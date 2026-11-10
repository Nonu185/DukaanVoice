import Product, { normalizeProductText, normalizeUnit } from '../models/Product.js';
import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import KhataTransaction from '../models/KhataTransaction.js';
import AuditLog, { recordAuditLog } from '../models/AuditLog.js';
import { transcribeAudio, isPrismaConfigured } from '../services/prismaService.js';
import {
  understandVoiceCommand,
  isGeminiConfigured,
  getGeminiModel,
} from '../services/geminiService.js';
import { synthesizeSpeech, isTimbreConfigured } from '../services/timbreService.js';

// Multi-turn clarification memory scoped by shopId:userId (5-minute TTL)
const pendingClarifications = new Map();
const CLARIFICATION_TTL_MS = 5 * 60 * 1000;

function getPendingContext(shopId, userId) {
  const key = `${shopId}:${userId}`;
  const entry = pendingClarifications.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CLARIFICATION_TTL_MS) {
    pendingClarifications.delete(key);
    return null;
  }
  return entry.data;
}

function savePendingContext(shopId, userId, data) {
  pendingClarifications.set(`${shopId}:${userId}`, { data, timestamp: Date.now() });
}

function clearPendingContext(shopId, userId) {
  pendingClarifications.delete(`${shopId}:${userId}`);
}

function pickSpeech(language, { en, hi, kn }) {
  if (language === 'en') return en;
  if (language === 'kn') return kn;
  return hi;
}

/**
 * Matches a spoken product against the authenticated shop's catalog,
 * respecting product identity, variant, and unit without merging distinct items.
 */
function resolveShopProduct(products, { productName, variant, unit }) {
  const normQuery = normalizeProductText(productName || '');
  const normVar = normalizeProductText(variant || '');
  const normUnit = unit ? normalizeUnit(unit) : null;

  if (!normQuery) {
    return { status: 'not_found', matches: [] };
  }

  const enriched = products.map((p) => ({
    doc: p,
    normName: p.normalizedName || normalizeProductText(p.name),
    normVar: p.normalizedVariant ?? normalizeProductText(p.variant || ''),
    normUnit: p.normalizedUnit || normalizeUnit(p.unit || 'pcs'),
    normHindi: normalizeProductText(p.hindiName || ''),
  }));

  // 1. Exact product name match
  let nameMatches = enriched.filter(
    (item) => item.normName === normQuery || (item.normHindi && item.normHindi === normQuery)
  );

  // 2. Partial match only if no exact match
  if (nameMatches.length === 0) {
    const partial = enriched.filter(
      (item) =>
        item.normName.includes(normQuery) ||
        normQuery.includes(item.normName) ||
        (item.normHindi && item.normHindi.includes(normQuery))
    );

    // If multiple distinct products match a partial term (e.g. "biscuit" -> "Marie Biscuit", "Parle-G Biscuit")
    // or a generic single word matches a specific variant/brand (e.g. "biscuit" -> "Marie Biscuit"), treat as ambiguous
    const distinctNames = new Set(partial.map((p) => p.normName));
    if (distinctNames.size > 1) {
      return { status: 'ambiguous', matches: partial.map((p) => p.doc) };
    }
    if (partial.length === 1 && partial[0].normName !== normQuery) {
      // Only auto-accept single partial match if the query has >=2 tokens or the product name is contained in query
      const queryTokens = normQuery.split(' ').filter(Boolean);
      const isSpecificMatch =
        normQuery.includes(partial[0].normName) || queryTokens.length >= 2;
      if (!isSpecificMatch) {
        return { status: 'ambiguous', matches: partial.map((p) => p.doc) };
      }
    }
    nameMatches = partial;
  }

  if (nameMatches.length === 0) {
    return { status: 'not_found', matches: [] };
  }

  // 3. Variant matching (keep variants separate)
  let candidates = nameMatches;
  if (normVar) {
    candidates = candidates.filter((item) => item.normVar === normVar);
    if (candidates.length === 0) {
      return { status: 'not_found', matches: [] };
    }
  } else if (candidates.length > 1) {
    const defaultVariantMatches = candidates.filter((item) => !item.normVar);
    if (defaultVariantMatches.length > 0) {
      candidates = defaultVariantMatches;
    } else {
      return { status: 'ambiguous', matches: candidates.map((p) => p.doc) };
    }
  }

  // 4. Unit matching (do not merge e.g. Atta kg with Atta packet)
  if (normUnit) {
    const unitMatches = candidates.filter((item) => item.normUnit === normUnit);
    if (unitMatches.length === 0) {
      return { status: 'not_found', matches: [] };
    }
    candidates = unitMatches;
  }

  if (candidates.length === 1) {
    return { status: 'matched', product: candidates[0].doc };
  }

  return { status: 'ambiguous', matches: candidates.map((p) => p.doc) };
}

function findCustomerMatches(customers, customerName) {
  const query = (customerName || '').toLowerCase().trim();
  if (!query) return [];

  const exact = customers.filter((c) => c.name.toLowerCase() === query);
  if (exact.length > 0) return exact;

  return customers.filter(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      query.includes(c.name.toLowerCase()) ||
      c.name.toLowerCase().split(' ')[0] === query
  );
}

function formatProductLabel(p) {
  const variantPart = p.variant ? ` [${p.variant}]` : '';
  return `${p.name}${variantPart} (${p.unit})`;
}

async function findExistingProductForEdit(shopId, { productId, productName, variant = '', unit }) {
  const products = await Product.find({ shop: shopId, isActive: true })
    .select('name normalizedName variant normalizedVariant unit normalizedUnit sellingPrice quantity')
    .lean();

  const cleanName = String(productName || '').trim();
  const normName = normalizeProductText(cleanName);
  const normVar = normalizeProductText(variant || '');
  const normUnit = unit ? normalizeUnit(unit) : null;

  if (productId) {
    const byId = products.find((p) => String(p._id) === String(productId));
    if (byId) {
      const sameName = !normName || (byId.normalizedName || normalizeProductText(byId.name)) === normName;
      const sameUnit = !normUnit || (byId.normalizedUnit || normalizeUnit(byId.unit)) === normUnit;
      if (sameName && sameUnit) {
        return { status: 'matched', product: byId };
      }
    }
  }

  if (!normName) {
    return { status: 'not_found', matches: [] };
  }

  // Exact match by normalized (name, variant, unit)
  const exact = products.filter((p) => {
    const pName = p.normalizedName || normalizeProductText(p.name);
    const pVar = p.normalizedVariant ?? normalizeProductText(p.variant || '');
    const pUnit = p.normalizedUnit || normalizeUnit(p.unit || 'pcs');
    return pName === normName && (!normVar || pVar === normVar) && (!normUnit || pUnit === normUnit);
  });

  if (exact.length === 1) {
    return { status: 'matched', product: exact[0] };
  }
  if (exact.length > 1) {
    const noVar = exact.find((p) => !(p.normalizedVariant ?? normalizeProductText(p.variant || '')));
    return noVar ? { status: 'matched', product: noVar } : { status: 'ambiguous', matches: exact };
  }

  return resolveShopProduct(products, { productName: cleanName, variant, unit });
}

async function findOrCreateCustomerForEdit(
  shopId,
  { customerId, customerName, phone = '', allowCreate = false }
) {
  const cleanName = String(customerName || '').trim();
  if (customerId) {
    const byId = await Customer.findOne({ _id: customerId, shop: shopId, isActive: true });
    if (
      byId &&
      (!cleanName || byId.name.trim().toLowerCase() === cleanName.toLowerCase())
    ) {
      return byId;
    }
  }

  if (!cleanName) return null;

  const existing = await Customer.findOne({
    shop: shopId,
    name: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    isActive: true,
  });

  if (existing) return existing;
  if (!allowCreate) return null;

  return Customer.create({
    shop: shopId,
    name: cleanName,
    phone: String(phone || '').trim(),
    totalCredit: 0,
  });
}

