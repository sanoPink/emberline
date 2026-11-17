// Deterministic dice for EMBERLINE. A single seeded stream feeds the bot
// skill rolls and the screenshot seeds, so a capture with &seed=N replays the
// same bot choices; the live game seeds from the clock instead.
export function seededStream(seed) {
  let cursor = seed >>> 0;
  return function next() {
    cursor |= 0;
    cursor = (cursor + 0x6d2b79f5) | 0;
    let hash = Math.imul(cursor ^ (cursor >>> 15), 1 | cursor);
    hash = (hash + Math.imul(hash ^ (hash >>> 7), 61 | hash)) ^ hash;
    return ((hash ^ (hash >>> 14)) >>> 0) / 4294967296;
  };
}

// Take one element from a list, spending a single draw.
export function drawOne(rng, pool) {
  return pool[Math.floor(rng() * pool.length)];
}

// Symmetric noise in [-amount, +amount], spending a single draw.
export function wobble(rng, span) {
  return (rng() * 2 - 1) * span;
}

// Roll a value in [min, max), spending a single draw.
export function between(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}
