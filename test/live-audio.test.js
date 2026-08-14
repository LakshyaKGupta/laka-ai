const assert = require('node:assert/strict');
const test = require('node:test');
const { LIVE_AUDIO, retainNewestAudio } = require('../src/live-audio');

test('uses a sub-second live flush cadence with bounded audio work', () => {
  assert.equal(LIVE_AUDIO.flushMs, 800);
  assert.equal(LIVE_AUDIO.minTranscriptionBytes, 25_600);
  assert.equal(LIVE_AUDIO.maxTranscriptionBytes, 80_000);
  assert.equal(LIVE_AUDIO.maxBufferedBytes, 256_000);
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
