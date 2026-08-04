// BraceletDesign v2 — the serializable recipe for one personalized bracelet.
//
// MEASURED-COLOR-FIRST (schemaVersion 2): the physical palette is derived
// from the customer's measured iris palette, matched per-colour to the
// physical inventory, with measured WEIGHTS driving bead quantities.
// Eye-colour classification is metadata only (stone naming, UI copy) and
// can never create or overwrite the physical palette.
//
//   PRIVACY BOUNDARY
//   ----------------
//   The raw eye image NEVER enters a design. It lives on a local <canvas>,
//   is read once for colour, and is never persisted or transmitted. A recipe
//   holds nothing that could reconstruct the photo — only derived colours,
//   matched bead SKUs and layout.
//
// A design is plain JSON-safe data (no class instances, no functions) so it
// can later be attached to an order, logged, or re-rendered as-is. The
// recipe is the source of truth; the design ID is just a handle for humans.

import { activeBeads } from './inventory.js';
import { matchColorToBead, hexToLab } from './match.js';
import { buildWeightedSequence } from './patterns.js';
import { physicalBeadCount } from './sizes.js';

export const SCHEMA_VERSION = 2;

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

// Turn merged SKU weights into exact integer bead quantities via the largest
// remainder method: floors first, then the leftover beads go to the largest
// fractional parts (ties: heavier weight, then SKU order). Always sums to
// `total`; small clusters may legitimately round to zero beads.
export function allocateQuantities(weightsBySku, total) {
  const entries = Object.entries(weightsBySku);
  const wSum = entries.reduce((a, [, w]) => a + w, 0);
  const exact = entries.map(([sku, w]) => {
    const share = (w / wSum) * total;
    return { sku, w, floor: Math.floor(share), frac: share - Math.floor(share) };
  });
  let left = total - exact.reduce((a, e) => a + e.floor, 0);
  exact.sort((x, y) => y.frac - x.frac || y.w - x.w || x.sku.localeCompare(y.sku));
  for (let i = 0; left > 0; i = (i + 1) % exact.length, left--) exact[i].floor++;
  const q = {};
  for (const e of exact.sort((x, y) => x.sku.localeCompare(y.sku))) {
    if (e.floor > 0) q[e.sku] = e.floor;
  }
  return q;
}

// Map a design's sequence to renderable physical bead hexes.
export function sequenceHexes(design, inventory = activeBeads()) {
  const hexBySku = Object.fromEntries(inventory.map((b) => [b.sku, b.hex]));
  return design.physical.sequence.map((sku) => hexBySku[sku]);
}

// Assemble a complete BraceletDesign from a measured palette + choices.
//
//   measuredPalette — [{ hex, lab, weight, radialZone }] from domain/palette.js
//                     (weights normalized to 1)
//   classification  — { category, variant, stone } metadata from scan.classifyPalette
//   arrangement     — 'dusk' | 'cadence' | 'wild'
//   size            — 'S' | 'M' | 'L'
//   designId        — pass an existing ID to keep it stable across pattern/size
//                     edits of the same bracelet; omitted → a new one is minted
//   inventory/now   — injectable for tests
//
// Deterministic given (measuredPalette, classification, arrangement, size,
// inventory, designId): everything except a freshly-minted id/createdAt is a
// pure function of the inputs (wild's ordering is seeded by the design id).
export function buildDesign({
  measuredPalette,
  classification,
  arrangement,
  size,
  designId,
  inventory = activeBeads(),
  now = () => new Date().toISOString(),
}) {
  const id = designId ?? newDesignId(classification.stone);

  // Per-measured-colour physical match, with weight and honest ΔE.
  const beadMatches = measuredPalette.map((p) => {
    const m = matchColorToBead(p.hex, inventory);
    return {
      measuredHex: p.hex,
      sku: m.sku,
      beadHex: m.beadHex,
      deltaE: Math.round(m.deltaE * 100) / 100,
      weight: p.weight,
    };
  });

  // Merge weights of measured colours that landed on the same SKU — the
  // physical bracelet reflects total per-family proportions.
  const weightsBySku = {};
  for (const m of beadMatches) weightsBySku[m.sku] = (weightsBySku[m.sku] ?? 0) + m.weight;

  const beadCount = physicalBeadCount(size);
  const quantities = allocateQuantities(weightsBySku, beadCount);

  const bead = (sku) => inventory.find((b) => b.sku === sku);
  const entries = Object.entries(quantities).map(([sku, count]) => ({
    sku, count, l: hexToLab(bead(sku).hex)[0],
  }));
  const sequence = buildWeightedSequence(entries, arrangement, beadCount, id);

  const diameters = [...new Set(Object.keys(quantities).map((sku) => bead(sku)?.diameterMm))]
    .filter((d) => d != null);

  return {
    schemaVersion: SCHEMA_VERSION,
    designId: id,
    createdAt: now(),

    // classification is METADATA (naming/copy) — it never chose the beads
    eye: { category: classification.category, variant: classification.variant },
    stone: classification.stone,

    // what we measured from THIS iris (derived colours only — never pixels)…
    measuredPalette: measuredPalette.map((p) => ({ ...p })),

    // …and how each measured colour maps to the physical catalog, with match
    // quality (CIEDE2000) exposed so bad matches are visible, never hidden.
    beadMatches,

    // customer choices
    arrangement,
    size,

    // the buildable spec
    physical: {
      beadCount,
      beadDiametersMm: diameters,      // [6] for Inventory V1
      sequence,                        // position → SKU, clockwise from top
      quantities,
    },
  };
}
