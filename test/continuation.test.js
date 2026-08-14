const assert = require('node:assert/strict');
const test = require('node:test');
const { MAX_AUTOMATIC_CONTINUATIONS, shouldAutomaticallyContinue } = require('../src/continuation');

test('continues a truncated answer automatically without a user action', () => {
  assert.equal(MAX_AUTOMATIC_CONTINUATIONS, 2);
  assert.equal(shouldAutomaticallyContinue('length', 0), true);
  assert.equal(shouldAutomaticallyContinue('max_tokens', 1), true);
  assert.equal(shouldAutomaticallyContinue('length', 2), false);
  assert.equal(shouldAutomaticallyContinue('stop', 0), false);
});
