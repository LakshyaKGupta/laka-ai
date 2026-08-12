function getThumbnailSize({ width, height }, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

module.exports = { getThumbnailSize };
