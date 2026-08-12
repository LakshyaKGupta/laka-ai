function getCooldownMs(error) {
  const status = error && (error.status || error.code || error.statusCode);
  if (status !== 429) return 0;
  const match = /retry in\s+([\d.]+)\s*(?:seconds?|s)/i.exec(String((error && error.message) || ''));
  return match ? Math.ceil(Number(match[1]) * 1000) : 60_000;
}

function getEarliestRetryMs(cooldowns, now = Date.now()) {
  const remaining = Object.values(cooldowns || {}).map((until) => Number(until) - now).filter((ms) => ms > 0);
  return remaining.length ? Math.min(...remaining) : 0;
}

module.exports = { getCooldownMs, getEarliestRetryMs };
