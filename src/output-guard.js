const LEAKED_REASONING_MARKERS = [
  /\n\s*wait,?\s+(?:the\s+)?user\s+wants/i,
  /\n\s*wait,?\s+i\s+(?:need|should|must)\s+to/i,
  /\n\s*\*?\s*(?:refining|thinking|analysis)\b/i,
  /\n\s*the\s+user\s+wants\s+me\s+to/i
];
const TRAILING_HOLD_CHARS = 160;

function leakedReasoningIndex(text) {
  let earliest = -1;
  for (const marker of LEAKED_REASONING_MARKERS) {
    const match = marker.exec(text);
    if (match && (earliest === -1 || match.index < earliest)) earliest = match.index;
  }
  return earliest;
}

function createOutputGuard(onText) {
  let pending = '';
  let text = '';
  let blocked = false;
  const emit = (chunk) => {
    if (!chunk) return;
    text += chunk;
    onText(chunk);
  };
  const drain = (force) => {
    const leakAt = leakedReasoningIndex(pending);
    if (leakAt >= 0) {
      emit(pending.slice(0, leakAt));
      pending = '';
      blocked = true;
      return;
    }
    if (force) {
      emit(pending);
      pending = '';
      return;
    }
    const safeLength = Math.max(0, pending.length - TRAILING_HOLD_CHARS);
    emit(pending.slice(0, safeLength));
    pending = pending.slice(safeLength);
  };

  return {
    get blocked() { return blocked; },
    get text() { return text; },
    push(chunk) {
      if (blocked || typeof chunk !== 'string' || !chunk) return;
      pending += chunk;
      drain(false);
    },
    finish() { if (!blocked) drain(true); }
  };
}

module.exports = { createOutputGuard, leakedReasoningIndex };
