const assert = require('node:assert/strict');
const test = require('node:test');
const { getDefaultMaxTokens, getProviderCandidates, isRetryableProviderError } = require('../src/llm');

test('treats quota and overload failures as retryable', () => {
  assert.equal(isRetryableProviderError({ status: 429 }), true);
  assert.equal(isRetryableProviderError({ status: 503 }), true);
  assert.equal(isRetryableProviderError({ status: 400 }), false);
});

test('builds a provider chain that prefers the selected provider and adds configured fallbacks', () => {
  const settings = {
    provider: 'gemini',
    smart: false,
    freeTierOnly: false,
    apiKeys: { gemini: 'g', openai: 'o' },
    models: {
      gemini: { fast: 'gemini-2.0-flash-lite', smart: 'gemini-2.0-flash' },
      openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' }
    }
  };

  const chain = getProviderCandidates(settings);
  assert.deepEqual(chain.map((entry) => entry.provider), ['gemini', 'openai']);
  assert.equal(chain[0].model, 'gemini-2.0-flash-lite');
  assert.equal(chain[1].model, 'gpt-4o-mini');
});

test('uses a larger token budget so answers are not cut off early', () => {
  assert.equal(getDefaultMaxTokens({ smart: false }), 700);
  assert.equal(getDefaultMaxTokens({ smart: true }), 1400);
  assert.equal(getDefaultMaxTokens({ smart: false, maxTokens: 500 }), 500);
});
