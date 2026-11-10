import axios from 'axios';

/**
 * Gnani Timbre v2.5 — Text-to-Speech (TTS) Service
 *
 * Official Gnani Timbre Specification:
 * - Base URL: https://api.vachana.ai/api/v1/tts/inference (or process.env.GNANI_TIMBRE_BASE_URL)
 * - Model: timbre-v2.5
 * - Auth Header: X-API-Key-ID: <GNANI_API_KEY>
 * - Supported Languages: 'hi-IN' (Hindi), 'kn-IN' (Kannada), 'en-IN' (Indian English)
 * - Output Formats: WAV (linear PCM, 24kHz/48kHz), MP3
 */

const TIMBRE_BASE_URL =
  process.env.GNANI_TIMBRE_BASE_URL || 'https://api.vachana.ai/api/v1/tts/inference';
const TIMBRE_API_KEY = process.env.GNANI_API_KEY;

export function isTimbreConfigured() {
  const key = process.env.GNANI_API_KEY;
  return Boolean(key && key !== 'your_gnani_api_key' && key !== 'your_gnani_unified_api_key');
}

export function mapTimbreLanguage(lang) {
  switch (lang?.toLowerCase()) {
    case 'kn':
    case 'kannada':
      return 'kn-IN';
    case 'en':
    case 'english':
      return 'en-IN';
    case 'hi':
    case 'hinglish':
    default:
      return 'hi-IN';
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Synthesizes natural speech from text using Gnani Timbre v2.5,
 * with up to 2 retries on temporary 503/429 responses.
 */
export async function synthesizeSpeech(text, options = {}) {
  const language = options.language || 'hi';
  const gnaniLang = mapTimbreLanguage(language);

  if (!isTimbreConfigured()) {
    console.warn('[Timbre TTS] Credentials missing (GNANI_API_KEY).');
    return {
      audioBase64: '',
      spokenText: text,
      format: 'wav',
      isLive: false,
      ttsUnavailable: true,
      stage: 'TIMBRE_TTS',
    };
  }

  const payload = {
    text,
    voice: options.voice || 'Nalini',
    model: 'timbre-v2.5',
    language: gnaniLang,
    speed: Number(options.speed) || 1.0,
    audio_config: {
      sample_rate: 24000,
      num_channels: 1,
      sample_width: 2,
      encoding: 'linear_pcm',
      container: 'wav',
    },
  };

  const maxRetries = 2;
  let lastStatus = 503;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await axios.post(TIMBRE_BASE_URL, payload, {
        headers: {
          'X-API-Key-ID': TIMBRE_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 15000,
      });

      const audioBase64 = Buffer.from(response.data).toString('base64');
      console.info(`[Timbre TTS] Succeeded (${gnaniLang}, ${text.length} chars)`);

      return {
        audioBase64,
        spokenText: text,
        format: 'wav',
        isLive: true,
        ttsUnavailable: false,
      };
    } catch (err) {
      const status = err.response?.status || 503;
      lastStatus = status;
      const isTransient = [429, 502, 503, 504].includes(status) || !err.response;

      console.error(`[Timbre TTS] Attempt ${attempt + 1} failed (HTTP ${status})`);

      if (isTransient && attempt < maxRetries) {
        await wait(800 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  return {
    audioBase64: '',
    spokenText: text,
    format: 'wav',
    isLive: false,
    ttsUnavailable: true,
    stage: 'TIMBRE_TTS',
    status: lastStatus,
  };
}

