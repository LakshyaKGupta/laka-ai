const assert = require('node:assert/strict');
const test = require('node:test');
const { createOutputGuard } = require('../src/output-guard');

test('keeps a streamed final answer while dropping leaked continuation reasoning', () => {
  const emitted = [];
  const guard = createOutputGuard((text) => emitted.push(text));
  guard.push('Use a digit-DP state for the remaining prime exponents.');
  guard.push('\n\nWait, the user wants me to continue the text.');
  guard.push('\n*Refining the text continuation:*');
  guard.finish();

  assert.equal(guard.blocked, true);
  assert.equal(guard.text, 'Use a digit-DP state for the remaining prime exponents.');
  assert.equal(emitted.join(''), guard.text);
});

test('does not delay or alter a normal complete response', () => {
  const emitted = [];
  const guard = createOutputGuard((text) => emitted.push(text));
  guard.push('A complete answer with a code block.\n```python\nprint(1)\n```');
  guard.finish();

  assert.equal(guard.blocked, false);
  assert.equal(guard.text, 'A complete answer with a code block.\n```python\nprint(1)\n```');
  assert.equal(emitted.join(''), guard.text);
});
