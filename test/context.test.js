const assert = require('node:assert/strict');
const test = require('node:test');
const { buildContextBlock } = require('../src/prompts');
const { normalizeResumeText } = require('../src/resume');

test('builds a concise grounded candidate context block', () => {
  const context = buildContextBlock({
    resumeText: 'Built hiring workflows using Python.',
    company: 'Laka Labs',
    role: 'Product Engineer',
    responsibilities: 'Own AI product workflows.'
  });
  assert.match(context, /Resume evidence/);
  assert.match(context, /Laka Labs/);
  assert.match(context, /Do not invent experience/);
});

test('normalizes and bounds uploaded resume text', () => {
  assert.equal(normalizeResumeText('  Ada\n\n  Lovelace  ', 100), 'Ada\nLovelace');
  assert.equal(normalizeResumeText('x'.repeat(20), 10).length, 10);
});
