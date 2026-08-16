const assert = require('node:assert/strict');
const test = require('node:test');
const { MODES, formatTranscript } = require('../src/prompts');

test('keeps a typed follow-up fast by not taking a new screenshot', () => {
  assert.equal(MODES.ask.needsScreen, false);
});

test('does not let stale conversation history override a standalone typed greeting', () => {
  const prompt = MODES.ask.build({
    userText: 'hi',
    transcript: [{ channel: 'assistant', text: 'Finish the GTM scroll trigger and configure GA4.' }]
  });
  assert.match(prompt, /Current user message: hi/);
  assert.doesNotMatch(prompt, /GTM scroll trigger/);
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

test('keeps prior Laka AI output out of screen Assist context', () => {
  const prompt = MODES.assist.build({
    transcript: [
      { channel: 'assistant', text: 'Wait, the user wants me to continue an old solution.' },
      { channel: 'them', text: 'Can you explain the current requirement?' }
    ]
  });
  assert.doesNotMatch(prompt, /continue an old solution/);
  assert.match(prompt, /Them: Can you explain the current requirement/);
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

test('voice replies request only the final words the user should say', () => {
  assert.match(MODES.say.system, /Output only the final words/);
  assert.match(MODES.ask.system, /Never introduce yourself/);
  assert.match(MODES.assist.system, /Do not guess/);
});

test('coding Assist rejects generic advice when the exact problem is unreadable', () => {
  assert.match(MODES.assist.system, /Do not give generic optimization advice/);
});
