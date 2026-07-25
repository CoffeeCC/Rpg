// Procedural per-gate floor/wall tile art, rendered UNDER the emoji/unit
// content of a map cell in FloorScreen. Replaces the flat "brown squares"
// look with pixel-art-flavored SVG that varies per gate and per tile.
//
// Determinism: the same (vx, vy) always renders the same variant — no
// Math.random() anywhere. This matters because FloorScreen re-renders on
// every step/turn (threat overlay, player position, HP), and a tile that
// changed its look between renders would read as flickering, not scenery.
//
// Style: dark-fantasy, desaturated, low-contrast. Decoration opacity stays
// low so emoji icons, unit tokens, the red "threat" tint, and the player
// token all stay readable sitting on top of this layer.
import type { ReactElement } from 'react';
import type { GateId } from '../engine/types';

interface TileTheme {
  floorBase: string;
  wallBase: string;
  accent: string;
}

export const GATE_TILE_THEMES: Record<GateId, TileTheme> = {
  verdant: { floorBase: '#1b2416', wallBase: '#0e130a', accent: '#6d9e5a' },
  hollow: { floorBase: '#282420', wallBase: '#16130f', accent: '#8f8a7c' },
  sunken: { floorBase: '#142426', wallBase: '#0b1719', accent: '#5f9391' },
  storm: { floorBase: '#20212e', wallBase: '#131420', accent: '#8fa4c4' },
  abyss: { floorBase: '#150e1c', wallBase: '#09060d', accent: '#8a6fb8' },
};

/** Spatial hash of grid coords -> stable non-negative int. No Math.random(). */
function hashCoord(vx: number, vy: number): number {
  return ((vx * 73856093) ^ (vy * 19349663)) >>> 0;
}

// ---------------------------------------------------------------------------
// Sparse set-dressing scattered across plain floor tiles. Deterministic per
// (vx, vy) like the decor above — the same tile always rolls the same prop, so
// it doesn't flicker between renders.
//
// v19 #5 — THE RULE: a decorative prop must NEVER mimic an interactive tile.
// v18 shipped an 'archway' prop (a painted stone doorway with a hinged wooden
// door) on ~1 in 15 floor tiles. It reads exactly like the real 🚪 START /
// way-back tile, so the map was littered with doors that did nothing — Paul:
// "there are tiles that look like doors that dont really act like doors".
// It is gone. Everything in this rotation is GROUND clutter: flat, wider than
// it is tall, no portal / container / altar / stair / breakable silhouette.
// Before adding a prop here, check it against TILE_VIEW in FloorScreen.tsx —
// if it could be mistaken for any entry there, it doesn't ship.
//
// v20 — "those are 2 identical tree branches and it looks cheap" (Paul). Two
// problems, both fixed here:
//
//   1. FOUR props for five tonally different gates. A stone-rimmed waterpool on
//      a wind-scoured Storm peak is exactly the thing that reads as stamped-on
//      filler. The rotation is now GATE-AWARE: each gate draws from its own
//      curated pool (see GATE_PROP_POOL). Pass `gateId` to pickTileProp; the
//      no-gate call still works and falls back to a neutral pool.
//   2. Every instance of a prop rendered BYTE-IDENTICAL. Two `roots` on screen
//      were literally the same drawing twice — which is what Paul saw. Every
//      instance now gets its own rotation, scale, mirroring, sub-cell offset
//      and colour tint, all derived from the tile's position hash (see
//      propVariation). Same tile -> same look, forever; no Math.random().
//
// Deliberately NOT in the rotation, both of them painted PNGs from the icon
// manifest (the files stay; this layer just stops using them as clutter):
//
//   `waterpool` — a grey stone rim enclosing a dark basin, i.e. the ⛲ shrine
//   silhouette with the flame taken out. A direct hit on THE RULE. Verdant and
//   Sunken get the hand-drawn `puddle` instead: no rim, flat, obviously a wet
//   patch of floor rather than a basin someone built.
//
//   `debris` — checked on a real Verdant/Storm/Abyss map: a raster heap reads
//   brighter and more saturated than everything drawn here, so it looks like a
//   sprite pasted onto the terrain; and because its lighting is baked in it
//   can't be rotated, so every instance looked the same — the exact defect
//   being fixed. Its heap-of-stuff-to-smash outline is also the nearest thing
//   in the set to the 🛢️ breakable. Replaced by `rubble`, drawn here, which
//   takes the full per-instance variation treatment.
// ---------------------------------------------------------------------------

export const TILE_PROP_KINDS = [
  // ground-neutral
  'pebbles',
  'crack',
  'moss',
  'bones',
  'rubble',
  // verdant woodland
  'roots',
  'leaflitter',
  'fern',
  'mushrooms',
  'puddle',
  'deadwood',
  // hollow caverns
  'driedmud',
  'shards',
  // sunken drowned temple-city
  'kelp',
  'silt',
  'shells',
  // storm peaks
  'feathers',
  'frost',
  'scree',
  // abyss
  'ash',
  'emberseam',
  'cinders',
] as const;

export type TilePropKind = (typeof TILE_PROP_KINDS)[number];
/** @deprecated name kept so older imports keep compiling. */
export type TileProp = TilePropKind;

/**
 * One rolled instance of ground clutter. Carries the seed for its own
 * per-instance variation so the caller never has to thread coordinates into
 * TilePropArt — pickTileProp's return value is the whole contract.
 */
export interface TilePropPick {
  kind: TilePropKind;
  /** deterministic per-tile variation seed (position-hashed) */
  seed: number;
}

/**
 * Per-gate clutter pools. The point is tonal: bones and dead roots belong in
 * the Hollow, kelp and silt in the Sunken, scoured rock and feathers on the
 * Storm peaks. A pool repeats an entry to weight it upward.
 */
export const GATE_PROP_POOL: Record<GateId, readonly TilePropKind[]> = {
  verdant: ['roots', 'leaflitter', 'leaflitter', 'fern', 'mushrooms', 'puddle', 'deadwood', 'moss', 'pebbles', 'bones'],
  hollow: ['bones', 'rubble', 'crack', 'driedmud', 'shards', 'shards', 'pebbles', 'deadwood', 'moss', 'roots'],
  sunken: ['kelp', 'kelp', 'silt', 'shells', 'moss', 'puddle', 'pebbles', 'rubble', 'bones'],
  storm: ['scree', 'scree', 'frost', 'feathers', 'shards', 'crack', 'pebbles', 'rubble', 'bones'],
  abyss: ['ash', 'emberseam', 'cinders', 'cinders', 'crack', 'bones', 'rubble', 'pebbles'],
};

/** Used when the call site hasn't got a gate to hand. Nothing gate-specific. */
const NEUTRAL_PROP_POOL: readonly TilePropKind[] = ['pebbles', 'rubble', 'roots', 'bones', 'crack', 'moss'];

