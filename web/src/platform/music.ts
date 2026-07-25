// WebAudio-synthesized background music — zero asset files, same philosophy as
// platform/sfx.ts. Three looping contexts (town/menus, expedition, battle) are
// generated live from oscillators, filtered noise and a look-ahead step
// scheduler, then crossfaded into one another when the screen changes.
//
// House rules this module lives by:
//   * the AudioContext is created on the first real user gesture, never before
//     (browser autoplay policy), and is resumed defensively after that;
//   * music mute/volume is INDEPENDENT of the SFX mute in platform/sfx.ts —
//     neither module touches the other's state;
//   * nothing here may ever throw. Audio is a garnish, never let it take the
//     meal down.

export type MusicContextName = 'town' | 'expedition' | 'battle' | 'silent';

/** Seconds of overlap when one context hands off to the next. */
const CROSSFADE = 1.3;
/** How far ahead of the clock the scheduler writes notes (survives tab throttling). */
const LOOKAHEAD_S = 1.2;
/** Scheduler tick. Background tabs clamp timers to ~1s, hence the fat lookahead. */
const TICK_MS = 120;
const STORAGE_KEY = 'everdusk.music';

// --- Tuning: one dark A-minor palette for the whole soundtrack --------------
const N = {
  A1: 55,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  G2: 98,
  A2: 110,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196,
  A3: 220,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  Gs4: 415.3,
  G4: 392,
  A4: 440,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
} as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

let muted = false;
let volume = 0.6;
let desired: MusicContextName = 'silent';
let gestured = false;
let hooked = false;
let timer: ReturnType<typeof setInterval> | null = null;

interface TrackSpec {
  /** Mix-bus gain once fully faded in. */
  target: number;
  /** Seconds per scheduler step. */
  stepDur: number;
  /** Long-lived nodes (drones, wind beds) that must be stopped on teardown. */
  sources: Array<OscillatorNode | AudioBufferSourceNode>;
  /** Schedules every event for one step, at the exact context time `t`. */
  play: (t: number, step: number) => void;
}

interface Track extends TrackSpec {
  name: MusicContextName;
  out: GainNode;
  step: number;
  nextTime: number;
  dying: boolean;
  /** Context time at which a fading track may be torn down. */
  endAt: number;
}

let tracks: Track[] = [];

// --- Persisted preference (best-effort; defaults are perfectly fine) --------
try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (raw) {
    const saved = JSON.parse(raw) as { muted?: boolean; volume?: number };
    if (typeof saved.muted === 'boolean') muted = saved.muted;
    if (typeof saved.volume === 'number' && isFinite(saved.volume)) {
      volume = Math.min(1, Math.max(0, saved.volume));
    }
  }
} catch {
  // No storage (tests/node/private mode) → defaults.
}

function save() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted, volume }));
  } catch {
    // Preference persistence is optional.
  }
}

// --- Graph plumbing ---------------------------------------------------------

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
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 2);
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

interface NoteOpts {
  type?: OscillatorType;
  vol?: number;
  attack?: number;
  /** Glide to this pitch across the note. */
  to?: number;
  detune?: number;
  /** Lowpass cutoff in Hz; omitted means no filter. */
  filter?: number;
  q?: number;
}

/** One voiced note: oscillator, optional lowpass, attack/decay envelope. */
function note(c: AudioContext, dest: AudioNode, t: number, freq: number, dur: number, o: NoteOpts = {}) {
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain();
  const vol = o.vol ?? 0.06;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.014));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let tail: AudioNode = osc;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.filter;
    f.Q.value = o.q ?? 0.7;
    osc.connect(f);
    tail = f;
  }
  tail.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

interface HitOpts {
  vol?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
}

