import api from './api.js';

/**
 * Voice Service — Interfaces with DukaanVoice AI Backend:
 * - Gnani Prisma v2.5: Speech-to-Text
 * - Google Gemini: Natural Language Understanding & Intent Extraction
 * - Gnani Timbre v2.5: Text-to-Speech
 */

/**
 * Process spoken audio or transcript text through Gnani pipeline.
 *
 * @param {Object} params
 * @param {String} [params.audio] - Base64 encoded audio
 * @param {String} [params.text] - Spoken transcript if typed or simulated
 * @param {String} [params.language='hi'] - 'hi' | 'hinglish' | 'kn'
 * @param {String} [params.mimeType='audio/wav']
 * @returns {Promise<Object>}
 */
export async function processVoice({ audio, text, language = 'hi', mimeType = 'audio/webm' }) {
  const response = await api.post('/voice/process', {
    audio,
    text,
    language,
    mimeType,
  });
  return response.data;
}

/**
 * Execute an approved voice transaction (e.g. RECORD_SALE, ADD_STOCK, RECORD_CREDIT).
 *
 * @param {Object} params
 * @param {Object} params.executionPayload
 * @param {String} [params.idempotencyKey]
 * @returns {Promise<Object>}
 */
export async function executeVoiceCommand({ executionPayload, idempotencyKey, language = 'hi' }) {
  const finalKey = idempotencyKey || `voice_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const response = await api.post(
    '/voice/execute',
    {
      executionPayload,
      idempotencyKey: finalKey,
      language,
    },
    {
      headers: {
        'X-Idempotency-Key': finalKey,
      },
    }
  );
  return response.data;
}

/**
 * Get diagnostics and status for the voice AI pipeline (Prisma v2.5, Google Gemini, Timbre v2.5).
 */
export async function getVoiceDiagnostics() {
  const response = await api.get('/voice/diagnostics');
  return response.data;
}

/**
 * Plays Timbre v2.5 synthesized audio (Base64) or falls back to Web Speech API.
 *
 * @param {Object} options
 * @param {String} options.audioBase64
 * @param {String} options.spokenText
 * @param {String} options.language - 'hi' | 'kn' | 'hinglish'
 * @param {Function} [options.onEnd]
 * @returns {Audio|SpeechSynthesisUtterance|null}
 */
export function playSpokenAudio({ audioBase64, spokenText, language = 'hi', onEnd }) {
  // If Timbre returned actual Base64 audio
  if (audioBase64) {
    try {
      const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
      if (onEnd) {
        audio.onended = onEnd;
        audio.onerror = onEnd;
      }
      audio.play().catch((err) => {
        console.warn('Audio autoplay prevented or failed:', err);
        fallbackBrowserTTS(spokenText, language, onEnd);
      });
      return audio;
    } catch (e) {
      console.warn('Failed to initialize Audio element, falling back to Web Speech:', e);
    }
  }

  // Web Speech API fallback for adapter mode
  return fallbackBrowserTTS(spokenText, language, onEnd);
}

function fallbackBrowserTTS(text, language, onEnd) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    if (onEnd) onEnd();
    return null;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  
  if (language === 'kn') {
    utterance.lang = 'kn-IN';
  } else if (language === 'hi' || language === 'hinglish') {
    utterance.lang = 'hi-IN';
  } else {
    utterance.lang = 'en-IN';
  }

  utterance.rate = 0.95;
  utterance.pitch = 1.0;

  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }

  window.speechSynthesis.speak(utterance);
  return utterance;
}