/** 32-bit avalanche mix — turns a hash into well-spread independent bits. */
function mix32(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** i-th independent unit float [0,1) off a seed. Deterministic, no state. */
function stream(seed: number, i: number): number {
  return mix32((seed + Math.imul(i, 0x9e3779b9)) >>> 0) / 4294967296;
}

/**
 * ~1 in 15 floor tiles gets a prop; deterministic, no engine/gameplay effect.
 *
 * `gateId` is optional purely so this stays a drop-in for the existing call
 * site — pass it and the clutter becomes tonally correct for the gate.
 */
export function pickTileProp(vx: number, vy: number, gateId?: GateId): TilePropPick | null {
  const hash = hashCoord(vx * 4297, vy * 2999);
  if (hash % 15 !== 0) return null;
  const pool = (gateId && GATE_PROP_POOL[gateId]) || NEUTRAL_PROP_POOL;
  const kind = pool[Math.floor(hash / 15) % pool.length];
  return { kind, seed: mix32(hash ^ 0x5bf03635) };
}

// --- per-instance colour jitter ---------------------------------------------
// A tint function is handed to every paint routine, which pipes each of its
// colour literals through it. Two `bones` on screen come out fractionally
// different in luminance and warmth, which is enough to break the "same
// drawing twice" read. No SVG filters: those cost per-pixel work on the Deck's
// integrated GPU and would need collision-free ids per instance.

type Tint = (hex: string) => string;

const TINT_CACHE = new Map<string, string>();
const IDENTITY_TINT: Tint = (hex) => hex;

function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

/** lum brightens/darkens; warm pushes red up and blue down (candle vs. cold). */
function shiftHex(hex: string, lum: number, warm: number): string {
  const key = `${hex}|${lum}|${warm}`;
  const hit = TINT_CACHE.get(key);
  if (hit !== undefined) return hit;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const body = m[1].length === 3 ? m[1].replace(/./g, (ch) => ch + ch) : m[1];
  const n = parseInt(body, 16);
  const r = clamp255(((n >> 16) & 255) * (1 + lum + warm));
  const g = clamp255(((n >> 8) & 255) * (1 + lum));
  const b = clamp255((n & 255) * (1 + lum - warm));
  const out = `#${(((1 << 24) | (r << 16) | (g << 8) | b) >>> 0).toString(16).slice(1)}`;
  TINT_CACHE.set(key, out);
  return out;
}

function makeTint(lum: number, warm: number): Tint {
  if (lum === 0 && warm === 0) return IDENTITY_TINT;
  return (hex) => shiftHex(hex, lum, warm);
}

// --- prop table --------------------------------------------------------------

type PropPaint = (c: Tint) => ReactElement;

interface PropDef {
  /**
   * Inline-SVG painter, in the desaturated tile-art idiom. Every prop is drawn
   * here rather than pulled from the painted PNG manifest, because a raster
   * sprite can't be rotated or re-tinted without its baked-in lighting going
   * wrong — which is what made the old rotation repeat.
   */
  paint: PropPaint;
  /**
   * Max |rotation| in degrees. 180 = the thing looks plausible at any angle
   * (a bone, a chip of rock). Small values are for props whose shading or
   * growth direction implies "up" — a mushroom cap must not end up upside down.
   */
  spin: number;
  /** [min, max] uniform scale about the prop's centre */
  scale: [number, number];
}

/** Surface roots sprawling across the tile — low, horizontal, unmistakably ground. */
function rootsProp(c: Tint): ReactElement {
  return (
    <g>
      {/* contact shadow so the root sits ON the terrain, not floating over it */}
      <path
        d="M6 71 C 28 63 40 77 58 69 C 72 63 86 71 96 65"
        stroke="#000"
        strokeOpacity="0.42"
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M6 67 C 28 59 40 73 58 65 C 72 59 86 67 96 61" stroke={c('#2c2114')} strokeWidth="8.5" fill="none" strokeLinecap="round" />
      <path
        d="M6 64 C 28 56 40 70 58 62 C 72 56 86 64 96 58"
        stroke={c('#57411f')}
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* offshoots stay LOW and lateral — nothing on a floor prop may stand up
          tall enough to read as a doorway, a figure or an object */}
      <g stroke={c('#332616')} strokeWidth="4.6" fill="none" strokeLinecap="round">
        <path d="M26 63 C 34 56 34 52 43 50" />
        <path d="M64 64 C 72 75 80 79 89 77" />
        <path d="M44 69 C 42 79 34 84 25 84" />
      </g>
      <g stroke={c('#241a0f')} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.85">
        <path d="M43 50 q7 -4 14 -3" />
        <path d="M43 50 q4 -7 3 -13" />
        <path d="M89 77 q6 3 8 8" />
        <path d="M25 84 q-6 2 -9 7" />
      </g>
    </g>
  );
}

/** A scatter of old bones. NO SKULL — 💀 is the boss tile. Ribs and shafts only. */
function bonesProp(c: Tint): ReactElement {
  return (
    <g>
      <ellipse cx="46" cy="79" rx="29" ry="5.5" fill="#000" opacity="0.28" />
      {/* long bone lying across the tile */}
      <g>
        <path d="M24 73 L66 62" stroke={c('#b8b09b')} strokeWidth="8" strokeLinecap="round" fill="none" />
        <circle cx="22" cy="69" r="5" fill={c('#b8b09b')} />
        <circle cx="25" cy="78" r="5" fill={c('#b8b09b')} />
        <circle cx="68" cy="58" r="4.6" fill={c('#b8b09b')} />
        <circle cx="66" cy="67" r="4.6" fill={c('#b8b09b')} />
        <path d="M25 76 L66 65" stroke={c('#6d6656')} strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.75" />
      </g>
      {/* two rib arcs behind it */}
      <g stroke={c('#a79f8b')} strokeWidth="3.4" fill="none" strokeLinecap="round" opacity="0.8">
        <path d="M30 53 q15 -13 31 -8" />
        <path d="M35 44 q13 -11 27 -7" />
      </g>
      {/* splinters */}
      <g fill={c('#9b9381')} opacity="0.7">
        <ellipse cx="78" cy="76" rx="6" ry="2.8" transform="rotate(24 78 76)" />
        <ellipse cx="34" cy="86" rx="5" ry="2.4" transform="rotate(-16 34 86)" />
      </g>
    </g>
  );
}

/** Loose stones. The workhorse — reads as ground anywhere, in every gate. */
function pebblesProp(c: Tint): ReactElement {
  return (
    <g>
      <ellipse cx="50" cy="64" rx="31" ry="12" fill="#000" opacity="0.24" />
      <ellipse cx="34" cy="54" rx="11" ry="8" fill={c('#524f48')} />
      <ellipse cx="32" cy="51" rx="7" ry="4.2" fill={c('#726d61')} opacity="0.8" />
      <ellipse cx="59" cy="61" rx="13" ry="9" fill={c('#484540')} />
      <ellipse cx="57" cy="58" rx="8.4" ry="5" fill={c('#67635a')} opacity="0.75" />
      <ellipse cx="73" cy="47" rx="7" ry="5" fill={c('#5a5750')} />
      <ellipse cx="71" cy="45" rx="4.4" ry="2.6" fill={c('#767164')} opacity="0.6" />
      <ellipse cx="44" cy="71" rx="6" ry="4" fill={c('#4d4a44')} />
      <ellipse cx="23" cy="66" rx="4.4" ry="3" fill={c('#535049')} opacity="0.9" />
      <g fill={c('#38352f')} opacity="0.7">
        <circle cx="81" cy="63" r="2.2" />
        <circle cx="17" cy="53" r="1.8" />
        <circle cx="64" cy="73" r="2" />
      </g>
    </g>
  );
}

/**
 * A fissure in the floor. Drawn as a TAPERED OPENING, not a stroked polyline —
 * the first pass used a constant-width zigzag and, seen on the map, it read as
 * a scribbled lightning bolt rather than a split in the ground. Widest in the
 * middle, closed at both ends, with a lit lip along one edge for depth.
 */
function crackProp(c: Tint): ReactElement {
  return (
    <g>
      {/* the ground sagging into the split */}
      <path
        d="M6 70 C 26 65 40 56 58 49 C 72 43 84 40 94 37 C 82 47 70 52 56 58 C 38 65 22 71 6 70 Z"
        fill={c('#171310')}
        opacity="0.5"
      />
      {/* the opening itself */}
      <path
        d="M8 68 C 26 62 40 54 58 47 C 72 42 82 39 92 37 C 80 45 70 49 57 54 C 40 61 25 68 8 68 Z"
        fill={c('#0a0807')}
      />
      {/* lit lip along the lower edge — this is what makes it read as depth */}
      <path
        d="M8 68 C 25 68 40 61 57 54 C 70 49 80 45 92 37"
        stroke={c('#6b6355')}
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.4"
      />
      {/* a hairline branch off the main split */}
      <path d="M40 58 C 40 66 36 72 30 78 C 36 70 37 65 37 58 Z" fill={c('#0a0807')} opacity="0.85" />
      {/* chips levered up out of the edge */}
      <g fill={c('#48443c')} opacity="0.7">
        <path d="M24 72 l8 1 -3 5 Z" />
        <path d="M66 40 l6 -3 1 5 Z" />
        <path d="M50 52 l5 3 -5 2 Z" />
      </g>
    </g>
  );
}

