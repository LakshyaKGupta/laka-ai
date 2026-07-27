const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { createStore } = require('../src/store');

test('persists and restores transcript history across store reloads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laka-store-'));
  const file = path.join(dir, 'history.json');
  const first = createStore({ file, safeStorage: null, fs });
  first.setHistory([{ channel: 'you', text: 'hello' }]);

  const second = createStore({ file, safeStorage: null, fs });
  assert.deepEqual(second.getHistory(), [{ channel: 'you', text: 'hello' }]);
});