async function askClarification(
  req,
  res,
  { transcript, nluResult, question, missingFields, language, products = [], customers = [] }
) {
  savePendingContext(req.shopId, req.user._id, {
    intent: nluResult.intent,
    productName: nluResult.productName,
    variant: nluResult.variant,
    quantity: nluResult.quantity,
    unit: nluResult.unit,
    customerName: nluResult.customerName,
    amount: nluResult.amount,
    paymentMethod: nluResult.paymentMethod,
    missingFields,
    clarificationQuestion: question,
  });

  const tts = await synthesizeSpeech(question, { language });

  return res.json({
    success: true,
    transcript,
    intent: nluResult.intent,
    language: nluResult.language || language,
    confidence: nluResult.confidence || 0.85,
    entities: {
      productName: nluResult.productName,
      variant: nluResult.variant,
      quantity: nluResult.quantity,
      unit: nluResult.unit,
      customerName: nluResult.customerName,
      amount: nluResult.amount,
      paymentMethod: nluResult.paymentMethod,
    },
    clarificationRequired: true,
    clarificationQuestion: question,
    missingFields,
    requiresConfirmation: false,
    availableProducts: products.map((p) => ({
      _id: p._id,
      name: p.name,
      variant: p.variant || '',
      unit: p.unit,
      sellingPrice: p.sellingPrice,
      availableStock: p.quantity,
    })),
    availableCustomers: customers.map((c) => ({
      _id: c._id,
      name: c.name,
      totalCredit: c.totalCredit,
    })),
    spokenResponse: question,
    audioBase64: tts.audioBase64 || '',
    format: tts.format || 'wav',
  });
}

/**
 * POST /api/voice/process
 * Workflow: Prisma STT -> Gemini JSON NLU -> Backend validation -> Clarification or Confirmation -> Timbre TTS
 */
