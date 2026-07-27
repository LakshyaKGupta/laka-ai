const assert = require('node:assert/strict');
const test = require('node:test');
const { takeAudioChunk } = require('../src/audio-buffer');

test('takes a bounded PCM chunk and preserves newer queued audio for the next transcription', () => {
  const first = Buffer.alloc(8, 1);
  const second = Buffer.alloc(8, 2);
  const result = takeAudioChunk([first, second], 10);
  assert.equal(result.pcm.length, 10);
  assert.deepEqual([...result.pcm.subarray(0, 8)], Array(8).fill(1));
  assert.deepEqual(result.remaining.map((chunk) => [...chunk]), [[2, 2, 2, 2, 2, 2]]);
});
