// Size architecture — physical production configuration, kept separate from
// rendering configuration.
//
// ⚠️ PLACEHOLDER STATUS: real S/M/L bracelet dimensions and bead counts have
// NOT been finalized. Every physical field below that is `null` is an open
// business decision (see README). Until those are confirmed, recipes fall
// back to the current 24-bead behaviour so the whole pipeline stays testable.
//
// The 3-D visualization does NOT need to render exactly the physical bead
// count — RENDER_BEAD_COUNT is a purely visual constant (it matches
// config.beadCount used by three/bracelet.js) and may stay fixed even after
// physical counts become size-dependent.

export const RENDER_BEAD_COUNT = 24; // visual only — what the Three.js scene shows

export const SIZES = {
  // wristRangeCm mirrors the customer-facing copy already shown in the size
  // hint ("S ≈ 14–15cm …"). It is descriptive copy, not a confirmed spec.
  S: { id: 'S', label: 'Small', wristRangeCm: '14–15', braceletCircumferenceMm: null, physicalBeadCount: null },
  M: { id: 'M', label: 'Medium', wristRangeCm: '15–17', braceletCircumferenceMm: null, physicalBeadCount: null },
  L: { id: 'L', label: 'Large', wristRangeCm: '17–19', braceletCircumferenceMm: null, physicalBeadCount: null },
};

// Physical bead count for a size. Once real dimensions exist this becomes
// round(braceletCircumferenceMm / beadDiameterMm) or a per-size confirmed
// count — for now every size falls back to the 24-bead placeholder.
export function physicalBeadCount(sizeId) {
  return SIZES[sizeId]?.physicalBeadCount ?? RENDER_BEAD_COUNT;
}
