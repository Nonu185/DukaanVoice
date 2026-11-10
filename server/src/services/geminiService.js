import { GoogleGenAI } from '@google/genai';

const SUPPORTED_INTENTS = new Set([
  'ADD_PRODUCT',
  'ADD_STOCK',
  'REMOVE_STOCK',
  'RECORD_SALE',
  'CHECK_STOCK',
  'LOW_STOCK_REPORT',
  'DAILY_SALES_REPORT',
  'ADD_CUSTOMER',
  'RECORD_CREDIT',
  'RECORD_PAYMENT',
  'UNKNOWN',
]);

export function isGeminiConfigured() {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim() !== '' && key !== 'your_gemini_api_key');
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL || 'gemini-3.6-flash';
}

function parseJsonSafely(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_err) {
    return null;
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getHttpStatus(err) {
  if (typeof err?.status === 'number') return err.status;
  const msg = String(err?.message || '');
  if (msg.includes('503') || msg.includes('UNAVAILABLE')) return 503;
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) return 429;
  if (msg.includes('404') || msg.includes('NOT_FOUND')) return 404;
  return 500;
}

async function callGemini({ systemInstruction, userPrompt, temperature = 0.1 }) {
  if (!isGeminiConfigured()) {
    const err = new Error('GEMINI_API_KEY is not configured in server/.env.');
    err.stage = 'GEMINI_NLU';
    err.status = 500;
    throw err;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const fallbackModels = [
    ...new Set([
      getGeminiModel(),
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
    ]),
  ];

  let lastErr = null;
  let lastStatus = 500;

  for (let mIdx = 0; mIdx < fallbackModels.length; mIdx += 1) {
    const model = fallbackModels[mIdx];
    const maxAttemptsForModel = 2;

    for (let attempt = 0; attempt < maxAttemptsForModel; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature,
          },
        });
        return parseJsonSafely(response?.text);
      } catch (err) {
        lastErr = err;
        lastStatus = getHttpStatus(err);
        const isTransient = lastStatus === 503 || lastStatus === 429;

        console.error(
          `[Gemini NLU] Model ${model} attempt ${attempt + 1} failed (HTTP ${lastStatus}): ${err?.message || err}`
        );

        // On 429 quota limit, immediately try the next healthy Flash model
        if (lastStatus === 429) {
          break;
        }

        // On 503 temporary load spike, retry once on the same model before moving to fallback
        if (isTransient && attempt + 1 < maxAttemptsForModel) {
          await wait(1000);
          continue;
        }
        break;
      }
    }
  }

  if (lastStatus === 503) {
    const outErr = new Error('AI command understanding temporarily unavailable. Please try again.');
    outErr.stage = 'GEMINI_NLU';
    outErr.status = 503;
    outErr.isTemporary = true;
    throw outErr;
  }

  if (lastStatus === 429) {
    const outErr = new Error(
      'AI command understanding is temporarily busy (quota limit reached). Please try again later.'
    );
    outErr.stage = 'GEMINI_NLU';
    outErr.status = 429;
    outErr.isTemporary = true;
    throw outErr;
  }

  const outErr = new Error(
    process.env.NODE_ENV === 'development' && lastErr?.message
      ? `AI command understanding failed: ${lastErr.message}`
      : 'AI command understanding failed. Please try again.'
  );
  outErr.stage = 'GEMINI_NLU';
  outErr.status = lastStatus;
  outErr.cause = lastErr;
  throw outErr;
}

/**
 * Single straightforward Gemini NLU function:
 * extracts structured intent and inventory/khata fields from the Prisma transcript.
 */
