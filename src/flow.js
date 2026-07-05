// The flow that begins at BEGIN: photo capture → bracelet reveal → reserve.
//
// This is layered over the SAME persistent 3D world built in home.js — the
// bracelet you watched float in the hero is the one that becomes yours. We
// reuse the live `iris` and `bracelet` objects (passed in via ctx) and the
// framework-agnostic color engine in scan.js, so the reveal happens in-world
// with no page reload and no broken continuity.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { config, petalEdge } from './config.js';
import { Scanner, extractIrisColor, buildMatch, hexToHsl } from './scan.js';

const $ = (id) => document.getElementById(id);
const show = (el) => { el.hidden = false; };
const hide = (el) => { el.hidden = true; };

export function createFlow(ctx) {
  const { iris, bracelet, sceneState, reduced } = ctx;

  const flow = $('flow');
  const camVideo = $('camVideo');
  const flash = $('flash');

  const stages = {
    captureIntro: $('captureIntro'),
    captureLive: $('captureLive'),
    reveal: $('revealStage'),
    configure: $('reserveStage'),
    collection: $('collectionStage'),
  };

  // The set is built live: each reveal pushes a bracelet; `current` is the one
  // being revealed / configured (always the last member, edited by reference).
  const state = { entered: false, captured: false, set: [], current: null };
  let holdTween = null;

  const PATTERNS = ['dusk', 'cadence', 'wild'];
  const BUNDLE_DISCOUNT = 0.10; // a quiet 10% off when more than one is matched

  // Exclusive backdrop modes (capturing | purchasing | collection); live/reading
  // are additive on top of capturing.
  function setMode(mode) {
    flow.classList.remove('capturing', 'purchasing', 'collection');
    if (mode) flow.classList.add(mode);
  }

  /* ---------- brand petal focus guide ---------- */
  function petalPath(radius = 100) {
    const pts = [];
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      const r = radius * petalEdge(a);
      pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
    }
    return `M${pts.join('L')}Z`;
  }
  (function buildPetals() {
    const d = petalPath(100);
    $('focusPetalBg').innerHTML = `<path d="${d}"/>`;
    $('focusPetalDraw').innerHTML = `<path d="${d}" pathLength="1"/>`;
    $('introPetal').innerHTML = `<path d="${d}"/>`;
  })();
  const drawPath = $('focusPetalDraw').querySelector('path');
  const resetDrawPetal = () => gsap.set(drawPath, { strokeDasharray: 1, strokeDashoffset: 1 });
  resetDrawPetal();

  /* ---------- transitions ---------- */
  function coverWipe() {
    return gsap.fromTo('#wipe',
      { clipPath: 'circle(0% at 50% 50%)' },
      { clipPath: 'circle(150% at 50% 50%)', duration: reduced ? 0.01 : 0.6, ease: 'power3.in' });
  }
  function uncoverWipe() {
    return gsap.fromTo('#wipe',
      { clipPath: 'circle(150% at 50% 50%)' },
      { clipPath: 'circle(0% at 50% 50%)', duration: reduced ? 0.01 : 0.85, ease: 'power3.out' });
  }

  function scramble(el, finalText, duration = 800) {
    const chars = '·∙—–+~*';
    const start = performance.now();
    (function frame() {
      const p = Math.min((performance.now() - start) / duration, 1);
      const reveal = Math.floor(p * finalText.length);
      let out = '';
      for (let i = 0; i < finalText.length; i++) {
        out += i < reveal || finalText[i] === ' ' ? finalText[i]
          : chars[(Math.random() * chars.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(frame);
    })();
  }

  /* ============ ENTER — leave the scroll story, open capture ============ */
  function enter() {
    if (state.entered) return;
    state.entered = true;

    // Freeze the scroll story so it stops driving the shared iris/bracelet.
    ScrollTrigger.getAll().forEach((t) => t.kill());
    ctx.master?.kill();
    ctx.lenis?.stop();

    coverWipe().then(() => {
      document.body.style.overflow = 'hidden';
      window.scrollTo(0, 0);
      const scroll = $('scroll');
      if (scroll) scroll.style.display = 'none';

      flow.classList.add('active');
      flow.setAttribute('aria-hidden', 'false');
      enterCapture();
      uncoverWipe();
      gsap.from('#captureIntro .flow-copy > *', {
        opacity: 0, y: 20, duration: 1.0, ease: 'power3.out', stagger: 0.12, delay: 0.2,
      });
    });
  }

  /* ============ STEP 1 — capture ============ */
  const scanner = new Scanner({
    video: camVideo,
    placeholder: { textContent: '', style: {} }, // unused in this design
    captureCanvas: $('captureCanvas'),
  });

  function enterCapture() {
    state.captured = false;
    resetDrawPetal();
    setMode('capturing');
    flow.classList.remove('live', 'reading');
    camVideo.classList.remove('live');
    show(stages.captureIntro);
    hide(stages.captureLive);
    hide(stages.reveal);
    hide(stages.configure);
    hide(stages.collection);
    $('captureSub').textContent = state.set.length > 0
      ? 'Another eye, another stone — take a photo or upload one.'
      : 'Take a photo of your eye — or upload one you already have.';
  }

  $('useCameraBtn').addEventListener('click', () => {
    $('captureSub').textContent = 'Starting your camera…';
    scanner.start().then(() => {
      if (!flow.classList.contains('capturing') || state.captured) return;
      if (scanner.ready) goLive();
      else cameraUnavailable();
    });
    // If permission is never answered, gently nudge toward upload.
    gsap.delayedCall(8, () => {
      if (flow.classList.contains('capturing') && !state.captured && !scanner.ready) cameraUnavailable();
    });
  });

  function goLive() {
    hide(stages.captureIntro);
    show(stages.captureLive);
    flow.classList.add('live');
    camVideo.classList.add('live');
    scramble($('captureStatus'), 'Center your eye, then capture.');
    // Effortless auto-assist: the petal draws itself; if they never press,
    // we capture for them. Pressing CAPTURE (or tapping) fires immediately.
    resetDrawPetal();
    holdTween = gsap.fromTo(drawPath,
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: 5.0, ease: 'none', delay: 1.2, onComplete: () => fireCapture() });
  }

  function cameraUnavailable() {
    $('captureSub').textContent =
      "We couldn't reach your camera — no problem, just upload a photo of your eye.";
  }

  function fireCapture() {
    if (state.captured || !scanner.ready) return;
    if (!scanner.captureFromVideo()) return;
    state.captured = true;
    holdTween?.kill();
    doReading();
  }

  $('captureBtn').addEventListener('click', () => fireCapture());
  camVideo.addEventListener('click', () => {
    if (flow.classList.contains('live')) fireCapture();
  });

  // Upload path — equally first-class, reachable from either screen.
  const openUpload = () => $('uploadInput').click();
  $('useUploadBtn').addEventListener('click', openUpload);
  $('switchUploadBtn').addEventListener('click', openUpload);

  $('uploadInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || state.captured) return;
    const img = new Image();
    img.onload = () => {
      scanner.captureFromImage(img);
      URL.revokeObjectURL(img.src);
      if (state.captured) return;
      state.captured = true;
      holdTween?.kill();
      hide(stages.captureIntro);
      hide(stages.captureLive);
      doReading();
    };
    img.src = URL.createObjectURL(file);
  });

  // The light-sweep that lifts your color out, then carries into the reveal.
  function doReading() {
    flow.classList.add('reading');
    if (!stages.captureLive.hidden) scramble($('captureStatus'), 'Reading your color…', 700);

    gsap.timeline()
      .set(flash, { opacity: 0, scale: 0.25, transformOrigin: '50% 50%' })
      .to(flash, { opacity: 1, scale: 1.15, duration: 0.5, ease: 'power2.in' })
      .add(() => {
        const hsl = extractIrisColor($('captureCanvas'));
        const match = buildMatch(hsl ?? { h: 210, s: 0.28, l: 0.45 });
        // A new bracelet joins the set; it becomes the one we reveal & configure.
        state.current = { match, pattern: 'dusk', size: 'M' };
        state.set.push(state.current);
      })
      .to(flash, { opacity: 0, duration: 0.55, ease: 'power2.out' }, '+=0.05')
      .add(() => { flow.classList.remove('reading'); reveal(); });
  }

  /* ============ STEP 2 — the reveal: iris reborn → their bracelet ============ */
  async function reveal() {
    const match = state.current.match;
    await coverWipe();

    setMode(null);
    flow.classList.remove('live');
    camVideo.classList.remove('live');
    scanner.stop();
    hide(stages.captureIntro);
    hide(stages.captureLive);
    hide(stages.configure);
    hide(stages.collection);
    show(stages.reveal);
    syncPattern(state.current.pattern); // selectors + the (default Dusk) arrangement

    gsap.killTweensOf([iris.uniforms.uAlpha, iris.uniforms.uDissolve, iris, ...bracelet.gems.map((g) => g.scale)]);

    // Stage the world: their iris colors, their stones, all hidden to start.
    iris.setColors(match.iris);
    iris.uniforms.uAlpha.value = 0;
    iris.uniforms.uDissolve.value = 0;
    iris.basePupil = 0.3;
    iris.mesh.scale.set(1, 1, 1);
    bracelet.pattern = state.current.pattern;
    bracelet.setColors(match.gems);
    bracelet.gems.forEach((g) => g.scale.setScalar(0.0001));
    bracelet.group.rotation.set(0, 0, 0);
    bracelet.group.position.set(0, 0, 0);
    bracelet.group.scale.setScalar(1);
    sceneState.spin = false;

    $('stoneName').innerHTML = '<em>&nbsp;</em>';
    gsap.set('#revealStage .flow-copy > *', { opacity: 0 });

    uncoverWipe();

    const tl = gsap.timeline({ delay: 0.3 });

    // 1 — their iris re-forms out of the dark
    tl.to(iris.uniforms.uAlpha, { value: 1, duration: 1.6, ease: 'power2.out' })
      .fromTo(iris.mesh.scale, { x: 0.9, y: 0.9 }, { x: 1, y: 1, duration: 1.8, ease: 'power3.out' }, '<')

      // 2 — pupil contracts, fibres stream outward and crystallize into stones
      .to(iris, { basePupil: 0.05, duration: 1.2, ease: 'power3.inOut' }, '+=0.5')
      .to(iris.uniforms.uDissolve, { value: 1.45, duration: 2.0, ease: 'power2.inOut' }, '<+=0.3')
      .to(bracelet.gems.map((g) => g.scale), {
        x: (i) => bracelet.gems[i].userData.baseScale,
        y: (i) => bracelet.gems[i].userData.baseScale,
        z: (i) => bracelet.gems[i].userData.baseScale,
        duration: 1.3, ease: 'back.out(1.8)', stagger: 0.05,
      }, '<+=0.5')

      // 3 — the ring of stones tips over into jewellery, settling high as a hero
      .to(bracelet.group.rotation, { x: -1.02, duration: 1.8, ease: 'power3.inOut' }, '<+=0.6')
      .to(bracelet.group.position, { y: 0.92, duration: 1.8, ease: 'power3.inOut' }, '<')
      .to(bracelet.group.scale, { x: 0.8, y: 0.8, z: 0.8, duration: 1.8, ease: 'power3.inOut' }, '<')
      .add(() => { sceneState.spin = true; }, '<+=0.9')

      // 4 — name their stone
      .to('#revealEyebrow', { opacity: 0.45, duration: 0.8 }, '<')
      .add(() => {
        $('stoneName').innerHTML = `<em>${match.stone}</em>`;
        gsap.fromTo('#stoneName', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out' });
      }, '<+=0.2')
      .to('#revealSub', { opacity: 0.6, duration: 0.9 }, '<+=0.5')
      .to('#revealPattern', { opacity: 1, duration: 0.9 }, '<+=0.2')
      .to('#revealStage .flow-actions', { opacity: 1, duration: 0.9 }, '<+=0.25');
  }

  // SCAN AGAIN discards this bracelet and re-scans (it never joins the set).
  $('againBtn').addEventListener('click', async () => {
    await coverWipe();
    if (state.set[state.set.length - 1] === state.current) state.set.pop();
    state.current = null;
    enterCapture();
    uncoverWipe();
  });

  /* ============ stone arrangement (the "mood" patterns) ============ */
  function syncPattern(id) {
    if (state.current) state.current.pattern = id;
    bracelet.setArrangement(id);
    document.querySelectorAll('#revealPattern .pattern')
      .forEach((b) => b.classList.toggle('active', b.dataset.pattern === id));
  }
  function onPatternClick(e) {
    const btn = e.target.closest('.pattern');
    if (!btn || !PATTERNS.includes(btn.dataset.pattern)) return;
    syncPattern(btn.dataset.pattern);
  }
  // Pattern is chosen on the reveal screen only — not repeated on purchase.
  $('revealPattern').addEventListener('click', onPatternClick);

  /* ============ STEP 2b — configure (purchase) ============ */
  function swatchGradient(c) {
    return `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.6), ${c} 42%, ${c} 70%, rgba(0,0,0,0.35) 100%)`;
  }
  const fmtPrice = (n) => `${config.checkout.currency}${n}`;

  // Reveal: always full-screen centered — the cinematic payoff moment.
  function poseReveal() {
    gsap.to(bracelet.group.position, { x: 0, y: 0.92, duration: 1.0, ease: 'power3.inOut' });
    gsap.to(bracelet.group.scale, { x: 0.8, y: 0.8, z: 0.8, duration: 1.0, ease: 'power3.inOut' });
  }

  // Configure: mobile = compact hero at top; desktop = left column of two-column layout.
  // The world group has a dynamic scale (stage resize: fit = min(vW,vH)/3.85, clamped to
  // [0.45,1]). On desktop ~0.73: x=-0.77 local → -0.56 scene → -25% screen = left-half
  // centre. y=-0.1 local → ~34% from top (just above vertical centre of left column).
  function poseConfigure() {
    const wide = window.innerWidth >= 900;
    gsap.to(bracelet.group.position, {
      x: wide ? -0.77 : 0,
      y: wide ? -0.1  : 0.72,
      duration: 1.0, ease: 'power3.inOut',
    });
    gsap.to(bracelet.group.scale, {
      x: wide ? 0.68 : 0.72,
      y: wide ? 0.68 : 0.72,
      z: wide ? 0.68 : 0.72,
      duration: 1.0, ease: 'power3.inOut',
    });
  }

  function enterConfigure() {
    const cur = state.current;
    if (!cur) return;
    setMode('purchasing');
    flow.classList.remove('live');
    hide(stages.reveal);
    hide(stages.collection);
    show(stages.configure);
    poseConfigure();

    $('reserveStoneName').textContent = cur.match.stone;
    document.querySelectorAll('#sizeOptions .opt')
      .forEach((o) => o.classList.toggle('active', o.dataset.size === cur.size));
    // Carry the chosen arrangement through so the matched bracelet renders right.
    bracelet.pattern = cur.pattern;
    bracelet.setArrangement(cur.pattern);

    $('priceVal').textContent = fmtPrice(config.checkout.price);
    // Once there's more than one bracelet, CHECKOUT first gathers the set.
    $('checkoutBtn').textContent = state.set.length > 1 ? 'REVIEW YOUR SET' : 'CHECKOUT';

    gsap.fromTo('#reserveStage .zone',
      { y: 18, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.08 });
  }

  $('reserveBtn').addEventListener('click', async () => {   // MAKE IT YOURS
    if (!state.current) return;
    await coverWipe();
    enterConfigure();
    uncoverWipe();
  });

  $('reserveBackBtn').addEventListener('click', async () => {
    await coverWipe();
    setMode(null);
    poseReveal();
    hide(stages.configure);
    show(stages.reveal);
    gsap.set('#revealStage .flow-copy > *', { opacity: 1 });
    syncPattern(state.current.pattern);
    uncoverWipe();
  });

  $('sizeOptions').addEventListener('click', (e) => {
    const btn = e.target.closest('.opt');
    if (!btn) return;
    document.querySelectorAll('#sizeOptions .opt').forEach((o) => o.classList.remove('active'));
    btn.classList.add('active');
    if (state.current) state.current.size = btn.dataset.size;
  });

  // Build a set — add another bracelet (the current one stays committed).
  $('addBraceletBtn').addEventListener('click', async () => {
    await coverWipe();
    enterCapture();
    uncoverWipe();
  });

  // CHECKOUT from configure: one bracelet → straight to purchase; a set →
  // review them together first.
  $('checkoutBtn').addEventListener('click', async () => {
    if (state.set.length > 1) {
      await coverWipe();
      enterCollection();
      uncoverWipe();
    } else {
      purchase();
    }
  });

  /* ============ STEP 3 — the collection: a set, not a cart ============ */
  function setCopy() {
    const n = state.set.length;
    if (n <= 1) {
      $('collectionEyebrow').textContent = 'YOUR PIECE';
      $('collectionTitle').innerHTML = 'Yours, and yours <em>alone</em>.';
      $('collectionSub').textContent = 'One eye, one stone — no other like it in the world.';
    } else if (n === 2) {
      $('collectionEyebrow').textContent = 'YOUR SET';
      $('collectionTitle').innerHTML = 'Worn apart, <em>matched always</em>.';
      $('collectionSub').textContent = 'Two eyes, two stones — one quiet thread between them.';
    } else {
      $('collectionEyebrow').textContent = 'YOUR SET';
      $('collectionTitle').innerHTML = 'Many eyes, <em>one circle</em>.';
      $('collectionSub').textContent = 'Each stone its own — together, a constellation that’s yours.';
    }
  }

  function renderCollection() {
    const list = $('collectionList');
    list.innerHTML = '';
    state.set.forEach((member) => {
      const row = document.createElement('div');
      row.className = 'set-member';

      const strand = document.createElement('div');
      strand.className = 'set-strand';
      member.match.gems.forEach((c) => {
        const s = document.createElement('span');
        s.style.background = swatchGradient(c);
        strand.appendChild(s);
      });

      const meta = document.createElement('div');
      meta.className = 'set-meta';
      const name = document.createElement('p');
      name.className = 'set-stone';
      name.innerHTML = `<em>${member.match.stone}</em><span class="set-pattern">${member.pattern}</span>`;

      const sizes = document.createElement('div');
      sizes.className = 'opt-row mini';
      ['S', 'M', 'L'].forEach((sz) => {
        const b = document.createElement('button');
        b.className = 'opt' + (member.size === sz ? ' active' : '');
        b.dataset.size = sz;
        b.textContent = sz;
        b.addEventListener('click', () => {
          member.size = sz;
          sizes.querySelectorAll('.opt').forEach((o) => o.classList.remove('active'));
          b.classList.add('active');
        });
        sizes.appendChild(b);
      });

      meta.appendChild(name);
      meta.appendChild(sizes);
      row.appendChild(strand);
      row.appendChild(meta);
      list.appendChild(row);
    });
  }

  function enterCollection() {
    setMode('collection');
    flow.classList.remove('live');
    hide(stages.reveal);
    hide(stages.configure);
    show(stages.collection);

    setCopy();
    renderCollection();

    // Bundle pricing: full total struck through, the quiet discount applied.
    const n = state.set.length;
    const full = config.checkout.price * n;
    const total = n > 1 ? Math.round(full * (1 - BUNDLE_DISCOUNT)) : full;
    $('setPriceWas').textContent = n > 1 ? fmtPrice(full) : '';
    $('setPrice').textContent = fmtPrice(total);
    $('setSave').textContent = n > 1
      ? `Set of ${n} · ${Math.round(BUNDLE_DISCOUNT * 100)}% off`
      : '';

    gsap.fromTo('#collectionStage .zone, #collectionStage .set-member',
      { y: 18, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.07 });
  }

  $('addAnotherBtn').addEventListener('click', async () => {
    await coverWipe();
    enterCapture();
    uncoverWipe();
  });

  $('collectionBackBtn').addEventListener('click', async () => {
    state.current = state.set[state.set.length - 1];
    await coverWipe();
    enterConfigure();
    uncoverWipe();
  });

  $('setCheckoutBtn').addEventListener('click', () => purchase());

  /* ============ direct purchase — hand off to Stripe checkout ============ */
  // No reservation, no waitlist: CHECKOUT opens the secure Stripe checkout for
  // the configured piece(s). Paste Stripe Payment Link URLs into
  // config.checkout.paymentLinks ({ S, M, L, and optional `set` }) to go live.
  function purchase() {
    const { paymentLinks } = config.checkout;
    const link = state.set.length === 1
      ? paymentLinks[state.set[0].size]
      : (paymentLinks.set || paymentLinks[state.set[0].size]);
    if (link) { window.location.href = link; return; }
    console.warn('[EyeMatch] No Stripe Payment Link configured — set config.checkout.paymentLinks to enable checkout.');
  }

  // Dev hook: build a set quickly without a camera.
  window.__flow = {
    simulate: (hex = '#7a5a32') => {
      if (!state.entered) enter();
      state.current = { match: buildMatch(hexToHsl(hex)), pattern: 'dusk', size: 'M' };
      state.set.push(state.current);
      reveal();
    },
    enter, reveal, state,
  };

  return { enter };
}
