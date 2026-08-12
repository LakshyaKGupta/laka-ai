const assert = require('node:assert/strict');
const test = require('node:test');
const { getThumbnailSize } = require('../src/screen-size');

test('caps Retina screenshot dimensions while preserving aspect ratio', () => {
  assert.deepEqual(getThumbnailSize({ width: 3456, height: 2234 }, 1440), { width: 1440, height: 931 });
});

test('does not upscale a smaller display capture', () => {
  assert.deepEqual(getThumbnailSize({ width: 1280, height: 800 }, 1440), { width: 1280, height: 800 });
});
