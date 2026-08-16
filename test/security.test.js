const assert = require('node:assert/strict');
const test = require('node:test');
const { getSetupStatus, sanitizeAskPayload, sanitizeSettingsPatch, toPcmBuffer } = require('../src/validators');

test('accepts a bounded known feature request', () => {
  assert.deepEqual(sanitizeAskPayload({ mode: 'ask', text: 'Summarize this.' }), { mode: 'ask', text: 'Summarize this.' });
});

test('rejects unknown modes and oversized audio', () => {
  assert.equal(sanitizeAskPayload({ mode: 'unknown', text: 'x' }), null);
  assert.equal(toPcmBuffer(new ArrayBuffer(1024 * 1024 + 1)), null);
});

test('only allows supported settings fields and non-empty replacement keys', () => {
  assert.deepEqual(sanitizeSettingsPatch({ provider: 'openrouter', smart: true, onboarded: true, apiKeys: { openrouter: 'key' }, meetingAudioDeviceId: 'BlackHole-2ch', speechLanguage: 'hi', ignored: true }), {
    provider: 'openrouter', smart: true, onboarded: true, apiKeys: { openrouter: 'key' }, meetingAudioDeviceId: 'BlackHole-2ch', speechLanguage: 'hi'
  });
});

test('allows OmniRoute settings while preserving the provider allowlist', () => {
  assert.deepEqual(sanitizeSettingsPatch({ provider: 'omniroute', apiKeys: { omniroute: 'local-route-key', arbitrary: 'discard' }, models: { omniroute: { fast: 'auto/fast', smart: 'auto/smart' } } }), {
    provider: 'omniroute',
    apiKeys: { omniroute: 'local-route-key' },
    models: { omniroute: { fast: 'auto/fast', smart: 'auto/smart' } }
  });
});

test('reports missing setup clearly when the provider key or model is missing', () => {
  assert.deepEqual(getSetupStatus({ provider: 'gemini', apiKeys: {}, models: { gemini: { fast: 'gemini-3.1-flash-lite' } } }), {
    provider: 'gemini', hasKey: false, hasModel: true, ready: false, message: 'Add a gemini API key in Settings to start.'
  });
  assert.deepEqual(getSetupStatus({ provider: 'gemini', apiKeys: { gemini: 'key' }, models: { gemini: {} } }), {
    provider: 'gemini', hasKey: true, hasModel: false, ready: false, message: 'Choose a model for gemini in Settings.'
  });
});

test('permits an unauthenticated local OmniRoute setup when a model is configured', () => {
  assert.deepEqual(getSetupStatus({ provider: 'omniroute', apiKeys: {}, models: { omniroute: { fast: 'auto/fast' } } }), {
    provider: 'omniroute', hasKey: false, hasModel: true, ready: true, message: ''
  });
});
