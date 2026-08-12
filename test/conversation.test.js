const assert = require('node:assert/strict');
const test = require('node:test');
const { clearConversation } = require('../src/conversation');

test('clears transcript and pending audio when a conversation ends', () => {
  const transcript = [{ channel: 'them', text: 'Hello' }];
  const buffers = { you: [Buffer.from('a')], them: [Buffer.from('b')] };
  const bufferBytes = { you: 1, them: 1 };
  clearConversation({ transcript, buffers, bufferBytes });
  assert.deepEqual(transcript, []);
  assert.deepEqual(buffers, { you: [], them: [] });
  assert.deepEqual(bufferBytes, { you: 0, them: 0 });
});