export async function handleProcessVoice(req, res) {
  let transcript = req.body?.text ? String(req.body.text).trim() : '';
  const language =
    req.body?.language || req.user?.primaryLanguage || req.shop?.preferredLanguage || 'hi';

  try {
    const { audio, mimeType = 'audio/wav' } = req.body;

    // 1. Gnani Prisma v2.5 Speech-to-Text
    if (audio) {
      const sttResult = await transcribeAudio(audio, { language, mimeType });
      transcript = sttResult.transcript || transcript;
    }

    if (!transcript) {
      const spoken = pickSpeech(language, {
        en: 'Sorry, no speech was detected. Please try speaking again.',
        kn: 'ಕ್ಷಮಿಸಿ, ಯಾವುದೇ ಧ್ವನಿ ಕೇಳಿಸಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಮಾತನಾಡಿ.',
        hi: 'माफ कीजिए, कोई आवाज सुनाई नहीं दी। कृपया दोबारा बोलें।',
      });
      const tts = await synthesizeSpeech(spoken, { language });
      return res.json({
        success: false,
        transcript: '',
        message: 'No speech recognized. Please speak clearly into the microphone.',
        spokenResponse: spoken,
        audioBase64: tts.audioBase64 || '',
      });
    }

    // 2. Load authenticated shop context from MongoDB
    const [products, customers] = await Promise.all([
      Product.find({ shop: req.shopId, isActive: true })
        .select('name normalizedName variant normalizedVariant hindiName sellingPrice quantity unit normalizedUnit category lowStockThreshold')
        .lean(),
      Customer.find({ shop: req.shopId, isActive: true })
        .select('name phone totalCredit')
        .lean(),
    ]);

    const pendingContext = getPendingContext(req.shopId, req.user._id);

    // 3. Google Gemini Structured Intent Extraction
    const nluResult = await understandVoiceCommand({
      transcript,
      productCatalog: products.map(formatProductLabel),
      customerNames: customers.map((c) => c.name),
      pendingContext,
      language,
    });

    if (nluResult.clarificationRequired && nluResult.clarificationQuestion) {
      return askClarification(req, res, {
        transcript,
        nluResult,
        question: nluResult.clarificationQuestion,
        missingFields: nluResult.missingFields || [],
        language,
        products,
        customers,
      });
    }

    clearPendingContext(req.shopId, req.user._id);

    const {
      intent,
      productName,
      variant,
      quantity,
      unit,
      customerName,
      amount,
      paymentMethod,
      dateRange,
    } = nluResult;

    // 4. Backend Validation & Context Resolution
    let resolvedProduct = null;
    let resolvedCustomer = null;
    let calculatedAmount = null;
    let availableStock = null;
    let validationError = null;
    let spokenResponseText = '';
    let requiresConfirmation = false;
    let executionPayload = null;
    let resolvedIntent = intent;

    switch (intent) {
      case 'ADD_STOCK':
      case 'ADD_PRODUCT': {
        const cleanName = (productName || '').trim();
        if (!cleanName) {
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['productName'],
            language,
            question: pickSpeech(language, {
              en: 'Which product do you want to add to inventory?',
              kn: 'ನೀವು ಯಾವ ಸರಕನ್ನು ದಾಸ್ತಾನಿಗೆ ಸೇರಿಸಲು ಬಯಸುತ್ತೀರಿ?',
              hi: 'आप किस सामान को स्टॉक में जोड़ना चाहते हैं?',
            }),
          });
        }

        const lookup = resolveShopProduct(products, { productName: cleanName, variant, unit });

        if (lookup.status === 'ambiguous') {
          const labels = lookup.matches.slice(0, 4).map(formatProductLabel).join(', ');
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['productName'],
            language,
            question: pickSpeech(language, {
              en: `Multiple matching products found (${labels}). Please specify the exact product name.`,
              kn: `ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಸರಕುಗಳು ಕಂಡುಬಂದಿವೆ (${labels}). ದಯವಿಟ್ಟು ಸರಿಯಾದ ಹೆಸರನ್ನು ತಿಳಿಸಿ.`,
              hi: `एक से अधिक सामान मिले (${labels})। कृपया स्पष्ट नाम बताएं।`,
            }),
          });
        }

        if (lookup.status === 'matched') {
          // Existing product found -> Add stock
          const addQty = Number(quantity);
          if (!addQty || addQty <= 0) {
            return askClarification(req, res, {
              transcript,
              nluResult: { ...nluResult, intent: 'ADD_STOCK' },
              missingFields: ['quantity'],
              language,
              question: pickSpeech(language, {
                en: `How many ${lookup.product.unit || 'units'} should I add to ${lookup.product.name}?`,
                kn: `${lookup.product.name} ಗೆ ಎಷ್ಟು ${lookup.product.unit || ''} ಸ್ಟಾಕ್ ಸೇರಿಸಬೇಕು?`,
                hi: `${lookup.product.name} का कितना स्टॉक बढ़ाना है?`,
              }),
            });
          }

          resolvedProduct = lookup.product;
          resolvedIntent = 'ADD_STOCK';
          requiresConfirmation = true;

          spokenResponseText = pickSpeech(language, {
            en: `Confirm adding ${addQty} ${resolvedProduct.unit} to ${resolvedProduct.name}. Stock will increase from ${resolvedProduct.quantity} to ${resolvedProduct.quantity + addQty}.`,
            kn: `${resolvedProduct.name} ಗೆ ${addQty} ${resolvedProduct.unit} ಸೇರಿಸಲು ಖಚಿತಪಡಿಸಿ. ಸ್ಟಾಕ್ ${resolvedProduct.quantity} ರಿಂದ ${resolvedProduct.quantity + addQty} ಆಗಲಿದೆ.`,
            hi: `${resolvedProduct.name} में ${addQty} ${resolvedProduct.unit} जोड़ने की पुष्टि करें। स्टॉक ${resolvedProduct.quantity} से बढ़कर ${resolvedProduct.quantity + addQty} हो जाएगा।`,
          });

          executionPayload = {
            actionType: 'ADD_STOCK',
            productId: resolvedProduct._id,
            productName: resolvedProduct.name,
            variant: resolvedProduct.variant || '',
            unit: resolvedProduct.unit,
            delta: addQty,
            currentStock: resolvedProduct.quantity,
            newStock: resolvedProduct.quantity + addQty,
          };
        } else {
          // Product does NOT exist in this shop -> Create new product dynamically with initial stock
          const qty = Number(quantity);
          const initialQty = !Number.isNaN(qty) && qty > 0 ? qty : intent === 'ADD_PRODUCT' ? 0 : null;

          if (initialQty === null) {
            return askClarification(req, res, {
              transcript,
              nluResult,
              missingFields: ['quantity'],
              language,
              question: pickSpeech(language, {
                en: `How much initial stock of "${cleanName}" do you want to add?`,
                kn: `"${cleanName}" ನ ಆರಂಭಿಕ ಸ್ಟಾಕ್ ಎಷ್ಟು ಸೇರಿಸಬೇಕು?`,
                hi: `नए उत्पाद "${cleanName}" का कितना स्टॉक जोड़ना है?`,
              }),
            });
          }

          const finalUnit = normalizeUnit(unit || 'pcs');
          const sellingPrice = amount && Number(amount) > 0 ? Number(amount) : 0;
          resolvedIntent = 'ADD_PRODUCT';
          requiresConfirmation = true;

          const variantLabel = variant ? ` (${variant})` : '';
          spokenResponseText = pickSpeech(language, {
            en: `Confirm adding new product "${cleanName}${variantLabel}" with ${initialQty} ${finalUnit} in stock.`,
            kn: `ಹೊಸ ಸರಕು "${cleanName}${variantLabel}" (${initialQty} ${finalUnit}) ಸೇರಿಸಲು ಖಚಿತಪಡಿಸಿ.`,
            hi: `नया उत्पाद "${cleanName}${variantLabel}" (${initialQty} ${finalUnit} स्टॉक) जोड़ने की पुष्टि करें।`,
          });

          executionPayload = {
            actionType: 'ADD_PRODUCT',
            name: cleanName,
            variant: variant || '',
            category: 'General',
            sellingPrice,
            purchasePrice: sellingPrice > 0 ? Math.round(sellingPrice * 0.85) : 0,
            quantity: initialQty,
            unit: finalUnit,
          };
        }
        break;
      }

      case 'REMOVE_STOCK': {
        const lookup = resolveShopProduct(products, { productName, variant, unit });

        if (lookup.status === 'ambiguous') {
          const labels = lookup.matches.slice(0, 4).map(formatProductLabel).join(', ');
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['productName'],
            language,
            question: pickSpeech(language, {
              en: `Multiple matching products found (${labels}). Which product should be reduced?`,
              kn: `ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಸರಕುಗಳು ಕಂಡುಬಂದಿವೆ (${labels}). ಯಾವ ಸರಕಿನ ಸ್ಟಾಕ್ ಕಡಿಮೆ ಮಾಡಬೇಕು?`,
              hi: `एक से अधिक सामान मिले (${labels})। किस सामान का स्टॉक कम करना है?`,
            }),
          });
        }

        if (lookup.status === 'not_found') {
          validationError = pickSpeech(language, {
            en: `Product "${productName || ''}" was not found in your inventory. Cannot remove stock from a nonexistent product.`,
            kn: `"${productName || ''}" ಸರಕು ನಿಮ್ಮ ದಾಸ್ತಾನಿನಲ್ಲಿ ಇಲ್ಲ. ಇಲ್ಲದ ಸರಕಿನ ಸ್ಟಾಕ್ ಕಡಿಮೆ ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ.`,
            hi: `उत्पाद "${productName || 'सामान'}" दुकान की सूची में नहीं मिला। नया स्टॉक हटाने से पहले उत्पाद जोड़ें।`,
          });
          spokenResponseText = validationError;
          break;
        }

        const removeQty = Number(quantity);
        if (!removeQty || removeQty <= 0) {
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['quantity'],
            language,
            question: pickSpeech(language, {
              en: `How many ${lookup.product.unit} should be removed from ${lookup.product.name}?`,
              kn: `${lookup.product.name} ನಿಂದ ಎಷ್ಟು ${lookup.product.unit} ಕಡಿಮೆ ಮಾಡಬೇಕು?`,
              hi: `${lookup.product.name} का कितना स्टॉक कम करना है?`,
            }),
          });
        }

        resolvedProduct = lookup.product;
        availableStock = resolvedProduct.quantity;

        if (resolvedProduct.quantity < removeQty) {
          savePendingContext(req.shopId, req.user._id, {
            intent: 'REMOVE_STOCK',
            productName: resolvedProduct.name,
            variant: resolvedProduct.variant,
            unit: resolvedProduct.unit,
            missingFields: ['quantity'],
          });
          validationError = pickSpeech(language, {
            en: `Only ${resolvedProduct.quantity} ${resolvedProduct.unit} of ${resolvedProduct.name} in stock (requested ${removeQty}). How would you like to proceed? Say a smaller quantity or add stock first.`,
            kn: `${resolvedProduct.name} ಕೇವಲ ${resolvedProduct.quantity} ${resolvedProduct.unit} ಮಾತ್ರ ಲಭ್ಯವಿದೆ (${removeQty} ಕೇಳಲಾಗಿದೆ). ಕಡಿಮೆ ಪ್ರಮಾಣ ತಿಳಿಸಿ ಅಥವಾ ಮೊದಲು ಸ್ಟಾಕ್ ಸೇರಿಸಿ.`,
            hi: `${resolvedProduct.name} का केवल ${resolvedProduct.quantity} ${resolvedProduct.unit} स्टॉक उपलब्ध है (आपने ${removeQty} कहा)। आप कैसे आगे बढ़ना चाहेंगे? कम मात्रा बताएं या पहले स्टॉक जोड़ें।`,
          });
          spokenResponseText = validationError;
          break;
        }

        requiresConfirmation = true;
        spokenResponseText = pickSpeech(language, {
          en: `Confirm removing ${removeQty} ${resolvedProduct.unit} from ${resolvedProduct.name}. Remaining stock will be ${resolvedProduct.quantity - removeQty}.`,
          kn: `${resolvedProduct.name} ನಿಂದ ${removeQty} ${resolvedProduct.unit} ಕಡಿಮೆ ಮಾಡಲು ಖಚಿತಪಡಿಸಿ. ಉಳಿದ ಸ್ಟಾಕ್ ${resolvedProduct.quantity - removeQty}.`,
          hi: `${resolvedProduct.name} से ${removeQty} ${resolvedProduct.unit} निकालने की पुष्टि करें। शेष स्टॉक ${resolvedProduct.quantity - removeQty} रहेगा।`,
        });

        executionPayload = {
          actionType: 'REMOVE_STOCK',
          productId: resolvedProduct._id,
          productName: resolvedProduct.name,
          unit: resolvedProduct.unit,
          delta: removeQty,
          currentStock: resolvedProduct.quantity,
          newStock: resolvedProduct.quantity - removeQty,
        };
        break;
      }

      case 'RECORD_SALE': {
        const lookup = resolveShopProduct(products, { productName, variant, unit });

        if (lookup.status === 'ambiguous') {
          const labels = lookup.matches.slice(0, 4).map(formatProductLabel).join(', ');
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['productName'],
            language,
            question: pickSpeech(language, {
              en: `Multiple matching products found (${labels}). Which product did you sell?`,
              kn: `ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಸರಕುಗಳು ಕಂಡುಬಂದಿವೆ (${labels}). ಯಾವ ಸರಕನ್ನು ಮಾರಾಟ ಮಾಡಿದ್ದೀರಿ?`,
              hi: `एक से अधिक सामान मिले (${labels})। आपने कौन सा सामान बेचा?`,
            }),
          });
        }

        if (lookup.status === 'not_found') {
          const label = productName || 'item';
          validationError = pickSpeech(language, {
            en: `Product "${label}" was not found in your shop inventory.`,
            kn: `"${label}" ಸರಕು ನಿಮ್ಮ ಅಂಗಡಿಯ ದಾಸ್ತಾನಿನಲ್ಲಿ ಕಂಡುಬಂದಿಲ್ಲ.`,
            hi: `उत्पाद "${label}" दुकान की सूची में नहीं मिला।`,
          });
          spokenResponseText = validationError;
          break;
        }

        const qty = Number(quantity);
        if (!qty || qty <= 0) {
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['quantity'],
            language,
            question: pickSpeech(language, {
              en: `How many ${lookup.product.unit} of ${lookup.product.name} did you sell?`,
              kn: `${lookup.product.name} ಎಷ್ಟು ${lookup.product.unit} ಮಾರಾಟ ಮಾಡಿದ್ದೀರಿ?`,
              hi: `${lookup.product.name} की कितनी मात्रा बेची गई?`,
            }),
          });
        }

        resolvedProduct = lookup.product;
        availableStock = resolvedProduct.quantity;

        if (availableStock < qty) {
          savePendingContext(req.shopId, req.user._id, {
            intent: 'RECORD_SALE',
            productName: resolvedProduct.name,
            variant: resolvedProduct.variant,
            unit: resolvedProduct.unit,
            paymentMethod,
            customerName,
            missingFields: ['quantity'],
          });
          validationError = pickSpeech(language, {
            en: `Insufficient stock for ${resolvedProduct.name}: only ${availableStock} ${resolvedProduct.unit} available (requested ${qty}). Say a smaller quantity or restock first.`,
            kn: `${resolvedProduct.name} ಸ್ಟಾಕ್ ಕಡಿಮೆ ಇದೆ: ಕೇವಲ ${availableStock} ${resolvedProduct.unit} ಲಭ್ಯವಿದೆ. ಕಡಿಮೆ ಪ್ರಮಾಣ ತಿಳಿಸಿ ಅಥವಾ ಮೊದಲು ಸ್ಟಾಕ್ ಸೇರಿಸಿ.`,
            hi: `स्टॉक कम है: ${resolvedProduct.name} केवल ${availableStock} ${resolvedProduct.unit} उपलब्ध है (आपने ${qty} मांगा)। कम मात्रा बताएं या पहले स्टॉक जोड़ें।`,
          });
          spokenResponseText = validationError;
          break;
        }

        const method = paymentMethod || 'cash';
        if (method === 'khata') {
          const custMatches = findCustomerMatches(customers, customerName);
          if (custMatches.length > 1) {
            const names = custMatches.slice(0, 3).map((c) => c.name).join(', ');
            return askClarification(req, res, {
              transcript,
              nluResult,
              missingFields: ['customerName'],
              language,
              question: pickSpeech(language, {
                en: `Multiple matching customers found (${names}). Which customer's Khata should be updated?`,
                kn: `ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಗ್ರಾಹಕರು ಕಂಡುಬಂದಿದ್ದಾರೆ (${names}). ಯಾರ ಖಾತಾಕ್ಕೆ ಸೇರಿಸಬೇಕು?`,
                hi: `एक से अधिक ग्राहक मिले (${names})। किस ग्राहक के खाते में उधार लिखना है?`,
              }),
            });
          }
          if (custMatches.length === 0) {
            return askClarification(req, res, {
              transcript,
              nluResult,
              missingFields: ['customerName'],
              language,
              question: pickSpeech(language, {
                en: 'Which customer should this Khata sale be recorded under?',
                kn: 'ಈ ಖಾತಾ ಮಾರಾಟವನ್ನು ಯಾವ ಗ್ರಾಹಕರ ಹೆಸರಿನಲ್ಲಿ ದಾಖಲಿಸಬೇಕು?',
                hi: 'यह उधार बिक्री किस ग्राहक के खाते में लिखनी है?',
              }),
            });
          }
          resolvedCustomer = custMatches[0];
        }

        const dbSellingPrice = Number(resolvedProduct.sellingPrice || 0);
        const hasValidPrice = dbSellingPrice > 0;
        calculatedAmount = hasValidPrice
          ? Math.round(qty * dbSellingPrice * 100) / 100
          : null;
        requiresConfirmation = true;

        spokenResponseText = hasValidPrice
          ? pickSpeech(language, {
              en: `Ready to record sale of ${qty} ${resolvedProduct.unit} of ${resolvedProduct.name} at ₹${dbSellingPrice} per ${resolvedProduct.unit} (Total ₹${calculatedAmount}). Please confirm.`,
              kn: `${resolvedProduct.name} (${qty} ${resolvedProduct.unit}, ₹${dbSellingPrice} ದರದಲ್ಲಿ ಒಟ್ಟು ₹${calculatedAmount}) ಮಾರಾಟವನ್ನು ದಾಖಲಿಸಲು ಖಚಿತಪಡಿಸಿ.`,
              hi: `${resolvedProduct.name} के ${qty} ${resolvedProduct.unit} ₹${dbSellingPrice} प्रति ${resolvedProduct.unit} की दर से कुल ₹${calculatedAmount} में बेचने के लिए तैयार है। कृपया पुष्टि करें।`,
            })
          : pickSpeech(language, {
              en: `Selling price for ${resolvedProduct.name} is not set. Please enter the price per ${resolvedProduct.unit} to confirm this sale.`,
              kn: `${resolvedProduct.name} ನ ಮಾರಾಟ ಬೆಲೆ ಇನ್ನೂ ನಿಗದಿಯಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಪ್ರತಿ ${resolvedProduct.unit} ಬೆಲೆಯನ್ನು ನಮೂದಿಸಿ ಖಚಿತಪಡಿಸಿ.`,
              hi: `${resolvedProduct.name} की बिक्री कीमत अभी दर्ज नहीं है। कृपया प्रति ${resolvedProduct.unit} कीमत लिखकर बिक्री की पुष्टि करें।`,
            });

        executionPayload = {
          actionType: 'RECORD_SALE',
          productId: resolvedProduct._id,
          productName: resolvedProduct.name,
          quantity: qty,
          unit: resolvedProduct.unit,
          unitPrice: hasValidPrice ? dbSellingPrice : null,
          total: calculatedAmount,
          paymentMethod: method,
          customerId: resolvedCustomer?._id || null,
          customerName: resolvedCustomer?.name || 'Walk-in Customer',
        };
        break;
      }

      case 'ADD_CUSTOMER': {
        const cleanCustomer = (customerName || '').trim();
        if (!cleanCustomer) {
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['customerName'],
            language,
            question: pickSpeech(language, {
              en: 'What is the name of the customer to add to Digital Khata?',
              kn: 'ಡಿಜಿಟಲ್ ಖಾತಾಕ್ಕೆ ಸೇರಿಸಬೇಕಾದ ಗ್ರಾಹಕರ ಹೆಸರೇನು?',
              hi: 'डिजिटल खाता में किस ग्राहक का नाम जोड़ना है?',
            }),
          });
        }

        const existingCust = customers.find(
          (c) => c.name.toLowerCase() === cleanCustomer.toLowerCase()
        );
        if (existingCust) {
          validationError = pickSpeech(language, {
            en: `Customer "${existingCust.name}" is already in your Digital Khata.`,
            kn: `ಗ್ರಾಹಕ "${existingCust.name}" ಈಗಾಗಲೇ ನಿಮ್ಮ ಖಾತಾದಲ್ಲಿ ಇದ್ದಾರೆ.`,
            hi: `ग्राहक "${existingCust.name}" पहले से ही खाते में जुड़े हुए हैं।`,
          });
          spokenResponseText = validationError;
          break;
        }

        requiresConfirmation = true;
        spokenResponseText = pickSpeech(language, {
          en: `Confirm adding new customer "${cleanCustomer}" to Digital Khata.`,
          kn: `ಹೊಸ ಗ್ರಾಹಕ "${cleanCustomer}" ಅವರನ್ನು ಡಿಜಿಟಲ್ ಖಾತಾಕ್ಕೆ ಸೇರಿಸಲು ಖಚಿತಪಡಿಸಿ.`,
          hi: `नया ग्राहक खाता "${cleanCustomer}" जोड़ने के लिए पुष्टि करें।`,
        });

        executionPayload = {
          actionType: 'ADD_CUSTOMER',
          name: cleanCustomer,
        };
        break;
      }

      case 'RECORD_CREDIT': {
        const custMatches = findCustomerMatches(customers, customerName);
        if (custMatches.length > 1) {
          const names = custMatches.slice(0, 3).map((c) => c.name).join(', ');
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['customerName'],
            language,
            question: pickSpeech(language, {
              en: `Multiple matching customers found (${names}). Which customer should receive this credit?`,
              kn: `ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಗ್ರಾಹಕರು ಕಂಡುಬಂದಿದ್ದಾರೆ (${names}). ಯಾರ ಖಾತೆಗೆ ಸಾಲ ಬರೆಯಬೇಕು?`,
              hi: `एक से अधिक ग्राहक मिले (${names})। किस ग्राहक के खाते में उधार लिखना है?`,
            }),
          });
        }
        if (custMatches.length === 0) {
          validationError = pickSpeech(language, {
            en: `Customer "${customerName || ''}" was not found in your Digital Khata.`,
            kn: `ಗ್ರಾಹಕ "${customerName || ''}" ಖಾತಾದಲ್ಲಿ ಕಂಡುಬಂದಿಲ್ಲ.`,
            hi: `ग्राहक "${customerName || 'अज्ञात'}" दुकान के खाते में नहीं मिला।`,
          });
          spokenResponseText = validationError;
          break;
        }

        const creditAmt = Number(amount);
        if (!creditAmt || creditAmt <= 0) {
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['amount'],
            language,
            question: pickSpeech(language, {
              en: `How much credit amount should be recorded for ${custMatches[0].name}?`,
              kn: `${custMatches[0].name} ಅವರ ಖಾತೆಗೆ ಎಷ್ಟು ರೂಪಾಯಿ ಸಾಲ ದಾಖಲಿಸಬೇಕು?`,
              hi: `${custMatches[0].name} के खाते में कितने रुपये का उधार लिखना है?`,
            }),
          });
        }

        resolvedCustomer = custMatches[0];
        requiresConfirmation = true;
        spokenResponseText = pickSpeech(language, {
          en: `Confirm recording ₹${creditAmt} credit for ${resolvedCustomer.name}.`,
          kn: `${resolvedCustomer.name} ಅವರ ಖಾತೆಗೆ ₹${creditAmt} ಸಾಲವನ್ನು ದಾಖಲಿಸಲು ಖಚಿತಪಡಿಸಿ.`,
          hi: `${resolvedCustomer.name} के खाते में ₹${creditAmt} उधार दर्ज करने के लिए पुष्टि करें।`,
        });

        executionPayload = {
          actionType: 'RECORD_CREDIT',
          customerId: resolvedCustomer._id,
          customerName: resolvedCustomer.name,
          amount: creditAmt,
          description: 'Voice Udhaar',
        };
        break;
      }

      case 'RECORD_PAYMENT': {
        const custMatches = findCustomerMatches(customers, customerName);
        if (custMatches.length > 1) {
          const names = custMatches.slice(0, 3).map((c) => c.name).join(', ');
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['customerName'],
            language,
            question: pickSpeech(language, {
              en: `Multiple matching customers found (${names}). Which customer made this payment?`,
              kn: `ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಗ್ರಾಹಕರು ಕಂಡುಬಂದಿದ್ದಾರೆ (${names}). ಯಾರ ಪಾವತಿಯನ್ನು ದಾಖಲಿಸಬೇಕು?`,
              hi: `एक से अधिक ग्राहक मिले (${names})। किस ग्राहक का भुगतान जमा करना है?`,
            }),
          });
        }
        if (custMatches.length === 0) {
          validationError = pickSpeech(language, {
            en: `Customer "${customerName || ''}" was not found in your Digital Khata.`,
            kn: `ಗ್ರಾಹಕ "${customerName || ''}" ಖಾತಾದಲ್ಲಿ ಕಂಡುಬಂದಿಲ್ಲ.`,
            hi: `ग्राहक "${customerName || 'अज्ञात'}" दुकान के खाते में नहीं मिला।`,
          });
          spokenResponseText = validationError;
          break;
        }

        const paymentAmt = Number(amount);
        if (!paymentAmt || paymentAmt <= 0) {
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['amount'],
            language,
            question: pickSpeech(language, {
              en: `How much payment did you receive from ${custMatches[0].name}?`,
              kn: `${custMatches[0].name} ಅವರಿಂದ ಎಷ್ಟು ರೂಪಾಯಿ ಪಾವತಿ ಬಂದಿದೆ?`,
              hi: `${custMatches[0].name} से कितने रुपये प्राप्त हुए हैं?`,
            }),
          });
        }

        resolvedCustomer = custMatches[0];
        requiresConfirmation = true;
        spokenResponseText = pickSpeech(language, {
          en: `Confirm recording ₹${paymentAmt} payment received from ${resolvedCustomer.name}.`,
          kn: `${resolvedCustomer.name} ಅವರಿಂದ ₹${paymentAmt} ಪಾವತಿಯನ್ನು ದಾಖಲಿಸಲು ಖಚಿತಪಡಿಸಿ.`,
          hi: `${resolvedCustomer.name} के खाते में ₹${paymentAmt} जमा करने के लिए पुष्टि करें।`,
        });

        executionPayload = {
          actionType: 'RECORD_PAYMENT',
          customerId: resolvedCustomer._id,
          customerName: resolvedCustomer.name,
          amount: paymentAmt,
          description: 'Voice Jama',
        };
        break;
      }

      case 'CHECK_STOCK': {
        const lookup = resolveShopProduct(products, { productName, variant, unit });
        if (lookup.status === 'ambiguous') {
          const labels = lookup.matches.slice(0, 4).map(formatProductLabel).join(', ');
          return askClarification(req, res, {
            transcript,
            nluResult,
            missingFields: ['productName'],
            language,
            question: pickSpeech(language, {
              en: `Multiple matching products found (${labels}). Which product's stock do you want to check?`,
              kn: `ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಸರಕುಗಳು ಕಂಡುಬಂದಿವೆ (${labels}). ಯಾವ ಸರಕಿನ ಸ್ಟಾಕ್ ಪರಿಶೀಲಿಸಬೇಕು?`,
              hi: `एक से अधिक सामान मिले (${labels})। आप किस सामान का स्टॉक जानना चाहते हैं?`,
            }),
          });
        }

        if (lookup.status === 'matched') {
          resolvedProduct = lookup.product;
          spokenResponseText = pickSpeech(language, {
            en: `${resolvedProduct.name} has ${resolvedProduct.quantity} ${resolvedProduct.unit} in stock.`,
            kn: `${resolvedProduct.name} ಸ್ಟಾಕ್ ${resolvedProduct.quantity} ${resolvedProduct.unit} ಲಭ್ಯವಿದೆ.`,
            hi: `आपकी दुकान में ${resolvedProduct.name} का स्टॉक ${resolvedProduct.quantity} ${resolvedProduct.unit} उपलब्ध है।`,
          });
        } else {
          spokenResponseText = pickSpeech(language, {
            en: `Product "${productName || ''}" was not found in your inventory.`,
            kn: `ಕ್ಷಮಿಸಿ, ಈ ಸರಕು ನಿಮ್ಮ ದಾಸ್ತಾನಿನಲ್ಲಿ ಕಂಡುಬಂದಿಲ್ಲ.`,
            hi: `माफ कीजिए, यह सामान दुकान की सूची में नहीं मिला।`,
          });
        }
        break;
      }

      case 'LOW_STOCK_REPORT': {
        const lowStockItems = products.filter(
          (p) => p.quantity <= (p.lowStockThreshold || 5)
        );

        if (lowStockItems.length === 0) {
          spokenResponseText = pickSpeech(language, {
            en: 'All products currently have sufficient stock.',
            kn: 'ನಿಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ ಎಲ್ಲಾ ಸರಕುಗಳ ಸ್ಟಾಕ್ ಸಾಕಷ್ಟಿದೆ.',
            hi: 'दुकान में सभी सामानों का पर्याप्त स्टॉक है। कोई भी सामान खत्म नहीं हो रहा है।',
          });
        } else {
          const names = lowStockItems
            .slice(0, 3)
            .map((p) => `${p.name} (${p.quantity} ${p.unit})`)
            .join(', ');
          spokenResponseText = pickSpeech(language, {
            en: `${lowStockItems.length} items are running low on stock: ${names}.`,
            kn: `${lowStockItems.length} ಸರಕುಗಳ ಸ್ಟಾಕ್ ಕಡಿಮೆ ಇದೆ: ${names}.`,
            hi: `दुकान में ${lowStockItems.length} सामानों का स्टॉक कम है: ${names}।`,
          });
        }
        break;
      }

      case 'DAILY_SALES_REPORT': {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const endOfYesterday = new Date(startOfToday.getTime() - 1);

        const todaySales = await Sale.find({
          shop: req.shopId,
          createdAt: { $gte: startOfToday, $lte: endOfToday },
        }).lean();

        const todayRev = todaySales.reduce((sum, s) => sum + s.total, 0);
        const todayBills = todaySales.length;

        if (dateRange === 'today_vs_yesterday') {
          const yesterdaySales = await Sale.find({
            shop: req.shopId,
            createdAt: { $gte: startOfYesterday, $lte: endOfYesterday },
          }).lean();

          const yesterdayRev = yesterdaySales.reduce((sum, s) => sum + s.total, 0);
          const yesterdayBills = yesterdaySales.length;

          spokenResponseText = pickSpeech(language, {
            en: `Today's sales are ₹${todayRev.toLocaleString('en-IN')} (${todayBills} bills), compared to ₹${yesterdayRev.toLocaleString('en-IN')} (${yesterdayBills} bills) yesterday.`,
            kn: `ಇಂದಿನ ಮಾರಾಟ ₹${todayRev.toLocaleString('en-IN')} (${todayBills} ಬಿಲ್‌ಗಳು), ನಿನ್ನೆ ₹${yesterdayRev.toLocaleString('en-IN')} (${yesterdayBills} ಬಿಲ್‌ಗಳು) ಇತ್ತು.`,
            hi: `आज की बिक्री ₹${todayRev.toLocaleString('en-IN')} (${todayBills} बिल) रही, जबकि कल ₹${yesterdayRev.toLocaleString('en-IN')} (${yesterdayBills} बिल) हुई थी।`,
          });
        } else {
          spokenResponseText = pickSpeech(language, {
            en: `Today you have ${todayBills} bills totaling ₹${todayRev.toLocaleString('en-IN')}.`,
            kn: `ಇಂದು ಒಟ್ಟು ${todayBills} ಬಿಲ್‌ಗಳಲ್ಲಿ ₹${todayRev.toLocaleString('en-IN')} ಮಾರಾಟವಾಗಿದೆ.`,
            hi: `आज दुकान में कुल ${todayBills} बिल कटे हैं और कुल बिक्री ₹${todayRev.toLocaleString('en-IN')} हुई है।`,
          });
        }
        break;
      }

      case 'UNKNOWN':
      default: {
        spokenResponseText = pickSpeech(language, {
          en: 'Sorry, I could not understand that command. Please try again clearly.',
          kn: 'ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಆದೇಶ ಸ್ಪಷ್ಟವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಹೇಳಿ.',
          hi: 'माफ कीजिए, आदेश स्पष्ट नहीं था। कृपया दोबारा साफ बोलें।',
        });
        break;
      }
    }

    // 5. Gnani Timbre v2.5 Text-to-Speech
    const ttsResult = await synthesizeSpeech(spokenResponseText, { language });

    return res.json({
      success: !validationError,
      transcript,
      intent: resolvedIntent,
      language: nluResult.language || language,
      confidence: nluResult.confidence || 0.9,
      entities: {
        productName,
        variant,
        quantity,
        unit,
        customerName,
        amount,
        paymentMethod,
        dateRange,
      },
      resolvedProduct: resolvedProduct
        ? {
            _id: resolvedProduct._id,
            name: resolvedProduct.name,
            variant: resolvedProduct.variant || '',
            sellingPrice: resolvedProduct.sellingPrice,
            availableStock: resolvedProduct.quantity,
            unit: resolvedProduct.unit,
          }
        : null,
      resolvedCustomer: resolvedCustomer
        ? {
            _id: resolvedCustomer._id,
            name: resolvedCustomer.name,
            totalCredit: resolvedCustomer.totalCredit,
          }
        : null,
      calculatedAmount,
      availableStock,
      requiresConfirmation,
      priceRequired: Boolean(
        requiresConfirmation &&
          executionPayload?.actionType === 'RECORD_SALE' &&
          (!executionPayload.unitPrice || executionPayload.unitPrice <= 0)
      ),
      availableProducts: products.map((p) => ({
        _id: p._id,
        name: p.name,
        variant: p.variant || '',
        unit: p.unit,
        sellingPrice: p.sellingPrice,
        availableStock: p.quantity,
      })),
      availableCustomers: customers.map((c) => ({
        _id: c._id,
        name: c.name,
        totalCredit: c.totalCredit,
      })),
      validationError,
      spokenResponse: spokenResponseText,
      audioBase64: ttsResult.audioBase64 || '',
      format: ttsResult.format || 'wav',
      ttsUnavailable: Boolean(ttsResult.ttsUnavailable),
      executionPayload,
    });
  } catch (err) {
    const stage = err.stage || 'BACKEND_VALIDATION';
    const httpStatus = err.status || (err.isTemporary ? 503 : 500);
    console.error(`[Voice Pipeline] Stage ${stage} failed (HTTP ${httpStatus}): ${err.message}`);

    let message = err.message || 'Voice processing failed. Please try again.';
    if (stage === 'PRISMA_STT' && err.isTemporary) {
      message = pickSpeech(language, {
        en: 'Speech recognition temporarily unavailable. Please try again.',
        kn: 'ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ತಾತ್ಕಾಲಿಕವಾಗಿ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
        hi: 'आवाज़ पहचान सेवा अस्थायी रूप से उपलब्ध नहीं है। कृपया पुनः प्रयास करें।',
      });
    } else if (stage === 'GEMINI_NLU' && err.isTemporary) {
      message = pickSpeech(language, {
        en: 'AI command understanding temporarily unavailable. Please try again.',
        kn: 'AI ಆದೇಶ ಗ್ರಹಿಕೆ ತಾತ್ಕಾಲಿಕವಾಗಿ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
        hi: 'AI आदेश समझने की सेवा अस्थायी रूप से उपलब्ध नहीं है। कृपया पुनः प्रयास करें।',
      });
    }

    return res.status(httpStatus).json({
      success: false,
      stage,
      httpStatus,
      retryable: Boolean(err.isTemporary || stage === 'PRISMA_STT' || stage === 'GEMINI_NLU'),
      transcript: transcript || undefined,
      language,
      message,
    });
  }
}