/**
 * Broken masonry — chunky, angular blocks with a mortar edge. Replaces the
 * painted `debris` heap: same "something collapsed here" note, but it lies
 * FLAT (nothing stacked, nothing to smash) and it rotates and tints per
 * instance like the rest of the set.
 */
function rubbleProp(c: Tint): ReactElement {
  const block = (d: string, face: string, lit: string, op: number) => (
    <g opacity={op}>
      <path d={d} fill={face} />
      <path d={d} fill={lit} opacity="0.45" transform="translate(-0.8 -2)" />
    </g>
  );
  return (
    <g>
      <ellipse cx="50" cy="64" rx="32" ry="12" fill="#000" opacity="0.3" />
      {block('M14 58 L32 52 L38 62 L20 69 Z', c('#3f3c37'), c('#7b756a'), 0.95)}
      {block('M40 48 L60 45 L63 57 L43 60 Z', c('#46433d'), c('#847d71'), 0.95)}
      {block('M62 56 L80 58 L78 70 L60 68 Z', c('#3a3733'), c('#736d63'), 0.92)}
      {block('M28 68 L46 66 L48 76 L30 77 Z', c('#434039'), c('#7a7368'), 0.88)}
      {/* mortar crumbs and grit around the blocks */}
      <g fill={c('#5e584e')} opacity="0.6">
        <circle cx="84" cy="48" r="2.4" />
        <circle cx="10" cy="66" r="2" />
        <circle cx="54" cy="72" r="1.8" />
        <circle cx="72" cy="46" r="1.5" />
        <circle cx="22" cy="48" r="1.6" />
      </g>
      <g stroke={c('#211f1c')} strokeWidth="1" fill="none" opacity="0.6">
        <path d="M32 52 L38 62 M60 45 L63 57 M80 58 L78 70" />
      </g>
    </g>
  );
}

/** Damp moss spreading over the stone. Soft, formless, obviously not an object. */
function mossProp(c: Tint): ReactElement {
  return (
    <g>
      {/* lobed, not elliptical — moss creeps, it doesn't get poured */}
      <path
        d="M16 60 C 10 52 18 42 28 43 C 33 34 46 34 51 41 C 62 33 80 39 82 50 C 92 56 88 68 78 70 C 74 79 60 80 53 74 C 42 81 27 77 24 68 C 16 68 13 64 16 60 Z"
        fill={c('#1e2718')}
        opacity="0.92"
      />
      <path
        d="M25 59 C 21 53 27 46 35 47 C 39 41 48 41 52 46 C 60 41 72 45 73 53 C 80 57 77 65 70 66 C 67 72 57 73 52 69 C 44 74 33 71 31 65 C 25 65 23 62 25 59 Z"
        fill={c('#31402a')}
        opacity="0.9"
      />
      <g fill={c('#485438')} opacity="0.6">
        <circle cx="38" cy="55" r="3" />
        <circle cx="55" cy="52" r="2.4" />
        <circle cx="62" cy="63" r="2.6" />
        <circle cx="34" cy="66" r="2" />
        <circle cx="70" cy="55" r="1.8" />
      </g>
      <g stroke={c('#5a6a47')} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.45">
        <path d="M43 50 q1 -6 -2 -9" />
        <path d="M58 58 q3 -5 1 -9" />
      </g>
    </g>
  );
}

/** Fallen leaves. Deliberately not a neat pile — a drift blown across the tile. */
function leafLitterProp(c: Tint): ReactElement {
  const leaf = (x: number, y: number, r: number, rx: number, ry: number, fill: string, op: number) => (
    <g transform={`rotate(${r} ${x} ${y})`} opacity={op}>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={fill} />
      <path d={`M${x - rx} ${y} L${x + rx} ${y}`} stroke={c('#2b2113')} strokeWidth="0.9" opacity="0.55" />
    </g>
  );
  return (
    <g>
      <ellipse cx="50" cy="62" rx="35" ry="16" fill="#000" opacity="0.22" />
      {leaf(28, 50, -28, 15, 7.6, c('#6b5227'), 0.95)}
      {leaf(58, 43, 34, 13, 6.4, c('#7a6132'), 0.9)}
      {leaf(72, 60, -12, 16, 7, c('#4c3a1e'), 0.95)}
      {leaf(38, 68, 62, 14, 6.8, c('#5f4c22'), 0.92)}
      {leaf(62, 74, -46, 12, 5.6, c('#3f2f18'), 0.9)}
      {leaf(18, 66, 18, 11, 5.2, c('#6d5629'), 0.85)}
      {leaf(48, 56, 8, 10, 4.8, c('#48371a'), 0.8)}
      <g fill={c('#3f2f13')} opacity="0.75">
        <ellipse cx="86" cy="46" rx="5.5" ry="2.6" transform="rotate(40 86 46)" />
        <ellipse cx="10" cy="54" rx="4.6" ry="2.2" transform="rotate(-24 10 54)" />
        <ellipse cx="80" cy="76" rx="4" ry="2" transform="rotate(66 80 76)" />
      </g>
    </g>
  );
}

/**
 * Low undergrowth. Fronds arch outward and stay under the tile's mid-line.
 * Six fine fronds rather than the first pass's three fat ones — three splayed
 * strokes read as a claw or a hand, which is not a thing that should be lying
 * on the floor doing nothing.
 */
function fernProp(c: Tint): ReactElement {
  const frond = (d: string, w: number, col: string, op: number) => (
    <path d={d} stroke={col} strokeWidth={w} fill="none" strokeLinecap="round" opacity={op} />
  );
  return (
    <g>
      <ellipse cx="50" cy="76" rx="28" ry="8" fill="#000" opacity="0.28" />
      {frond('M48 76 C 32 73 20 65 12 54', 2.6, c('#2b3f20'), 0.95)}
      {frond('M49 76 C 36 68 28 56 24 42', 2.4, c('#334a26'), 0.95)}
      {frond('M50 77 C 51 62 47 48 41 36', 2.4, c('#2e4322'), 0.95)}
      {frond('M52 76 C 58 62 66 52 76 44', 2.4, c('#35502a'), 0.92)}
      {frond('M53 76 C 66 71 78 65 88 56', 2.6, c('#2b3f20'), 0.92)}
      {frond('M52 77 C 64 78 74 80 84 78', 2, c('#26381c'), 0.8)}
      {/* pinnae — fine ticks along each frond are what make it read as a fern */}
      <g stroke={c('#4d6b39')} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.75">
        <path d="M38 73 l-3 -5 M30 69 l-3 -5 M22 63 l-3 -5 M15 57 l-3 -4" />
        <path d="M40 68 l-5 -2 M34 60 l-5 -2 M29 51 l-5 -2" />
        <path d="M50 68 l-5 -2 M48 58 l-5 -2 M45 48 l-4 -2 M50 68 l5 -3 M48 58 l5 -3" />
        <path d="M58 66 l4 -4 M65 58 l4 -4 M72 51 l4 -4" />
        <path d="M62 73 l2 -5 M72 69 l2 -5 M81 62 l2 -5" />
      </g>
      {/* a couple of curled fiddleheads, kept flat to the ground */}
      <g stroke={c('#3d5a2c')} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.7">
        <path d="M24 42 a3.5 3.5 0 1 1 -3 3" />
        <path d="M88 56 a3 3 0 1 0 -3 -2.6" />
      </g>
    </g>
  );
}

/**
 * A few small caps. Low and clustered — no stem tall enough to read as a
 * figure. Deliberately bone/tan, NOT red: on the map red is the threat overlay
 * colour, and the first pass put warm red specks on floor tiles that looked
 * like a danger marker. Pale caps also stay legible on the dark verdant floor.
 */
