const assert = require('node:assert/strict');
const test = require('node:test');
const { MODES, formatTranscript } = require('../src/prompts');

test('keeps a typed follow-up fast by not taking a new screenshot', () => {
  assert.equal(MODES.ask.needsScreen, false);
});

test('bounds conversation context to keep follow-up prompts responsive', () => {
  const turns = Array.from({ length: 40 }, () => ({ channel: 'them', text: 'x'.repeat(1000) }));
  assert.ok(formatTranscript(turns, 12).length <= 4000);
});

test('keeps Laka AI replies out of the captured-speaker context for voice answers', () => {
  const prompt = MODES.say.build({
    transcript: [
      { channel: 'them', text: 'Tell me about your product work.' },
      { channel: 'assistant', text: 'Hello! I represent Lakshya.' }
    ]
  });
  assert.match(prompt, /Them: Tell me about your product work\./);
  assert.doesNotMatch(prompt, /I represent Lakshya/);
});

test('recognizes whether remote-speaker audio is available for a voice reply', () => {
  assert.equal(require('../src/prompts').hasRemoteTranscript([{ channel: 'assistant', text: 'Previous reply' }]), false);
  assert.equal(require('../src/prompts').hasRemoteTranscript([{ channel: 'them', text: 'Question' }]), true);
});

test('keeps voice replies focused on the newest captured conversation turns', () => {
  const prompt = MODES.say.build({
    transcript: [
      { channel: 'them', text: 'old-one' }, { channel: 'you', text: 'old-two' },
      { channel: 'them', text: 'old-three' }, { channel: 'you', text: 'old-four' },
      { channel: 'them', text: 'old-five' }, { channel: 'you', text: 'old-six' },
      { channel: 'them', text: 'old-seven' }, { channel: 'you', text: 'old-eight' },
      { channel: 'them', text: 'What measurable product outcome did you improve?' }
    ]
  });
  assert.doesNotMatch(prompt, /old-one/);
  assert.match(prompt, /What measurable product outcome did you improve\?/);
});
