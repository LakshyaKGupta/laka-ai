const assert = require('node:assert/strict');
const test = require('node:test');
const { buildOpenAIChatMessages, formatProviderError, getDefaultMaxTokens, getProviderCandidates, isRetryableProviderError } = require('../src/llm');

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
    apiKeys: { gemini: 'g', groq: 'r', openai: 'o' },
    models: {
      gemini: { fast: 'gemini-2.0-flash-lite', smart: 'gemini-2.0-flash' },
      groq: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile' },
      openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' }
    }
  };

  const chain = getProviderCandidates(settings);
  assert.deepEqual(chain.map((entry) => entry.provider), ['gemini', 'groq', 'openai']);
  assert.equal(chain[0].model, 'gemini-2.0-flash-lite');
  assert.equal(chain[1].model, 'llama-3.1-8b-instant');
});

test('uses a larger token budget so answers are not cut off early', () => {
  assert.equal(getDefaultMaxTokens({ smart: false }), 450);
  assert.equal(getDefaultMaxTokens({ smart: true }), 900);
  assert.equal(getDefaultMaxTokens({ smart: false, maxTokens: 500 }), 500);
});

test('turns provider quota JSON into a useful recovery action', () => {
  const message = formatProviderError({ status: 429, message: 'Quota exceeded. Please retry in 57.8s.' });
  assert.match(message, /Gemini free-tier limit reached/);
  assert.match(message, /Retry in 58 seconds/);
  assert.match(message, /Groq key/);
});

test('keeps Groq chat payloads text-only even when a feature captured a screenshot', () => {
  const messages = buildOpenAIChatMessages({
    system: 'Be concise.',
    turns: [{ role: 'user', text: 'Answer this.' }],
    imageDataUrl: 'data:image/png;base64,AAAA',
    supportsImages: false
  });
  assert.equal(messages[1].content, 'Answer this.');
});
