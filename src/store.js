const fs = require('fs');
const path = require('path');
const electron = require('electron');
const { PROVIDERS, sanitizeSettingsPatch } = require('./validators');

const DEFAULTS = {
  provider: 'gemini', smart: false, freeTierOnly: true, encryptedApiKeys: {}, encryptedProfile: '', profileEnabled: false,
  models: {
    openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    anthropic: { fast: 'claude-3-5-haiku-latest', smart: 'claude-3-5-sonnet-latest' },
    gemini: { fast: 'gemini-3.1-flash-lite', smart: 'gemini-3-flash-preview' },
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
  function canEncrypt() { return storage && storage.isEncryptionAvailable && storage.isEncryptionAvailable(); }
  function save() { fileSystem.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 }); }
  function migrateLegacyKeys() {
    if (!data.apiKeys) return;
    if (!canEncrypt()) throw new Error('macOS Keychain is unavailable; API keys cannot be stored securely.');
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
      if (!encrypted || !canEncrypt()) { keys[provider] = ''; continue; }
      try { keys[provider] = storage.decryptString(Buffer.from(encrypted, 'base64')); } catch { keys[provider] = ''; }
    }
    return keys;
  }
  function decryptProfile() {
    load();
    if (!data.profileEnabled || !data.encryptedProfile || !canEncrypt()) return {};
    try { return JSON.parse(storage.decryptString(Buffer.from(data.encryptedProfile, 'base64'))); } catch { return {}; }
  }
  function sanitizeProfile(profile) {
    const value = profile && typeof profile === 'object' ? profile : {};
    const text = (field, limit) => typeof value[field] === 'string' ? value[field].trim().slice(0, limit) : '';
    return { displayName: text('displayName', 120), company: text('company', 500), role: text('role', 500), responsibilities: text('responsibilities', 4000), resumeName: text('resumeName', 255), resumeText: text('resumeText', 24_000) };
  }
  function getSettings() { return { ...load(), apiKeys: decryptedKeys() }; }
  function getPublicSettings() {
    const current = load(); const configured = {};
    for (const provider of PROVIDERS) configured[provider] = Boolean(current.encryptedApiKeys[provider]);
    return { ...current, apiKeys: Object.fromEntries([...PROVIDERS].map((provider) => [provider, ''])), apiKeyConfigured: configured };
  }
  function setSettings(patch) {
    load(); const clean = sanitizeSettingsPatch(patch); const keys = clean.apiKeys || {}; delete clean.apiKeys;
    data = deepMerge(data, clean);
    if (Object.keys(keys).length) {
      if (!canEncrypt()) throw new Error('macOS Keychain is unavailable; API keys cannot be stored securely.');
      for (const [provider, key] of Object.entries(keys)) data.encryptedApiKeys[provider] = storage.encryptString(key).toString('base64');
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
      if (!canEncrypt()) throw new Error('macOS Keychain is unavailable; profile data cannot be stored securely.');
      data.encryptedProfile = storage.encryptString(JSON.stringify(sanitizeProfile(profile))).toString('base64');
    }
    save(); return getPublicProfile();
  }
  return { getPublicProfile, getProfile, getPublicSettings, getSettings, setProfile, setSettings };
}

const store = electron.app
  ? createStore({ file: path.join(electron.app.getPath('userData'), 'laka-ai-data.json'), safeStorage: electron.safeStorage, fs })
  : {};

module.exports = store;
module.exports.createStore = createStore;