function mushroomsProp(c: Tint): ReactElement {
  const cap = (x: number, y: number, w: number, h: number, top: string, lip: string, stem: string) => (
    <g>
      <rect x={x - 1.8} y={y} width="3.6" height={h} rx="1.6" fill={stem} />
      <path d={`M${x - w} ${y + 2} a${w} ${h * 1.15} 0 0 1 ${w * 2} 0 Z`} fill={top} />
      <path d={`M${x - w * 0.75} ${y - h * 0.4} a${w * 0.6} ${h * 0.5} 0 0 1 ${w * 0.9} -1`} fill={lip} opacity="0.55" />
      <path d={`M${x - w} ${y + 2} h${w * 2}`} stroke="#000" strokeOpacity="0.4" strokeWidth="1.6" />
    </g>
  );
  return (
    <g>
      <ellipse cx="50" cy="74" rx="28" ry="8" fill="#000" opacity="0.3" />
      {cap(34, 64, 10, 9, c('#8d8267'), c('#c0b493'), c('#6a6250'))}
      {cap(58, 69, 12, 10.5, c('#9a8e71'), c('#cbbf9c'), c('#756c58'))}
      {cap(72, 62, 7, 6.5, c('#7d7460'), c('#b0a488'), c('#5f584a'))}
      {/* gills catching what light there is */}
      <g fill={c('#3a352a')} opacity="0.5">
        <path d="M25 67 h18 M47 72 h22 M66 65 h13" strokeWidth="0" />
        <rect x="25" y="66.2" width="18" height="1.3" rx="0.6" />
        <rect x="47" y="71.2" width="22" height="1.4" rx="0.7" />
        <rect x="66" y="64.4" width="13" height="1.1" rx="0.5" />
      </g>
      <ellipse cx="21" cy="73" rx="5" ry="2.6" fill={c('#6e6553')} opacity="0.85" />
      <ellipse cx="85" cy="70" rx="3.4" ry="1.8" fill={c('#635b4b')} opacity="0.7" />
    </g>
  );
}

/**
 * Standing rainwater. Flat, rimless — deliberately NOT the shrine's stone
 * basin. Two corrections after seeing it on the Verdant map: the outline is
 * LOBED rather than a clean ellipse (a field of tidy ovals is exactly the
 * "stamped" read), and the water is peat-dark rather than teal — the first
 * pass's saturated blue-green was the loudest thing on a woodland floor.
 */
function puddleProp(c: Tint): ReactElement {
  const outer = 'M14 60 C 12 50 22 44 32 45 C 40 38 54 39 60 45 C 74 41 88 48 85 59 C 87 70 72 76 60 73 C 48 79 32 77 26 70 C 17 70 13 66 14 60 Z';
  const inner = 'M21 60 C 20 52 28 48 36 49 C 43 44 54 45 59 50 C 70 47 80 52 78 59 C 79 67 68 71 58 68 C 48 73 35 71 30 66 C 23 66 20 64 21 60 Z';
  return (
    <g>
      {/* damp margin — the ground darkening where the water has soaked in */}
      <path d={outer} fill={c('#2e2f24')} opacity="0.5" />
      <path d={inner} fill={c('#12140f')} opacity="0.95" />
      {/* water reading the dark canopy above it, not the sky */}
      <path d="M27 59 C 26 53 33 50 41 51 C 48 48 57 49 61 53 C 69 51 74 55 72 60 C 72 65 62 68 53 66 C 44 69 34 67 30 63 C 26 63 26 61 27 59 Z" fill={c('#1c2621')} opacity="0.85" />
      {/* one specular arc — the only bright note, kept short so it doesn't
          glow like an interactive tile's halo */}
      <path d="M34 55 C 40 52 49 52 55 54" stroke={c('#8fa39a')} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.4" />
      <path d="M44 64 C 50 66 58 65 63 62" stroke={c('#6d7d76')} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.25" />
      {/* grit sitting in the shallow edge */}
      <g fill={c('#4a4c3c')} opacity="0.65">
        <circle cx="19" cy="53" r="2" />
        <circle cx="84" cy="64" r="1.7" />
        <circle cx="56" cy="75" r="1.5" />
        <circle cx="32" cy="43" r="1.4" />
      </g>
    </g>
  );
}

/** A fallen limb. Straight and snapped — reads apart from the curling `roots`. */
function deadwoodProp(c: Tint): ReactElement {
  return (
    <g>
      <path d="M12 72 L86 57" stroke="#000" strokeOpacity="0.4" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M12 68 L86 53" stroke={c('#291e15')} strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M15 65 L83 51" stroke={c('#463322')} strokeWidth="4.2" fill="none" strokeLinecap="round" opacity="0.85" />
      {/* snapped end — splintered, not a cut plank */}
      <path d="M84 47 L95 51 L92 57 L85 60 Z" fill={c('#5e4830')} opacity="0.9" />
      <path d="M86 49 L93 52 L89 56 Z" fill={c('#37281a')} opacity="0.8" />
      {/* one stub branch, kept low */}
      <path d="M46 61 C 50 71 56 75 65 76" stroke={c('#2f2318')} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M65 76 q6 1 9 5" stroke={c('#241b12')} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.85" />
      {/* bark shear */}
      <g stroke={c('#1d150e')} strokeWidth="1.2" fill="none" opacity="0.7">
        <path d="M26 66 l3 -4 M40 63 l3 -4 M56 60 l3 -4 M70 57 l3 -4" />
      </g>
    </g>
  );
}

/**
 * Dried mud plates curling apart. Pure surface texture — zero object read.
 * The first pass drew a regular octagon and it looked like a hatch set into
 * the floor, so the patch outline is now ragged and the plate seams stop short
 * of the edge, the way real drying mud feathers out into the ground.
 */
function driedMudProp(c: Tint): ReactElement {
  return (
    <g>
      <path
        d="M11 46 C 20 36 34 34 46 36 C 58 30 74 34 82 40 C 92 46 91 60 84 66 C 78 76 62 78 50 74 C 36 78 20 72 14 62 C 8 56 8 50 11 46 Z"
        fill={c('#4a3d2f')}
        opacity="0.85"
      />
      {/* plate seams — irregular, none of them reaching the patch edge */}
      <g stroke={c('#191410')} strokeWidth="1.9" fill="none" strokeLinecap="round" opacity="0.85">
        <path d="M44 40 C 42 48 44 52 42 58 C 40 64 32 66 24 65" />
        <path d="M42 58 C 52 57 62 54 76 50" />
        <path d="M42 58 C 46 64 48 68 48 73" />
        <path d="M62 53 C 64 59 66 62 68 68" />
        <path d="M28 44 C 34 47 38 49 44 51" />
      </g>
      {/* curled lit edge on the upper side of each seam — reads as thickness */}
      <g stroke={c('#83705a')} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.45">
        <path d="M45.6 40 C 43.6 48 45.6 52 43.6 58" />
        <path d="M43 55.6 C 53 54.6 63 51.6 76 47.6" />
        <path d="M27 42.6 C 33 45.6 37 47.6 43 49.6" />
      </g>
      <g fill={c('#241d16')} opacity="0.5">
        <circle cx="32" cy="56" r="2" />
        <circle cx="70" cy="60" r="1.6" />
        <circle cx="58" cy="44" r="1.4" />
      </g>
    </g>
  );
}

/** Snapped stalactite shards on the cavern floor. Angular, sharp, lying flat. */
function shardsProp(c: Tint): ReactElement {
  const shard = (d: string, lit: string, dark: string, op: number) => (
    <g opacity={op}>
      <path d={d} fill={dark} />
      <path d={d} fill={lit} opacity="0.35" transform="translate(0 -1.6)" />
    </g>
  );
  return (
    <g>
      <ellipse cx="50" cy="66" rx="30" ry="10" fill="#000" opacity="0.26" />
      {shard('M14 62 L44 52 L48 58 L20 70 Z', c('#8e8779'), c('#4a463e'), 0.95)}
      {shard('M52 46 L80 56 L74 62 L48 54 Z', c('#9a9284'), c('#514d44'), 0.92)}
      {shard('M40 70 L62 74 L58 80 L38 76 Z', c('#837c6f'), c('#413d36'), 0.85)}
      <g fill={c('#6e685c')} opacity="0.7">
        <path d="M82 44 l7 3 -4 4 Z" />
        <path d="M22 46 l6 -3 1 5 Z" />
        <path d="M70 74 l5 2 -4 3 Z" />
      </g>
    </g>
  );
}

