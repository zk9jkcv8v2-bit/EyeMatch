import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class Stage {
  constructor(container, { reducedMotion = false } = {}) {
    this.container = container;
    this.reducedMotion = reducedMotion;
    this.clock = new THREE.Clock();
    this.parallaxTarget = new THREE.Vector2();
    this.parallax = new THREE.Vector2();
    this.onTick = [];

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x07070a, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x07070a, 5, 11);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50);
    this.camera.position.set(0, 0, 3.4);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // The whole composition lives in one group so parallax / float / fit
    // can be applied without touching the camera.
    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.scene.add(new THREE.AmbientLight(0x404048, 0.7));
    const key = new THREE.DirectionalLight(0xffe2b8, 1.6);
    key.position.set(-2.6, 3.2, 2.4);
    this.scene.add(key);

    // Single orbiting specular — the "one moving highlight" from the brief.
    this.sweep = new THREE.PointLight(0xfff4e0, 8, 9, 1.8);
    this.sweep.position.set(2.4, 1.4, 1.6);
    this.scene.add(this.sweep);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.6, 0.72
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    // Self-heal: always match the actual container size, even when a
    // resize event never fires (embedded previews, iframes, late layout).
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(container);
    }
    this.resize();

    this.renderer.setAnimationLoop(() => this.tick());
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    // Keep the centerpiece comfortably framed at any aspect ratio: size the
    // world so a ~3-unit composition fits the narrower view dimension.
    const viewH = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z;
    const viewW = viewH * this.camera.aspect;
    const fit = Math.min(viewW, viewH) / 3.85;
    this.world.scale.setScalar(Math.min(1, Math.max(0.45, fit)));
  }

  setParallax(nx, ny) {
    this.parallaxTarget.set(nx, ny);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    this.parallax.lerp(this.parallaxTarget, 0.06);
    this.world.rotation.y = this.parallax.x * 0.14;
    this.world.rotation.x = this.parallax.y * 0.1;
    // Composition sits slightly above center so the copy below has room.
    this.world.position.y = 0.22 + (this.reducedMotion ? 0 : Math.sin(t * 0.5) * 0.045);

    const sw = t * 0.45;
    this.sweep.position.set(Math.cos(sw) * 2.6, 1.1 + Math.sin(t * 0.3) * 0.7, Math.sin(sw) * 2.6 + 0.6);

    for (const fn of this.onTick) fn(t, dt);
    this.composer.render();
  }
}
