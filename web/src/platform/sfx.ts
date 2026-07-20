// WebAudio-synthesized SFX — zero asset files. Every sound is built from
// oscillators and noise buffers with sharp attacks and exponential decays.
// AudioContext is lazily created on the first play() call (user gesture),
// and play() never throws: no audio support (tests/node) means silent no-op.
export type SfxName =
  | 'cardHover'
  | 'cardPlay'
  | 'slash'
  | 'pierce'
  | 'fire'
  | 'frost'
  | 'bolt'
  | 'dark'
  | 'holy'
  | 'hit'
  | 'block'
  | 'heal'
  | 'hurt'
  | 'ko'
  | 'tameSuccess'
  | 'tameFail'
  | 'victory'
  | 'defeat'
  | 'endTurn'
  | 'draw'
  | 'gold'
  | 'uiClick';

let muted = false;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

export function setMuted(value: boolean) {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const w = globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const len = Math.floor(c.sampleRate * 0.6);
  noiseBuffer = c.createBuffer(1, len, c.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

interface ToneOpts {
  type?: OscillatorType;
  /** Glide the pitch to this frequency over the duration. */
  to?: number;
  vol?: number;
  attack?: number;
  /** Start offset in seconds. */
  at?: number;
  /** Detune in cents. */
  detune?: number;
}

/** One oscillator with a sharp attack and exponential decay. */
function tone(freq: number, dur: number, opts: ToneOpts = {}) {
  const c = getCtx();
  if (!c || !master) return;
  const t0 = c.currentTime + (opts.at ?? 0);
  const osc = c.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + dur);
  if (opts.detune) osc.detune.value = opts.detune;
  const g = c.createGain();
  const vol = opts.vol ?? 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

interface NoiseOpts {
  vol?: number;
  filter?: BiquadFilterType;
  freq?: number;
  /** Glide the filter frequency to this value over the duration. */
  to?: number;
  q?: number;
  at?: number;
}

/** A filtered noise burst with exponential decay. */
function noise(dur: number, opts: NoiseOpts = {}) {
  const c = getCtx();
  if (!c || !master) return;
  const t0 = c.currentTime + (opts.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  const filter = c.createBiquadFilter();
  filter.type = opts.filter ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2000, t0);
  if (opts.to !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + dur);
  filter.Q.value = opts.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.4, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

function synth(name: SfxName) {
  switch (name) {
    case 'slash':
      noise(0.14, { filter: 'highpass', freq: 3200, vol: 0.5 });
      tone(700, 0.1, { type: 'triangle', to: 220, vol: 0.25 });
      break;
    case 'pierce':
      noise(0.09, { filter: 'highpass', freq: 5200, vol: 0.4 });
      tone(1200, 0.08, { type: 'triangle', to: 300, vol: 0.3 });
      break;
    case 'fire':
      tone(140, 0.35, { type: 'sawtooth', to: 60, vol: 0.4 });
      noise(0.3, { filter: 'lowpass', freq: 900, vol: 0.35 });
      noise(0.22, { filter: 'bandpass', freq: 3000, q: 0.6, vol: 0.15, at: 0.05 });
      break;
    case 'frost':
      tone(1900, 0.28, { to: 2600, vol: 0.2 });
      tone(2400, 0.24, { to: 3200, vol: 0.14, at: 0.05 });
      noise(0.2, { filter: 'highpass', freq: 6500, vol: 0.12 });
      break;
    case 'bolt':
      tone(880, 0.06, { type: 'square', to: 110, vol: 0.4 });
      noise(0.1, { filter: 'highpass', freq: 4000, vol: 0.3 });
      break;
    case 'dark':
      tone(88, 0.45, { type: 'sawtooth', vol: 0.35 });
      tone(92, 0.45, { type: 'sawtooth', vol: 0.3, detune: 18 });
      tone(44, 0.4, { vol: 0.3, at: 0.02 });
      break;
    case 'holy':
      tone(660, 0.4, { vol: 0.25 });
      tone(830, 0.4, { vol: 0.2, at: 0.03 });
      tone(1320, 0.35, { vol: 0.1, at: 0.06 });
      break;
    case 'hit':
    case 'hurt':
      tone(180, 0.16, { to: 55, vol: 0.5 });
      noise(0.1, { filter: 'lowpass', freq: 1200, vol: 0.3 });
      break;
    case 'block':
      tone(420, 0.05, { type: 'square', vol: 0.3 });
      noise(0.07, { filter: 'bandpass', freq: 2600, q: 6, vol: 0.35 });
      break;
    case 'heal':
      tone(520, 0.14, { vol: 0.2 });
      tone(660, 0.14, { vol: 0.2, at: 0.09 });
      tone(780, 0.2, { vol: 0.2, at: 0.18 });
      break;
    case 'ko':
      tone(320, 0.7, { type: 'triangle', to: 40, vol: 0.4 });
      noise(0.3, { filter: 'lowpass', freq: 700, vol: 0.2, at: 0.05 });
      break;
    case 'tameSuccess':
      tone(392, 0.16, { vol: 0.25 });
      tone(494, 0.16, { vol: 0.25, at: 0.12 });
      tone(587, 0.28, { vol: 0.25, at: 0.24 });
      break;
    case 'tameFail':
      tone(330, 0.18, { vol: 0.25 });
      tone(262, 0.3, { vol: 0.25, at: 0.16 });
      break;
    case 'victory':
      tone(523, 0.14, { type: 'triangle', vol: 0.3 });
      tone(659, 0.14, { type: 'triangle', vol: 0.3, at: 0.13 });
      tone(784, 0.14, { type: 'triangle', vol: 0.3, at: 0.26 });
      tone(1047, 0.4, { type: 'triangle', vol: 0.3, at: 0.39 });
      break;
    case 'defeat':
      tone(220, 0.5, { type: 'triangle', vol: 0.3 });
      tone(175, 0.5, { type: 'triangle', vol: 0.3, at: 0.45 });
      tone(110, 0.9, { type: 'triangle', vol: 0.3, at: 0.9 });
      break;
    case 'cardPlay':
      noise(0.12, { filter: 'bandpass', freq: 900, to: 3800, q: 1.5, vol: 0.3 });
      break;
    case 'endTurn':
      tone(300, 0.07, { type: 'square', vol: 0.15 });
      tone(200, 0.09, { type: 'square', vol: 0.15, at: 0.07 });
      break;
    case 'draw':
      noise(0.06, { filter: 'highpass', freq: 3800, vol: 0.15 });
      tone(900, 0.05, { type: 'triangle', vol: 0.1 });
      break;
    case 'gold':
      tone(1568, 0.1, { vol: 0.2 });
      tone(2093, 0.16, { vol: 0.2, at: 0.07 });
      break;
    case 'uiClick':
      tone(600, 0.04, { type: 'square', vol: 0.12 });
      break;
    case 'cardHover':
      tone(1100, 0.03, { type: 'sine', vol: 0.05 });
      break;
  }
}

export function play(name: SfxName) {
  if (muted) return;
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    synth(name);
  } catch {
    // Audio is a garnish; never let it take the meal down.
  }
}