/** Stranded kelp — limp, boneless blades collapsed on the flagstones. */
function kelpProp(c: Tint): ReactElement {
  return (
    <g>
      <path d="M14 68 C 34 62 52 72 72 62 C 80 58 86 58 92 60" stroke="#000" strokeOpacity="0.35" strokeWidth="11" fill="none" strokeLinecap="round" />
      <path
        d="M12 64 C 26 56 34 66 46 60 C 58 54 66 64 80 56"
        stroke={c('#243a2c')}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* blades: wide, drooping, no rigid edge */}
      <path d="M20 60 C 28 50 40 48 50 52 C 40 60 28 64 20 60 Z" fill={c('#2c4a34')} opacity="0.9" />
      <path d="M48 62 C 58 54 72 54 82 58 C 70 66 56 68 48 62 Z" fill={c('#26412e')} opacity="0.9" />
      <path d="M30 70 C 40 66 52 68 60 74 C 48 78 36 78 30 70 Z" fill={c('#1f3728')} opacity="0.85" />
      <g stroke={c('#487051')} strokeWidth="1" fill="none" opacity="0.5">
        <path d="M24 58 C 32 54 40 53 47 55" />
        <path d="M54 62 C 62 58 72 58 79 60" />
      </g>
      {/* air bladders */}
      <g fill={c('#5d7a4e')} opacity="0.6">
        <circle cx="34" cy="57" r="2.2" />
        <circle cx="64" cy="60" r="2" />
        <circle cx="44" cy="72" r="1.6" />
      </g>
    </g>
  );
}

/** Silt drift — ripples of settled sediment. The quietest prop in the set. */
function siltProp(c: Tint): ReactElement {
  return (
    <g>
      {/* the drift itself — pale sediment, deliberately lighter than the
          flagstones it settles on, or it disappears (it did, first pass) */}
      <path d="M8 66 C 24 52 46 47 66 50 C 79 52 88 56 94 62 C 74 72 38 76 8 66 Z" fill={c('#7b7a63')} opacity="0.5" />
      <path d="M16 65 C 30 55 48 51 65 53 C 75 55 82 58 87 62 C 70 69 40 71 16 65 Z" fill={c('#93917a')} opacity="0.32" />
      {/* ripple crests catching light, troughs behind them */}
      <g stroke={c('#c2bfa2')} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.45">
        <path d="M14 62 C 32 51 54 48 82 54" />
        <path d="M18 68 C 36 58 58 55 86 61" />
        <path d="M26 74 C 42 66 62 64 84 68" />
      </g>
      <g stroke={c('#302f26')} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5">
        <path d="M15 64.5 C 33 54 55 51 83 57" />
        <path d="M20 70.5 C 38 61 60 58 86 64" />
      </g>
      <g fill={c('#5a5847')} opacity="0.55">
        <circle cx="40" cy="60" r="1.6" />
        <circle cx="62" cy="64" r="1.3" />
        <circle cx="72" cy="57" r="1.1" />
        <circle cx="30" cy="68" r="1.2" />
      </g>
    </g>
  );
}

