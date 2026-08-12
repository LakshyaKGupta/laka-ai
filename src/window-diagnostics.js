const WINDOW_EVENTS = new Set(['ready', 'focus', 'blur', 'show', 'hide']);

function getWindowDiagnostic(type, window) {
  if (!WINDOW_EVENTS.has(type) || !window) return null;
  return {
    type,
    visible: Boolean(window.isVisible()),
    focused: Boolean(window.isFocused()),
    alwaysOnTop: Boolean(window.isAlwaysOnTop())
  };
}

module.exports = { getWindowDiagnostic };
