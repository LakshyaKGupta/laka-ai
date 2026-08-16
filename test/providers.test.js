const assert = require('node:assert/strict');
const test = require('node:test');
const { OMNIROUTE_BASE_URL, buildOpenAIChatMessages, createLLM, formatProviderError, getDefaultMaxTokens, getProviderCandidates, isRetryableProviderError, isTruncatedFinishReason } = require('../src/llm');

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
    apiKeys: { gemini: 'g', groq: 'r', omniroute: 'local-route-key', openrouter: 'r2', openai: 'o' },
    models: {
      gemini: { fast: 'gemini-2.0-flash-lite', smart: 'gemini-2.0-flash' },
      groq: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile' },
      omniroute: { fast: 'auto/fast', smart: 'auto/smart' },
      openrouter: { fast: 'openrouter/free', smart: 'openrouter/free' },
      openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' }
    }
  };

  const chain = getProviderCandidates(settings);
  assert.deepEqual(chain.map((entry) => entry.provider), ['gemini', 'groq', 'omniroute', 'openrouter', 'openai']);
  assert.equal(chain[0].model, 'gemini-2.0-flash-lite');
  assert.equal(chain[2].model, 'auto/fast');
  assert.equal(chain[3].model, 'openrouter/free');
});

test('keeps OmniRoute text-only and outside Laka free-tier-only guarantees', () => {
  const llm = createLLM({
    provider: 'omniroute', smart: false, freeTierOnly: false,
    apiKeys: { omniroute: 'local-route-key' },
    models: { omniroute: { fast: 'auto/fast', smart: 'auto/smart' } }
  });

  assert.equal(llm.ready, true);
  assert.equal(llm.model, 'auto/fast');
  assert.equal(llm.supportsImages, false);
  assert.deepEqual(llm.getCandidates({ requiresImages: true }), []);

  const freeOnly = createLLM({
    provider: 'omniroute', smart: false, freeTierOnly: true,
    apiKeys: { omniroute: 'local-route-key' },
    models: { omniroute: { fast: 'auto/fast' } }
  });
  assert.equal(freeOnly.ready, false);
  assert.equal(OMNIROUTE_BASE_URL, 'http://127.0.0.1:20128/v1');
});

test('allows a local OmniRoute server without endpoint authentication', () => {
  const llm = createLLM({
    provider: 'omniroute', smart: false, freeTierOnly: false,
    apiKeys: {}, models: { omniroute: { fast: 'auto/fast' } }
  });
  assert.equal(llm.ready, true);
  assert.equal(llm.apiKey, 'omniroute-local');
});

test('uses a larger token budget so answers are not cut off early', () => {
  assert.equal(getDefaultMaxTokens({ smart: false }), 800);
  assert.equal(getDefaultMaxTokens({ smart: true }), 1200);
  assert.equal(getDefaultMaxTokens({ smart: false, maxTokens: 500 }), 500);
});

test('turns provider quota JSON into a useful recovery action', () => {
  const message = formatProviderError({ status: 429, message: 'Quota exceeded. Please retry in 57.8s.' });
  assert.match(message, /Gemini free-tier limit reached/);
  assert.match(message, /Retry in 58 seconds/);
  assert.match(message, /Groq or OpenRouter/);
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

test('recognizes provider token-limit finish reasons for automatic continuation', () => {
  assert.equal(isTruncatedFinishReason('length'), true);
  assert.equal(isTruncatedFinishReason('max_tokens'), true);
  assert.equal(isTruncatedFinishReason('MAX_TOKENS'), true);
  assert.equal(isTruncatedFinishReason('stop'), false);
});

test('keeps screen Assist on a vision-capable provider instead of a text-only fallback', () => {
  const llm = createLLM({
    provider: 'groq', smart: false, freeTierOnly: false,
    apiKeys: { groq: 'g', openai: 'o' },
    models: {
      groq: { fast: 'llama-3.1-8b-instant' },
      openai: { fast: 'gpt-4o-mini' }
    }
  });
  assert.equal(llm.supportsImages, true);
  assert.equal(llm.getCandidates({ requiresImages: true }).map((entry) => entry.provider).join(','), 'openai');
});

test('skips a provider that is cooling down after a quota failure', () => {
  const llm = createLLM({
    provider: 'gemini', smart: false, freeTierOnly: false,
    apiKeys: { gemini: 'g', groq: 'r' },
    models: { gemini: { fast: 'gemini-2.0-flash-lite' }, groq: { fast: 'llama-3.1-8b-instant' } }
  });
  assert.deepEqual(llm.getCandidates({ blockedProviders: { gemini: Date.now() + 10_000 } }).map((entry) => entry.provider), ['groq']);
});

test('uses a configured eligible free fallback when the selected provider has no usable key', () => {
  const llm = createLLM({
    provider: 'gemini', smart: false, freeTierOnly: true,
    apiKeys: { groq: 'g' },
    models: {
      gemini: { fast: 'gemini-2.0-flash-lite' },
      groq: { fast: 'llama-3.1-8b-instant' }
    }
  });

  assert.equal(llm.ready, true);
  assert.equal(llm.model, 'llama-3.1-8b-instant');
  assert.deepEqual(llm.getCandidates().map((entry) => entry.provider), ['groq']);
});

test('never sends a paid-model fallback while free-tier-only is enabled', () => {
  const llm = createLLM({
    provider: 'gemini', smart: false, freeTierOnly: true,
    apiKeys: { gemini: 'g', openai: 'o', groq: 'r' },
    models: {
      gemini: { fast: 'gemini-2.0-flash-lite' },
      groq: { fast: 'llama-3.1-8b-instant' },
      openai: { fast: 'gpt-4o-mini' }
    }
  });

  assert.deepEqual(llm.getCandidates({ blockedProviders: { gemini: Date.now() + 10_000 } }).map((entry) => entry.provider), ['groq']);
});
