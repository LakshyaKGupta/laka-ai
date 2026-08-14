const assert = require('node:assert/strict');
const test = require('node:test');
const { getThumbnailSize } = require('../src/screen-size');

test('caps Retina screenshot dimensions while preserving aspect ratio', () => {
  assert.deepEqual(getThumbnailSize({ width: 3456, height: 2234 }, 1600), { width: 1600, height: 1034 });
});

test('does not upscale a smaller display capture', () => {
  assert.deepEqual(getThumbnailSize({ width: 1280, height: 800 }, 1600), { width: 1280, height: 800 });
});
