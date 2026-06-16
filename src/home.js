import './home.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { config } from './config.js';
import { Stage } from './three/stage.js';
import { Iris } from './three/iris.js';
import { Bracelet } from './three/bracelet.js';

gsap.registerPlugin(ScrollTrigger);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

/* ============ 3D stage (fixed cinematic background) ============ */
const stage = new Stage($('webgl'), { reducedMotion: reduced });

const iris = new Iris({ petals: config.petals });
iris.basePupil = 0.3;
iris.setColors({ core: '#8a6b38', mid: '#5d7791', edge: '#27384c' });
iris.uniforms.uAlpha.value = 0;
stage.world.add(iris.mesh);

const bracelet = new Bracelet({ count: config.beadCount, shiftPalettes: config.shiftPalettes });
bracelet.startColorShift();
stage.world.add(bracelet.group);

const sceneState = { spin: true };

// Hero rest pose: a bracelet floating, gently turning.
function setHeroPose() {
  bracelet.gems.forEach((g) => g.scale.setScalar(g.userData.baseScale));
  bracelet.group.rotation.set(-0.95, 0, 0);
  bracelet.group.position.set(0, 0, 0);
  bracelet.group.scale.setScalar(0.92);
  iris.uniforms.uAlpha.value = 0;
  iris.uniforms.uDissolve.value = 0;
  iris.mesh.scale.set(1, 1, 1);
  iris.basePupil = 0.3;
}
setHeroPose();

stage.onTick.push((t, dt) => {
  iris.update(t);
  bracelet.update(t);
  if (sceneState.spin) bracelet.group.rotation.z += dt * 0.06;
  // Lift the composition slightly so centered copy reads below it.
  stage.world.position.y = 0.38 + Math.sin(t * 0.45) * 0.04;
});

/* ============ atmosphere: grain ============ */
(function grain() {
  const s = 180;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
})();

/* ============ custom cursor ============ */
(function cursor() {
  const el = $('cursor');
  if (window.matchMedia('(pointer: coarse)').matches) return;
  let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;
  addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; el.style.opacity = 0.9; });
  (function loop() {
    cx += (mx - cx) * 0.2; cy += (my - cy) * 0.2;
    el.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  })();
  const bind = () => document.querySelectorAll('.cta, .wordmark').forEach((n) => {
    n.addEventListener('mouseenter', () => el.classList.add('active'));
    n.addEventListener('mouseleave', () => el.classList.remove('active'));
  });
  bind();
})();

/* ============ gentle mouse parallax (calm) ============ */
addEventListener('mousemove', (e) => {
  const nx = (e.clientX / innerWidth - 0.5) * 2;
  const ny = (e.clientY / innerHeight - 0.5) * 2;
  stage.setParallax(nx * 0.5, ny * 0.5);
  iris.setMouse(nx, -ny);
});

/* ============ smooth scrolling (Lenis ↔ ScrollTrigger) ============ */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ============ the scroll-scrubbed transformation ============ */
// One master timeline maps the whole scroll to the eye→bracelet story.
const master = gsap.timeline({
  scrollTrigger: { trigger: '#scroll', start: 'top top', end: 'bottom bottom', scrub: 1 },
});

const beadScales = bracelet.gems.map((g) => g.scale);

master
  // [hold hero ~0–1.4]
  // hero bracelet → eye : beads dissolve, iris fades in and grows
  .to(beadScales, {
    x: 0.0001, y: 0.0001, z: 0.0001, duration: 1.4, ease: 'power2.in', stagger: { amount: 0.5, from: 'random' },
  }, 1.4)
  .to(iris.uniforms.uAlpha, { value: 1, duration: 1.4, ease: 'power2.out' }, 1.6)
  .fromTo(iris.mesh.scale, { x: 0.8, y: 0.8 }, { x: 1.05, y: 1.05, duration: 1.4, ease: 'power2.out' }, 1.6)

  // [discovery] zoom into the iris — kept centered, the eye fills the frame
  .to(iris.mesh.scale, { x: 1.32, y: 1.32, duration: 1.6, ease: 'power1.inOut' }, 3.2)

  // [transformation] eye → palette → bracelet: pupil contracts, fibres stream
  // outward and crystallize into beads as the iris fades away
  .to(iris, { basePupil: 0.04, duration: 1.6, ease: 'power2.inOut' }, 5.0)
  .to(iris.uniforms.uDissolve, { value: 1.45, duration: 2.0, ease: 'power2.inOut' }, 5.2)
  .to(beadScales, {
    x: (i) => bracelet.gems[i].userData.baseScale,
    y: (i) => bracelet.gems[i].userData.baseScale,
    z: (i) => bracelet.gems[i].userData.baseScale,
    duration: 1.8, ease: 'back.out(1.6)', stagger: { amount: 0.6 },
  }, 5.8)
  .to(iris.uniforms.uAlpha, { value: 0, duration: 1.2, ease: 'power2.in' }, 6.4)
  .to(iris.mesh.scale, { x: 0.8, y: 0.8, duration: 1.2, ease: 'power2.in' }, 6.4)

  // [transformation settle / handoff] the finished bracelet, centered, tipped
  .to(bracelet.group.rotation, { x: -1.0, duration: 1.6, ease: 'power2.inOut' }, 7.0)
  .to(bracelet.group.scale, { x: 0.9, y: 0.9, z: 0.9, duration: 1.6, ease: 'power2.inOut' }, 7.0);

/* ============ per-section copy reveals (calm fades) ============ */
gsap.utils.toArray('.panel .sticky').forEach((el) => {
  gsap.from(el.children, {
    opacity: 0, y: 28, duration: 1.1, ease: 'power2.out', stagger: 0.1,
    scrollTrigger: { trigger: el, start: 'top 62%', toggleActions: 'play none none reverse' },
  });
});

// Hero copy fades away as you scroll past it.
gsap.to('#hero .sticky', {
  opacity: 0, ease: 'none',
  scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
});

/* ============ discovery swatches (the extracted colors) ============ */
(function swatches() {
  const row = $('discSwatches');
  const palette = config.shiftPalettes[0]; // soft eye-blue family
  palette.forEach((c) => {
    const s = document.createElement('span');
    s.style.background = `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.6), ${c} 42%, ${c} 72%, rgba(0,0,0,0.4) 100%)`;
    row.appendChild(s);
  });
  gsap.to('#discSwatches span', {
    opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(2)', stagger: 0.1,
    scrollTrigger: { trigger: '#discovery', start: 'top 40%', toggleActions: 'play none none reverse' },
  });
})();

/* ============ transformation steps light up in sequence ============ */
(function steps() {
  const items = [...$('transformSteps').children];
  ScrollTrigger.create({
    trigger: '#transformation',
    start: 'top top', end: 'bottom bottom', scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      const active = p < 0.34 ? 0 : p < 0.68 ? 1 : 2;
      items.forEach((li, i) => li.classList.toggle('lit', i === active));
    },
  });
})();

/* ============ enter the experience ============ */
function enter() { window.location.href = '/experience.html'; }
$('beginBtn').addEventListener('click', enter);
$('beginBtn2').addEventListener('click', enter);

window.addEventListener('load', () => ScrollTrigger.refresh());

// Debug hook for headless verification (scroll is otherwise smooth-intercepted).
window.__home = {
  scrollToFraction(f) {
    const y = (document.documentElement.scrollHeight - innerHeight) * f;
    if (lenis) lenis.scrollTo(y, { immediate: true });
    else window.scrollTo(0, y);
    ScrollTrigger.update();
  },
  master, stage, iris, bracelet,
};
