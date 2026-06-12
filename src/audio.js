// Procedural WebAudio soundscape — no files. Muted until the user opts in.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.ambientNodes = [];
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
  }

  toggle() {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.enabled = !this.enabled;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.enabled ? 0.8 : 0, now, 0.4);
    if (this.enabled && !this.ambientNodes.length) this.startAmbient();
    return this.enabled;
  }

  // Low, warm drone — two detuned triangles + breathing lowpass.
  startAmbient() {
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0.05;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 190;
    filter.Q.value = 0.7;

    [55, 110.4, 164.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = i * 4 - 4;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 1 : 0.35 / i;
      osc.connect(g).connect(filter);
      osc.start();
      this.ambientNodes.push(osc);
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.ambientNodes.push(lfo);

    filter.connect(bus).connect(this.master);
  }

  // Soft tactile click — stone on glass.
  click() {
    if (!this.enabled) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1900, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Rising filtered-noise sweep for the scan.
  scan(duration = 1.8) {
    if (!this.enabled) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 9;
    bp.frequency.setValueAtTime(280, now);
    bp.frequency.exponentialRampToValueAtTime(2300, now + duration);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.09, now + duration * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(bp).connect(g).connect(this.master);
    src.start(now);
  }

  // Warm resonant chime with long decay — the reveal.
  chime() {
    if (!this.enabled) return;
    const ctx = this.ctx, now = ctx.currentTime;
    [523.25, 784, 1046.5, 1568].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.002);
      const g = ctx.createGain();
      const peak = 0.16 / (i + 1);
      g.gain.setValueAtTime(0.0001, now + i * 0.02);
      g.gain.exponentialRampToValueAtTime(peak, now + i * 0.02 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
      osc.connect(g).connect(this.master);
      osc.start(now + i * 0.02);
      osc.stop(now + 3.6);
    });
  }

  // Understated low whoosh for act transitions.
  whoosh() {
    if (!this.enabled) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.9);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(120, now + 0.85);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.11, now + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    src.connect(lp).connect(g).connect(this.master);
    src.start(now);
  }
}
