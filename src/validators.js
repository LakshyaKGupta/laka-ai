const PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'groq', 'nvidia']);
const MODES = new Set(['assist', 'say', 'followup', 'recap', 'ask', 'leetcode']);
const MAX_TEXT_LENGTH = 12_000;
const MAX_PCM_BYTES = 1_048_576;

function boundedText(value, limit = MAX_TEXT_LENGTH) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function sanitizeAskPayload(payload) {
  if (!payload || typeof payload !== 'object' || !MODES.has(payload.mode)) return null;
  return { mode: payload.mode, text: boundedText(payload.text) };
}

function getSetupStatus(settings = {}) {
  const provider = settings.provider || 'gemini';
  const apiKeys = settings.apiKeys || {};
  const models = settings.models || {};
  const providerModels = models[provider] || {};
  const hasKey = Boolean(apiKeys[provider]);
  const hasModel = Boolean(providerModels.fast || providerModels.smart);
  return {
    provider,
    hasKey,
    hasModel,
    ready: hasKey && hasModel,
    message: !hasKey ? `Add a ${provider} API key in Settings to start.` : !hasModel ? `Choose a model for ${provider} in Settings.` : ''
  };
}

function sanitizeSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const result = {};
  if (PROVIDERS.has(patch.provider)) result.provider = patch.provider;
  if (typeof patch.smart === 'boolean') result.smart = patch.smart;
  if (typeof patch.freeTierOnly === 'boolean') result.freeTierOnly = patch.freeTierOnly;
  if (typeof patch.onboarded === 'boolean') result.onboarded = patch.onboarded;
  if (typeof patch.localSpeechEnabled === 'boolean') result.localSpeechEnabled = patch.localSpeechEnabled;
  if (['tiny.en', 'base.en', 'small.en', 'medium.en', 'tiny', 'base', 'small', 'medium'].includes(patch.localSpeechModel)) result.localSpeechModel = patch.localSpeechModel;
  if (typeof patch.meetingAudioDeviceId === 'string') result.meetingAudioDeviceId = boundedText(patch.meetingAudioDeviceId, 512);
  if (patch.models && typeof patch.models === 'object') {
    result.models = {};
    for (const provider of PROVIDERS) {
      if (!patch.models[provider] || typeof patch.models[provider] !== 'object') continue;
      const fast = boundedText(patch.models[provider].fast, 120);
      const smart = boundedText(patch.models[provider].smart, 120);
      if (fast || smart) result.models[provider] = { ...(fast && { fast }), ...(smart && { smart }) };
    }
  }
  if (patch.apiKeys && typeof patch.apiKeys === 'object') {
    result.apiKeys = {};
    for (const provider of PROVIDERS) {
      const key = boundedText(patch.apiKeys[provider], 500);
      if (key) result.apiKeys[provider] = key;
    }
  }
  return result;
}

function toPcmBuffer(value) {
  if (!(value instanceof ArrayBuffer) || value.byteLength > MAX_PCM_BYTES) return null;
  return Buffer.from(value);
}

module.exports = { MAX_PCM_BYTES, PROVIDERS, boundedText, getSetupStatus, sanitizeAskPayload, sanitizeSettingsPatch, toPcmBuffer };
