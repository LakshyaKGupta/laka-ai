const DEBUG = false; // Set to false to disable debug logging
// LLM factory — OpenAI / Anthropic / Gemini behind one streaming interface.
// stream({ system, turns:[{role,text}], imageDataUrl, maxTokens, onToken }) -> Promise<fullText>

function stripDataUrl(dataUrl) {
  const m = /^data:(.+?);base64,(.*)$/s.exec(dataUrl || '');
  return m ? { mime: m[1], b64: m[2] } : null;
}

async function streamOpenAI({ apiKey, model, system, turns, imageDataUrl, maxTokens, onToken, baseURL }) {
  if (DEBUG) console.log('[DEBUG LLM] streamOpenAI called', { model, baseURL, hasImage: !!imageDataUrl, maxTokens });
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey, baseURL });
  const messages = [{ role: 'system', content: system }];
  turns.forEach((t, i) => {
    const last = i === turns.length - 1;
    if (last && imageDataUrl && t.role === 'user') {
      messages.push({ role: 'user', content: [
        { type: 'text', text: t.text },
        { type: 'image_url', image_url: { url: imageDataUrl } }
      ] });
    } else {
      messages.push({ role: t.role, content: t.text });
    }
  });
  if (DEBUG) console.log('[DEBUG LLM] streamOpenAI sending request to OpenAI SDK with messages count:', messages.length);
  try {
    const stream = await client.chat.completions.create({ model, messages, stream: true, max_tokens: maxTokens });
    let full = '';
    for await (const part of stream) {
      const d = part.choices && part.choices[0] && part.choices[0].delta && part.choices[0].delta.content;
      if (d) { full += d; onToken(d); }
    }
    if (DEBUG) console.log('[DEBUG LLM] streamOpenAI finished successfully, total length:', full.length);
    return full;
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
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { full += ev.delta.text; onToken(ev.delta.text); }
    }
    if (DEBUG) console.log('[DEBUG LLM] streamAnthropic finished successfully, total length:', full.length);
    return full;
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
    return full;
  } catch (err) {
    if (DEBUG) console.error('[DEBUG LLM] streamGemini error:', err);
    throw err;
  }
}

function getDefaultMaxTokens(settings) {
  if (typeof settings?.maxTokens === 'number' && settings.maxTokens > 0) return settings.maxTokens;
  return settings?.smart ? 4000 : 2400;
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
  const freeTierModels = new Set(['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview']);
  const candidates = getProviderCandidates(settings);
  const primary = candidates.find((entry) => entry.provider === provider) || candidates[0] || null;
  const model = primary ? primary.model : null;
  const apiKey = primary ? primary.apiKey : null;
  const freeTierBlocked = settings.freeTierOnly && (provider !== 'gemini' || !freeTierModels.has(model));

  if (DEBUG) console.log('[DEBUG LLM] createLLM initialized:', { provider, model, candidateCount: candidates.length, ready: Boolean(primary) && !freeTierBlocked });

  return {
    provider, model, apiKey,
    ready: Boolean(primary) && !freeTierBlocked,
    error: freeTierBlocked ? 'Free-tier only is enabled. Select Gemini with a supported free-tier model.' : (!primary ? 'Add a provider API key in Settings before asking Laka AI for help.' : ''),
    async stream(params) {
      if (DEBUG) console.log('[DEBUG LLM] stream() invoked for provider:', provider);
      let lastError = null;
      for (const candidate of candidates) {
        try {
          const args = { apiKey: candidate.apiKey, model: candidate.model, maxTokens, ...params };
          if (candidate.provider === 'openai') return await streamOpenAI(args);
          if (candidate.provider === 'nvidia') return await streamOpenAI({ ...args, baseURL: 'https://integrate.api.nvidia.com/v1' });
          if (candidate.provider === 'anthropic') return await streamAnthropic(args);
          if (candidate.provider === 'gemini') return await streamGemini(args);
          throw new Error('unknown provider: ' + candidate.provider);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('unknown provider: ' + provider);
    }
  };
}

module.exports = { createLLM, getDefaultMaxTokens, isRetryableProviderError, getProviderCandidates };
