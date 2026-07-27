const assert = require('node:assert/strict');
const test = require('node:test');
const { createSTT } = require('../src/stt');

test('offers Faster-Whisper as the local fallback when no cloud key is configured', () => {
  const stt = createSTT({ apiKeys: {}, localSpeechEnabled: true, localSpeechModel: 'base.en' });
  assert.equal(stt.available, true);
  assert.deepEqual(stt.providers, ['faster-whisper']);
});
