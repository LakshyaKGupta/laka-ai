// Full-resolution screenshot via desktopCapturer (main process).
// First call triggers the macOS Screen-Recording permission prompt for the app.
const { desktopCapturer, screen } = require('electron');
const { getThumbnailSize } = require('./screen-size');

const MAX_SCREENSHOT_EDGE = 1600;

async function captureScreenshot() {
  const primary = screen.getPrimaryDisplay();
  const scale = primary.scaleFactor || 1;
  const { width, height } = primary.size;
  const thumbnailSize = getThumbnailSize({ width: Math.floor(width * scale), height: Math.floor(height * scale) }, MAX_SCREENSHOT_EDGE);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize
  });
  if (!sources.length) return null;
  // Prefer the primary display source.
  const src = sources.find((s) => String(s.display_id) === String(primary.id)) || sources[0];
  const img = src.thumbnail;
  if (!img || img.isEmpty()) return null;
  return img.toDataURL(); // data:image/png;base64,...
}

module.exports = { captureScreenshot };
