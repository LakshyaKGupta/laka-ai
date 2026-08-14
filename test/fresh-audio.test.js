const assert = require('node:assert/strict');
const test = require('node:test');
const { VOICE_REPLY_FLUSH_WAIT_MS, waitForCompletion } = require('../src/fresh-audio');

test('bounds voice-answer freshness waiting below half a second', () => {
  assert.equal(VOICE_REPLY_FLUSH_WAIT_MS, 350);
});

test('returns immediately when a transcription flush completes promptly', async () => {
  assert.equal(await waitForCompletion(Promise.resolve(), 20), true);
});

test('returns after the short deadline when a transcription flush is still running', async () => {
  assert.equal(await waitForCompletion(new Promise(() => {}), 5), false);
});
