const LIVE_AUDIO = Object.freeze({
  flushMs: 200,
  silenceMs: 450,
  minTranscriptionBytes: 25_600, // 0.8 seconds of 16 kHz mono PCM16
  maxTranscriptionBytes: 80_000, // 2.5 seconds per live request
  maxBufferedBytes: 256_000 // keep at most eight seconds when a provider is slow
});

function shouldFlushLiveAudio({ bytes, lastSpeechAt, now = Date.now(), force = false }) {
  if (Number(bytes) < LIVE_AUDIO.minTranscriptionBytes) return false;
  if (force || Number(bytes) >= LIVE_AUDIO.maxTranscriptionBytes) return true;
  return Number(now) - Number(lastSpeechAt) >= LIVE_AUDIO.silenceMs;
}

function retainNewestAudio(chunks, maxBytes) {
  const retained = [];
  let bytes = 0;
  let remaining = Math.max(0, Number(maxBytes) || 0);
  for (let index = chunks.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const chunk = chunks[index];
    if (!Buffer.isBuffer(chunk) || !chunk.length) continue;
    const kept = chunk.length > remaining ? chunk.subarray(chunk.length - remaining) : chunk;
    retained.unshift(kept);
    bytes += kept.length;
    remaining -= kept.length;
  }
  return { chunks: retained, bytes };
}

module.exports = { LIVE_AUDIO, retainNewestAudio, shouldFlushLiveAudio };
