const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { createStore } = require('../src/store');

test('stores API keys and profile settings across store reloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laka-store-'));
  const file = path.join(dir, 'settings.json');
  const first = createStore({ file, safeStorage: null, fs });
  first.setSettings({ provider: 'gemini', apiKeys: { gemini: 'abc123' }, freeTierOnly: false });
  first.setProfile({ displayName: 'Ada' }, true);

  const second = createStore({ file, safeStorage: null, fs });
  const settings = second.getSettings();
  assert.equal(settings.provider, 'gemini');
  assert.equal(settings.apiKeys.gemini, 'abc123');
  assert.equal(settings.freeTierOnly, false);
  const profile = second.getProfile();
  assert.equal(profile.displayName, 'Ada');
  assert.equal(profile.enabled, true);
});
