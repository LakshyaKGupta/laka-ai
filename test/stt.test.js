const assert = require('node:assert/strict');
const test = require('node:test');
const { createSTT, normalizeSpeechLanguage } = require('../src/stt');

test('offers Faster-Whisper as the local fallback when no cloud key is configured', () => {
  const stt = createSTT({ apiKeys: {}, localSpeechEnabled: true, localSpeechModel: 'base.en' });
  assert.equal(stt.available, true);
  assert.deepEqual(stt.providers, ['faster-whisper']);
});

test('prefers Groq Whisper before other cloud transcription providers', () => {
  const stt = createSTT({ apiKeys: { groq: 'g', gemini: 'm', openai: 'o' }, localSpeechEnabled: true });
  assert.deepEqual(stt.providers, ['groq', 'openai', 'gemini', 'faster-whisper']);
});

test('uses only approved speech-language hints', () => {
  assert.equal(normalizeSpeechLanguage('en'), 'en');
  assert.equal(normalizeSpeechLanguage('hi'), 'hi');
  assert.equal(normalizeSpeechLanguage('anything'), '');
});
