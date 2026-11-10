import { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertTriangle,
  Send,
  Loader2,
  HelpCircle,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { translations } from '../i18n/translations.js';
import {
  processVoice,
  executeVoiceCommand,
  playSpokenAudio,
} from '../services/voiceService.js';
import Button from '../components/ui/button.jsx';

const SPOKEN_LANG_OPTIONS = [
  { code: 'hi', label: 'हिंदी' },
  { code: 'hinglish', label: 'Hinglish' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'en', label: 'English' },
];

const EDITABLE_ACTION_TYPES = [
  'ADD_STOCK',
  'REMOVE_STOCK',
  'RECORD_SALE',
  'ADD_CUSTOMER',
  'RECORD_CREDIT',
  'RECORD_PAYMENT',
];

const UNIT_OPTIONS = ['kg', 'g', 'litre', 'ml', 'packet', 'pcs', 'box', 'bottle'];

function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/wav',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function encodeWavFromFloat32(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function convertAudioBlobToWavBase64(blob) {
  if (!blob || blob.size < 256) {
    throw new Error('EMPTY_RECORDING');
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('CONVERSION_UNSUPPORTED');
  }

  const audioCtx = new AudioCtx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);

    if (!decoded || decoded.length === 0 || decoded.duration < 0.15) {
      throw new Error('EMPTY_RECORDING');
    }

    const targetRate = 16000;
    const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offlineCtx = new OfflineAudioContext(1, frameCount, targetRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    const channelData = rendered.getChannelData(0);
    return encodeWavFromFloat32(channelData, targetRate);
  } finally {
    audioCtx.close().catch(() => {});
  }
}

