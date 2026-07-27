const assert = require('node:assert/strict');
const test = require('node:test');
const { getSpeechMode } = require('../src/stt');

test('prefers local speech fallback when no cloud speech key is configured', () => {
  assert.equal(getSpeechMode({ apiKeys: {} }), 'local');
  assert.equal(getSpeechMode({ apiKeys: { gemini: 'abc' } }), 'cloud');
  assert.equal(getSpeechMode({ apiKeys: { openai: 'abc' } }), 'cloud');
});
