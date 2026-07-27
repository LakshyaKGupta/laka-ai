const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('downsamples 48 kHz microphone frames to 16 kHz PCM', () => {
  let Processor;
  const sent = [];
  class MockWorkletProcessor { constructor() { this.port = { postMessage: (buffer) => sent.push(new Int16Array(buffer)) }; } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pcm-processor.js'), 'utf8'), {
    AudioWorkletProcessor: MockWorkletProcessor,
    sampleRate: 48000,
    Int16Array,
    Math,
    registerProcessor: (_name, value) => { Processor = value; }
  });
  const processor = new Processor();
  processor.process([[new Float32Array(128).fill(0.5)]]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].length, 43);
  assert.ok(sent[0][0] > 16000);
});