export default function VoiceAssistantPage() {
  const { user } = useAuth();
  const { language, shopProfile, t, refreshDashboardStats, showToast, formatCurrency } = useShop();

  const savedPrimaryLanguage = user?.primaryLanguage || shopProfile?.preferredLanguage || 'hi';

  // Assistant state: 'idle' | 'recording' | 'processing' | 'awaiting_confirmation' | 'clarification' | 'executed' | 'error'
  const [assistantState, setAssistantState] = useState('idle');
  const [spokenLanguage, setSpokenLanguage] = useState(savedPrimaryLanguage);

  // Audio recording refs
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [micError, setMicError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordIntervalRef = useRef(null);

  // Result & NLU state
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [detectedIntent, setDetectedIntent] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [entities, setEntities] = useState({});
  const [resolvedProduct, setResolvedProduct] = useState(null);
  const [resolvedCustomer, setResolvedCustomer] = useState(null);
  const [calculatedAmount, setCalculatedAmount] = useState(null);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [availableCustomers, setAvailableCustomers] = useState([]);
  const [draft, setDraft] = useState(null);
  const [pendingIdempotencyKey, setPendingIdempotencyKey] = useState('');
  const [validationError, setValidationError] = useState(null);
  const [lastVoiceInput, setLastVoiceInput] = useState(null);
  const [canRetryInput, setCanRetryInput] = useState(false);
  const [ttsNotice, setTtsNotice] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);

  // Audio playback
  const [audioBase64, setAudioBase64] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef(null);

  // Manual text input
  const [manualText, setManualText] = useState('');

  useEffect(() => {
    if (assistantState === 'idle') {
      setSpokenLanguage(savedPrimaryLanguage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPrimaryLanguage]);

  const savedPrimaryLabel =
    SPOKEN_LANG_OPTIONS.find((opt) => opt.code === savedPrimaryLanguage)?.label ||
    savedPrimaryLanguage;
  const isTemporaryLangOverride = spokenLanguage !== savedPrimaryLanguage;

  useEffect(() => {
    return () => {
      clearInterval(recordIntervalRef.current);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (audioPlayerRef.current && typeof audioPlayerRef.current.pause === 'function') {
        audioPlayerRef.current.pause();
      }
    };
  }, []);

  const stopPlayback = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioPlayerRef.current && typeof audioPlayerRef.current.pause === 'function') {
      audioPlayerRef.current.pause();
    }
    setIsPlayingAudio(false);
  };

  const triggerAudioPlayback = (text, b64Audio, lang) => {
    if (!text && !b64Audio) return;
    stopPlayback();
    setIsPlayingAudio(true);

    audioPlayerRef.current = playSpokenAudio({
      audioBase64: b64Audio,
      spokenText: text,
      language: lang || spokenLanguage,
      onEnd: () => setIsPlayingAudio(false),
    });
  };

  const startRecording = async () => {
    setMicError(null);
    setValidationError(null);
    stopPlayback();

    try {
      const activeRecordingLanguage = spokenLanguage;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const selectedMime = pickRecorderMimeType();
      const mediaRecorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const recordedMime = mediaRecorder.mimeType || selectedMime || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedMime });
        stream.getTracks().forEach((track) => track.stop());

        if (audioChunksRef.current.length === 0 || audioBlob.size < 256) {
          setAssistantState('error');
          setValidationError(t('voice.emptyRecordingError'));
          return;
        }

        try {
          const wavBase64 = await convertAudioBlobToWavBase64(audioBlob);
          handleProcessVoiceInput({
            audio: wavBase64,
            mimeType: 'audio/wav',
            lang: activeRecordingLanguage,
          });
        } catch (convErr) {
          setAssistantState('error');
          setValidationError(
            convErr?.message === 'EMPTY_RECORDING'
              ? t('voice.emptyRecordingError')
              : t('voice.audioConversionError')
          );
        }
      };

      mediaRecorder.start(200);
      setAssistantState('recording');
      setRecordingDuration(0);

      recordIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (_err) {
      setMicError(t('voice.micDeniedError'));
      setAssistantState('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      clearInterval(recordIntervalRef.current);
      setAssistantState('processing');
    }
  };

  const buildInitialDraft = (result) => {
    const rawAction = result.executionPayload?.actionType || result.intent;
    const isReadOnlySuccess =
      ['CHECK_STOCK', 'LOW_STOCK_REPORT', 'DAILY_SALES_REPORT'].includes(rawAction) &&
      !result.validationError &&
      !result.clarificationRequired;

    if (isReadOnlySuccess) return null;

    const actionType = EDITABLE_ACTION_TYPES.includes(rawAction)
      ? rawAction
      : 'ADD_STOCK';

    const prod = result.resolvedProduct;
    const cust = result.resolvedCustomer;
    const ent = result.entities || {};
    const ep = result.executionPayload || {};

    const initialPrice =
      actionType === 'RECORD_SALE'
        ? prod?.sellingPrice > 0
          ? String(prod.sellingPrice)
          : ''
        : ep.sellingPrice > 0
        ? String(ep.sellingPrice)
        : '';

    return {
      actionType,
      productId: ep.productId || prod?._id || '',
      productName: prod?.name || ep.name || ent.productName || '',
      variant: prod?.variant || ep.variant || ent.variant || '',
      quantity: String(ep.quantity ?? ep.delta ?? ent.quantity ?? ''),
      unit: prod?.unit || ep.unit || ent.unit || 'pcs',
      unitPrice: initialPrice,
      updateDefaultPrice: false,
      paymentMethod: ep.paymentMethod || ent.paymentMethod || 'cash',
      customerId: ep.customerId || cust?._id || '',
      customerName: cust?.name || (ep.customerName && ep.customerName !== 'Walk-in Customer' ? ep.customerName : '') || ent.customerName || '',
      amount: String(ep.amount ?? ent.amount ?? ''),
      phone: '',
      description: ep.description || '',
    };
  };

  const handleProcessVoiceInput = async ({ audio, text, mimeType, lang = spokenLanguage }) => {
    setAssistantState('processing');
    setValidationError(null);
    setDraft(null);
    setAvailableProducts([]);
    setAvailableCustomers([]);
    setTtsNotice('');
    setCanRetryInput(false);
    setLastVoiceInput({ audio, text, mimeType: mimeType || 'audio/wav', lang });

    try {
      const result = await processVoice({
        audio,
        text,
        language: lang,
        mimeType: mimeType || 'audio/wav',
      });

      setTranscript(result.transcript || text || '');
      setAiResponse(result.spokenResponse || '');
      setDetectedIntent(result.intent || 'UNKNOWN');
      setConfidence(result.confidence ?? null);
      setEntities(result.entities || {});
      setResolvedProduct(result.resolvedProduct || null);
      setResolvedCustomer(result.resolvedCustomer || null);
      setCalculatedAmount(result.calculatedAmount ?? null);
      setAvailableProducts(result.availableProducts || []);
      setAvailableCustomers(result.availableCustomers || []);
      setValidationError(result.validationError || null);
      setAudioBase64(result.audioBase64 || '');
      setLastVoiceInput(null);
      setCanRetryInput(false);

      const initialDraft = buildInitialDraft(result);
      setDraft(initialDraft);

      if (result.validationError) {
        setAssistantState('error');
        setPendingIdempotencyKey(
          initialDraft ? `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : ''
        );
      } else if (result.clarificationRequired) {
        setAssistantState('clarification');
        setPendingIdempotencyKey(
          initialDraft ? `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : ''
        );
      } else if (result.requiresConfirmation || initialDraft) {
        setPendingIdempotencyKey(`voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
        setAssistantState('awaiting_confirmation');
      } else {
        setPendingIdempotencyKey('');
        setAssistantState('executed');
        if (refreshDashboardStats) refreshDashboardStats();
      }

      if (result.spokenResponse && !result.ttsUnavailable) {
        triggerAudioPlayback(result.spokenResponse, result.audioBase64, lang);
      }
    } catch (err) {
      const errData = err.response?.data;
      setAssistantState('error');

      if (errData?.transcript) {
        setTranscript(errData.transcript);
        setLastVoiceInput({ text: errData.transcript, lang: errData.language || lang });
      }

      const stage = errData?.stage;
      let msg = errData?.message || t('common.errorGeneric');
      if (stage === 'PRISMA_STT') {
        msg = errData?.message || t('voice.sttUnavailableError');
      } else if (stage === 'GEMINI_NLU') {
        msg = errData?.message || t('voice.nluUnavailableError');
      }

      setValidationError(msg);
      setCanRetryInput(Boolean(audio || text || errData?.transcript));
    }
  };

  // Match edited product/customer against shop lists dynamically
  const matchedProduct = draft
    ? availableProducts.find(
        (p) =>
          p.name.toLowerCase() === draft.productName.trim().toLowerCase() &&
          p.unit.toLowerCase() === draft.unit.trim().toLowerCase()
      ) ||
      availableProducts.find(
        (p) => p.name.toLowerCase() === draft.productName.trim().toLowerCase()
      ) ||
      null
    : null;

  const matchedCustomer = draft
    ? availableCustomers.find(
        (c) => c.name.toLowerCase() === draft.customerName.trim().toLowerCase()
      ) || null
    : null;

  const showEditableForm = Boolean(draft) && assistantState !== 'executed' && assistantState !== 'processing';

  const parsedQty = Number(draft?.quantity);
  const parsedPrice = Number(draft?.unitPrice);
  const parsedAmount = Number(draft?.amount);

  const isProductAction = draft && ['ADD_STOCK', 'REMOVE_STOCK', 'RECORD_SALE'].includes(draft.actionType);
  const isKhataAction = draft && ['RECORD_CREDIT', 'RECORD_PAYMENT'].includes(draft.actionType);
  const needsCustomer =
    draft &&
    (['ADD_CUSTOMER', 'RECORD_CREDIT', 'RECORD_PAYMENT'].includes(draft.actionType) ||
      (draft.actionType === 'RECORD_SALE' && draft.paymentMethod === 'khata'));

  const hasValidProductName = !isProductAction || Boolean(draft?.productName?.trim());
  const hasValidQty = !isProductAction || (Number.isFinite(parsedQty) && parsedQty > 0);
  const hasValidSalePrice =
    draft?.actionType !== 'RECORD_SALE' || (Number.isFinite(parsedPrice) && parsedPrice > 0);
  const hasValidCustomerName = !needsCustomer || Boolean(draft?.customerName?.trim());
  const hasValidAmount = !isKhataAction || (Number.isFinite(parsedAmount) && parsedAmount > 0);

  const missingRequiredExistingProduct =
    draft &&
    ['REMOVE_STOCK', 'RECORD_SALE'].includes(draft.actionType) &&
    draft.productName.trim().length > 0 &&
    !matchedProduct;

  const missingRequiredExistingCustomer =
    draft?.actionType === 'RECORD_PAYMENT' &&
    draft.customerName.trim().length > 0 &&
    !matchedCustomer;

  const insufficientStock =
    draft &&
    ['REMOVE_STOCK', 'RECORD_SALE'].includes(draft.actionType) &&
    matchedProduct &&
    Number.isFinite(parsedQty) &&
    parsedQty > matchedProduct.availableStock;

  const liveSaleTotal =
    draft?.actionType === 'RECORD_SALE' &&
    Number.isFinite(parsedQty) &&
    parsedQty > 0 &&
    Number.isFinite(parsedPrice) &&
    parsedPrice > 0
      ? Math.round(parsedQty * parsedPrice * 100) / 100
      : null;

  const canConfirmDraft =
    showEditableForm &&
    hasValidProductName &&
    hasValidQty &&
    hasValidSalePrice &&
    hasValidCustomerName &&
    hasValidAmount &&
    !missingRequiredExistingProduct &&
    !missingRequiredExistingCustomer &&
    !insufficientStock;

  const handleDraftProductNameChange = (value) => {
    const picked =
      availableProducts.find(
        (p) =>
          p.name.toLowerCase() === value.trim().toLowerCase() &&
          p.unit.toLowerCase() === (draft?.unit || '').toLowerCase()
      ) ||
      availableProducts.find((p) => p.name.toLowerCase() === value.trim().toLowerCase());

    setDraft((prev) => ({
      ...prev,
      productName: value,
      productId: picked ? picked._id : '',
      unit: picked?.unit || prev.unit,
      unitPrice:
        prev.actionType === 'RECORD_SALE'
          ? picked?.sellingPrice > 0
            ? String(picked.sellingPrice)
            : ''
          : prev.unitPrice,
    }));
  };

  const handleDraftActionChange = (nextAction) => {
    setDraft((prev) => {
      const currentMatch =
        availableProducts.find(
          (p) => p.name.toLowerCase() === prev.productName.trim().toLowerCase()
        ) || null;
      return {
        ...prev,
        actionType: nextAction,
        unitPrice:
          nextAction === 'RECORD_SALE' && !prev.unitPrice && currentMatch?.sellingPrice > 0
            ? String(currentMatch.sellingPrice)
            : prev.unitPrice,
      };
    });
  };

  const getDraftSummaryText = () => {
    if (!draft) return '';
    const actName =
      (translations[language] || translations.en).voice.intentNames[draft.actionType] ||
      draft.actionType;
    if (draft.actionType === 'RECORD_SALE') {
      const totalStr = liveSaleTotal !== null ? formatCurrency(liveSaleTotal) : '—';
      return `${actName}: ${draft.quantity || 0} ${draft.unit} ${draft.productName || '—'} × ${
        Number.isFinite(parsedPrice) && parsedPrice > 0 ? formatCurrency(parsedPrice) : '—'
      } = ${totalStr}`;
    }
    if (draft.actionType === 'ADD_STOCK' || draft.actionType === 'REMOVE_STOCK') {
      return `${actName}: ${draft.quantity || 0} ${draft.unit} ${draft.productName || '—'}`;
    }
    if (draft.actionType === 'ADD_CUSTOMER') {
      return `${actName}: ${draft.customerName || '—'}`;
    }
    return `${actName}: ${formatCurrency(parsedAmount || 0)} — ${draft.customerName || '—'}`;
  };

  const handleExecute = async () => {
    if (!draft || isExecuting || !canConfirmDraft) return;

    setIsExecuting(true);
    setTtsNotice('');

    try {
      const idempotencyKey =
        pendingIdempotencyKey || `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const payloadToExecute = {
        actionType: draft.actionType,
        productId: matchedProduct?._id || draft.productId || undefined,
        productName: draft.productName.trim(),
        name: draft.productName.trim(),
        variant: draft.variant.trim(),
        quantity: parsedQty,
        delta: parsedQty,
        unit: draft.unit.trim() || 'pcs',
        unitPrice:
          draft.unitPrice !== '' && Number.isFinite(parsedPrice) ? parsedPrice : undefined,
        updateDefaultPrice: Boolean(draft.updateDefaultPrice),
        paymentMethod: draft.paymentMethod || 'cash',
        customerId: matchedCustomer?._id || draft.customerId || undefined,
        customerName: draft.customerName.trim(),
        phone: draft.phone.trim(),
        amount: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
        description: draft.description.trim() || undefined,
      };

      const result = await executeVoiceCommand({
        executionPayload: payloadToExecute,
        idempotencyKey,
        language: spokenLanguage,
      });

      if (result.result?.sale?.total !== undefined) {
        setCalculatedAmount(result.result.sale.total);
      } else if (liveSaleTotal !== null) {
        setCalculatedAmount(liveSaleTotal);
      }

      if (result.result?.updatedProduct) {
        setResolvedProduct({
          _id: result.result.updatedProduct._id,
          name: result.result.updatedProduct.name,
          availableStock: result.result.updatedProduct.quantity,
          unit: result.result.updatedProduct.unit,
          sellingPrice: result.result.updatedProduct.sellingPrice,
        });
      }

      if (result.result?.customer) {
        setResolvedCustomer({
          _id: result.result.customer._id,
          name: result.result.customer.name,
          totalCredit: result.result.customer.totalCredit,
        });
      }

      setDetectedIntent(result.result?.action || draft.actionType);
      setEntities({
        productName: draft.productName.trim() || null,
        quantity: Number.isFinite(parsedQty) ? parsedQty : null,
        unit: draft.unit || null,
        customerName: draft.customerName.trim() || null,
        amount: Number.isFinite(parsedAmount) ? parsedAmount : null,
      });
      setValidationError(null);
      setAiResponse(result.spokenResponse || '');
      setAudioBase64(result.audioBase64 || '');
      setAssistantState('executed');
      setDraft(null);
      setPendingIdempotencyKey('');

      if (result.ttsUnavailable) {
        setTtsNotice(result.ttsNotice || t('voice.ttsUnavailableSaved'));
      } else if (result.spokenResponse) {
        triggerAudioPlayback(result.spokenResponse, result.audioBase64, spokenLanguage);
      }

      if (refreshDashboardStats) {
        refreshDashboardStats();
      }
      showToast(t('voice.executionSuccessToast'), 'success');
    } catch (err) {
      showToast(err.response?.data?.message || t('common.errorGeneric'), 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleReset = () => {
    stopPlayback();
    setAssistantState('idle');
    setTranscript('');
    setAiResponse('');
    setDetectedIntent('');
    setEntities({});
    setResolvedProduct(null);
    setResolvedCustomer(null);
    setCalculatedAmount(null);
    setDraft(null);
    setAvailableProducts([]);
    setAvailableCustomers([]);
    setPendingIdempotencyKey('');
    setValidationError(null);
    setLastVoiceInput(null);
    setCanRetryInput(false);
    setTtsNotice('');
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualText.trim()) {
      showToast(t('voice.emptyInputError'), 'warning');
      return;
    }
    const textToSend = manualText.trim();
    setManualText('');
    handleProcessVoiceInput({ text: textToSend, lang: spokenLanguage });
  };

  const intentDisplayName =
    (translations[language] || translations.en).voice.intentNames[detectedIntent] ||
    detectedIntent;

  const getStatusLabel = () => {
    switch (assistantState) {
      case 'recording':
        return t('voice.listeningSeconds', { sec: recordingDuration });
      case 'processing':
        return t('voice.statusProcessing');
      case 'awaiting_confirmation':
        return t('voice.statusAwaitingConfirm');
      case 'clarification':
        return t('voice.clarificationNeeded');
      case 'executed':
        return t('voice.statusExecuted');
      case 'error':
        return t('voice.statusError');
      default:
        return t('voice.statusIdle');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header & Spoken Language Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            {t('voice.title')}
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">{t('voice.subtitle')}</p>
        </div>

        <div className="flex flex-col sm:items-end gap-1.5 self-start sm:self-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-500 whitespace-nowrap">
              {t('voice.spokenLanguageLabel')}:
            </span>
            <div className="inline-flex bg-white border border-stone-200/90 rounded-xl p-1 shadow-xs">
              {SPOKEN_LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  disabled={assistantState === 'recording' || assistantState === 'processing'}
                  onClick={() => setSpokenLanguage(opt.code)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    spokenLanguage === opt.code
                      ? 'bg-emerald-700 text-white'
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {isTemporaryLangOverride && (
            <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-lg">
              <span>{t('voice.temporaryLangBadge', { lang: savedPrimaryLabel })}</span>
              <button
                type="button"
                disabled={assistantState === 'recording' || assistantState === 'processing'}
                onClick={() => setSpokenLanguage(savedPrimaryLanguage)}
                className="font-semibold underline hover:text-amber-950 disabled:opacity-60"
              >
                {t('voice.resetToDefaultLang')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Microphone Capture Card */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs p-6 sm:p-8 flex flex-col items-center text-center space-y-5">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
            assistantState === 'recording'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : assistantState === 'processing'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : assistantState === 'executed'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : assistantState === 'error'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-stone-50 text-stone-600 border-stone-200'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              assistantState === 'recording'
                ? 'bg-rose-600'
                : assistantState === 'processing'
                ? 'bg-amber-500'
                : assistantState === 'executed'
                ? 'bg-emerald-600'
                : assistantState === 'error'
                ? 'bg-rose-600'
                : 'bg-emerald-600'
            }`}
          />
          <span>{getStatusLabel()}</span>
        </div>

        <div className="py-2">
          {assistantState === 'recording' ? (
            <button
              type="button"
              onClick={stopRecording}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex flex-col items-center justify-center gap-1.5 shadow-md transition-colors focus:outline-none focus:ring-4 focus:ring-rose-500/25"
              aria-label={t('voice.tapToStop')}
            >
              <Square size={28} className="fill-white" />
              <span className="text-[11px] font-semibold">{t('voice.tapToStop')}</span>
            </button>
          ) : assistantState === 'processing' ? (
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-stone-100 border-2 border-stone-200 text-emerald-700 flex items-center justify-center">
              <Loader2 size={32} className="animate-spin" />
            </div>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white flex flex-col items-center justify-center gap-1.5 shadow-md transition-colors focus:outline-none focus:ring-4 focus:ring-emerald-600/25"
              aria-label={t('voice.tapToSpeak')}
            >
              <Mic size={32} />
              <span className="text-[11px] font-semibold px-2 leading-tight">
                {t('voice.tapToSpeak')}
              </span>
            </button>
          )}
        </div>

        {assistantState === 'processing' && (
          <p className="text-xs text-stone-500">{t('voice.processingPrompt')}</p>
        )}

        {micError && (
          <div className="w-full max-w-lg p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-left flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{micError}</span>
          </div>
        )}

        <form onSubmit={handleManualSubmit} className="w-full max-w-xl flex gap-2 pt-2">
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={t('voice.typeOrSpeakPlaceholder')}
            className="input-field flex-1"
            disabled={assistantState === 'processing' || assistantState === 'recording'}
          />
          <Button
            type="submit"
            disabled={assistantState === 'processing' || assistantState === 'recording'}
            className="gap-1.5 shrink-0"
          >
            <Send size={15} />
            <span>{t('voice.sendCommandBtn')}</span>
          </Button>
        </form>
      </div>

      {/* Results, Interpretation, Editable Form & Confirmation Card */}
      {(transcript || aiResponse || validationError || showEditableForm) && (
        <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs p-5 sm:p-6 space-y-5">
          {/* Transcribed Speech */}
          {transcript && (
            <div className="pb-4 border-b border-stone-100">
              <p className="text-[11px] font-semibold text-stone-400 mb-1">
                {t('voice.transcribedSpeech')}
              </p>
              <p className="text-sm sm:text-base font-semibold text-stone-900">“{transcript}”</p>
            </div>
          )}

          {/* Validation / API Error Banner */}
          {validationError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 flex-1">
                <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">{t('voice.statusError')}</p>
                  <p className="mt-0.5">{validationError}</p>
                </div>
              </div>
              {canRetryInput && lastVoiceInput && (
                <button
                  type="button"
                  onClick={() => handleProcessVoiceInput(lastVoiceInput)}
                  className="btn-secondary text-xs py-1.5 px-3 shrink-0 self-start sm:self-center border-rose-200 text-rose-800 hover:bg-rose-100/70"
                >
                  <RotateCcw size={13} />
                  <span>{t('common.retry')}</span>
                </button>
              )}
            </div>
          )}

          {/* TTS Unavailable Notice after successful DB save */}
          {ttsNotice && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
              <span>{ttsNotice}</span>
            </div>
          )}

          {/* Clarification Needed Banner */}
          {assistantState === 'clarification' && aiResponse && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-2.5">
              <HelpCircle size={18} className="text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{t('voice.clarificationNeeded')}</p>
                <p className="mt-1">{aiResponse}</p>
              </div>
            </div>
          )}

          {/* Editable Command Form (always available for transactional or partially failed commands) */}
          {showEditableForm && draft && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-stone-500">
                  {t('voice.editCommandTitle')}
                </h3>
                {confidence !== null && (
                  <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/70">
                    {t('voice.confidenceLabel')}: {Math.round(confidence * 100)}%
                  </span>
                )}
              </div>

              <datalist id="voice-shop-products">
                {availableProducts.map((p) => (
                  <option key={p._id} value={p.name}>
                    {p.availableStock} {p.unit}
                  </option>
                ))}
              </datalist>

              <datalist id="voice-shop-customers">
                {availableCustomers.map((c) => (
                  <option key={c._id} value={c.name} />
                ))}
              </datalist>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* Action Selector */}
                <div>
                  <label className="block font-semibold text-stone-600 mb-1">
                    {t('voice.editActionLabel')}
                  </label>
                  <select
                    value={draft.actionType}
                    onChange={(e) => handleDraftActionChange(e.target.value)}
                    className="input-field py-2 text-xs"
                  >
                    {EDITABLE_ACTION_TYPES.map((code) => (
                      <option key={code} value={code}>
                        {(translations[language] || translations.en).voice.intentNames[code] || code}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Product Name */}
                {isProductAction && (
                  <div>
                    <label className="block font-semibold text-stone-600 mb-1">
                      {t('voice.productLabel')}
                    </label>
                    <input
                      type="text"
                      list="voice-shop-products"
                      value={draft.productName}
                      onChange={(e) => handleDraftProductNameChange(e.target.value)}
                      className="input-field py-2 text-xs"
                    />
                    {draft.productName.trim() && (
                      <p className="text-[11px] mt-1 text-stone-500">
                        {matchedProduct ? (
                          <span>
                            {t('voice.stockAvailableLabel')}: {matchedProduct.availableStock}{' '}
                            {matchedProduct.unit}
                          </span>
                        ) : draft.actionType === 'ADD_STOCK' ? (
                          <span className="text-emerald-700">{t('voice.newProductHint')}</span>
                        ) : (
                          <span className="text-rose-700">{t('voice.productNotFoundInline')}</span>
                        )}
                      </p>
                    )}
                  </div>
                )}

                {/* Quantity */}
                {isProductAction && (
                  <div>
                    <label className="block font-semibold text-stone-600 mb-1">
                      {t('voice.quantityLabel')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={draft.quantity}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, quantity: e.target.value }))
                      }
                      className="input-field py-2 text-xs"
                    />
                  </div>
                )}

                {/* Unit */}
                {isProductAction && (
                  <div>
                    <label className="block font-semibold text-stone-600 mb-1">
                      {t('voice.unitLabel')}
                    </label>
                    <select
                      value={draft.unit}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, unit: e.target.value }))
                      }
                      className="input-field py-2 text-xs"
                    >
                      {[...new Set([draft.unit, ...UNIT_OPTIONS])]
                        .filter(Boolean)
                        .map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Price (required for Sale, optional for Add Stock) */}
                {(draft.actionType === 'RECORD_SALE' || draft.actionType === 'ADD_STOCK') && (
                  <div>
                    <label className="block font-semibold text-stone-600 mb-1">
                      {t('voice.pricePerUnitLabel', { unit: draft.unit })}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={draft.actionType === 'RECORD_SALE' ? '0.01' : '0'}
                      placeholder={t('voice.enterPricePlaceholder')}
                      value={draft.unitPrice}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, unitPrice: e.target.value }))
                      }
                      className={`input-field py-2 text-xs ${
                        draft.actionType === 'RECORD_SALE' && !hasValidSalePrice
                          ? 'border-amber-400 bg-amber-50/40'
                          : ''
                      }`}
                    />
                  </div>
                )}

                {/* Payment Method for Sale */}
                {draft.actionType === 'RECORD_SALE' && (
                  <div>
                    <label className="block font-semibold text-stone-600 mb-1">
                      {t('voice.paymentMethodLabel')}
                    </label>
                    <select
                      value={draft.paymentMethod}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, paymentMethod: e.target.value }))
                      }
                      className="input-field py-2 text-xs"
                    >
                      <option value="cash">{t('common.cash')}</option>
                      <option value="upi">{t('common.upi')}</option>
                      <option value="khata">{t('common.khata')}</option>
                    </select>
                  </div>
                )}

                {/* Customer Name */}
                {needsCustomer && (
                  <div>
                    <label className="block font-semibold text-stone-600 mb-1">
                      {t('voice.customerLabel')}
                    </label>
                    <input
                      type="text"
                      list="voice-shop-customers"
                      value={draft.customerName}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          customerName: e.target.value,
                          customerId: '',
                        }))
                      }
                      className="input-field py-2 text-xs"
                    />
                    {draft.customerName.trim() && (
                      <p className="text-[11px] mt-1 text-stone-500">
                        {matchedCustomer ? (
                          <span>
                            {t('khata.currentBalance')}:{' '}
                            {formatCurrency(matchedCustomer.totalCredit)}
                          </span>
                        ) : draft.actionType === 'RECORD_PAYMENT' ? (
                          <span className="text-rose-700">{t('voice.customerNotFoundInline')}</span>
                        ) : (
                          <span className="text-emerald-700">{t('voice.newCustomerHint')}</span>
                        )}
                      </p>
                    )}
                  </div>
                )}

                {/* Amount for Credit / Payment */}
                {isKhataAction && (
                  <div>
                    <label className="block font-semibold text-stone-600 mb-1">
                      {t('voice.amountLabel')} (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={draft.amount}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, amount: e.target.value }))
                      }
                      className="input-field py-2 text-xs"
                    />
                  </div>
                )}

                {/* Optional Phone for Add Customer */}
                {draft.actionType === 'ADD_CUSTOMER' && (
                  <div>
                    <label className="block font-semibold text-stone-600 mb-1">
                      {t('voice.phoneOptionalLabel')}
                    </label>
                    <input
                      type="tel"
                      value={draft.phone}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      className="input-field py-2 text-xs"
                    />
                  </div>
                )}

                {/* Optional Note for Credit / Payment */}
                {isKhataAction && (
                  <div>
                    <label className="block font-semibold text-stone-600 mb-1">
                      {t('voice.notesOptionalLabel')}
                    </label>
                    <input
                      type="text"
                      value={draft.description}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, description: e.target.value }))
                      }
                      className="input-field py-2 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Warnings for Missing Sale Price or Insufficient Stock */}
              {draft.actionType === 'RECORD_SALE' && !hasValidSalePrice && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <AlertTriangle size={15} className="text-amber-700 shrink-0 mt-0.5" />
                  <span>{t('voice.priceRequiredNote', { unit: draft.unit })}</span>
                </div>
              )}

              {insufficientStock && matchedProduct && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>
                    {t('voice.insufficientStockInline', {
                      available: matchedProduct.availableStock,
                      unit: matchedProduct.unit,
                    })}
                  </span>
                </div>
              )}

              {/* Final Operation Summary + Optional Default Price Checkbox */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70">
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-emerald-800">
                    {t('voice.summaryLabel')}
                  </p>
                  <p className="text-xs sm:text-sm font-semibold text-emerald-950">
                    {getDraftSummaryText()}
                  </p>
                  {(draft.actionType === 'RECORD_SALE' ||
                    (draft.actionType === 'ADD_STOCK' && draft.unitPrice)) && (
                    <label className="inline-flex items-center gap-2 text-xs text-stone-700 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={draft.updateDefaultPrice}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            updateDefaultPrice: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 accent-emerald-700 rounded border-stone-300"
                      />
                      <span>{t('voice.updateDefaultPriceLabel')}</span>
                    </label>
                  )}
                </div>

                {draft.actionType === 'RECORD_SALE' && (
                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-medium text-emerald-800 block">
                      {t('voice.calculatedTotalLabel')}
                    </span>
                    <span className="font-bold text-emerald-900 text-base">
                      {liveSaleTotal !== null
                        ? formatCurrency(liveSaleTotal)
                        : t('voice.enterPriceToCalculate')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Read-only Summary after Execution or Read-only Queries */}
          {!showEditableForm && detectedIntent && !validationError && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-stone-500">
                  {t('voice.interpretationTitle')}
                </h3>
                {confidence !== null && (
                  <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/70">
                    {t('voice.confidenceLabel')}: {Math.round(confidence * 100)}%
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-warm-50 border border-stone-200/70">
                  <span className="text-stone-500 block">{t('voice.detectedAction')}</span>
                  <span className="font-semibold text-stone-900 text-sm mt-0.5 block">
                    {intentDisplayName}
                  </span>
                </div>

                {(resolvedProduct?.name || entities.productName) && (
                  <div className="p-3 rounded-xl bg-warm-50 border border-stone-200/70">
                    <span className="text-stone-500 block">{t('voice.productLabel')}</span>
                    <span className="font-semibold text-stone-900 text-sm mt-0.5 block truncate">
                      {resolvedProduct?.name || entities.productName}
                    </span>
                  </div>
                )}

                {entities.quantity && (
                  <div className="p-3 rounded-xl bg-warm-50 border border-stone-200/70">
                    <span className="text-stone-500 block">{t('voice.quantityLabel')}</span>
                    <span className="font-semibold text-stone-900 text-sm mt-0.5 block">
                      {entities.quantity} {entities.unit || resolvedProduct?.unit || ''}
                    </span>
                  </div>
                )}

                {(resolvedCustomer?.name || entities.customerName) && (
                  <div className="p-3 rounded-xl bg-warm-50 border border-stone-200/70">
                    <span className="text-stone-500 block">{t('voice.customerLabel')}</span>
                    <span className="font-semibold text-stone-900 text-sm mt-0.5 block truncate">
                      {resolvedCustomer?.name || entities.customerName}
                    </span>
                  </div>
                )}

                {(calculatedAmount !== null || entities.amount) && (
                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/70">
                    <span className="text-emerald-800 block">{t('voice.calculatedTotalLabel')}</span>
                    <span className="font-bold text-emerald-900 text-base mt-0.5 block">
                      {formatCurrency(calculatedAmount ?? entities.amount)}
                    </span>
                  </div>
                )}

                {resolvedProduct?.availableStock !== undefined && (
                  <div className="p-3 rounded-xl bg-warm-50 border border-stone-200/70">
                    <span className="text-stone-500 block">{t('voice.stockAvailableLabel')}</span>
                    <span className="font-semibold text-stone-900 text-sm mt-0.5 block">
                      {resolvedProduct.availableStock} {resolvedProduct.unit || ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Assistant Spoken Response + Playback */}
          {aiResponse && assistantState !== 'clarification' && (
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                {assistantState === 'executed' && (
                  <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
                )}
                <p className="text-xs sm:text-sm text-stone-800 font-medium">{aiResponse}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  isPlayingAudio
                    ? stopPlayback()
                    : triggerAudioPlayback(aiResponse, audioBase64, spokenLanguage)
                }
                className="btn-secondary text-xs py-1.5 px-3 shrink-0 self-start sm:self-auto"
              >
                {isPlayingAudio ? <VolumeX size={14} /> : <Volume2 size={14} />}
                <span>
                  {isPlayingAudio ? t('voice.pauseVoiceResponse') : t('voice.playVoiceResponse')}
                </span>
              </button>
            </div>
          )}

          {/* Cancel / Confirm & Save Action Bar */}
          {showEditableForm && (
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-stone-100">
              <Button type="button" variant="secondary" onClick={handleReset} disabled={isExecuting}>
                {t('voice.cancelCommand')}
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={handleExecute}
                disabled={isExecuting || !canConfirmDraft}
              >
                {isExecuting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>{t('voice.executing')}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>{t('voice.confirmAndExecute')}</span>
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Done button when executed or non-editable error */}
          {(assistantState === 'executed' || (assistantState === 'error' && !showEditableForm)) && (
            <div className="flex justify-end pt-1">
              <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw size={14} />
                <span>{t('common.done')}</span>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