/** Shell litter and barnacle crust — the Sunken's "someone drowned here" note. */
function shellsProp(c: Tint): ReactElement {
  const fan = (x: number, y: number, r: number, s: number, face: string, rib: string) => (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s}) translate(${-x} ${-y})`}>
      <path d={`M${x} ${y + 8} L${x - 11} ${y - 5} A13 13 0 0 1 ${x + 11} ${y - 5} Z`} fill={face} />
      <g stroke={rib} strokeWidth="0.9" opacity="0.6" fill="none">
        <path d={`M${x} ${y + 8} L${x - 8} ${y - 5} M${x} ${y + 8} L${x} ${y - 7} M${x} ${y + 8} L${x + 8} ${y - 5}`} />
      </g>
    </g>
  );
  return (
    <g>
      <ellipse cx="50" cy="66" rx="32" ry="12" fill="#000" opacity="0.3" />
      {fan(32, 56, -22, 1.25, c('#cfc5a8'), c('#6b6454'))}
      {fan(68, 64, 38, 1.05, c('#bcb298'), c('#5e5748'))}
      {/* spiral */}
      <g>
        <circle cx="50" cy="76" r="9" fill={c('#c3b99e')} />
        <path d="M50 76 m6.5 0 a6.5 6.5 0 1 1 -4 -6 a4 4 0 1 0 2.2 4" fill="none" stroke={c('#5d5748')} strokeWidth="1.6" />
      </g>
      {/* barnacle crust */}
      <g fill={c('#d2c8ac')} opacity="0.7">
        <circle cx="18" cy="70" r="3" />
        <circle cx="25" cy="75" r="2" />
        <circle cx="85" cy="52" r="2.6" />
        <circle cx="79" cy="76" r="1.8" />
        <circle cx="44" cy="42" r="2.2" />
      </g>
      <g fill={c('#4e4839')} opacity="0.5">
        <circle cx="18" cy="70" r="1.2" />
        <circle cx="85" cy="52" r="1" />
        <circle cx="44" cy="42" r="0.9" />
      </g>
    </g>
  );
}

/** Feathers on the wind-scoured rock. Nothing else on the peaks is this soft. */
function feathersProp(c: Tint): ReactElement {
  const feather = (x: number, y: number, r: number, len: number, vane: string, shaft: string, op: number) => (
    <g transform={`rotate(${r} ${x} ${y})`} opacity={op}>
      <path d={`M${x} ${y} C ${x + len * 0.35} ${y - 8} ${x + len * 0.75} ${y - 7} ${x + len} ${y}`} fill={vane} />
      <path d={`M${x} ${y} C ${x + len * 0.35} ${y + 8} ${x + len * 0.75} ${y + 6} ${x + len} ${y}`} fill={vane} opacity="0.75" />
      <path d={`M${x} ${y} L${x + len} ${y}`} stroke={shaft} strokeWidth="1.3" strokeLinecap="round" />
    </g>
  );
  return (
    <g>
      <ellipse cx="50" cy="66" rx="28" ry="9" fill="#000" opacity="0.3" />
      {feather(18, 58, -14, 44, c('#2b303c'), c('#b9c2d2'), 0.95)}
      {feather(38, 73, 26, 38, c('#242832'), c('#aab3c4'), 0.92)}
      {feather(58, 44, -38, 30, c('#2e333f'), c('#b1bbcc'), 0.82)}
      <g fill={c('#9aa3b4')} opacity="0.6">
        <ellipse cx="86" cy="66" rx="4.4" ry="1.8" transform="rotate(30 86 66)" />
        <ellipse cx="14" cy="74" rx="3.4" ry="1.4" transform="rotate(-20 14 74)" />
      </g>
    </g>
  );
}

/** Rime crust with needle ice. Cold, pale, hugging the stone. */
function frostProp(c: Tint): ReactElement {
  return (
    <g>
      {/* meltwater ring: a DARK wet edge is what separates rime from the pale
          storm flagstones — without it the patch was invisible on the map */}
      <path
        d="M14 58 C 10 47 24 39 36 41 C 44 35 58 36 63 43 C 78 41 90 49 87 59 C 85 71 64 78 48 74 C 32 76 16 69 14 58 Z"
        fill={c('#2c3340')}
        opacity="0.5"
      />
      <path d="M20 58 C 17 48 30 43 41 45 C 48 40 59 42 63 48 C 75 47 84 52 82 59 C 80 69 62 74 48 70 C 34 72 22 66 20 58 Z" fill={c('#c3d1e0')} opacity="0.42" />
      <path d="M28 57 C 26 50 36 47 45 49 C 51 45 59 47 62 52 C 70 52 75 55 73 60 C 70 66 57 69 46 66 C 36 67 29 63 28 57 Z" fill={c('#e0e9f3')} opacity="0.3" />
      <g stroke={c('#f2f7fc')} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.6">
        <path d="M36 62 L48 50 M48 50 L60 60 M48 50 L48 40" />
        <path d="M42 46 L46 51 M55 55 L58 50 M43 57 L40 53" />
      </g>
      <g fill={c('#f4f8fd')} opacity="0.5">
        <circle cx="30" cy="52" r="1.7" />
        <circle cx="68" cy="54" r="1.4" />
        <circle cx="58" cy="66" r="1.6" />
        <circle cx="38" cy="68" r="1.2" />
      </g>
    </g>
  );
}

/** Wind-scoured scree — angular, flaky, pale. Sharper-edged than `pebbles`. */
function screeProp(c: Tint): ReactElement {
  const chip = (d: string, face: string, edge: string, op: number) => (
    <g opacity={op}>
      <path d={d} fill={face} />
      <path d={d} fill={edge} opacity="0.4" transform="translate(0.8 -1.4)" />
    </g>
  );
  return (
    <g>
      <ellipse cx="50" cy="66" rx="32" ry="11" fill="#000" opacity="0.34" />
      {chip('M16 62 L30 52 L42 58 L34 68 Z', c('#2f323b'), c('#9aa0b0'), 0.95)}
      {chip('M46 52 L64 48 L70 58 L52 62 Z', c('#2a2d35'), c('#949aaa'), 0.92)}
      {chip('M60 64 L78 62 L80 72 L62 72 Z', c('#262931'), c('#888ea0'), 0.9)}
      {chip('M26 70 L40 70 L38 78 L24 76 Z', c('#2d3038'), c('#8f95a6'), 0.88)}
      {/* scour streaks — the wind's direction, drawn into the grit */}
      <g stroke={c('#2b2e36')} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5">
        <path d="M10 56 C 34 50 62 46 90 48" />
        <path d="M12 76 C 36 72 64 70 88 72" />
      </g>
      <g fill={c('#585c68')} opacity="0.7">
        <circle cx="86" cy="60" r="2" />
        <circle cx="14" cy="50" r="1.6" />
      </g>
    </g>
  );
}

/** Ash drift with a couple of embers still alive in it. Layered, no filters. */
function ashProp(c: Tint): ReactElement {
  return (
    <g>
      {/* lobed drift, and pale enough to be visible against abyss black —
          the first pass was a dark ellipse on a dark floor, i.e. invisible */}
      <path
        d="M12 62 C 8 52 20 46 30 48 C 40 41 56 43 62 50 C 76 48 90 55 90 63 C 78 73 54 76 38 73 C 24 73 14 69 12 62 Z"
        fill={c('#4a4450')}
        opacity="0.62"
      />
      <path d="M22 61 C 20 54 30 50 38 52 C 46 47 58 49 62 55 C 72 54 80 58 80 63 C 68 69 44 70 32 67 C 24 67 21 65 22 61 Z" fill={c('#6b6272')} opacity="0.45" />
      <g stroke={c('#8c8298')} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.4">
        <path d="M18 62 C 34 53 56 51 78 57" />
        <path d="M26 69 C 42 63 62 63 80 67" />
      </g>
      {/* embers: stacked circles fake the glow — an SVG blur filter would cost
          per-pixel work on ~250 cells and need a collision-free id per tile */}
      <circle cx="42" cy="60" r="5" fill={c('#b3541e')} opacity="0.14" />
      <circle cx="42" cy="60" r="2.6" fill={c('#c2661f')} opacity="0.4" />
      <circle cx="42" cy="60" r="1.2" fill={c('#e8a24c')} opacity="0.7" />
      <circle cx="66" cy="58" r="4" fill={c('#b3541e')} opacity="0.12" />
      <circle cx="66" cy="58" r="1.8" fill={c('#c2661f')} opacity="0.35" />
      <circle cx="30" cy="67" r="1.1" fill={c('#d98c3c')} opacity="0.45" />
    </g>
  );
}

/** A hairline seam of heat in the floor. Thin — never a pit, never stairs. */
function emberSeamProp(c: Tint): ReactElement {
  const seam = 'M10 68 C 30 60 38 54 52 54 C 68 54 76 46 92 44';
  return (
    <g>
      <path d={seam} stroke={c('#5a2410')} strokeWidth="9" fill="none" strokeLinecap="round" opacity="0.16" />
      <path d={seam} stroke={c('#8a3a15')} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.28" />
      <path d={seam} stroke={c('#0b0710')} strokeWidth="3.4" fill="none" strokeLinecap="round" opacity="0.9" />
      <path d={seam} stroke={c('#c2661f')} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6" />
      <path d="M40 58 C 46 57 48 56 52 55" stroke={c('#f0b45e')} strokeWidth="0.9" fill="none" strokeLinecap="round" opacity="0.7" />
      {/* two hairline branches off the seam */}
      <g stroke={c('#0b0710')} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8">
        <path d="M30 62 L24 74" />
        <path d="M68 50 L74 60" />
      </g>
      <g stroke={c('#b3541e')} strokeWidth="0.9" fill="none" strokeLinecap="round" opacity="0.45">
        <path d="M30 62 L25 73" />
        <path d="M68 50 L73 59" />
      </g>
    </g>
  );
}

/** Burnt twigs, mostly gone out. Charcoal blacks against the abyss violet. */
function cindersProp(c: Tint): ReactElement {
  const twig = (d: string, w: number, op: number) => (
    <path d={d} stroke={c('#100c14')} strokeWidth={w} fill="none" strokeLinecap="round" opacity={op} />
  );
  return (
    <g>
      <ellipse cx="50" cy="66" rx="29" ry="10" fill="#000" opacity="0.26" />
      {twig('M16 62 C 32 58 46 64 66 58', 5, 0.95)}
      {twig('M28 74 C 44 70 58 74 74 66', 4, 0.9)}
      {twig('M38 50 C 48 56 54 60 58 70', 3.4, 0.85)}
      <g stroke={c('#3a2f33')} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.7">
        <path d="M18 60 C 34 56 46 62 64 57" />
        <path d="M30 72 C 44 69 57 72 72 65" />
      </g>
      {/* ember tips — the only warm light in the prop */}
      <circle cx="66" cy="58" r="2.6" fill={c('#b3541e')} opacity="0.3" />
      <circle cx="66" cy="58" r="1.2" fill={c('#e8a24c')} opacity="0.65" />
      <circle cx="16" cy="62" r="1.1" fill={c('#c2661f')} opacity="0.45" />
      <g fill={c('#221b20')} opacity="0.8">
        <circle cx="80" cy="72" r="2.2" />
        <circle cx="24" cy="50" r="1.8" />
        <circle cx="52" cy="78" r="1.5" />
      </g>
    </g>
  );
}

const PROP_DEFS: Record<TilePropKind, PropDef> = {
  // any orientation is plausible for loose debris -> full spin
  pebbles: { paint: pebblesProp, spin: 180, scale: [0.8, 1.14] },
  crack: { paint: crackProp, spin: 180, scale: [0.85, 1.15] },
  bones: { paint: bonesProp, spin: 180, scale: [0.82, 1.1] },
  roots: { paint: rootsProp, spin: 180, scale: [0.84, 1.12] },
  deadwood: { paint: deadwoodProp, spin: 180, scale: [0.8, 1.14] },
  shards: { paint: shardsProp, spin: 180, scale: [0.82, 1.12] },
  shells: { paint: shellsProp, spin: 180, scale: [0.8, 1.08] },
  feathers: { paint: feathersProp, spin: 180, scale: [0.82, 1.12] },
  scree: { paint: screeProp, spin: 180, scale: [0.82, 1.14] },
  cinders: { paint: cindersProp, spin: 180, scale: [0.82, 1.12] },
  leaflitter: { paint: leafLitterProp, spin: 180, scale: [0.84, 1.12] },
  kelp: { paint: kelpProp, spin: 180, scale: [0.84, 1.12] },
  // shading or growth direction implies "up" -> keep the spin small
  moss: { paint: mossProp, spin: 40, scale: [0.78, 1.16] },
  puddle: { paint: puddleProp, spin: 34, scale: [0.78, 1.18] },
  driedmud: { paint: driedMudProp, spin: 34, scale: [0.84, 1.12] },
  silt: { paint: siltProp, spin: 26, scale: [0.84, 1.14] },
  frost: { paint: frostProp, spin: 40, scale: [0.78, 1.16] },
  ash: { paint: ashProp, spin: 28, scale: [0.82, 1.14] },
  emberseam: { paint: emberSeamProp, spin: 34, scale: [0.84, 1.12] },
  fern: { paint: fernProp, spin: 22, scale: [0.84, 1.12] },
  mushrooms: { paint: mushroomsProp, spin: 14, scale: [0.8, 1.14] },
  rubble: { paint: rubbleProp, spin: 180, scale: [0.8, 1.14] },
};

interface PropVariation {
  rot: number;
  scale: number;
  mirror: 1 | -1;
  ox: number;
  oy: number;
  tint: Tint;
}

/**
 * The whole answer to "two identical tree branches". Five independent channels
 * off one position-derived seed: rotation, scale, mirroring, sub-cell offset
 * and colour tint. Same tile -> same numbers on every render, always.
 *
 * Values are quantised so the emitted markup is short and byte-stable (React
 * diffs string attributes; jitter to 14 decimal places would be pure noise).
 */
function propVariation(def: PropDef, seed: number): PropVariation {
  const q = (n: number, step: number) => Math.round(n / step) * step;
  return {
    rot: q((stream(seed, 0) * 2 - 1) * def.spin, 0.5),
    scale: q(def.scale[0] + stream(seed, 1) * (def.scale[1] - def.scale[0]), 0.01),
    mirror: stream(seed, 2) < 0.5 ? -1 : 1,
    // nudge off dead centre — a grid of perfectly centred props reads as tiling
    ox: q((stream(seed, 5) * 2 - 1) * 9, 0.5),
    oy: q((stream(seed, 6) * 2 - 1) * 9, 0.5),
    tint: makeTint(q((stream(seed, 3) * 2 - 1) * 0.13, 0.01), q((stream(seed, 4) * 2 - 1) * 0.07, 0.01)),
  };
}

/** Normalises the legacy bare-string form so an old call site still renders. */
function asPick(prop: TilePropPick | TilePropKind): TilePropPick {
  return typeof prop === 'string' ? { kind: prop, seed: 0 } : prop;
}

/**
 * Renders one decorative floor prop. Painted PNGs come from the icon manifest;
 * anything painted here is inline SVG in the same desaturated tile-art style.
 * Sizing is CSS-driven off --cell (see floor.css §1) — `size` is only the
 * intrinsic attribute so the element has a sane box before CSS applies.
 *
 * Per-instance variation rides in on `prop.seed`, so this stays a pure function
 * of its props and the call site needs no coordinates.
 */
export function TilePropArt({
  prop,
  size = 64,
}: {
  prop: TilePropPick | TilePropKind;
  size?: number;
}): ReactElement | null {
  const pick = asPick(prop);
  const def = PROP_DEFS[pick.kind];
  if (!def) return null;
  const v = propVariation(def, pick.seed);

  // overflow visible: a rotated prop may poke a few units past the 100x100 box,
  // and letting it bleed slightly past its cell is *better* than a hard clip —
  // clipped clutter is exactly what makes a grid look stamped.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="ui-icon"
      role="presentation"
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <g
        transform={`translate(${v.ox} ${v.oy}) rotate(${v.rot} 50 50) translate(50 50) scale(${v.mirror * v.scale} ${v.scale}) translate(-50 -50)`}
      >
        {def.paint(v.tint)}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Floor decoration, per gate. Each takes a 0-3 variant index and returns a
// low-opacity overlay group so large open rooms don't look like a stamped-out
// grid of identical squares.
// ---------------------------------------------------------------------------

function verdantFloorDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // grass tufts, lower-left
      return (
        <g stroke={accent} strokeWidth="2.2" fill="none" opacity="0.4" strokeLinecap="round">
          <path d="M22 78 q2 -10 -2 -16 M28 80 q0 -12 4 -18 M34 78 q3 -9 0 -15" />
        </g>
      );
    case 1:
      // tiny flower + root tendril
      return (
        <g opacity="0.45">
          <circle cx="70" cy="30" r="2.6" fill={accent} opacity="0.7" />
          <path d="M70 33 q-4 8 -10 10" stroke="#3c5233" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      );
    case 2:
      // scattered dirt/leaf speckles
      return (
        <g fill={accent} opacity="0.3">
          <circle cx="46" cy="58" r="1.6" />
          <circle cx="60" cy="70" r="1.2" />
          <circle cx="38" cy="40" r="1.4" />
          <circle cx="72" cy="46" r="1" />
        </g>
      );
    default:
      // faint surface root crossing the tile
      return (
        <path
          d="M8 60 Q40 46 92 66"
          stroke="#0f150a"
          strokeWidth="3"
          fill="none"
          opacity="0.4"
          strokeLinecap="round"
        />
      );
  }
}

function verdantWallDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // dense trunk mass, off-center
      return (
        <g>
          <path d="M30 100 C 24 70 26 40 36 8 C 46 40 46 70 42 100 Z" fill="#0a0e07" opacity="0.85" />
          <path d="M64 100 C 60 74 64 44 74 14 C 82 44 80 74 76 100 Z" fill="#0a0e07" opacity="0.6" />
        </g>
      );
    case 1:
      // gnarled branches reaching across
      return (
        <g stroke="#141b0d" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.75">
          <path d="M10 20 C 30 30 46 26 60 12" />
          <path d="M20 70 C 40 64 56 72 88 62" />
        </g>
      );
    case 2:
      // hanging moss strands
      return (
        <g stroke={accent} strokeWidth="1.6" fill="none" opacity="0.3" strokeLinecap="round">
          <path d="M28 6 q6 40 -4 74" />
          <path d="M56 4 q-8 36 2 80" />
          <path d="M78 8 q6 34 -6 70" />
        </g>
      );
    default:
      // dense leaf canopy blotches
      return (
        <g fill="#0d1408" opacity="0.65">
          <ellipse cx="30" cy="26" rx="22" ry="16" />
          <ellipse cx="70" cy="60" rx="24" ry="18" />
          <ellipse cx="46" cy="82" rx="20" ry="14" />
        </g>
      );
  }
}

function hollowFloorDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // zigzag crack
      return (
        <path
          d="M14 20 L28 38 L20 46 L40 68 L34 78"
          stroke="#100d09"
          strokeWidth="2.4"
          fill="none"
          opacity="0.55"
          strokeLinecap="round"
        />
      );
    case 1:
      // pebble cluster
      return (
        <g fill={accent} opacity="0.3">
          <ellipse cx="64" cy="60" rx="4" ry="2.6" />
          <ellipse cx="72" cy="66" rx="3" ry="2" />
          <ellipse cx="60" cy="70" rx="2.4" ry="1.8" />
        </g>
      );
    case 2:
      // single deep fissure
      return (
        <path
          d="M84 10 L70 40 L78 50 L58 90"
          stroke="#0c0a07"
          strokeWidth="2.8"
          fill="none"
          opacity="0.5"
          strokeLinecap="round"
        />
      );
    default:
      // stone-block grout seams
      return (
        <g stroke="#100d09" strokeWidth="1.4" opacity="0.4">
          <path d="M0 34 L48 34 L48 0 M48 34 L100 34 M48 34 L48 74 L100 74 M48 74 L48 100 M0 74 L48 74" fill="none" />
        </g>
      );
  }
}

function hollowWallDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // vertical crack
      return (
        <path
          d="M50 0 C 46 30 54 60 44 100"
          stroke="#0a0806"
          strokeWidth="3"
          fill="none"
          opacity="0.6"
          strokeLinecap="round"
        />
      );
    case 1:
      // stalagmite hint from top edge
      return <path d="M50 0 L62 0 L56 26 Z" fill="#0a0806" opacity="0.75" />;
    case 2:
      // rough stone blotches
      return (
        <g fill="#0b0908" opacity="0.55">
          <ellipse cx="30" cy="34" rx="18" ry="14" />
          <ellipse cx="68" cy="66" rx="20" ry="16" />
        </g>
      );
    default:
      // horizontal seam band with pebble glints
      return (
        <g opacity="0.5">
          <path d="M0 50 L100 50" stroke="#0a0806" strokeWidth="2.6" />
          <circle cx="26" cy="50" r="1.6" fill={accent} opacity="0.5" />
          <circle cx="70" cy="50" r="1.4" fill={accent} opacity="0.4" />
        </g>
      );
  }
}

function sunkenFloorDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // algae seam blob in a corner
      return <path d="M0 100 C 6 78 20 66 40 64 C 24 76 16 90 16 100 Z" fill={accent} opacity="0.24" />;
    case 1:
      // ripple glints
      return (
        <g stroke={accent} strokeWidth="1.6" fill="none" opacity="0.32" strokeLinecap="round">
          <path d="M18 40 Q 50 32 84 42" />
          <path d="M14 56 Q 50 48 88 58" />
        </g>
      );
    case 2:
      // flagstone grout cross
      return (
        <g stroke="#081213" strokeWidth="1.6" opacity="0.4">
          <path d="M0 50 L100 50 M50 0 L50 100" fill="none" />
        </g>
      );
    default:
      // faint algae speckles
      return (
        <g fill={accent} opacity="0.28">
          <circle cx="70" cy="26" r="1.6" />
          <circle cx="78" cy="34" r="1.2" />
          <circle cx="30" cy="78" r="1.4" />
        </g>
      );
  }
}

function sunkenWallDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // horizontal masonry courses
      return (
        <g stroke="#060f10" strokeWidth="2" opacity="0.5">
          <path d="M0 26 L100 26 M0 58 L100 58 M0 84 L100 84" fill="none" />
        </g>
      );
    case 1:
      // vertical block seam, offset coursing
      return (
        <g stroke="#060f10" strokeWidth="2" opacity="0.45">
          <path d="M34 0 L34 40 M70 0 L70 40 M14 40 L14 78 M54 40 L54 78 M86 40 L86 78 M34 78 L34 100 M70 78 L70 100" fill="none" />
        </g>
      );
    case 2:
      // faint carved rune glow
      return <circle cx="50" cy="50" r="3.2" fill={accent} opacity="0.3" />;
    default:
      // cracked masonry corner
      return (
        <path
          d="M100 0 L70 10 L78 30 L60 46"
          stroke="#050d0e"
          strokeWidth="2.6"
          fill="none"
          opacity="0.55"
          strokeLinecap="round"
        />
      );
  }
}

function stormFloorDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // lichen fleck cluster
      return (
        <g fill={accent} opacity="0.28">
          <circle cx="60" cy="70" r="2" />
          <circle cx="66" cy="64" r="1.4" />
          <circle cx="54" cy="76" r="1.2" />
        </g>
      );
    case 1:
      // snow patch
      return <ellipse cx="30" cy="30" rx="14" ry="8" fill="#c8d0dc" opacity="0.14" />;
    case 2:
      // wind-scour grooves
      return (
        <g stroke="#0d0e16" strokeWidth="1.6" fill="none" opacity="0.4" strokeLinecap="round">
          <path d="M10 20 Q 50 30 90 14" />
          <path d="M14 34 Q 50 44 86 30" />
        </g>
      );
    default:
      // scattered ice flecks
      return (
        <g fill="#c8d0dc" opacity="0.2">
          <circle cx="76" cy="50" r="1.4" />
          <circle cx="40" cy="82" r="1.2" />
          <circle cx="86" cy="80" r="1" />
        </g>
      );
  }
}

function stormWallDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // jagged diagonal crack
      return (
        <path
          d="M0 10 L30 40 L18 50 L54 90"
          stroke="#0a0b12"
          strokeWidth="2.8"
          fill="none"
          opacity="0.55"
          strokeLinecap="round"
        />
      );
    case 1:
      // ledge highlight along the top
      return <path d="M0 6 L100 2 L100 12 L0 16 Z" fill={accent} opacity="0.14" />;
    case 2:
      // rough rock blotches
      return (
        <g fill="#0b0c14" opacity="0.5">
          <ellipse cx="36" cy="40" rx="20" ry="16" />
          <ellipse cx="70" cy="70" rx="18" ry="14" />
        </g>
      );
    default:
      // icy vein glint
      return (
        <path
          d="M20 0 C 30 30 20 60 40 100"
          stroke={accent}
          strokeWidth="1.6"
          fill="none"
          opacity="0.3"
          strokeLinecap="round"
        />
      );
  }
}

function abyssFloorDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // thin ember vein
      return (
        <path
          d="M10 80 Q 40 60 30 30"
          stroke="#7a3a1e"
          strokeWidth="1.6"
          fill="none"
          opacity="0.4"
          strokeLinecap="round"
        />
      );
    case 1:
      // faint crack with violet glow
      return (
        <path
          d="M70 10 L60 40 L74 55 L64 90"
          stroke={accent}
          strokeWidth="1.4"
          fill="none"
          opacity="0.32"
          strokeLinecap="round"
        />
      );
    case 2:
      // single ember speck
      return <circle cx="55" cy="55" r="1.8" fill="#b3541e" opacity="0.5" />;
    default:
      // subtle obsidian sheen streak
      return <path d="M10 90 Q 50 50 90 10" stroke="#2a2036" strokeWidth="3" fill="none" opacity="0.3" strokeLinecap="round" />;
  }
}

function abyssWallDecor(v: number, accent: string): ReactElement {
  switch (v) {
    case 0:
      // rim glow along the top edge
      return <path d="M0 4 L100 0 L100 10 L0 14 Z" fill={accent} opacity="0.16" />;
    case 1:
      // violet vein crack
      return (
        <path
          d="M40 0 C 50 30 34 60 50 100"
          stroke={accent}
          strokeWidth="1.8"
          fill="none"
          opacity="0.34"
          strokeLinecap="round"
        />
      );
    case 2:
      // ember glow speck
      return <circle cx="66" cy="60" r="2.2" fill="#b3541e" opacity="0.4" />;
    default:
      // near-invisible corner glow
      return <ellipse cx="86" cy="14" rx="16" ry="12" fill={accent} opacity="0.12" />;
  }
}

const FLOOR_DECOR: Record<GateId, (variant: number, accent: string) => ReactElement> = {
  verdant: verdantFloorDecor,
  hollow: hollowFloorDecor,
  sunken: sunkenFloorDecor,
  storm: stormFloorDecor,
  abyss: abyssFloorDecor,
};

const WALL_DECOR: Record<GateId, (variant: number, accent: string) => ReactElement> = {
  verdant: verdantWallDecor,
  hollow: hollowWallDecor,
  sunken: sunkenWallDecor,
  storm: stormWallDecor,
  abyss: abyssWallDecor,
};

// ---------------------------------------------------------------------------
// Shell: base fill + directional shading so adjacent tiles read as continuous
// ground rather than a grid of stamped squares. Floors get a darker top edge
// (as if in the shadow of the tile above); walls get a lit top edge.
// ---------------------------------------------------------------------------

function tileShell(size: number, gid: string, base: string, decor: ReactElement, isWall: boolean): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="presentation"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, display: 'block' }}
    >
      <defs>
        <linearGradient id={`${gid}-sh`} x1="0" y1="0" x2="0" y2="1">
          {isWall ? (
            <>
              <stop offset="0%" stopColor="#fff" stopOpacity="0.1" />
              <stop offset="14%" stopColor="#fff" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#000" stopOpacity="0.24" />
              <stop offset="16%" stopColor="#000" stopOpacity="0" />
              <stop offset="88%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0.05" />
            </>
          )}
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill={base} />
      {decor}
      <rect x="0" y="0" width="100" height="100" fill={`url(#${gid}-sh)`} />
    </svg>
  );
}

const WALL_TILE = '#';

/**
 * Floor/wall art meant to sit UNDER a map cell's emoji/unit content.
 * Deterministic per (vx, vy): same coordinates -> identical markup, always.
 */
export function TileFill({
  gateId,
  tile,
  vx,
  vy,
  size,
}: {
  gateId: GateId;
  tile: string;
  vx: number;
  vy: number;
  size: number;
}): ReactElement | null {
  const theme = GATE_TILE_THEMES[gateId];
  if (!theme) return null;

  const hash = hashCoord(vx, vy);
  const variant = hash % 4;
  const isWall = tile === WALL_TILE;
  const gid = `tf${isWall ? 'w' : 'f'}${vx}x${vy}`;

  if (isWall) {
    return tileShell(size, gid, theme.wallBase, WALL_DECOR[gateId](variant, theme.accent), true);
  }
  return tileShell(size, gid, theme.floorBase, FLOOR_DECOR[gateId](variant, theme.accent), false);
}
