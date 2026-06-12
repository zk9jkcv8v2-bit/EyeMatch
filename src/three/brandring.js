import * as THREE from 'three';
import { petalEdge, config } from '../config.js';

// The EyeMatch icon as a physical object: a champagne-metal band undulating
// around the iris, its inner edge tracing the same 8-petal star as the iris
// silhouette — the brand mark made dimensional, like the reference render.
class WavyCurve extends THREE.Curve {
  constructor(irisHalfSize, tube) {
    super();
    this.irisHalfSize = irisHalfSize;
    this.tube = tube;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    // Sit the band just outside the iris edge so the petals nest into it.
    const r = this.irisHalfSize * petalEdge(a) + this.tube * 0.72;
    const z = 0.04 * Math.sin(a * config.petals + 1.1);
    return target.set(Math.cos(a) * r, Math.sin(a) * r, z);
  }
}

export class BrandRing {
  constructor({ irisSize = 2.3, tube = 0.13 } = {}) {
    const curve = new WavyCurve(irisSize / 2, tube);
    this.material = new THREE.MeshPhysicalMaterial({
      color: 0x9d9486,
      metalness: 1,
      roughness: 0.45,
      envMapIntensity: 0.65,
      transparent: true,
      opacity: 0,
    });
    this.mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 480, tube, 28, true),
      this.material
    );
    this.mesh.position.z = -0.02;
  }
}
