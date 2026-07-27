function takeAudioChunk(chunks, maxBytes) {
  const selected = [];
  const remaining = [];
  let available = Math.max(0, Number(maxBytes) || 0);

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!Buffer.isBuffer(chunk) || !chunk.length) continue;
    if (!available) {
      remaining.push(chunk);
      continue;
    }
    if (chunk.length <= available) {
      selected.push(chunk);
      available -= chunk.length;
      continue;
    }
    selected.push(chunk.subarray(0, available));
    remaining.push(chunk.subarray(available));
    available = 0;
  }
  return { pcm: Buffer.concat(selected), remaining };
}

module.exports = { takeAudioChunk };
