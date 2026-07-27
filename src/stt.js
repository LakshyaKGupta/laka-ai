// Speech-to-text factory. Decoupled from the LLM provider because Anthropic has
// no audio API — we transcribe with whatever audio-capable key is available, and
// fall back across providers. Returns { text, provider } or { text:'', error }.
const { pcmToWav } = require('./wav');
const { isRetryableProviderError } = require('./llm');
const { transcribeLocal } = require('./local-stt');

const SPEECH_LANGUAGES = new Set(['en', 'hi', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh']);

function normalizeSpeechLanguage(language) {
  return SPEECH_LANGUAGES.has(language) ? language : '';
}

async function transcribeOpenAI(apiKey, wav, model, language) {
  const OpenAI = require('openai');
  const toFile = OpenAI.toFile || require('openai/uploads').toFile;
  const client = new OpenAI({ apiKey });
  const file = await toFile(wav, 'audio.wav', { type: 'audio/wav' });
  const res = await client.audio.transcriptions.create({ file, model: model || 'whisper-1', ...(normalizeSpeechLanguage(language) && { language: normalizeSpeechLanguage(language) }) });
  return (res.text || '').trim();
}

async function transcribeGroq(apiKey, wav, language) {
  const OpenAI = require('openai');
  const toFile = OpenAI.toFile || require('openai/uploads').toFile;
  const client = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
  const file = await toFile(wav, 'audio.wav', { type: 'audio/wav' });
  const res = await client.audio.transcriptions.create({ file, model: 'whisper-large-v3-turbo', temperature: 0, ...(normalizeSpeechLanguage(language) && { language: normalizeSpeechLanguage(language) }) });
  return (res.text || '').trim();
}

async function transcribeGemini(apiKey, wav, language) {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model: 'gemini-2.0-flash-lite',
    contents: [{ role: 'user', parts: [
      { text: 'Transcribe this audio verbatim. Return only the spoken words with no commentary. If there is no clear speech, return an empty response.' + (normalizeSpeechLanguage(language) ? ` The spoken language is ${normalizeSpeechLanguage(language)}.` : '') },
      { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } }
    ] }]
  });
  return ((res && res.text) || '').trim();
}

function getSpeechMode(settings) {
  const keys = settings && settings.apiKeys ? settings.apiKeys : {};
  return keys.groq || keys.openai || keys.gemini ? 'cloud-with-local-fallback' : 'local';
}

function createSTT(settings) {
  const keys = settings.apiKeys || {};
  const language = normalizeSpeechLanguage(settings.speechLanguage);
  const chain = [];
  if (keys.groq) chain.push({ p: 'groq', fn: (wav) => transcribeGroq(keys.groq, wav, language) });
  if (keys.openai) chain.push({ p: 'openai', fn: (wav) => transcribeOpenAI(keys.openai, wav, settings.sttModel, language) });
  if (keys.gemini) chain.push({ p: 'gemini', fn: (wav) => transcribeGemini(keys.gemini, wav, language) });
  if (settings.localSpeechEnabled !== false) chain.push({ p: 'faster-whisper', fn: (wav) => transcribeLocal(wav, { ...settings, speechLanguage: language }) });

  return {
    available: chain.length > 0,
    providers: chain.map((c) => c.p),
    mode: getSpeechMode(settings),
    async transcribe(pcm) {
      if (!chain.length || !pcm || pcm.length < 3200) return { text: '' };
      const wav = pcmToWav(pcm, 16000, 1);
      let lastErr = null;
      for (const c of chain) {
        try {
          const text = await c.fn(wav);
          return { text, provider: c.p };
        } catch (e) {
          const err = { status: e && e.status, code: e && e.code, message: (e && e.message) || String(e), provider: c.p };
          lastErr = err;
          // Cloud providers can reject a key or hit quota; keep the local fallback available.
          if (c.p === 'faster-whisper' || !isRetryableProviderError(e)) continue;
        }
      }
      return { text: '', error: lastErr };
    }
  };
}

module.exports = { createSTT, getSpeechMode, normalizeSpeechLanguage, transcribeGroq };