/** A filtered noise burst — hats, sweeps, breath. */
function hit(c: AudioContext, dest: AudioNode, t: number, dur: number, o: HitOpts = {}) {
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  const f = c.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 3000, t);
  if (o.to !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.05, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  // Random read offset keeps repeated hits from sounding identical; the 2s
  // buffer leaves at least a second of material past any offset we pick.
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

interface DroneOpts {
  type?: OscillatorType;
  vol?: number;
  filter?: number;
  q?: number;
  detune?: number;
  /** Slow filter wobble so the pad never sits still. */
  lfoRate?: number;
  lfoDepth?: number;
}

/** A sustained pad voice. Returns its persistent sources for teardown. */
function drone(c: AudioContext, dest: AudioNode, freq: number, o: DroneOpts = {}): OscillatorNode[] {
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sawtooth';
  osc.frequency.value = freq;
  if (o.detune) osc.detune.value = o.detune;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = o.filter ?? 500;
  f.Q.value = o.q ?? 0.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.04, t + 2.2);
  osc.connect(f).connect(g).connect(dest);
  osc.start(t);
  const made: OscillatorNode[] = [osc];
  if (o.lfoRate) {
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = o.lfoRate;
    const amt = c.createGain();
    amt.gain.value = o.lfoDepth ?? 120;
    lfo.connect(amt).connect(f.frequency);
    lfo.start(t);
    made.push(lfo);
  }
  return made;
}

interface BedOpts {
  freq?: number;
  q?: number;
  vol?: number;
  filter?: BiquadFilterType;
  lfoRate?: number;
  lfoDepth?: number;
}

/** Looping noise bed — wind through the gate, air in the tavern. */
function bed(c: AudioContext, dest: AudioNode, o: BedOpts = {}): Array<OscillatorNode | AudioBufferSourceNode> {
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.value = o.freq ?? 500;
  f.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol ?? 0.03, t + 3);
  src.connect(f).connect(g).connect(dest);
  src.start(t);
  const made: Array<OscillatorNode | AudioBufferSourceNode> = [src];
  if (o.lfoRate) {
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = o.lfoRate;
    const amt = c.createGain();
    amt.gain.value = o.lfoDepth ?? 200;
    lfo.connect(amt).connect(f.frequency);
    lfo.start(t);
    made.push(lfo);
  }
  return made;
}

// --- The three scores -------------------------------------------------------

/** Town & menus: warm, melancholy, sparse. A lute in an empty hall. */
function buildTown(c: AudioContext, out: GainNode): TrackSpec {
  const sources: Array<OscillatorNode | AudioBufferSourceNode> = [
    ...drone(c, out, N.A2, { type: 'triangle', vol: 0.05, filter: 620, lfoRate: 0.05, lfoDepth: 180 }),
    ...drone(c, out, N.E3, { type: 'sine', vol: 0.035, filter: 700, detune: -6, lfoRate: 0.037, lfoDepth: 120 }),
    ...bed(c, out, { freq: 300, q: 0.5, vol: 0.012, filter: 'lowpass', lfoRate: 0.03, lfoDepth: 90 }),
  ];

  // Four bars of eighth notes, A-minor pentatonic, mostly rests.
  const phrase: Array<Array<number | null>> = [
    [N.E4, null, null, N.C4, null, N.D4, null, null],
    [N.A3, null, N.C4, null, null, N.B3, null, null],
    [N.D4, null, null, N.E4, null, null, N.G4, null],
    [N.C4, null, N.B3, null, N.A3, null, null, null],
  ];

  return {
    target: 0.85,
    stepDur: 60 / 62 / 2, // eighth notes at 62bpm
    sources,
    play: (t, step) => {
      const bar = Math.floor(step / 8);
      const s = step % 8;
      const n = phrase[bar % phrase.length][s];
      if (n !== null && Math.random() > 0.16) {
        note(c, out, t, n, 1.7, { type: 'triangle', vol: 0.055, attack: 0.035, filter: 2100 });
        // A lonely octave echo answers the phrase openings.
        if (s === 0) note(c, out, t + 0.26, n * 2, 1.2, { type: 'sine', vol: 0.016, attack: 0.06 });
      }
      // Chord swell every other bar: the room breathing.
      if (s === 0 && bar % 2 === 0) {
        note(c, out, t, N.A3, 3.4, { type: 'sine', vol: 0.024, attack: 0.6 });
        note(c, out, t, N.C4, 3.4, { type: 'sine', vol: 0.018, attack: 0.75 });
        note(c, out, t, N.E4, 3.4, { type: 'sine', vol: 0.014, attack: 0.9 });
      }
      // A distant bell marks the long turns of the phrase.
      if (s === 0 && bar % 8 === 0) {
        note(c, out, t, N.A2, 4.2, { type: 'sine', vol: 0.05, attack: 0.01 });
        note(c, out, t + 0.02, N.E3, 3.6, { type: 'sine', vol: 0.022, attack: 0.01 });
      }
    },
  };
}

