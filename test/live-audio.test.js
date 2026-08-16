const assert = require('node:assert/strict');
const test = require('node:test');
const { LIVE_AUDIO, retainNewestAudio, shouldFlushLiveAudio } = require('../src/live-audio');

test('uses pause-aware live flushing with bounded audio work', () => {
  assert.equal(LIVE_AUDIO.flushMs, 200);
  assert.equal(LIVE_AUDIO.silenceMs, 450);
  assert.equal(LIVE_AUDIO.minTranscriptionBytes, 25_600);
  assert.equal(LIVE_AUDIO.maxTranscriptionBytes, 80_000);
  assert.equal(LIVE_AUDIO.maxBufferedBytes, 256_000);
});

test('waits for a short pause but flushes a long speech segment without waiting indefinitely', () => {
  const now = 10_000;
  assert.equal(shouldFlushLiveAudio({ bytes: 25_600, lastSpeechAt: now - 300, now }), false);
  assert.equal(shouldFlushLiveAudio({ bytes: 25_600, lastSpeechAt: now - 450, now }), true);
  assert.equal(shouldFlushLiveAudio({ bytes: 80_000, lastSpeechAt: now, now }), true);
  assert.equal(shouldFlushLiveAudio({ bytes: 25_600, lastSpeechAt: now, now, force: true }), true);
});

test('drops stale queued audio and retains the newest PCM when transcription is slower than speech', () => {
  const result = retainNewestAudio([
    Buffer.alloc(4, 1),
    Buffer.alloc(4, 2),
    Buffer.alloc(4, 3)
  ], 7);

  assert.equal(result.bytes, 7);
  assert.deepEqual(result.chunks.map((chunk) => [...chunk]), [[2, 2, 2], [3, 3, 3, 3]]);
});
