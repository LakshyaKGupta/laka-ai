const assert = require('node:assert/strict');
const test = require('node:test');
const { getScreenCaptureError } = require('../src/screen-request');

test('blocks screen Assist when no screenshot was captured', () => {
  assert.match(getScreenCaptureError(true, null), /Screen Recording permission/);
});

test('allows non-screen requests and requests with a screenshot', () => {
  assert.equal(getScreenCaptureError(false, null), '');
  assert.equal(getScreenCaptureError(true, 'data:image/png;base64,AAAA'), '');
});