/** Expedition: tense, low drones, a heartbeat, an occasional wrong-sounding motif. */
function buildExpedition(c: AudioContext, out: GainNode): TrackSpec {
  const sources: Array<OscillatorNode | AudioBufferSourceNode> = [
    ...drone(c, out, N.D2, { type: 'sawtooth', vol: 0.05, filter: 230, lfoRate: 0.041, lfoDepth: 70 }),
    ...drone(c, out, N.D2, { type: 'sawtooth', vol: 0.038, filter: 260, detune: 9, lfoRate: 0.027, lfoDepth: 60 }),
    ...drone(c, out, N.A2, { type: 'triangle', vol: 0.02, filter: 420, lfoRate: 0.019, lfoDepth: 110 }),
    ...bed(c, out, { freq: 460, q: 0.7, vol: 0.032, lfoRate: 0.05, lfoDepth: 260 }),
  ];

  // Tritone-shadowed D minor — three notes, four bars apart, never resolving.
  const motif = [N.D4, N.Gs4, N.F4];

  return {
    target: 0.9,
    stepDur: 60 / 54 / 2, // eighth notes at 54bpm
    sources,
    play: (t, step) => {
      const bar = Math.floor(step / 8);
      const s = step % 8;
      // Heartbeat: a doubled sub thump every other bar.
      if (s === 0 && bar % 2 === 0) {
        note(c, out, t, N.A1, 0.5, { type: 'sine', to: 38, vol: 0.09, attack: 0.02 });
        note(c, out, t + 0.3, N.A1, 0.42, { type: 'sine', to: 36, vol: 0.055, attack: 0.02 });
      }
      // The motif, rare enough to stay unsettling.
      if (s === 2 && bar % 4 === 3) {
        motif.forEach((n, i) => {
          note(c, out, t + i * 0.62, n, 1.5, { type: 'triangle', vol: 0.042, attack: 0.08, filter: 1500 });
        });
      }
      // Water, stone, something moving out of sight.
      if (Math.random() < 0.05) {
        note(c, out, t, 900 + Math.random() * 900, 0.16, { type: 'sine', vol: 0.018, attack: 0.005 });
      }
      if (Math.random() < 0.03) {
        hit(c, out, t, 0.9, { filter: 'bandpass', freq: 260, to: 120, q: 1.4, vol: 0.03 });
      }
    },
  };
}

