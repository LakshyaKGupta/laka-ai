// Feature definitions: each mode picks which inputs to attach and how to prompt.
// ctx = { transcript: [{channel:'you'|'them', text}], userText }

function formatTranscript(turns, limit) {
  const recent = limit ? turns.slice(-limit) : turns;
  return recent.map((t) => (t.channel === 'them' ? 'Them: ' : (t.channel === 'assistant' ? 'Laka AI: ' : 'You: ')) + t.text).join('\n').slice(-4000);
}

function hasRemoteTranscript(turns) {
  return Array.isArray(turns) && turns.some((turn) => turn && turn.channel === 'them' && typeof turn.text === 'string' && turn.text.trim());
}

function buildContextBlock(ctx) {
  const fields = [];
  if (ctx.resumeText) fields.push('Resume evidence (use only this evidence for candidate claims):\n' + ctx.resumeText.slice(0, 3500));
  if (ctx.company) fields.push('Company: ' + ctx.company);
  if (ctx.role) fields.push('Target role: ' + ctx.role);
  if (ctx.responsibilities) fields.push('Key responsibilities: ' + ctx.responsibilities);
  if (!fields.length) return '';
  return '\n\nCandidate and role context:\n' + fields.join('\n') + '\nDo not invent experience, achievements, company facts, or qualifications. If context is missing, say so briefly. Keep the answer accurate, concrete, and concise.';
}

function formatStructuredReply(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return trimmed;
  const normalized = trimmed.replace(/^\s+|\s+$/g, '');
  if (/^\d+\./.test(normalized) || /^[-*]\s/.test(normalized)) return normalized;
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 2) return normalized;
  const bullets = lines.map((line) => `- ${line}`);
  return bullets.join('\n');
}

const MODES = {
  // One-shot "do the smart thing". Uses screen + recent transcript.
  assist: {
    needsScreen: true,
    userBubble: null,
    small: false,
    system:
      'You are Laka AI, a concise real-time copilot for the user\'s permitted work, study, and practice. ' +
      'Look at the screenshot and the recent conversation, decide what the user needs RIGHT NOW, and deliver it directly with no preamble. ' +
      'If the screen shows a coding/LeetCode problem: give a short approach, then a correct solution in a fenced code block, then time and space complexity. ' +
      'If it is a conversation: answer the current question or say exactly what the user should say next, in the first person. ' +
      'Give one self-contained, complete answer. Be concise and confident; do not waste output repeating the prompt. Never say "I can see" or describe the screenshot.',
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 12);
      return 'Recent conversation:\n' + (t || '(none)') + '\n\nRespond with what I need right now.' + buildContextBlock(ctx);
    }
  },

  // Meeting copilot: what to say next.
  say: {
    needsScreen: false,
    userBubble: 'What should I say?',
    small: false,
    system:
      'You are Laka AI, suggesting concise replies for a permitted conversation. ' +
      '"Them" is the other person; "You" is the user. Based on what Them just said and what You already said, ' +
      'draft ONE short, natural, confident reply the user can say out loud, in the first person. Never introduce yourself, represent the user, or turn profile details into a greeting. No quotes, no preamble, 1–3 sentences.',
    build(ctx) {
      const t = formatTranscript((ctx.transcript || []).filter((turn) => turn.channel !== 'assistant'), 14);
      return 'Conversation so far:\n' + (t || '(nothing heard yet — the user opened Laka AI without audio)') +
        '\n\nWhat should I say next?' + buildContextBlock(ctx);
    }
  },

  // Smart follow-up questions to keep the conversation going.
  followup: {
    needsScreen: false,
    userBubble: 'Follow-up questions',
    small: true,
    system:
      'You are Laka AI. Given the conversation, suggest 2–4 sharp, relevant follow-up questions the user could ask next ' +
      'to sound engaged and drive the discussion. Return them as a short bullet list, nothing else.',
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 20);
      return 'Conversation so far:\n' + (t || '(none)') + '\n\nSuggest follow-up questions.' + buildContextBlock(ctx);
    }
  },

  // Recap of the whole session.
  recap: {
    needsScreen: false,
    userBubble: 'Recap',
    small: true,
    system:
      'You are Laka AI. Summarize the conversation so far for someone who joined late: ' +
      'a few key points, any decisions, and action items. Use short bullets under bold headers. Be brief.',
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 0);
      return 'Full transcript:\n' + (t || '(nothing captured yet)') + '\n\nRecap this.' + buildContextBlock(ctx);
    }
  },

  // Free-form question typed in the composer. All three inputs as context.
  ask: {
    needsScreen: false,
    userBubble: null, // uses the typed text as the bubble
    small: false,
    system:
      'You are Laka AI, a concise assistant grounded in the user\'s permitted conversation and profile context. ' +
      'Answer the user\'s question directly, accurately, and completely in one self-contained response. Favor evidence over guesses, and be concise. No preamble.',
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 12);
      return (t ? 'Recent conversation:\n' + t + '\n\n' : '') + 'Question: ' + ctx.userText + buildContextBlock(ctx);
    }
  },

  // Explicit LeetCode/coding screenshot solver (Cmd+H). Screen only.
  leetcode: {
    needsScreen: true,
    userBubble: 'Solve what\'s on screen',
    small: false,
    system:
      'You are an expert competitive programmer. The screenshot contains a coding problem. ' +
      'Respond with: (1) a one-line restatement, (2) a short approach, (3) a clean, correct, idiomatic solution in a fenced code block ' +
      '(use the language shown on screen, else Python), (4) time and space complexity.',
    build(ctx) { return 'Solve the coding problem shown in the screenshot.' + buildContextBlock(ctx); }
  }
};

module.exports = { MODES, buildContextBlock, formatTranscript, formatStructuredReply, hasRemoteTranscript };
