const assert = require('node:assert/strict');
const test = require('node:test');
const { getWindowDiagnostic } = require('../src/window-diagnostics');

test('reports only Laka AI window state with normalized booleans', () => {
  assert.deepEqual(getWindowDiagnostic('focus', { isVisible: () => 1, isFocused: () => true, isAlwaysOnTop: () => 1 }), {
    type: 'focus', visible: true, focused: true, alwaysOnTop: true
  });
});

test('rejects unknown diagnostic event names', () => {
  assert.equal(getWindowDiagnostic('other-app-window', {}), null);
});