/**
 * POST /api/voice/execute
 * Executes the confirmed MongoDB operation with duplicate-execution protection -> Timbre TTS response
 */
export async function handleExecuteVoice(req, res) {
  try {
    const { executionPayload, idempotencyKey } = req.body;
    const language =
      req.body.language || req.user?.primaryLanguage || req.shop?.preferredLanguage || 'hi';
    const finalKey = idempotencyKey || req.headers['x-idempotency-key'] || null;

    if (!executionPayload || !executionPayload.actionType) {
      return res.status(400).json({ success: false, message: 'Invalid or missing execution payload.' });
    }

    // Duplicate execution protection across all confirmed voice mutations
    if (finalKey) {
      const existingAudit = await AuditLog.findOne({
        shop: req.shopId,
        'details.idempotencyKey': finalKey,
      }).lean();

      if (existingAudit) {
        const replayMsg = pickSpeech(language, {
          en: 'This action has already been recorded.',
          kn: 'ಈ ಕ್ರಿಯೆಯನ್ನು ಈಗಾಗಲೇ ದಾಖಲಿಸಲಾಗಿದೆ.',
          hi: 'यह कार्य पहले ही दर्ज किया जा चुका है।',
        });
        const tts = await synthesizeSpeech(replayMsg, { language });
        return res.json({
          success: true,
          isDuplicateReplay: true,
          spokenResponse: replayMsg,
          audioBase64: tts.audioBase64 || '',
        });
      }
    }

    clearPendingContext(req.shopId, req.user._id);

    const shopId = req.shopId;
    const userId = req.user._id;
    const { actionType } = executionPayload;
    let result;

    switch (actionType) {
      case 'RECORD_SALE': {
        const {
          productId,
          productName,
          variant = '',
          unit,
          quantity,
          unitPrice,
          updateDefaultPrice = false,
          paymentMethod = 'cash',
          customerId,
          customerName,
        } = executionPayload;

        const requestedQty = Number(quantity);
        if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
          return res.status(400).json({ success: false, message: 'Sale quantity must be greater than zero.' });
        }

        const prodLookup = await findExistingProductForEdit(shopId, {
          productId,
          productName,
          variant,
          unit,
        });

        if (prodLookup.status !== 'matched') {
          return res.status(404).json({
            success: false,
            message: `Product "${productName || ''}" was not found in your shop.`,
          });
        }

        const existingProd = await Product.findOne({
          _id: prodLookup.product._id,
          shop: shopId,
          isActive: true,
        });

        if (!existingProd) {
          return res.status(404).json({
            success: false,
            message: 'Product not found in your shop.',
          });
        }

        if (existingProd.quantity < requestedQty) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${existingProd.name}: only ${existingProd.quantity} ${existingProd.unit} available.`,
          });
        }

        const submittedPrice =
          unitPrice !== undefined && unitPrice !== null && unitPrice !== ''
            ? Number(unitPrice)
            : Number(existingProd.sellingPrice);

        if (!Number.isFinite(submittedPrice) || submittedPrice <= 0) {
          return res.status(400).json({
            success: false,
            message: `Please enter a valid selling price per ${existingProd.unit} greater than zero.`,
          });
        }

        const verifiedUnitPrice = Math.round(submittedPrice * 100) / 100;
        const verifiedTotal = Math.round(requestedQty * verifiedUnitPrice * 100) / 100;

        const stockUpdate = { $inc: { quantity: -requestedQty } };
        if (Boolean(updateDefaultPrice)) {
          stockUpdate.$set = { sellingPrice: verifiedUnitPrice };
        }

        const updatedProd = await Product.findOneAndUpdate(
          { _id: existingProd._id, shop: shopId, isActive: true, quantity: { $gte: requestedQty } },
          stockUpdate,
          { new: true }
        );

        if (!updatedProd) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient stock or product no longer available.',
          });
        }

        const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

        let verifiedCustomer = null;
        if (paymentMethod === 'khata') {
          const custDoc = await findOrCreateCustomerForEdit(shopId, {
            customerId,
            customerName,
            allowCreate: Boolean(customerName && String(customerName).trim()),
          });
          if (!custDoc) {
            await Product.updateOne({ _id: existingProd._id, shop: shopId }, { $inc: { quantity: requestedQty } });
            return res.status(400).json({ success: false, message: 'Customer name is required for Khata sale.' });
          }
          verifiedCustomer = await Customer.findOneAndUpdate(
            { _id: custDoc._id, shop: shopId, isActive: true },
            { $inc: { totalCredit: verifiedTotal } },
            { new: true }
          );
        }

        const sale = await Sale.create({
          shop: shopId,
          invoiceNumber,
          items: [
            {
              product: updatedProd._id,
              name: updatedProd.name,
              quantity: requestedQty,
              price: verifiedUnitPrice,
              total: verifiedTotal,
            },
          ],
          subtotal: verifiedTotal,
          discount: 0,
          total: verifiedTotal,
          paymentMethod,
          customer: verifiedCustomer?._id || null,
          customerName: verifiedCustomer?.name || 'Walk-in Customer',
          idempotencyKey: finalKey || undefined,
        });

        if (verifiedCustomer) {
          await KhataTransaction.create({
            shop: shopId,
            customer: verifiedCustomer._id,
            type: 'credit',
            amount: verifiedTotal,
            description: `Voice Bill #${invoiceNumber}`,
            sale: sale._id,
            balanceAfter: verifiedCustomer.totalCredit,
            idempotencyKey: finalKey ? `${finalKey}:khata` : undefined,
          });
        }

        await recordAuditLog({
          shopId,
          userId,
          action: 'VOICE_SALE_EXECUTED',
          entityType: 'Sale',
          entityId: sale._id,
          details: {
            invoiceNumber,
            total: verifiedTotal,
            unitPrice: verifiedUnitPrice,
            updateDefaultPrice: Boolean(updateDefaultPrice),
            productName: updatedProd.name,
            quantity: requestedQty,
            idempotencyKey: finalKey,
          },
        });

        result = {
          action: 'RECORD_SALE',
          sale,
          updatedProduct: updatedProd,
          spokenResponse: pickSpeech(language, {
            en: `Sale recorded: ${requestedQty} ${updatedProd.unit || 'pcs'} of ${updatedProd.name} at ₹${verifiedUnitPrice} each for ₹${verifiedTotal}.`,
            kn: `ಮಾರಾಟ ದಾಖಲಾಗಿದೆ: ${updatedProd.name} (${requestedQty} ${updatedProd.unit || ''}) ಒಟ್ಟು ₹${verifiedTotal}.`,
            hi: `बिक्री पूरी हुई। ${updatedProd.name} के ${requestedQty} ${updatedProd.unit} का बिल ₹${verifiedTotal} दर्ज कर दिया गया है।`,
          }),
        };
        break;
      }

      case 'ADD_STOCK':
      case 'ADD_PRODUCT': {
        const cleanName = String(executionPayload.productName || executionPayload.name || '').trim();
        if (!cleanName) {
          return res.status(400).json({ success: false, message: 'Product name is required.' });
        }

        const rawQty = executionPayload.quantity ?? executionPayload.delta;
        const qty = Number(rawQty);
        if (!Number.isFinite(qty) || (actionType === 'ADD_STOCK' ? qty <= 0 : qty < 0)) {
          return res.status(400).json({ success: false, message: 'Quantity must be greater than zero.' });
        }

        const cleanUnit = normalizeUnit(executionPayload.unit || 'pcs');
        const variant = String(executionPayload.variant || '').trim();
        const rawPrice = executionPayload.unitPrice ?? executionPayload.sellingPrice;
        const parsedPrice =
          rawPrice !== undefined && rawPrice !== null && rawPrice !== '' ? Number(rawPrice) : 0;
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
          return res.status(400).json({ success: false, message: 'Price cannot be negative.' });
        }

        const lookup = await findExistingProductForEdit(shopId, {
          productId: executionPayload.productId,
          productName: cleanName,
          variant,
          unit: cleanUnit,
        });

        if (lookup.status === 'matched') {
          const updateOps = { $inc: { quantity: qty } };
          if (Boolean(executionPayload.updateDefaultPrice) && parsedPrice > 0) {
            updateOps.$set = { sellingPrice: Math.round(parsedPrice * 100) / 100 };
          }
          const updatedProd = await Product.findOneAndUpdate(
            { _id: lookup.product._id, shop: shopId, isActive: true },
            updateOps,
            { new: true }
          );

          await recordAuditLog({
            shopId,
            userId,
            action: 'VOICE_STOCK_ADDED',
            entityType: 'Product',
            entityId: updatedProd._id,
            details: {
              productName: updatedProd.name,
              unit: updatedProd.unit,
              delta: qty,
              newQuantity: updatedProd.quantity,
              idempotencyKey: finalKey,
            },
          });

          result = {
            action: 'ADD_STOCK',
            updatedProduct: updatedProd,
            spokenResponse: pickSpeech(language, {
              en: `Added ${qty} ${updatedProd.unit} to ${updatedProd.name}. New stock is ${updatedProd.quantity}.`,
              kn: `${updatedProd.name} ಸ್ಟಾಕ್ ${qty} ${updatedProd.unit} ಹೆಚ್ಚಿಸಲಾಗಿದೆ. ಹೊಸ ಸ್ಟಾಕ್ ${updatedProd.quantity}.`,
              hi: `${updatedProd.name} का स्टॉक ${qty} ${updatedProd.unit} बढ़ा दिया गया है। नया स्टॉक ${updatedProd.quantity} है।`,
            }),
          };
          break;
        }

        const finalSellPrice = parsedPrice > 0 ? Math.round(parsedPrice * 100) / 100 : 0;
        const product = await Product.create({
          shop: shopId,
          name: cleanName,
          variant,
          category: executionPayload.category || 'General',
          purchasePrice: finalSellPrice > 0 ? Math.round(finalSellPrice * 0.85) : 0,
          sellingPrice: finalSellPrice,
          quantity: qty,
          unit: cleanUnit,
        });

        await recordAuditLog({
          shopId,
          userId,
          action: 'VOICE_PRODUCT_ADDED',
          entityType: 'Product',
          entityId: product._id,
          details: {
            name: product.name,
            variant: product.variant,
            unit: product.unit,
            quantity: product.quantity,
            sellingPrice: product.sellingPrice,
            idempotencyKey: finalKey,
          },
        });

        result = {
          action: 'ADD_PRODUCT',
          product,
          updatedProduct: product,
          spokenResponse: pickSpeech(language, {
            en: `Added new product "${product.name}" with ${product.quantity} ${product.unit} in stock.`,
            kn: `ಹೊಸ ಸರಕು "${product.name}" (${product.quantity} ${product.unit}) ಸೇರಿಸಲಾಗಿದೆ.`,
            hi: `नया उत्पाद "${product.name}" ${product.quantity} ${product.unit} स्टॉक के साथ जोड़ दिया गया है।`,
          }),
        };
        break;
      }

      case 'REMOVE_STOCK': {
        const delta = Number(executionPayload.quantity ?? executionPayload.delta);
        if (!Number.isFinite(delta) || delta <= 0) {
          return res.status(400).json({ success: false, message: 'Quantity must be greater than zero.' });
        }

        const lookup = await findExistingProductForEdit(shopId, {
          productId: executionPayload.productId,
          productName: executionPayload.productName,
          variant: executionPayload.variant || '',
          unit: executionPayload.unit,
        });

        if (lookup.status !== 'matched') {
          return res.status(404).json({
            success: false,
            message: `Product "${executionPayload.productName || ''}" not found in your shop.`,
          });
        }

        const updatedProd = await Product.findOneAndUpdate(
          { _id: lookup.product._id, shop: shopId, isActive: true, quantity: { $gte: delta } },
          { $inc: { quantity: -delta } },
          { new: true }
        );

        if (!updatedProd) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${lookup.product.name}: only ${lookup.product.quantity} ${lookup.product.unit} available.`,
          });
        }

        await recordAuditLog({
          shopId,
          userId,
          action: 'VOICE_STOCK_REMOVED',
          entityType: 'Product',
          entityId: updatedProd._id,
          details: {
            productName: updatedProd.name,
            unit: updatedProd.unit,
            delta,
            newQuantity: updatedProd.quantity,
            idempotencyKey: finalKey,
          },
        });

        result = {
          action: 'REMOVE_STOCK',
          updatedProduct: updatedProd,
          spokenResponse: pickSpeech(language, {
            en: `Removed ${delta} ${updatedProd.unit} from ${updatedProd.name}. Remaining stock is ${updatedProd.quantity}.`,
            kn: `${updatedProd.name} ಸ್ಟಾಕ್ ${delta} ${updatedProd.unit} ಕಡಿಮೆ ಮಾಡಲಾಗಿದೆ. ಉಳಿದ ಸ್ಟಾಕ್ ${updatedProd.quantity}.`,
            hi: `${updatedProd.name} का स्टॉक ${delta} ${updatedProd.unit} कम कर दिया गया है। शेष स्टॉक ${updatedProd.quantity} है।`,
          }),
        };
        break;
      }

      case 'ADD_CUSTOMER': {
        const cleanName = String(executionPayload.customerName || executionPayload.name || '').trim();
        if (!cleanName) {
          return res.status(400).json({ success: false, message: 'Customer name is required.' });
        }
        const phone = String(executionPayload.phone || '').trim();
        if (phone && !/^[6-9]\d{9}$/.test(phone)) {
          return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian phone number.' });
        }

        const existing = await Customer.findOne({
          shop: shopId,
          name: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          isActive: true,
        });

        if (existing) {
          return res.status(409).json({ success: false, message: `Customer "${existing.name}" already exists.` });
        }

        const customer = await Customer.create({
          shop: shopId,
          name: cleanName,
          phone,
          totalCredit: 0,
        });

        await recordAuditLog({
          shopId,
          userId,
          action: 'VOICE_CUSTOMER_ADDED',
          entityType: 'Customer',
          entityId: customer._id,
          details: { name: customer.name, idempotencyKey: finalKey },
        });

        result = {
          action: 'ADD_CUSTOMER',
          customer,
          spokenResponse: pickSpeech(language, {
            en: `Customer "${customer.name}" added to Digital Khata.`,
            kn: `ಗ್ರಾಹಕ "${customer.name}" ಅವರನ್ನು ಡಿಜಿಟಲ್ ಖಾತಾಕ್ಕೆ ಸೇರಿಸಲಾಗಿದೆ.`,
            hi: `ग्राहक "${customer.name}" का खाता डिजिटल खाता में जोड़ दिया गया है।`,
          }),
        };
        break;
      }

      case 'RECORD_CREDIT': {
        const amt = Number(executionPayload.amount);
        if (!Number.isFinite(amt) || amt <= 0) {
          return res.status(400).json({ success: false, message: 'Credit amount must be greater than zero.' });
        }

        const custDoc = await findOrCreateCustomerForEdit(shopId, {
          customerId: executionPayload.customerId,
          customerName: executionPayload.customerName,
          allowCreate: true,
        });

        if (!custDoc) {
          return res.status(400).json({ success: false, message: 'Customer name is required.' });
        }

        const updatedCust = await Customer.findOneAndUpdate(
          { _id: custDoc._id, shop: shopId, isActive: true },
          { $inc: { totalCredit: amt } },
          { new: true }
        );

        await KhataTransaction.create({
          shop: shopId,
          customer: updatedCust._id,
          type: 'credit',
          amount: amt,
          description: executionPayload.description || 'Voice Udhaar',
          balanceAfter: updatedCust.totalCredit,
          idempotencyKey: finalKey || undefined,
        });

        await recordAuditLog({
          shopId,
          userId,
          action: 'VOICE_CREDIT_RECORDED',
          entityType: 'Customer',
          entityId: updatedCust._id,
          details: { amount: amt, newBalance: updatedCust.totalCredit, idempotencyKey: finalKey },
        });

        result = {
          action: 'RECORD_CREDIT',
          customer: updatedCust,
          spokenResponse: pickSpeech(language, {
            en: `₹${amt} credit added to ${updatedCust.name}'s account.`,
            kn: `${updatedCust.name} ಅವರ ಖಾತೆಗೆ ₹${amt} ಸಾಲ ಸೇರಿಸಲಾಗಿದೆ.`,
            hi: `${updatedCust.name} के खाते में ₹${amt} उधार जोड़ दिया गया है।`,
          }),
        };
        break;
      }

      case 'RECORD_PAYMENT': {
        const amt = Number(executionPayload.amount);
        if (!Number.isFinite(amt) || amt <= 0) {
          return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
        }

        const custDoc = await findOrCreateCustomerForEdit(shopId, {
          customerId: executionPayload.customerId,
          customerName: executionPayload.customerName,
          allowCreate: false,
        });

        if (!custDoc) {
          return res.status(404).json({
            success: false,
            message: `Customer "${executionPayload.customerName || ''}" not found in your Digital Khata.`,
          });
        }

        const updatedCust = await Customer.findOneAndUpdate(
          { _id: custDoc._id, shop: shopId, isActive: true },
          { $inc: { totalCredit: -amt } },
          { new: true }
        );

        await KhataTransaction.create({
          shop: shopId,
          customer: updatedCust._id,
          type: 'payment',
          amount: amt,
          description: executionPayload.description || 'Voice Jama',
          balanceAfter: updatedCust.totalCredit,
          idempotencyKey: finalKey || undefined,
        });

        await recordAuditLog({
          shopId,
          userId,
          action: 'VOICE_PAYMENT_RECORDED',
          entityType: 'Customer',
          entityId: updatedCust._id,
          details: { amount: amt, newBalance: updatedCust.totalCredit, idempotencyKey: finalKey },
        });

        result = {
          action: 'RECORD_PAYMENT',
          customer: updatedCust,
          spokenResponse: pickSpeech(language, {
            en: `₹${amt} payment recorded for ${updatedCust.name}.`,
            kn: `${updatedCust.name} ಅವರ ₹${amt} ಪಾವತಿ ದಾಖಲಾಗಿದೆ.`,
            hi: `${updatedCust.name} का ₹${amt} का भुगतान जमा कर लिया गया है।`,
          }),
        };
        break;
      }

      default:
        return res.status(400).json({ success: false, message: `Unsupported action type: ${actionType}` });
    }

    const tts = await synthesizeSpeech(result.spokenResponse, { language });

    return res.json({
      success: true,
      dbSaved: true,
      ttsUnavailable: Boolean(tts.ttsUnavailable),
      ttsNotice: tts.ttsUnavailable
        ? pickSpeech(language, {
            en: 'Voice response temporarily unavailable. Your operation was saved successfully.',
            kn: 'ಧ್ವನಿ ಉತ್ತರ ತಾತ್ಕಾಲಿಕವಾಗಿ ಲಭ್ಯವಿಲ್ಲ. ನಿಮ್ಮ ಕಾರ್ಯಾಚರಣೆಯನ್ನು ಯಶಸ್ವಿಯಾಗಿ ಉಳಿಸಲಾಗಿದೆ.',
            hi: 'आवाज़ में उत्तर अस्थायी रूप से उपलब्ध नहीं है। आपका कार्य सफलतापूर्वक सेव हो गया है।',
          })
        : undefined,
      result,
      spokenResponse: result.spokenResponse,
      audioBase64: tts.audioBase64 || '',
    });
  } catch (err) {
    console.error('Execute voice error:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to execute voice action.',
    });
  }
}

