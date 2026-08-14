function getScreenCaptureError(needsScreen, imageDataUrl) {
  if (!needsScreen || imageDataUrl) return '';
  return 'Screen Assist could not capture the screen. Grant Screen Recording permission to Laka AI, then try again.';
}

module.exports = { getScreenCaptureError };
