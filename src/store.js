const fs = require('fs');
const path = require('path');
const electron = require('electron');
const { PROVIDERS, sanitizeSettingsPatch } = require('./validators');

const DEFAULTS = {
  provider: 'gemini', smart: false, freeTierOnly: true, localSpeechEnabled: true, localSpeechModel: 'base.en', speechLanguage: 'auto', meetingAudioDeviceId: '', encryptedApiKeys: {}, encryptedProfile: '', profileEnabled: false, transcriptHistory: [],
  models: {
    openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    anthropic: { fast: 'claude-3-5-haiku-latest', smart: 'claude-3-5-sonnet-latest' },
    gemini: { fast: 'gemini-2.0-flash-lite', smart: 'gemini-2.0-flash' },
    groq: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile' },
    openrouter: { fast: 'openrouter/free', smart: 'openrouter/free' },
    nvidia: { fast: 'meta/llama-3.2-11b-vision-instruct', smart: 'meta/llama-3.2-90b-vision-instruct' }
  }
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const key of Object.keys(over || {})) out[key] = over[key] && typeof over[key] === 'object' && !Array.isArray(over[key]) && typeof base[key] === 'object' ? deepMerge(base[key], over[key]) : over[key];
  return out;
}

function createStore({ file, safeStorage: storage, fs: fileSystem = fs }) {
  let data = null;
  function canEncrypt() { return Boolean(storage && storage.isEncryptionAvailable && storage.isEncryptionAvailable()); }
  function save() { fileSystem.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 }); }
  function migrateLegacyKeys() {
    if (!data.apiKeys) return;
    if (!canEncrypt()) {
      for (const provider of PROVIDERS) if (data.apiKeys[provider]) data.encryptedApiKeys[provider] = data.apiKeys[provider];
      delete data.apiKeys;
      save();
      return;
    }
    for (const provider of PROVIDERS) if (data.apiKeys[provider]) data.encryptedApiKeys[provider] = storage.encryptString(data.apiKeys[provider]).toString('base64');
    delete data.apiKeys;
    save();
  }
  function load() {
    if (data) return data;
    try { data = deepMerge(DEFAULTS, JSON.parse(fileSystem.readFileSync(file, 'utf8'))); }
    catch { data = deepMerge(DEFAULTS, {}); }
    migrateLegacyKeys();
    return data;
  }
  function decryptedKeys() {
    load(); const keys = {};
    for (const provider of PROVIDERS) {
      const encrypted = data.encryptedApiKeys[provider];
      if (!encrypted) { keys[provider] = ''; continue; }
      if (!canEncrypt()) { keys[provider] = encrypted; continue; }
      try { keys[provider] = storage.decryptString(Buffer.from(encrypted, 'base64')); } catch { keys[provider] = ''; }
    }
    return keys;
  }
  function decryptProfile() {
    load();
    if (!data.profileEnabled || !data.encryptedProfile) return {};
    if (!canEncrypt()) return typeof data.encryptedProfile === 'string' ? JSON.parse(data.encryptedProfile) : {};
    try { return JSON.parse(storage.decryptString(Buffer.from(data.encryptedProfile, 'base64'))); } catch { return {}; }
  }
  function sanitizeProfile(profile) {
    const value = profile && typeof profile === 'object' ? profile : {};
    const text = (field, limit) => typeof value[field] === 'string' ? value[field].trim().slice(0, limit) : '';
    return { displayName: text('displayName', 120), company: text('company', 500), role: text('role', 500), responsibilities: text('responsibilities', 4000), resumeName: text('resumeName', 255), resumeText: text('resumeText', 24_000) };
  }
  function getSettings() { return { ...load(), apiKeys: decryptedKeys() }; }
  function getHistory() { load(); return Array.isArray(data.transcriptHistory) ? data.transcriptHistory : []; }
  function setHistory(history) {
    load();
    data.transcriptHistory = Array.isArray(history) ? history.slice(0, 200) : [];
    save();
    return data.transcriptHistory;
  }
  function getPublicSettings() {
    const current = load(); const configured = {};
    for (const provider of PROVIDERS) configured[provider] = Boolean(current.encryptedApiKeys[provider]);
    return { ...current, apiKeys: Object.fromEntries([...PROVIDERS].map((provider) => [provider, ''])), apiKeyConfigured: configured };
  }
  function setSettings(patch) {
    load(); const clean = sanitizeSettingsPatch(patch); const keys = clean.apiKeys || {}; delete clean.apiKeys;
    data = deepMerge(data, clean);
    if (Object.keys(keys).length) {
      for (const [provider, key] of Object.entries(keys)) {
        if (!canEncrypt()) data.encryptedApiKeys[provider] = key;
        else data.encryptedApiKeys[provider] = storage.encryptString(key).toString('base64');
      }
    }
    save(); return getPublicSettings();
  }
  function getProfile() { return { enabled: Boolean(load().profileEnabled), ...decryptProfile() }; }
  function getPublicProfile() {
    const profile = getProfile();
    return { enabled: profile.enabled, displayName: profile.displayName || '', company: profile.company || '', role: profile.role || '', responsibilities: profile.responsibilities || '', resumeName: profile.resumeName || '', hasResume: Boolean(profile.resumeText) };
  }
  function setProfile(profile, enabled) {
    load();
    data.profileEnabled = Boolean(enabled);
    if (!data.profileEnabled) data.encryptedProfile = '';
    else {
      const payload = JSON.stringify(sanitizeProfile(profile));
      if (!canEncrypt()) data.encryptedProfile = payload;
      else data.encryptedProfile = storage.encryptString(payload).toString('base64');
    }
    save(); return getPublicProfile();
  }
  return { getPublicProfile, getProfile, getPublicSettings, getSettings, getHistory, setHistory, setProfile, setSettings };
}

const store = electron.app
  ? createStore({ file: path.join(electron.app.getPath('userData'), 'laka-ai-data.json'), safeStorage: electron.safeStorage, fs })
  : {};

module.exports = store;
module.exports.createStore = createStore;
