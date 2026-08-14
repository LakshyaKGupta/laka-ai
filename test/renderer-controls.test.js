const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'renderer', 'renderer.js'), 'utf8');

test('provides a microphone toggle beside the send button', () => {
  assert.match(html, /id="mic-toggle"/);
  assert.match(html, /id="mic-toggle"[^>]*title="Start \/ stop listening"[\s\S]*id="send-btn"/);
  assert.match(renderer, /\$\('#mic-toggle'\)\.addEventListener\('click'/);
});
