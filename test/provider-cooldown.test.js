const assert = require('node:assert/strict');
const test = require('node:test');
const { getCooldownMs, getEarliestRetryMs } = require('../src/provider-cooldown');

test('uses a provider retry-after message to set a quota cooldown', () => {
  assert.equal(getCooldownMs({ status: 429, message: 'Retry in 52 seconds.' }), 52_000);
});

test('uses a bounded default cooldown for a 429 without a retry time', () => {
  assert.equal(getCooldownMs({ status: 429, message: 'quota exceeded' }), 60_000);
});

test('finds the earliest configured provider retry time', () => {
  assert.equal(getEarliestRetryMs({ gemini: 1_500, groq: 1_200 }, 1_000), 200);
});
