// BraceletDesign v3 — the serializable recipe for one personalized bracelet.
//
// INVENTORY-INDEPENDENT (schemaVersion 3). A design is built ONLY from what
// the scanner measured in this particular iris. There is no bead catalog, no
// SKU matching and no colour substitution anywhere in this file — a measured
// colour is never replaced, merged or discarded because some current bead
// stock happens to lack a near match.
//
// The physical bracelet is assembled LATER, by a human, using whatever real
// beads exist at that time: the recipe hands them a per-position colour
// sequence and per-colour quantities, and they pick the closest bead they
// actually hold. Colour→bead matching therefore happens at fulfillment time
// against current stock, not at scan time against a snapshot.
//
//   PRIVACY BOUNDARY
//   ----------------
//   The raw eye image NEVER enters a design. It lives on a local <canvas>,
//   is read once for colour, and is never persisted or transmitted. A recipe
//   holds nothing that could reconstruct the photo — only derived colours,
//   weights and layout.
//
// A design is plain JSON-safe data (no class instances, no functions) so it
// can later be attached to an order, logged, or re-rendered as-is. The
// recipe is the source of truth; the design ID is just a handle for humans.

import { buildWeightedSequence } from './patterns.js';
import { physicalBeadCount } from './sizes.js';

export const SCHEMA_VERSION = 3;

// Human-readable design ID, e.g. "EM-AQU-7K3M9Q".
//   - "EM" brand prefix, three letters of the stone name (support staff can
//     sanity-check an order at a glance), 6 random chars.
//   - Alphabet omits 0/O/1/I/L so IDs survive being read over the phone.
//   - Randomness comes from crypto.getRandomValues (never Math.random); it is
//     used ONLY for uniqueness — nothing about the customer or their eye is
//     encoded in the ID.
const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newDesignId(stoneName = '') {
  const prefix = (stoneName.replace(/[^a-z]/gi, '').slice(0, 3) || 'EMX').toUpperCase();
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  let rand = '';
  for (const v of buf) rand += ID_ALPHABET[v % ID_ALPHABET.length];
  return `EM-${prefix}-${rand}`;
}

// Stable key for palette entry i. Zero-padded so lexicographic order (used as
// a deterministic tie-break downstream) matches numeric order at any length.
export const colorKey = (i) => `c${String(i).padStart(2, '0')}`;

// Turn per-colour weights into exact integer bead counts via the largest
// remainder method: floors first, then leftover beads go to the largest
// fractional parts (ties: heavier weight, then key order). Always sums to
// `total`; a very small colour may legitimately round to zero beads.
export function allocateQuantities(weightsByKey, total) {
  const entries = Object.entries(weightsByKey);
  const wSum = entries.reduce((a, [, w]) => a + w, 0);
  const exact = entries.map(([key, w]) => {
    const share = (w / wSum) * total;
    return { key, w, floor: Math.floor(share), frac: share - Math.floor(share) };
  });
  let left = total - exact.reduce((a, e) => a + e.floor, 0);
  exact.sort((x, y) => y.frac - x.frac || y.w - x.w || x.key.localeCompare(y.key));
  for (let i = 0; left > 0; i = (i + 1) % exact.length, left--) exact[i].floor++;
  const q = {};
  for (const e of exact.sort((x, y) => x.key.localeCompare(y.key))) {
    if (e.floor > 0) q[e.key] = e.floor;
  }
  return q;
}

// Per-position measured colours, for rendering and for manual assembly.
export function sequenceHexes(design) {
  return design.physical.sequenceHex.slice();
}

// Assemble a complete BraceletDesign from a measured palette + choices.
//
//   measuredPalette — [{ hex, lab, weight, radialZone, radialMean }] from
//                     domain/palette.js (weights normalized to 1)
//   classification  — { category, variant, stone } metadata from
//                     scan.classifyPalette — naming/copy ONLY
//   arrangement     — 'dusk' | 'cadence' | 'wild'
//   size            — 'S' | 'M' | 'L'
//   designId        — pass an existing ID to keep it stable across pattern/size
//                     edits of the same bracelet; omitted → a new one is minted
//   now             — injectable clock for tests
//
// Deterministic given (measuredPalette, classification, arrangement, size,
// designId): everything except a freshly-minted id/createdAt is a pure
// function of the inputs (wild's ordering is seeded by the design id).
export function buildDesign({
  measuredPalette,
  classification,
  arrangement,
  size,
  designId,
  now = () => new Date().toISOString(),
}) {
  const id = designId ?? newDesignId(classification.stone);

  // Every measured colour gets a key and keeps its measured weight. No
  // matching, no merging, no substitution.
  const palette = measuredPalette.map((p, i) => ({ key: colorKey(i), ...p }));

  const weightsByKey = {};
  for (const p of palette) weightsByKey[p.key] = p.weight;

  const beadCount = physicalBeadCount(size);
  const quantities = allocateQuantities(weightsByKey, beadCount);

  // Placement uses each colour's own Lab L* — no bead lookup.
  const entries = Object.entries(quantities).map(([key, count]) => ({
    key, count, l: palette.find((p) => p.key === key).lab[0],
  }));
  const sequence = buildWeightedSequence(entries, arrangement, beadCount, id);
  const hexByKey = Object.fromEntries(palette.map((p) => [p.key, p.hex]));

  return {
    schemaVersion: SCHEMA_VERSION,
    designId: id,
    createdAt: now(),

    // classification is METADATA (naming/copy) — it never shapes the palette
    eye: { category: classification.category, variant: classification.variant },
    stone: classification.stone,

    // what we measured from THIS iris (derived colours only — never pixels).
    // This is the source of truth an assembler works from.
    measuredPalette: palette.map((p) => ({ ...p })),

    // customer choices
    arrangement,
    size,

    // the buildable spec — colours and positions, no bead identities
    physical: {
      beadCount,
      sequence,                                   // position → colour key, clockwise from top
      sequenceHex: sequence.map((k) => hexByKey[k]), // same, resolved to measured colours
      quantities,                                 // colour key → number of beads
    },
  };
}
