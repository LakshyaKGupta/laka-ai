const DEBUG = false; // Set to false to disable debug logging
// LLM factory — OpenAI / Anthropic / Gemini behind one streaming interface.
// stream({ system, turns:[{role,text}], imageDataUrl, maxTokens, onToken }) -> Promise<{text, finishReason}>

function stripDataUrl(dataUrl) {
  const m = /^data:(.+?);base64,(.*)$/s.exec(dataUrl || '');
  return m ? { mime: m[1], b64: m[2] } : null;
}

function buildOpenAIChatMessages({ system, turns, imageDataUrl, supportsImages = true }) {
  const messages = [{ role: 'system', content: system }];
  turns.forEach((t, i) => {
    const last = i === turns.length - 1;
    if (supportsImages && last && imageDataUrl && t.role === 'user') {
      messages.push({ role: 'user', content: [
        { type: 'text', text: t.text },
        { type: 'image_url', image_url: { url: imageDataUrl } }
      ] });
    } else {
      messages.push({ role: t.role, content: t.text });
    }
  });
  return messages;
}

function isTruncatedFinishReason(reason) {
  return new Set(['length', 'max_tokens', 'MAX_TOKENS']).has(reason);
}

async function streamOpenAI({ apiKey, model, system, turns, imageDataUrl, maxTokens, onToken, baseURL, supportsImages = true }) {
  if (DEBUG) console.log('[DEBUG LLM] streamOpenAI called', { model, baseURL, hasImage: !!imageDataUrl, maxTokens });
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey, baseURL });
  const messages = buildOpenAIChatMessages({ system, turns, imageDataUrl, supportsImages });
  if (DEBUG) console.log('[DEBUG LLM] streamOpenAI sending request to OpenAI SDK with messages count:', messages.length);
  try {
    const stream = await client.chat.completions.create({ model, messages, stream: true, max_tokens: maxTokens });
    let full = '';
    let finishReason = 'unknown';
    for await (const part of stream) {
      const d = part.choices && part.choices[0] && part.choices[0].delta && part.choices[0].delta.content;
      if (d) { full += d; onToken(d); }
      if (part.choices && part.choices[0] && part.choices[0].finish_reason) finishReason = part.choices[0].finish_reason;
    }
    if (DEBUG) console.log('[DEBUG LLM] streamOpenAI finished successfully, total length:', full.length);
    return { text: full, finishReason };
  } catch (err) {
    if (DEBUG) console.error('[DEBUG LLM] streamOpenAI error:', err);
    throw err;
  }
}

async function streamAnthropic({ apiKey, model, system, turns, imageDataUrl, maxTokens, onToken }) {
  if (DEBUG) console.log('[DEBUG LLM] streamAnthropic called', { model, hasImage: !!imageDataUrl, maxTokens });
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const messages = turns.map((t, i) => {
    const last = i === turns.length - 1;
    if (last && imageDataUrl && t.role === 'user') {
      const img = stripDataUrl(imageDataUrl);
      const content = [];
      if (img) content.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.b64 } });
      content.push({ type: 'text', text: t.text });
      return { role: 'user', content };
    }
    return { role: t.role, content: t.text };
  });
  if (DEBUG) console.log('[DEBUG LLM] streamAnthropic sending request to Anthropic SDK with messages count:', messages.length);
  try {
    const stream = await client.messages.create({ model, max_tokens: maxTokens, system, messages, stream: true });
    let full = '';
    let finishReason = 'unknown';
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { full += ev.delta.text; onToken(ev.delta.text); }
      if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) finishReason = ev.delta.stop_reason;
    }
    if (DEBUG) console.log('[DEBUG LLM] streamAnthropic finished successfully, total length:', full.length);
    return { text: full, finishReason };
  } catch (err) {
    if (DEBUG) console.error('[DEBUG LLM] streamAnthropic error:', err);
    throw err;
  }
}

async function streamGemini({ apiKey, model, system, turns, imageDataUrl, maxTokens, onToken }) {
  if (DEBUG) console.log('[DEBUG LLM] streamGemini called', { model, hasImage: !!imageDataUrl, maxTokens });
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const contents = turns.map((t, i) => {
    const last = i === turns.length - 1;
    const parts = [{ text: t.text }];
    if (last && imageDataUrl && t.role === 'user') {
      const img = stripDataUrl(imageDataUrl);
      if (img) parts.push({ inlineData: { mimeType: img.mime, data: img.b64 } });
    }
    return { role: t.role === 'assistant' ? 'model' : 'user', parts };
  });
  if (DEBUG) console.log('[DEBUG LLM] streamGemini sending request to Google SDK with contents count:', contents.length);
  try {
    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: { systemInstruction: system, maxOutputTokens: maxTokens }
    });
    let full = '';
    let lastFinishReason = 'UNKNOWN';
    for await (const chunk of stream) {
      const t = chunk && chunk.text;
      if (t) { full += t; onToken(t); }
      if (chunk && chunk.candidates && chunk.candidates[0] && chunk.candidates[0].finishReason) {
        lastFinishReason = chunk.candidates[0].finishReason;
      }
    }
    if (DEBUG) console.log('[DEBUG LLM] streamGemini finished successfully, total length:', full.length, 'finishReason:', lastFinishReason);
    return { text: full, finishReason: lastFinishReason };
  } catch (err) {
    if (DEBUG) console.error('[DEBUG LLM] streamGemini error:', err);
    throw err;
  }
}

