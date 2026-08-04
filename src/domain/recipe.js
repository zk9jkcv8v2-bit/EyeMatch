// BraceletDesign — the serializable recipe for one personalized bracelet.
//
// This object is the bridge between what the customer sees on screen and what
// a fulfillment person will eventually build. It contains ONLY derived,
// non-image data:
//
//   PRIVACY BOUNDARY
//   ----------------
//   The raw eye image NEVER enters a design. It lives on a local <canvas>,
//   is read once for colour, and is never persisted or transmitted. A recipe
//   holds nothing that could reconstruct the photo — only the classified eye
//   colour, generated palette, matched bead SKUs and layout.
//
// A design is plain JSON-safe data (no class instances, no functions) so it
// can later be attached to an order, logged, or re-rendered as-is. The recipe
// is the source of truth; the design ID is just a handle for humans.

import { activeBeads } from './inventory.js';
import { matchPaletteToBeads } from './match.js';
import { colorIndexFor } from './patterns.js';
import { physicalBeadCount } from './sizes.js';

export const SCHEMA_VERSION = 1;

// Human-readable design ID, e.g. "EM-AQU-7K3M9Q".
//   - "EM" brand prefix, three letters of the matched stone (support staff can
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

// Build the full bead sequence for an arrangement: position p (0-based, going
// around the wrist) → bead SKU. Uses the exact same colorIndexFor math as the
// 3-D visualization, so screen and recipe always agree.
export function buildSequence(beadMatches, arrangement, beadCount) {
  const n = beadMatches.length;
  return Array.from({ length: beadCount }, (_, i) =>
    beadMatches[colorIndexFor(arrangement, i, beadCount, n)].sku);
}

export function countQuantities(sequence) {
  const q = {};
  for (const sku of sequence) q[sku] = (q[sku] ?? 0) + 1;
  return q;
}

// Assemble a complete BraceletDesign from a scan result + customer choices.
//
//   match       — the object produced by scan.buildMatch (category, variant,
//                 stone, gems[5], iris{core,mid,edge})
//   arrangement — 'dusk' | 'cadence' | 'wild'
//   size        — 'S' | 'M' | 'L'
//   designId    — pass an existing ID to keep it stable across pattern/size
//                 edits of the same bracelet; omitted → a new one is minted
//   inventory   — injectable for tests; defaults to the active catalog
//   now         — injectable clock for tests; defaults to real time
//
// Deterministic given (match, arrangement, size, inventory): everything except
// designId/createdAt is a pure function of the inputs.
export function buildDesign({
  match,
  arrangement,
  size,
  designId,
  inventory = activeBeads(),
  now = () => new Date().toISOString(),
}) {
  const beadMatches = matchPaletteToBeads(match.gems, inventory);
  const beadCount = physicalBeadCount(size);
  const sequence = buildSequence(beadMatches, arrangement, beadCount);

  // Distinct diameters across the selected beads (DEV inventory: always [8]).
  const diameters = [...new Set(
    beadMatches.map((m) => inventory.find((b) => b.sku === m.sku)?.diameterMm),
  )].filter((d) => d != null);

  return {
    schemaVersion: SCHEMA_VERSION,
    designId: designId ?? newDesignId(match.stone),
    createdAt: now(),

    // classification (derived — never the image itself)
    eye: { category: match.category, variant: match.variant },
    stone: match.stone,

    // what the generator asked for…
    generatedPalette: [...match.gems],
    irisColors: { ...match.iris },

    // …and what the physical catalog can actually supply, with match quality
    // (CIEDE2000) exposed so bad matches are visible, never hidden.
    beadMatches: beadMatches.map((m, i) => ({
      paletteIndex: i,
      desiredHex: m.desiredHex,
      sku: m.sku,
      beadHex: m.beadHex,
      deltaE: Math.round(m.deltaE * 100) / 100,
    })),

    // customer choices
    arrangement,
    size,

    // the buildable spec
    physical: {
      beadCount,
      beadDiametersMm: diameters,      // [8] until real inventory lands
      sequence,                        // position → SKU, clockwise from top
      quantities: countQuantities(sequence),
    },
  };
}