export async function understandVoiceCommand({
  transcript,
  productCatalog = [],
  customerNames = [],
  pendingContext = null,
  language = 'hi',
}) {
  const fallbackUnknown = {
    intent: 'UNKNOWN',
    language,
    productName: null,
    variant: null,
    quantity: null,
    unit: null,
    customerName: null,
    amount: null,
    paymentMethod: null,
    dateRange: null,
    missingFields: [],
    clarificationRequired: false,
    clarificationQuestion: null,
    confidence: 0,
  };

  if (!transcript || !transcript.trim()) {
    return fallbackUnknown;
  }

  const contextSection = pendingContext
    ? `\nACTIVE CLARIFICATION FOLLOW-UP:\nPrevious partial command: ${JSON.stringify(pendingContext)}\nMerge the shopkeeper's new reply into the complete command.`
    : '';

  const systemInstruction = `You are the natural-language parser for DukaanVoice AI (Indian kirana store assistant).
Understand spoken commands in Hindi, Hinglish, Kannada, and English and return STRICT JSON ONLY.

SHOP CONTEXT:
- Existing Store Products: [${productCatalog.join(', ')}]
- Registered Khata Customers: [${customerNames.join(', ')}]
- Selected UI language: ${language}${contextSection}

SUPPORTED INTENTS (use exact name):
ADD_PRODUCT, ADD_STOCK, REMOVE_STOCK, RECORD_SALE, CHECK_STOCK, LOW_STOCK_REPORT, DAILY_SALES_REPORT, ADD_CUSTOMER, RECORD_CREDIT, RECORD_PAYMENT, UNKNOWN.

EXTRACTION RULES:
1. Extract clean canonical English productName (e.g. "आटा" -> "Atta", "चावल" -> "Rice", "मैगी" -> "Maggi", "मैरी बिस्किट"/"मैरिज बिस्किट" -> "Marie Biscuit", "पार्ले जी" -> "Parle-G"). If an existing store product matches the spoken item, use that exact product name. Keep distinct brands separate.
2. NEVER include spoken quantities or units inside productName (e.g. "10 kg atta" -> productName: "Atta", quantity: 10, unit: "kg").
3. Extract "variant" ONLY when explicitly specified (e.g. "Maggi family pack" -> productName: "Maggi", variant: "Family Pack"). Otherwise null.
4. Normalize "unit" to one of: "kg", "g", "packet", "litre", "ml", "pcs", "box", "bottle", or null.
5. Use ADD_STOCK when adding stock to an existing or newly mentioned product (e.g. "दस किलो आटा स्टॉक में ऐड कर दो", "चार मैगी के पैकेट स्टॉक में ऐड कर दो"). Use REMOVE_STOCK for stock removal ("मैगी के चार पैकेट निकाल दो", "Remove 5 kg rice"). Use RECORD_SALE when explicitly selling ("दस बिस्किट के पैकेट बेच दिए").
6. NEVER invent IDs, prices, stock quantities, or balances.
7. If required fields are missing or the spoken product is generic/ambiguous against the store catalog (for example "biscuit" when multiple biscuit brands exist, or missing productName/quantity for stock operations, or missing customerName/amount for khata operations), set clarificationRequired: true, list missingFields, and write a concise clarificationQuestion in language "${language}".
8. Return STRICT JSON ONLY:
{
  "intent": "ADD_PRODUCT" | "ADD_STOCK" | "REMOVE_STOCK" | "RECORD_SALE" | "CHECK_STOCK" | "LOW_STOCK_REPORT" | "DAILY_SALES_REPORT" | "ADD_CUSTOMER" | "RECORD_CREDIT" | "RECORD_PAYMENT" | "UNKNOWN",
  "language": "hi" | "hinglish" | "kn" | "en",
  "productName": String or null,
  "variant": String or null,
  "quantity": Number or null,
  "unit": "kg" | "g" | "packet" | "litre" | "ml" | "pcs" | "box" | "bottle" | null,
  "customerName": String or null,
  "amount": Number or null,
  "paymentMethod": "cash" | "upi" | "khata" | null,
  "dateRange": "today" | "yesterday" | "today_vs_yesterday" | "this_week" | "this_month" | null,
  "missingFields": Array of strings,
  "clarificationRequired": Boolean,
  "clarificationQuestion": String or null,
  "confidence": Number
}`;

  const parsed = await callGemini({
    systemInstruction,
    userPrompt: `Transcript: "${transcript.trim()}"`,
    temperature: 0.1,
  });

  if (!parsed) {
    return fallbackUnknown;
  }

  const intent = SUPPORTED_INTENTS.has(parsed.intent) ? parsed.intent : 'UNKNOWN';

  return {
    intent,
    language: parsed.language || language,
    productName: typeof parsed.productName === 'string' ? parsed.productName.trim() || null : null,
    variant: typeof parsed.variant === 'string' ? parsed.variant.trim() || null : null,
    quantity: typeof parsed.quantity === 'number' && !Number.isNaN(parsed.quantity) ? parsed.quantity : null,
    unit: typeof parsed.unit === 'string' ? parsed.unit.trim().toLowerCase() || null : null,
    customerName: typeof parsed.customerName === 'string' ? parsed.customerName.trim() || null : null,
    amount: typeof parsed.amount === 'number' && !Number.isNaN(parsed.amount) ? parsed.amount : null,
    paymentMethod: typeof parsed.paymentMethod === 'string' ? parsed.paymentMethod : null,
    dateRange: typeof parsed.dateRange === 'string' ? parsed.dateRange : null,
    missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields : [],
    clarificationRequired: Boolean(parsed.clarificationRequired),
    clarificationQuestion:
      typeof parsed.clarificationQuestion === 'string' ? parsed.clarificationQuestion : null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
  };
}

export async function generateGeminiInsights({ metrics, language = 'en' }) {
  const languageLabel =
    language === 'kn'
      ? 'Kannada'
      : language === 'hi'
      ? 'Hindi'
      : language === 'hinglish'
      ? 'Hinglish'
      : 'English';

  const systemInstruction = `You are a retail business advisor for an Indian kirana store.
Write a short, practical business summary and up to 3 recommendations strictly in ${languageLabel}.
Use ONLY the verified numbers provided below and return STRICT JSON ONLY:
{
  "narrative": "2-3 concise sentences summarizing current store status",
  "recommendations": [
    {
      "title": "Short recommendation title",
      "desc": "One specific sentence referencing the real numbers",
      "priority": "high" | "medium" | "low",
      "actionType": "RESTOCK" | "KHATA_REMINDER" | "UPSELL" | "GENERAL"
    }
  ]
}`;

  const compactMetrics = {
    totalProducts: metrics.totalProducts,
    todayRevenue: metrics.todayRevenue,
    todayBills: metrics.todayBills,
    weeklyRevenue: metrics.weeklyRevenue,
    monthlyRevenue: metrics.monthlyRevenue,
    totalTransactions: metrics.totalTransactions,
    averageSaleValue: metrics.averageSaleValue,
    outstandingCredit: metrics.outstandingCredit,
    customersWithCreditCount: metrics.customersWithCreditCount,
    bestSellingProducts: (metrics.bestSellingProducts || []).slice(0, 3),
    lowStockProducts: (metrics.lowStockProducts || []).slice(0, 5).map((p) => ({
      name: p.name,
      quantity: p.quantity,
      threshold: p.threshold,
    })),
    slowMovingProducts: (metrics.slowMovingProducts || []).slice(0, 3).map((p) => p.name),
  };

  const parsed = await callGemini({
    systemInstruction,
    userPrompt: `VERIFIED SHOP METRICS:\n${JSON.stringify(compactMetrics)}`,
    temperature: 0.2,
  });

  if (!parsed) {
    throw new Error('Gemini returned an invalid insights response.');
  }

  return {
    narrative: typeof parsed.narrative === 'string' ? parsed.narrative : '',
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 3) : [],
  };
}
