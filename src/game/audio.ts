// Temp audio, all synthesized: whistle, footstep crunch, sled grab/drop shout, ball release,
// impact, wall break, lights clunk. No sound for a landing ring. (No temp audio = void session.)

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  muted = false;

  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private out(pan: number, gain: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.master);
    return g;
  }

  private noise(dur: number, type: BiquadFilterType, freq: number, gain: number, pan = 0, q = 1, freqEnd?: number) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = this.out(pan, 0);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, pan = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.out(pan, 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  whistle() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    for (const [start, dur] of [[0, 0.22], [0.3, 0.55]]) {
      const t = ctx.currentTime + start;
      const o = ctx.createOscillator();
      o.frequency.value = 2300;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 38;
      const lg = ctx.createGain();
      lg.gain.value = 140;
      lfo.connect(lg).connect(o.frequency);
      const g = this.out(0, 0);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      o.start(t);
      lfo.start(t);
      o.stop(t + dur);
      lfo.stop(t + dur);
    }
  }

  crunch(pan = 0, gain = 0.12) {
    this.noise(0.07, "bandpass", 1400 + Math.random() * 600, gain, pan, 0.8);
  }

  release(pan = 0) {
    this.noise(0.1, "highpass", 2500, 0.18, pan, 0.7, 5000);
  }

  blower(pan = 0) {
    this.noise(0.45, "bandpass", 500, 0.22, pan, 0.6, 1800);
  }

  impact(pan = 0) {
    this.noise(0.14, "lowpass", 900, 0.5, pan, 0.8, 200);
    this.tone("sine", 160, 55, 0.16, 0.3, pan);
  }

  splat(pan = 0) {
    this.noise(0.1, "lowpass", 1600, 0.3, pan, 1, 400);
  }

  missPlop(pan = 0) {
    this.noise(0.06, "lowpass", 700, 0.08, pan);
  }

  grab(pan = 0) {
    // a little "hup!" shout
    this.tone("sawtooth", 320, 620, 0.14, 0.09, pan);
    this.tone("triangle", 640, 900, 0.1, 0.06, pan, 0.03);
  }

  drop(pan = 0) {
    this.tone("sawtooth", 560, 220, 0.22, 0.09, pan);
  }

  handoff(pan = 0) {
    this.tone("triangle", 500, 760, 0.12, 0.1, pan);
    this.tone("triangle", 760, 1000, 0.1, 0.08, pan, 0.08);
  }

  plant(pan = 0) {
    this.noise(0.25, "lowpass", 500, 0.25, pan, 0.7, 150);
  }

  wallBreak(pan = 0) {
    this.noise(0.4, "lowpass", 1200, 0.45, pan, 0.6, 120);
  }

  pellet(pan = 0) {
    this.noise(0.05, "highpass", 3500, 0.08, pan, 0.7);
  }

  /** One soft tock per crown-second: you hear the points arrive. Ours higher, theirs lower. */
  tock(team: number) {
    this.tone("sine", team === 0 ? 880 : 520, team === 0 ? 860 : 500, 0.07, 0.07);
  }

  /** Last 10 seconds: a clock tick that climbs as the lights get close. */
  tick(left: number) {
    this.tone("square", 1200 + (10 - left) * 60, 1200 + (10 - left) * 60, 0.04, 0.05);
  }

  thaw(pan = 0) {
    this.tone("triangle", 660, 990, 0.12, 0.08, pan);
    this.tone("triangle", 990, 1320, 0.14, 0.07, pan, 0.08);
  }

  melt(pan = 0) {
    this.noise(0.5, "highpass", 4000, 0.12, pan, 0.5, 1500);
  }

  coin() {
    this.tone("square", 990, 990, 0.06, 0.05);
    this.tone("square", 1320, 1320, 0.12, 0.05, 0, 0.06);
  }

  // ---------------------------------------------------------------- Frosty's bout

  /** Frosty wakes up: a low, friendly-ominous groan. */
  frostyWake() {
    this.tone("sawtooth", 90, 140, 0.5, 0.12);
    this.tone("sine", 70, 60, 0.9, 0.16, 0, 0.1);
    this.noise(0.8, "lowpass", 400, 0.2, 0, 0.7, 150);
  }

  /** The mitten sweep: mounds sink and rise. */
  sweep() {
    this.noise(0.5, "bandpass", 300, 0.35, 0, 0.6, 1400);
  }

  /** The warning swirl: bigger and louder each half second (step 0..4). */
  swirl(step: number) {
    this.noise(0.5, "bandpass", 900 + step * 500, 0.1 + step * 0.07, 0, 2, 2400 + step * 700);
    this.tone("triangle", 500 + step * 160, 560 + step * 160, 0.16, 0.04 + step * 0.02);
  }

  burst() {
    this.noise(0.7, "highpass", 1800, 0.5, 0, 0.6, 600);
    this.noise(0.4, "lowpass", 600, 0.4, 0, 0.8, 120);
  }

  frostyHit(pan = 0) {
    this.noise(0.18, "lowpass", 700, 0.55, pan, 0.8, 150);
    this.tone("sine", 110, 60, 0.22, 0.3, pan);
  }

  dizzy() {
    for (let i = 0; i < 4; i++) this.tone("sine", 900 - i * 120, 1100 - i * 120, 0.12, 0.05, 0, i * 0.11);
  }

  boutWin() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone("square", f, f, 0.14, 0.06, 0, i * 0.12));
  }

  boutLose() {
    [392, 330, 262].forEach((f, i) => this.tone("triangle", f, f * 0.97, 0.22, 0.08, 0, i * 0.18));
  }

  lights() {
    this.tone("square", 70, 50, 0.09, 0.25);
    this.noise(0.03, "highpass", 3000, 0.3);
    this.tone("sine", 120, 120, 0.9, 0.06, 0, 0.05);
  }
}
