const VOICE_REPLY_FLUSH_WAIT_MS = 350;

function waitForCompletion(promise, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    Promise.resolve(promise).then(
      () => { clearTimeout(timer); resolve(true); },
      () => { clearTimeout(timer); resolve(false); }
    );
  });
}

module.exports = { VOICE_REPLY_FLUSH_WAIT_MS, waitForCompletion };
