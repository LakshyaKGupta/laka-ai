const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createStore } = require('../src/store');

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laka-store-'));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from('encrypted:' + value),
    decryptString: (value) => value.toString().replace('encrypted:', '')
  };
  return { store: createStore({ file: path.join(dir, 'settings.json'), safeStorage, fs }), file: path.join(dir, 'settings.json') };
}

test('encrypts API keys and never returns them to the renderer', () => {
  const { store, file } = makeStore();
  store.setSettings({ apiKeys: { gemini: 'secret-value' } });
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /secret-value/);
  assert.equal(store.getPublicSettings().apiKeys.gemini, '');
  assert.equal(store.getPublicSettings().apiKeyConfigured.gemini, true);
  assert.equal(store.getSettings().apiKeys.gemini, 'secret-value');
});

test('persists opted-in profile data encrypted and exposes only a safe summary', () => {
  const { store, file } = makeStore();
  store.setProfile({ displayName: 'Lakshya', company: 'Acme', role: 'Engineer', responsibilities: 'Build reliable systems', resumeName: 'resume.pdf', resumeText: 'Built private systems.' }, true);
  const disk = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(disk, /Built private systems/);
  assert.equal(store.getProfile().company, 'Acme');
  assert.equal(store.getProfile().resumeText, 'Built private systems.');
  assert.deepEqual(store.getPublicProfile(), { enabled: true, displayName: 'Lakshya', company: 'Acme', role: 'Engineer', responsibilities: 'Build reliable systems', resumeName: 'resume.pdf', hasResume: true });
});
