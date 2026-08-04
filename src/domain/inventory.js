// ============================================================================
// PHYSICAL BEAD INVENTORY
//
// ⚠️⚠️⚠️  DEVELOPMENT PLACEHOLDER — NOT REAL SUPPLIER DATA  ⚠️⚠️⚠️
//
// EyeMatch has NOT yet selected its real physical beads. Every entry below is
// a stand-in derived from the site's existing on-screen colour palettes so the
// matching / recipe architecture can be built and tested end-to-end.
//
//   - SKUs are prefixed "EM-DEV-" and MUST NOT appear on a real order.
//   - `supplierRef` is null everywhere because no supplier exists yet.
//   - `diameterMm: 8` is a TEMPORARY assumption (a common bracelet bead size),
//     not a confirmed spec.
//
// TO GO LIVE: replace BEAD_INVENTORY with the confirmed catalog (real SKUs,
// supplier refs, measured hex from product photography, confirmed diameters)
// and set INVENTORY_STATUS to 'PRODUCTION'. Nothing else in the app should
// need to change — matching and recipes only read this list.
// ============================================================================

export const INVENTORY_STATUS = 'DEVELOPMENT_PLACEHOLDER';

// Shape of a bead record (the contract the rest of the app relies on):
//   sku          string  — unique stable identifier, used in recipes/orders
//   name         string  — human-readable display name
//   hex          string  — representative colour '#rrggbb' (match target)
//   material     string  — stone/material name
//   supplierRef  string|null — supplier's own item code, when known
//   diameterMm   number  — bead diameter in millimetres
//   active       boolean — only active beads may ever be matched/sold
export const BEAD_INVENTORY = [
  // --- blue family (placeholder hexes from the landing's blue palette) ---
  { sku: 'EM-DEV-BLU-01', name: 'Sky Aquamarine (DEV)', hex: '#a6c4d6', material: 'Aquamarine', supplierRef: null, diameterMm: 8, active: true },
  { sku: 'EM-DEV-BLU-02', name: 'Aquamarine (DEV)', hex: '#7ba3c0', material: 'Aquamarine', supplierRef: null, diameterMm: 8, active: true },
  { sku: 'EM-DEV-BLU-03', name: 'Sodalite (DEV)', hex: '#4f7896', material: 'Sodalite', supplierRef: null, diameterMm: 8, active: true },
  { sku: 'EM-DEV-BLU-04', name: 'Blue Chalcedony (DEV)', hex: '#5f87a6', material: 'Chalcedony', supplierRef: null, diameterMm: 8, active: true },

  // --- green family ---
  { sku: 'EM-DEV-GRN-01', name: 'Pale Jade (DEV)', hex: '#9fbf9a', material: 'Jade', supplierRef: null, diameterMm: 8, active: true },
  { sku: 'EM-DEV-GRN-02', name: 'Jade (DEV)', hex: '#74a075', material: 'Jade', supplierRef: null, diameterMm: 8, active: true },
  { sku: 'EM-DEV-GRN-03', name: 'Aventurine (DEV)', hex: '#4f7857', material: 'Aventurine', supplierRef: null, diameterMm: 8, active: true },

  // --- hazel / golden family ---
  { sku: 'EM-DEV-HAZ-01', name: 'Amber (DEV)', hex: '#c2a878', material: 'Amber', supplierRef: null, diameterMm: 8, active: true },
  { sku: 'EM-DEV-HAZ-02', name: 'Golden Tiger Eye (DEV)', hex: '#a08049', material: 'Tiger Eye', supplierRef: null, diameterMm: 8, active: true },
  { sku: 'EM-DEV-HAZ-03', name: 'Bronzite (DEV)', hex: '#7a6038', material: 'Bronzite', supplierRef: null, diameterMm: 8, active: true },

  // --- brown family ---
  { sku: 'EM-DEV-BRN-01', name: 'Citrine (DEV)', hex: '#b08a5a', material: 'Citrine', supplierRef: null, diameterMm: 8, active: true },
  { sku: 'EM-DEV-BRN-02', name: 'Tiger Eye (DEV)', hex: '#8a6638', material: 'Tiger Eye', supplierRef: null, diameterMm: 8, active: true },
  { sku: 'EM-DEV-BRN-03', name: 'Smoky Quartz (DEV)', hex: '#664a2b', material: 'Smoky Quartz', supplierRef: null, diameterMm: 8, active: true },

  // --- grey family ---
  { sku: 'EM-DEV-GRY-01', name: 'Moonstone (DEV)', hex: '#b9bdc2', material: 'Moonstone', supplierRef: null, diameterMm: 8, active: true },
  { sku: 'EM-DEV-GRY-02', name: 'Labradorite (DEV)', hex: '#949ca3', material: 'Labradorite', supplierRef: null, diameterMm: 8, active: true },
  { sku: 'EM-DEV-GRY-03', name: 'Storm Agate (DEV)', hex: '#6f767e', material: 'Agate', supplierRef: null, diameterMm: 8, active: true },

  // --- inactive example: proves the matcher can never select retired stock.
  //     Deliberately given a colour nothing else has, so tests can target it.
  { sku: 'EM-DEV-RETIRED-01', name: 'Retired Example (DEV, INACTIVE)', hex: '#ff00ff', material: 'None', supplierRef: null, diameterMm: 8, active: false },
];

// The only list matching is allowed to see. Returns a fresh array each call so
// callers can't mutate the catalog by accident.
export function activeBeads(inventory = BEAD_INVENTORY) {
  return inventory.filter((b) => b.active);
}
