// Central knobs for the experience. Drop Higgsfield-generated assets into
// /public/media and point these at them to swap procedural elements for video.
export const config = {
  // e.g. '/media/hero-loop.mp4' (asset A1 from the Higgsfield prompt library).
  // When set, it plays full-bleed behind the landing scene.
  heroVideo: null,

  // Default bead palette for the landing bracelet tease — aquamarine /
  // apatite / sodalite blues, matching the reference product photo.
  brandBeads: ['#a9c6d6', '#7fa9c4', '#3e7396', '#2b4a73', '#27355e'],

  // Landing iris colors (blue iris, warm amber corona near the pupil).
  brandIris: { core: '#8a6b38', mid: '#5d7791', edge: '#27384c' },

  beadCount: 24,
  // The brand icon's inner opening is an 8-petal soft star — the iris
  // silhouette and the 3D metal ring both derive from this.
  petals: 8,
};

// Shared silhouette math (GLSL mirrors this): normalized radius of the
// scalloped edge at angle `a`, in 0..1 disc space.
export function petalEdge(a, petals = config.petals) {
  const wave = Math.pow(0.5 + 0.5 * Math.cos(a * petals), 1.35);
  return 0.86 + 0.115 * wave;
}
