// ============================================================================
// EYEMATCH PHYSICAL INVENTORY — V1   ·   FULFILLMENT REFERENCE ONLY
//
// ⛔ NOT PART OF THE APPLICATION. Nothing under src/ imports this file, and
//    nothing ever should. The scanner, the personalization pipeline, the 3-D
//    preview and order creation are all INVENTORY-INDEPENDENT: they measure
//    and record the iris's actual colours and never substitute a bead colour
//    for a measured one.
//
//    This file exists so a human assembling a bracelet (or a future
//    fulfillment tool) has a record of what stock the V1 catalog described.
//    Matching a design's measured colours to real beads happens at ASSEMBLY
//    time, against whatever stock actually exists then — not at scan time
//    against a snapshot. A verification check enforces the no-import rule.
//
// Six real bead families that EyeMatch physically owns, all nominally 6 mm
// round, polished. SKUs B001–B006 are EYEMATCH-CONTROLLED identifiers:
// they name a visual/material family, NOT a supplier product. The same SKU
// may later be sourced from a different supplier if the replacement bead is
// visually close enough — that is why supplierRef is intentionally null and
// why no geological/mineral names are claimed anywhere (current supplier
// information is not reliable enough to verify material identity).
//
// ⚠️ REPRESENTATIVE COLORS ARE APPROXIMATE V1 CALIBRATION VALUES.
// They were chosen by eye from the product descriptions to sit near the
// CENTER of each family's visual range — they are NOT laboratory-measured.
// Beads inside a family vary naturally (see `variation`); fulfillment picks
// visually appropriate individual beads from the requested family. After a
// controlled physical color calibration, update `hex` in place — SKU
// identity must never change when colors are recalibrated.
//
// Stock quantities are deliberately NOT modelled here. This catalog defines
// WHICH families exist; counting what's in the box belongs to a future
// order/operations layer.
// ============================================================================

export const INVENTORY_STATUS = 'PHYSICAL_V1_APPROXIMATE_COLORS';

// Bead record contract (what the rest of the app relies on):
//   sku          string       — EyeMatch-controlled stable identifier (B001…)
//   name         string       — human-readable family name (no mineral claims)
//   family       string       — short family slug
//   hex          string       — representative colour '#rrggbb' (match target;
//                               approximate — see calibration note above)
//   variation    'low'|'medium'|'high' — natural spread within the family
//   appearance   string       — textual description for humans/fulfillment
//   usefulFor    string[]     — eye categories this family tends to serve
//   supplierRef  string|null  — unknown for V1; SKU identity is supplier-independent
//   diameterMm   number       — nominal bead diameter
//   active       boolean      — only active beads may ever be matched/sold
export const BEAD_INVENTORY = [
  {
    sku: 'B001',
    name: 'Grey Taupe',
    family: 'grey-taupe',
    hex: '#8b8378', // approx: centre between light beige-grey and dark charcoal-grey
    variation: 'high',
    appearance: 'Grey / taupe, polished; substantial natural variation — individual beads range from light beige-grey to dark charcoal-grey.',
    usefulFor: ['grey', 'brown', 'hazel'],
    supplierRef: null,
    diameterMm: 6,
    active: true,
  },
  {
    sku: 'B002',
    name: 'Light Green',
    family: 'light-green',
    hex: '#8aae85', // approx: centre of light-to-medium translucent green
    variation: 'medium',
    appearance: 'Light to medium green, somewhat translucent, natural inclusions / variation, polished.',
    usefulFor: ['green', 'hazel'],
    supplierRef: null,
    diameterMm: 6,
    active: true,
  },
  {
    sku: 'B003',
    name: 'Blue Grey',
    family: 'blue-grey',
    hex: '#8fa9bc', // approx: centre of light-blue → blue-grey range
    variation: 'medium',
    appearance: 'Light blue to blue-grey, somewhat translucent, some darker natural inclusions, polished.',
    usefulFor: ['blue', 'grey'],
    supplierRef: null,
    diameterMm: 6,
    active: true,
  },
  {
    sku: 'B004',
    name: 'Muted Green',
    family: 'muted-green',
    hex: '#6b7d66', // approx: darker grey-green centre
    variation: 'medium',
    appearance: 'Darker / muted green with grey-green tones, natural variation, polished.',
    usefulFor: ['green', 'hazel', 'grey'],
    supplierRef: null,
    diameterMm: 6,
    active: true,
  },
  {
    sku: 'B005',
    name: 'Champagne',
    family: 'champagne',
    hex: '#d5c39c', // approx: cream / champagne / warm pale yellow centre
    variation: 'medium', // described as low-to-medium; recorded as medium (enum)
    appearance: 'Cream / champagne / warm pale yellow, translucent to semi-translucent, polished. Variation: low-to-medium.',
    usefulFor: ['hazel', 'brown'], // + amber/golden iris highlights
    supplierRef: null,
    diameterMm: 6,
    active: true,
  },
  {
    sku: 'B006',
    name: 'Taupe Brown Veined',
    family: 'taupe-brown-veined',
    hex: '#9d8468', // approx: beige/taupe base tone (veining not representable in one hex)
    variation: 'high',
    appearance: 'Beige / taupe base with visible brown veining and patterning; substantial natural visual variation, polished.',
    usefulFor: ['brown', 'hazel', 'grey'],
    supplierRef: null,
    diameterMm: 6,
    active: true,
  },
];

// The only list matching is allowed to see. Returns a fresh array each call so
// callers can't mutate the catalog by accident.
export function activeBeads(inventory = BEAD_INVENTORY) {
  return inventory.filter((b) => b.active);
}