/** Battle: driving, rhythmic, urgent. Drums first, everything else on top. */
function buildBattle(c: AudioContext, out: GainNode): TrackSpec {
  const sources: Array<OscillatorNode | AudioBufferSourceNode> = [
    ...drone(c, out, N.A2, { type: 'sawtooth', vol: 0.028, filter: 380, lfoRate: 0.15, lfoDepth: 140 }),
    ...drone(c, out, N.E3, { type: 'sawtooth', vol: 0.02, filter: 420, detune: 7, lfoRate: 0.11, lfoDepth: 120 }),
  ];

  const KICK = [0, 6, 8, 14];
  const RIM = [4, 12];
  const bassA: Array<number | null> = [
    N.A2, null, null, N.A2, null, null, N.C3, null, N.A2, null, null, N.G2, null, null, N.E2, null,
  ];
  const bassB: Array<number | null> = [
    N.F2, null, null, N.F2, null, null, N.A2, null, N.F2, null, null, N.E2, null, null, N.E2, null,
  ];
  const stab: Array<number | null> = [
    N.A4, null, N.C5, null, null, null, N.E5, null, null, N.D5, null, null, N.C5, null, null, null,
  ];

  return {
    target: 1,
    stepDur: 60 / 138 / 4, // sixteenths at 138bpm
    sources,
    play: (t, step) => {
      const bar = Math.floor(step / 16);
      const s = step % 16;

      if (KICK.includes(s)) {
        note(c, out, t, 130, 0.19, { type: 'sine', to: 44, vol: 0.16, attack: 0.004 });
        hit(c, out, t, 0.06, { filter: 'lowpass', freq: 900, vol: 0.05 });
      }
      if (RIM.includes(s)) {
        hit(c, out, t, 0.16, { filter: 'bandpass', freq: 1900, q: 1.2, vol: 0.07, to: 900 });
        note(c, out, t, 220, 0.09, { type: 'triangle', to: 90, vol: 0.05 });
      }
      // Hats: eighths accented, sixteenth ghosts between them.
      if (s % 2 === 0) hit(c, out, t, 0.05, { filter: 'highpass', freq: 7000, vol: s % 4 === 0 ? 0.035 : 0.02 });
      else if (s % 4 === 3) hit(c, out, t, 0.03, { filter: 'highpass', freq: 9000, vol: 0.012 });

      const bass = bar % 4 < 2 ? bassA : bassB;
      const bn = bass[s];
      if (bn !== null) {
        note(c, out, t, bn, 0.24, { type: 'sawtooth', vol: 0.09, attack: 0.006, filter: 700, q: 3 });
      }
      // The lead only enters on the back half of each four-bar cycle.
      if (bar % 4 >= 2) {
        const sn = stab[s];
        if (sn !== null) {
          note(c, out, t, sn, 0.26, { type: 'square', vol: 0.038, attack: 0.005, filter: 2000, q: 1.5 });
          note(c, out, t, sn / 2, 0.3, { type: 'triangle', vol: 0.022, attack: 0.01 });
        }
      }
      // Turnaround: a rising sweep into the next cycle.
      if (bar % 8 === 7 && s === 12) {
        hit(c, out, t, 0.7, { filter: 'bandpass', freq: 400, to: 6000, q: 0.8, vol: 0.05 });
      }
    },
  };
}

function build(name: MusicContextName, c: AudioContext, out: GainNode): TrackSpec | null {
  if (name === 'town') return buildTown(c, out);
  if (name === 'expedition') return buildExpedition(c, out);
  if (name === 'battle') return buildBattle(c, out);
  return null;
}

// --- Scheduler --------------------------------------------------------------

function startTimer() {
  if (timer !== null) return;
  try {
    timer = setInterval(pump, TICK_MS);
  } catch {
    timer = null;
  }
}

function stopTimer() {
  if (timer === null) return;
  try {
    clearInterval(timer);
  } catch {
    // ignore
  }
  timer = null;
}

function teardown(tr: Track) {
  for (const s of tr.sources) {
    try {
      s.stop();
    } catch {
      // already stopped
    }
    try {
      s.disconnect();
    } catch {
      // ignore
    }
  }
  try {
    tr.out.disconnect();
  } catch {
    // ignore
  }
}

function pump() {
  const c = ctx;
  if (!c) return;
  try {
    const now = c.currentTime;
    const horizon = now + LOOKAHEAD_S;
    for (const tr of tracks) {
      if (tr.dying) continue;
      // Recover the grid after a throttled/suspended stretch.
      if (tr.nextTime < now) tr.nextTime = now + 0.05;
      let guard = 0;
      while (tr.nextTime < horizon && guard++ < 512) {
        try {
          tr.play(tr.nextTime, tr.step);
        } catch {
          // One bad note never stops the music.
        }
        tr.step++;
        tr.nextTime += tr.stepDur;
      }
    }
    if (tracks.some((t) => t.dying && now >= t.endAt)) {
      for (const t of tracks) if (t.dying && now >= t.endAt) teardown(t);
      tracks = tracks.filter((t) => !(t.dying && now >= t.endAt));
    }
    if (tracks.length === 0) stopTimer();
  } catch {
    // Audio is a garnish; never let it take the meal down.
  }
}

