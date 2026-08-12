const assert = require('node:assert/strict');
const test = require('node:test');
const { waitForCompletion } = require('../src/fresh-audio');

test('returns immediately when a transcription flush completes promptly', async () => {
  assert.equal(await waitForCompletion(Promise.resolve(), 20), true);
});

test('returns after the short deadline when a transcription flush is still running', async () => {
  assert.equal(await waitForCompletion(new Promise(() => {}), 5), false);
});