/**
 * GET /api/voice/diagnostics
 * Returns status for Gnani Prisma v2.5, Google Gemini, and Gnani Timbre v2.5.
 */
export function handleGetDiagnostics(req, res) {
  return res.json({
    success: true,
    services: {
      prisma: {
        model: 'Prisma v2.5',
        role: 'Speech-to-Text (STT)',
        configured: isPrismaConfigured(),
        supportedLanguages: ['hi-IN', 'indic-auto', 'kn-IN', 'en-IN'],
        endpoint: process.env.GNANI_PRISMA_BASE_URL || 'https://api.vachana.ai/stt/v3',
      },
      gemini: {
        model: getGeminiModel(),
        role: 'Natural Language Understanding (NLU)',
        configured: isGeminiConfigured(),
        supportedLanguages: ['hi', 'hinglish', 'kn', 'en'],
        provider: 'Google Gen AI (@google/genai)',
      },
      timbre: {
        model: 'Timbre v2.5',
        role: 'Text-to-Speech (TTS)',
        configured: isTimbreConfigured(),
        supportedLanguages: ['hi-IN', 'kn-IN', 'en-IN'],
        endpoint: process.env.GNANI_TIMBRE_BASE_URL || 'https://api.vachana.ai/api/v1/tts/inference',
      },
    },
  });
}