function fadeOutAll(c: AudioContext, seconds = CROSSFADE) {
  const now = c.currentTime;
  for (const tr of tracks) {
    if (tr.dying) continue;
    tr.dying = true;
    tr.endAt = now + seconds + 0.25;
    try {
      tr.out.gain.cancelScheduledValues(now);
      tr.out.gain.setValueAtTime(tr.out.gain.value, now);
      tr.out.gain.linearRampToValueAtTime(0.0001, now + seconds);
    } catch {
      tr.endAt = now;
    }
  }
}

function startTrack(name: MusicContextName, c: AudioContext) {
  if (!master) return;
  const out = c.createGain();
  out.gain.value = 0.0001;
  out.connect(master);
  const spec = build(name, c, out);
  if (!spec) {
    try {
      out.disconnect();
    } catch {
      // ignore
    }
    return;
  }
  const now = c.currentTime;
  try {
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(spec.target, now + CROSSFADE * 0.8);
  } catch {
    out.gain.value = spec.target;
  }
  tracks.push({
    ...spec,
    name,
    out,
    step: 0,
    nextTime: now + 0.12,
    dying: false,
    endAt: Infinity,
  });
  startTimer();
}

/** Reconcile the live graph with `desired` + mute state. Safe to call anytime. */
function apply() {
  if (!gestured) return;
  try {
    const c = getCtx();
    if (!c || !master) return;
    if (c.state === 'suspended') void c.resume();

    const want: MusicContextName = muted ? 'silent' : desired;
    const live = tracks.find((t) => !t.dying);
    if (live && live.name === want) return;
    if (live) fadeOutAll(c);
    if (want !== 'silent') startTrack(want, c);
    else if (tracks.length) startTimer(); // keep pumping until the fade finishes
  } catch {
    // never throw
  }
}

/** Wait for the first real gesture before touching the AudioContext. */
function hookGesture() {
  if (hooked || gestured) return;
  const w = globalThis as unknown as {
    addEventListener?: typeof window.addEventListener;
    removeEventListener?: typeof window.removeEventListener;
  };
  if (typeof w.addEventListener !== 'function') return;
  hooked = true;
  const events = ['pointerdown', 'keydown', 'touchstart'];
  const onGesture = () => {
    gestured = true;
    for (const ev of events) {
      try {
        w.removeEventListener?.(ev, onGesture, true);
      } catch {
        // ignore
      }
    }
    apply();
  };
  for (const ev of events) {
    try {
      w.addEventListener?.(ev, onGesture, { capture: true, passive: true });
    } catch {
      // ignore
    }
  }
}

// --- Public API -------------------------------------------------------------

/**
 * Ask for a musical context. Crossfades if something else is already playing;
 * does nothing until the player's first gesture unlocks audio.
 */
export function setMusicContext(name: MusicContextName) {
  try {
    if (desired === name) {
      hookGesture();
      apply();
      return;
    }
    desired = name;
    hookGesture();
    apply();
  } catch {
    // never throw
  }
}

export function getMusicContext(): MusicContextName {
  return desired;
}

export function isMusicMuted(): boolean {
  return muted;
}

/** Music mute only — the SFX mute in platform/sfx.ts is untouched. */
export function setMusicMuted(value: boolean) {
  try {
    muted = value;
    save();
    if (master && ctx) {
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(muted ? 0.0001 : volume, now + 0.4);
      } catch {
        master.gain.value = muted ? 0 : volume;
      }
    }
    if (muted) {
      const c = ctx;
      if (c) fadeOutAll(c, 0.45);
    } else {
      apply();
    }
  } catch {
    // never throw
  }
}

export function getMusicVolume(): number {
  return volume;
}

export function setMusicVolume(value: number) {
  try {
    volume = Math.min(1, Math.max(0, value));
    save();
    if (master && ctx && !muted) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(Math.max(0.0001, volume), now + 0.25);
    }
  } catch {
    // never throw
  }
}

/** Hard stop — used by nothing in-game yet, handy for teardown/tests. */
export function stopMusic() {
  try {
    desired = 'silent';
    const c = ctx;
    if (c) fadeOutAll(c, 0.3);
  } catch {
    // never throw
  }
}
