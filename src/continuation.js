const TRUNCATED_FINISH_REASONS = new Set(['length', 'max_tokens', 'MAX_TOKENS']);
const MAX_AUTOMATIC_CONTINUATIONS = 2;

function shouldAutomaticallyContinue(finishReason, completedContinuations) {
  return TRUNCATED_FINISH_REASONS.has(finishReason) && completedContinuations < MAX_AUTOMATIC_CONTINUATIONS;
}

module.exports = { MAX_AUTOMATIC_CONTINUATIONS, shouldAutomaticallyContinue };
