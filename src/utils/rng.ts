// Seeded RNG (mulberry32) — deterministic distractor choice & shuffles.
// Same (state, now, seed) → identical session plan (§7).

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher–Yates shuffle. Returns a new array. */
export function shuffled<T>(arr: readonly T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Pick `count` distinct elements deterministically. */
export function pickN<T>(arr: readonly T[], count: number, rand: () => number): T[] {
  return shuffled(arr, rand).slice(0, Math.max(0, Math.min(count, arr.length)));
}
