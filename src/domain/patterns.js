// Stone arrangements — the single source of truth for how a palette of N
// colours is laid out across a circle of beads. Both the 3-D visualization
// (three/bracelet.js) and the physical bracelet recipe (domain/recipe.js)
// import THIS function, so what the customer sees and what fulfillment builds
// can never drift apart.
//
// Pure math, fully deterministic: same (pattern, i, count, n) → same index.

export const ARRANGEMENTS = ['dusk', 'cadence', 'wild'];

const TAU = Math.PI * 2;

// Which palette colour (0 = lightest … n-1 = darkest) sits on bead `i` of
// `count`, under a named arrangement. Palettes are ordered light→dark.
export function colorIndexFor(pattern, i, count, n) {
  if (pattern === 'cadence') return i % n;            // a steady repeating rhythm
  if (pattern === 'wild') {                            // scattered, but every hue used
    const h = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
    return Math.floor((h - Math.floor(h)) * n) % n;
  }
  // 'dusk' — a seamless vertical gradient: lightest at the top of the wrist,
  // darkest at the bottom, mirrored on both sides so there is no seam.
  const ang = (i / count) * TAU;
  const s = (Math.sin(ang) + 1) / 2;                   // 1 at top → 0 at bottom
  return Math.round((1 - s) * (n - 1));
}

/* ============================================================
   Weighted placement (Measured Palette V1)

   The recipe allocates an exact bead COUNT per MEASURED COLOUR from that
   colour's weight. These placers arrange those exact quantities around the
   wrist while keeping each pattern's visual identity:

     dusk    — lightness gradient: lightest at the top of the wrist, darkest
               at the bottom (uses Lab L* of the MEASURED colour)
     cadence — proportional rhythmic interleave (error-diffusion spacing)
     wild    — organic scatter via a seeded deterministic shuffle
               (seed = design id; NO Math.random anywhere)

   The placers are colour-agnostic: they operate on opaque keys, so they know
   nothing about bead inventory and never will.

   Every placer consumes exactly the allocated quantities — the sequence
   multiset always equals `quantities`. Fully deterministic.
   ============================================================ */

// FNV-1a string hash → 32-bit seed.
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — tiny deterministic PRNG (used ONLY for wild's shuffle).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// entries: [{ key, l, count }] — `key` is an opaque stable identifier (the
// recipe passes a measured-palette key such as 'c00'); `l` is that colour's
// Lab L*; counts must sum to beadCount. seed: any stable string (the design id).
export function buildWeightedSequence(entries, pattern, beadCount, seed = '') {
  const totalCount = entries.reduce((a, e) => a + e.count, 0);
  if (totalCount !== beadCount) {
    throw new Error(`buildWeightedSequence: counts ${totalCount} ≠ beadCount ${beadCount}`);
  }

  if (pattern === 'cadence') {
    // Error-diffusion interleave: at each position, emit the colour with the
    // greatest accumulated entitlement. Evenly spaces every colour.
    const sorted = [...entries].sort((x, y) => y.count - x.count || x.key.localeCompare(y.key));
    const acc = sorted.map(() => 0);
    const remaining = sorted.map((e) => e.count);
    const seq = [];
    for (let i = 0; i < beadCount; i++) {
      let pick = -1;
      for (let j = 0; j < sorted.length; j++) {
        if (remaining[j] <= 0) continue;
        acc[j] += sorted[j].count;
        if (pick === -1 || acc[j] > acc[pick]) pick = j;
      }
      seq.push(sorted[pick].key);
      acc[pick] -= beadCount;
      remaining[pick]--;
    }
    return seq;
  }

  if (pattern === 'wild') {
    // Exact multiset, deterministically shuffled from the design id.
    const multiset = [...entries]
      .sort((x, y) => x.key.localeCompare(y.key))
      .flatMap((e) => Array(e.count).fill(e.key));
    const rng = mulberry32(hashSeed(seed));
    for (let i = multiset.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [multiset[i], multiset[j]] = [multiset[j], multiset[i]];
    }
    return multiset;
  }

  // dusk — rank positions by height on the wrist (top first), then pour the
  // colours in lightness order (lightest first) into the highest positions.
  const positions = Array.from({ length: beadCount }, (_, i) => ({
    i, h: (Math.sin((i / beadCount) * TAU) + 1) / 2,
  })).sort((x, y) => y.h - x.h || x.i - y.i);
  const byLight = [...entries].sort((x, y) => y.l - x.l || x.key.localeCompare(y.key));
  const seq = new Array(beadCount);
  let p = 0;
  for (const e of byLight) {
    for (let k = 0; k < e.count; k++) seq[positions[p++].i] = e.key;
  }
  return seq;
}
