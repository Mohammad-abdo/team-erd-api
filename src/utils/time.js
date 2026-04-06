/**
 * Parses strings like `15m`, `7d`, `24h`, `30s`, `1w` into milliseconds.
 * @param {string} input
 */
export function durationToMs(input) {
  const m = String(input ?? "").trim().match(/^(\d+)\s*(ms|s|m|h|d|w)$/i);
  if (!m) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  const table = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return n * (table[u] ?? 86_400_000);
}
