const assert = require('node:assert/strict');
const test = require('node:test');
const { MODES, formatTranscript } = require('../src/prompts');

test('keeps a typed follow-up fast by not taking a new screenshot', () => {
  assert.equal(MODES.ask.needsScreen, false);
});

test('bounds conversation context to keep follow-up prompts responsive', () => {
  const turns = Array.from({ length: 40 }, () => ({ channel: 'them', text: 'x'.repeat(1000) }));
  assert.ok(formatTranscript(turns, 12).length <= 4000);
});
