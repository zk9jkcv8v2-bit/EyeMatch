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
