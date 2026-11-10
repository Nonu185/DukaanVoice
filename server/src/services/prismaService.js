/**
 * Gnani Prisma v2.5 — Speech-to-Text (STT) Service
 *
 * Official Gnani STT API Specification:
 * - Base URL: https://api.vachana.ai/stt/v3 (or process.env.GNANI_PRISMA_BASE_URL)
 * - Model: prisma-v2.5
 * - Auth Header: X-API-Key-ID: <GNANI_API_KEY>
 * - Request Format: multipart/form-data (audio_file, language_code, model)
 * - Supported Languages: 'hi-IN' (Hindi), 'indic-auto' (Hinglish), 'kn-IN' (Kannada), 'en-IN' (English)
 * - Supported Audio: MP3, WAV, M4A, OGG, FLAC, AAC
 */

const PRISMA_BASE_URL =
  process.env.GNANI_PRISMA_BASE_URL || 'https://api.vachana.ai/stt/v3';
const PRISMA_API_KEY = process.env.GNANI_API_KEY;

const SUPPORTED_PRISMA_LANGUAGES = [
  'as-IN',
  'bn-IN',
  'en-IN',
  'gu-IN',
  'hi-IN',
  'indic-auto',
  'kn-IN',
  'ml-IN',
  'mr-IN',
  'pa-IN',
  'ta-IN',
  'te-IN',
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createStageError(message, { status = 500, isTemporary = false } = {}) {
  const err = new Error(message);
  err.stage = 'PRISMA_STT';
  err.status = status;
  err.isTemporary = isTemporary;
  return err;
}

export function mapPrismaLanguage(lang) {
  const normalized = String(lang || '').trim().toLowerCase();
  if (!normalized) return 'hi-IN';

  switch (normalized) {
    case 'hi':
    case 'hindi':
    case 'hi-in':
      return 'hi-IN';
    case 'hinglish':
    case 'indic-auto':
      return 'indic-auto';
    case 'kn':
    case 'kannada':
    case 'kn-in':
      return 'kn-IN';
    case 'en':
    case 'english':
    case 'en-in':
      return 'en-IN';
    default: {
      const matched = SUPPORTED_PRISMA_LANGUAGES.find(
        (code) => code.toLowerCase() === normalized
      );
      if (matched) return matched;
      throw createStageError(
        `Unsupported speech recognition language "${lang}". Please select Hindi, Hinglish, Kannada, or English.`,
        { status: 400 }
      );
    }
  }
}

export function isPrismaConfigured() {
  const key = process.env.GNANI_API_KEY;
  return Boolean(key && key !== 'your_gnani_api_key' && key !== 'your_gnani_unified_api_key');
}

function resolveSupportedAudioFormat(rawMimeType = '') {
  const mime = String(rawMimeType || '').split(';')[0].trim().toLowerCase();
  if (mime === 'audio/wav' || mime === 'audio/wave' || mime === 'audio/x-wav') {
    return { mimeType: 'audio/wav', filename: 'audio.wav' };
  }
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') {
    return { mimeType: 'audio/mpeg', filename: 'audio.mp3' };
  }
  if (mime === 'audio/mp4' || mime === 'audio/m4a' || mime === 'audio/x-m4a') {
    return { mimeType: 'audio/mp4', filename: 'audio.m4a' };
  }
  if (mime === 'audio/ogg') {
    return { mimeType: 'audio/ogg', filename: 'audio.ogg' };
  }
  if (mime === 'audio/flac' || mime === 'audio/x-flac') {
    return { mimeType: 'audio/flac', filename: 'audio.flac' };
  }
  if (mime === 'audio/aac') {
    return { mimeType: 'audio/aac', filename: 'audio.aac' };
  }
  return null;
}

/**
 * Transcribes an audio recording using Gnani Prisma v2.5 with retries on temporary 503/429 errors.
 */
export async function transcribeAudio(audioData, options = {}) {
  const language = options.language || 'hi';
  const gnaniLang = mapPrismaLanguage(language);

  if (!isPrismaConfigured()) {
    throw createStageError('Gnani Prisma v2.5 STT requires GNANI_API_KEY in server/.env.', {
      status: 500,
    });
  }

  const audioBuffer = Buffer.isBuffer(audioData)
    ? audioData
    : Buffer.from(audioData || '', 'base64');

  if (!audioBuffer || audioBuffer.length < 44) {
    throw createStageError('Recorded audio is empty. Please speak clearly and try again.', {
      status: 400,
    });
  }

  const format = resolveSupportedAudioFormat(options.mimeType || 'audio/wav');
  if (!format) {
    throw createStageError(
      `Unsupported audio format (${options.mimeType || 'unknown'}). Please record or upload WAV, MP3, M4A, OGG, FLAC, or AAC.`,
      { status: 400 }
    );
  }

  const maxRetries = 2;
  let lastStatus = 503;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: format.mimeType });
      formData.append('audio_file', blob, format.filename);
      formData.append('language_code', gnaniLang);
      if (gnaniLang === 'indic-auto') {
        formData.append('multi_lang_codes', 'hi-IN,en-IN');
      }
      formData.append('model', 'prisma-v2.5');

      const response = await fetch(PRISMA_BASE_URL, {
        method: 'POST',
        headers: {
          'X-API-Key-ID': PRISMA_API_KEY,
        },
        body: formData,
      });

      if (!response.ok) {
        lastStatus = response.status;
        const errText = await response.text();
        const isTransient = [429, 502, 503, 504].includes(response.status);

        console.error(`[Prisma STT] Attempt ${attempt + 1} failed (HTTP ${response.status})`);

        if (isTransient && attempt < maxRetries) {
          await wait(800 * (attempt + 1));
          continue;
        }

        if (errText.includes('INVALID_LANGUAGE_CODE')) {
          throw createStageError(
            `Speech recognition rejected language code "${gnaniLang}". Please choose Hindi, Hinglish, Kannada, or English.`,
            { status: 400 }
          );
        }
        if (errText.includes('UNSUPPORTED_AUDIO_FORMAT')) {
          throw createStageError(
            'Audio format was rejected by speech recognition. Please try recording again.',
            { status: 400 }
          );
        }
        if (isTransient) {
          throw createStageError('Speech recognition temporarily unavailable. Please try again.', {
            status: response.status,
            isTemporary: true,
          });
        }
        throw createStageError(`Speech recognition failed (HTTP ${response.status}).`, {
          status: response.status,
        });
      }

      const data = await response.json();
      let rawTranscript = data.transcript ?? data.output?.literal ?? '';
      if (rawTranscript && typeof rawTranscript === 'object') {
        rawTranscript =
          rawTranscript['hi-IN'] ||
          rawTranscript['en-IN'] ||
          Object.values(rawTranscript).find((v) => typeof v === 'string' && v.trim()) ||
          '';
      }
      const finalTranscript = typeof rawTranscript === 'string' ? rawTranscript.trim() : '';

      console.info(`[Prisma STT] Succeeded (${gnaniLang}): "${finalTranscript}"`);

      return {
        transcript: finalTranscript,
        confidence: data.confidence || 0.95,
        language: gnaniLang,
        isLive: true,
        raw: data,
      };
    } catch (err) {
      if (err.stage === 'PRISMA_STT') {
        throw err;
      }
      console.error(`[Prisma STT] Attempt ${attempt + 1} network error: ${err.message}`);
      if (attempt < maxRetries) {
        await wait(800 * (attempt + 1));
        continue;
      }
      throw createStageError('Speech recognition temporarily unavailable. Please try again.', {
        status: lastStatus,
        isTemporary: true,
      });
    }
  }
}
