const assert = require('node:assert/strict');
const test = require('node:test');
const { getFeatureMaxTokens } = require('../src/llm');

test('uses a concise budget for voice replies and a complete budget for direct answers', () => {
  assert.equal(getFeatureMaxTokens({ smart: false }, { mode: 'say', small: false }), 360);
  assert.equal(getFeatureMaxTokens({ smart: false }, { mode: 'assist', small: false }), 750);
  assert.equal(getFeatureMaxTokens({ smart: false }, { mode: 'ask', small: false }), 800);
  assert.equal(getFeatureMaxTokens({ smart: false }, { mode: 'followup', small: true }), 260);
  assert.equal(getFeatureMaxTokens({ smart: true }, { mode: 'ask', small: false }), 1200);
});