function getDefaultMaxTokens(settings) {
  if (typeof settings?.maxTokens === 'number' && settings.maxTokens > 0) return settings.maxTokens;
  return settings?.smart ? 900 : 450;
}

function getFeatureMaxTokens(settings, { mode, small }) {
  if (small || mode === 'say') return settings.smart ? 360 : 260;
  if (mode === 'assist') return settings.smart ? 800 : 450;
  return settings.smart ? 1000 : 600;
}

function isRetryableProviderError(error) {
  const status = error && (error.status || error.code || error.statusCode);
  if (status === 429 || status === 503 || status === 408 || status === 500 || status === 502) return true;
  const message = (error && (error.message || '')) + '';
  return /quota|rate limit|exceeded|overload|temporarily|unavailable|retry/i.test(message);
}

function getProviderCandidates(settings) {
  const keys = settings.apiKeys || {};
  const tier = settings.smart ? 'smart' : 'fast';
  const selectedProvider = settings.provider || 'gemini';
  const candidates = [];
  const push = (provider) => {
    const model = (settings.models[provider] || {})[tier];
    if (!model || !keys[provider]) return;
    candidates.push({ provider, model, apiKey: keys[provider] });
  };

  push(selectedProvider);
  if (selectedProvider !== 'gemini') push('gemini');
  if (selectedProvider !== 'groq') push('groq');
  if (selectedProvider !== 'openrouter') push('openrouter');
  if (selectedProvider !== 'openai') push('openai');
  if (selectedProvider !== 'anthropic') push('anthropic');
  if (selectedProvider !== 'nvidia') push('nvidia');
  return candidates;
}

function createLLM(settings) {
  const provider = settings.provider;
  const keys = settings.apiKeys || {};
  const tier = settings.smart ? 'smart' : 'fast';
  const maxTokens = getDefaultMaxTokens(settings);
  const freeTierModels = {
    gemini: new Set(['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview']),
    groq: new Set(['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']),
    openrouter: new Set(['openrouter/free'])
  };
  const candidates = getProviderCandidates(settings);
  const primary = candidates.find((entry) => entry.provider === provider) || candidates[0] || null;
  const model = primary ? primary.model : null;
  const apiKey = primary ? primary.apiKey : null;
  const freeTierBlocked = settings.freeTierOnly && !(freeTierModels[provider] && freeTierModels[provider].has(model));

  if (DEBUG) console.log('[DEBUG LLM] createLLM initialized:', { provider, model, candidateCount: candidates.length, ready: Boolean(primary) && !freeTierBlocked });

  return {
    provider, model, apiKey,
    supportsImages: primary ? !['groq', 'openrouter'].includes(primary.provider) : false,
    ready: Boolean(primary) && !freeTierBlocked,
    error: freeTierBlocked ? 'Free-tier only is enabled. Select Gemini, Groq, or OpenRouter with a supported free-tier model.' : (!primary ? 'Add a provider API key in Settings before asking Laka AI for help.' : ''),
    async stream(params) {
      if (DEBUG) console.log('[DEBUG LLM] stream() invoked for provider:', provider);
      let lastError = null;
      for (const candidate of candidates) {
        try {
          const args = { apiKey: candidate.apiKey, model: candidate.model, maxTokens, ...params };
          let result;
          if (candidate.provider === 'openai') result = await streamOpenAI(args);
          else if (candidate.provider === 'groq') result = await streamOpenAI({ ...args, baseURL: 'https://api.groq.com/openai/v1', supportsImages: false });
          else if (candidate.provider === 'openrouter') result = await streamOpenAI({ ...args, baseURL: 'https://openrouter.ai/api/v1', supportsImages: false });
          else if (candidate.provider === 'nvidia') result = await streamOpenAI({ ...args, baseURL: 'https://integrate.api.nvidia.com/v1' });
          else if (candidate.provider === 'anthropic') result = await streamAnthropic(args);
          else if (candidate.provider === 'gemini') result = await streamGemini(args);
          else throw new Error('unknown provider: ' + candidate.provider);
          return { ...result, provider: candidate.provider, model: candidate.model, attempts: candidates.indexOf(candidate) + 1 };
        } catch (error) {
          if (error && typeof error === 'object') error.lakaProvider = candidate.provider;
          lastError = error;
        }
      }
      throw lastError || new Error('unknown provider: ' + provider);
    }
  };
}

function formatProviderError(error) {
  const message = String((error && error.message) || error || 'Unable to reach the AI provider.');
  const retry = /retry in\s+([\d.]+)s/i.exec(message);
  if ((error && (error.status === 429 || error.code === 429)) || /quota|rate limit|resource_exhausted/i.test(message)) {
    const provider = error && error.lakaProvider ? error.lakaProvider : 'gemini';
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
    return `${providerName} free-tier limit reached${retry ? `. Retry in ${Math.ceil(Number(retry[1]))} seconds` : ''}. Laka AI will try configured fallbacks. Add Groq or OpenRouter in Settings for another free option, or wait for the quota window.`;
  }
  return message.slice(0, 600);
}

module.exports = { buildOpenAIChatMessages, createLLM, formatProviderError, getDefaultMaxTokens, getFeatureMaxTokens, getProviderCandidates, isRetryableProviderError, isTruncatedFinishReason };
