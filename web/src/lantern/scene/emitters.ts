// =========================================================================
// EMITTERS — the many faint lights the ceiling was in the way of.
//
// ENGINE_PLAN §12, in Paul's words: "there can be wall sconces and glowing
// things that give off faint bits of light though. maybe some floaty beings
// kind of like what ocarina of time has in the forest that also give off very
// small bits of luminescence maybe some glowing mushrooms. the occasional lit
// torch."
//
// §12.4 orders them by cheapness and this file follows that order exactly:
//
//   SCONCE / LIT TORCH  static, warm, tiny reach. The one that makes a
//                       corridor legible, because it is the only thing that
//                       tells you the corridor continues.
//   GLOWING MUSHROOM    static, cool green, fainter still. Clusters well, and
//                       a cluster is the cheapest possible test of binning.
//   DRIFTING WISP       a MOVING emissive sprite. The showcase — a light that
//                       is also a thing you can watch.
//
// TWO THINGS EVERY EMITTER HERE HAS IN COMMON, and both are load-bearing.
//
// 1. FAINT MEANS SMALL REACH, and small reach is the entire reason this is
//    affordable (§12.2). A mushroom reaching two tiles touches about a dozen
//    tiles and lands in three or four light bins; everywhere else on the board
//    it costs precisely nothing. Turning a mushroom's reach up to a lantern's
//    is not "a brighter mushroom", it is a second lantern, and the bin
//    occupancy view (RenderOptions.debug = 6) will say so immediately.
//
// 2. THEY DO NOT CAST. `indirectOnly` and `castsShadow: false` together, which
//    is right physically — a dim broad source throws no hard edge — and is
//    also where most of a light's cost lives, since it skips the shadow march
//    entirely. See `packLights` for what `indirectOnly` means before M5's
//    lattice exists.
//
// HOW AN EMITTER IS VISIBLE AT ALL, since `Material.emissive` is M6 and does
// not exist yet: the painted sprite is lit BY ITS OWN LIGHT. That is not a
// trick, it is what a flame is — but it only works if the geometry is right,
// and getting it wrong is instructive. Put the light in the sprite's own plane
// and the fragments above it face 90 degrees away from it and go BLACK, so the
// flame renders as a dark tongue with a bright waist. The light therefore sits
// slightly ABOVE and IN FRONT of the quad (see `GLOW_LIFT`/`GLOW_FRONT`), so
// N·L stays between about 0.8 and 1.0 across the whole sprite and the falloff
// paints a soft radial glow — which is what an emissive sprite looks like.
// When M6 lands, the offsets go and the emissive map does this properly.
// =========================================================================

import type { Vec2, Vec3 } from './camera';
import { isSolid, type Light, type OccluderGrid, type RGB } from './scene';
import { LAYER_PIECE, type Sprite, type UVRect } from './sprite';

/** An emitter is a light and the thing you can see glowing. Never one without the other. */
export interface Emitter {
  light: Light;
  sprites: Sprite[];
}

const FULL_UV: UVRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

/**
 * Where the light sits relative to its own painted quad, as a FRACTION of the
 * quad's size.
 *
 * Derived rather than dialled. A billboard's surface normal is the view
 * direction, which at the shipping 55 degree tilt is (0, 0.819, 0.574). Put
 * the light in the quad's own plane and every fragment above it faces 90
 * degrees away and goes BLACK — a flame with a bright waist and a dark tongue.
 * Offset it forward and up by these fractions and N·L is ~1.0 at the centre
 * and never below about 0.8 at any corner, so the sprite lights evenly.
 *
 * Fractions rather than tiles because the derivation is scale-invariant: shrink
 * the quad and the offsets shrink with it, which is what keeps a 0.28-tile
 * mushroom's light sitting ON the mushroom rather than a third of a tile in
 * front of it.
 */
export const GLOW_FRONT = 0.75;
export const GLOW_LIFT = 0.65;

/** The light's position for a glow of `size` centred at `centre`. */
export function glowLightPosition(centre: Vec3, size: number): Vec3 {
  return { x: centre.x, y: centre.y + size * GLOW_FRONT, z: centre.z + size * GLOW_LIFT };
}

export interface EmitterOptions {
  /** Linear-light colour. Well below the lantern's, deliberately. */
  colour?: RGB;
  intensity?: number;
  /** Tiles. THE number that decides whether this is cheap. Keep it small. */
  reach?: number;
  /** Source size, for penumbra width. Unused while these do not cast. */
  radius?: number;
  /** Sprite edge length in tiles. */
  size?: number;
  /** Seconds. Drives flicker; a fixed value gives a fixed frame. */
  time?: number;
  /** Per-instance, so two sconces side by side do not flicker in lockstep. */
  seed?: number;
  /** Flicker depth, 0..1 of intensity. 0 is a perfectly steady light. */
  flicker?: number;
  textureId?: string;
  uv?: UVRect;
}

/**
 * Deterministic flicker, in `[1 - amount, 1 + amount]`.
 *
 * Three sines at incommensurable rates rather than a random number, for the
 * reason the whole engine keeps: a frame must be a pure function of state and
 * time. `Math.random` in a scene builder means two renders of the same moment
 * differ, which makes every pixel-diff measurement in this project impossible
 * — and pixel diffs are how the real bugs here have been found.
 *
 * The rates are deliberately unequal and non-harmonic (11.3 / 6.7 / 19.1) so
 * the sum has no audible period; equal or harmonic rates give a pulse that the
 * eye locks onto immediately and reads as a strobe rather than as a flame.
 */
export function flicker(seed: number, t: number, amount = 0.12): number {
  if (amount <= 0) return 1;
  const a = Math.sin(t * 11.3 + seed * 1.7);
  const b = Math.sin(t * 6.7 + seed * 4.1);
  const c = Math.sin(t * 19.1 + seed * 2.3);
  return 1 + amount * (a * 0.5 + b * 0.35 + c * 0.15);
}

/**
 * The light half of an emitter: a faint, non-casting source at `centre`.
 *
 * Shared by all three emitters because the differences between a sconce, a
 * mushroom and a wisp are colour, reach and where they sit — not what kind of
 * light they are. One constructor is also the only way to be sure all of them
 * really do default to not casting, which is the promise §12.4 makes.
 */
export function emitterLight(centre: Vec3, o: EmitterOptions = {}): Light {
  const intensity = (o.intensity ?? 2) * flicker(o.seed ?? 0, o.time ?? 0, o.flicker ?? 0);
  return {
    position: centre,
    colour: o.colour ?? [1, 0.66, 0.32],
    intensity: Math.max(0, intensity),
    radius: o.radius ?? 0.12,
    reach: o.reach ?? 3.2,
    // BOTH, and they are not the same claim. `castsShadow: false` is what the
    // direct pass reads today. `indirectOnly` is the M5 routing flag, set now
    // so the scenes authored against this file do not all need revisiting when
    // the lattice arrives.
    castsShadow: false,
    indirectOnly: true,
  };
}

/**
 * The glowing quad, placed so its own light lands on it evenly.
 *
 * A BILLBOARD rather than a fixed face, even for something bolted to a wall.
 * A flame has no front; it presents itself to whoever is looking, and a fixed
 * +y face would be edge-on to the room lamp and behave oddly as the tilt
 * changes. It is also the orientation whose normal is the view direction,
 * which is what the GLOW_FRONT/GLOW_LIFT derivation above assumes.
 */
function glowSprite(centre: Vec3, textureId: string, size: number, uv: UVRect, tintA = 1): Sprite {
  return {
    // pivot y = 1 anchors the quad at its BASE, so `position.z` is the bottom
    // of the sprite and `centre.z` is its middle.
    position: { x: centre.x, y: centre.y, z: centre.z - size / 2 },
    size: { x: size, y: size },
    pivot: { x: 0.5, y: 1 },
    billboard: true,
    uv,
    textureId,
    tint: [1, 1, 1, tintA],
    layer: LAYER_PIECE,
  };
}

// -------------------------------------------------------------------------
// SCONCE / LIT TORCH — §12.4's first row, and the one that pays immediately
// -------------------------------------------------------------------------

export interface SconceOptions extends EmitterOptions {
  /** Height of the flame's centre above the board, in tiles. */
  height?: number;
}

/**
 * A flame on the front face of a wall block.
 *
 * `at` is the WALL TILE, not the floor tile in front of it. `wallBlockSprites`
 * puts a block's front face at board `y = at.y + 1` (the face is the plane
 * between the wall tile and the open tile in front of it), so the flame goes
 * there plus a hair, which is what keeps it painting after the face rather
 * than fighting it in the depth-free painter sort.
 *
 * Warm and SHORT. Reach 3.2 tiles means a sconce lights its own alcove and the
 * few tiles of corridor either side, and stops. That is the whole effect §12.2
 * is after: "a pinprick of green at the end of a corridor is what tells you
 * how dark the corridor is."
 */
export function sconceEmitter(at: Vec2, o: SconceOptions = {}): Emitter {
  const height = o.height ?? 0.5;
  const size = o.size ?? 0.34;
  // A hair proud of the face. sortKey scales y by 1024, so 0.02 of a tile is
  // 20 units of sort key — comfortably enough to break the tie, and far too
  // little to see.
  const y = at.y + 1.02;
  const centre: Vec3 = { x: at.x + 0.5, y, z: height };
  return {
    light: emitterLight(glowLightPosition(centre, size), {
      colour: [1, 0.56, 0.22],
      // The brightest of the three and now a ninth of the lantern. A sconce has
      // a job the others do not — it says the corridor continues — so it keeps
      // the most reach in this file, and that is still 2.2 tiles.
      //
      // MEASURED, not eyeballed, and twice. The first pass ran 1.6 over 2.8
      // tiles and read fine alone; put one on every wall face that has one and
      // the mean luminance of the board interior went up 15% and the darkness
      // was gone. 1.25 over 2.4 was the answer to that, and on a real floor it
      // was still worth 1.5% of the board's mean PER SCONCE — five times a
      // mushroom. A sconce is only faint relative to the lantern; a dozen of
      // them are not faint relative to each other, and the density they are
      // placed at is as much a part of "very tiny" as the intensity is.
      //
      // 0.55 over 2.0, with the flame's own `emissiveStrength` raised so the
      // fire still reads as fire. What a sconce is FOR is being seen from down
      // the corridor, and that is the sprite's job, not the light's.
      //
      // The number that settled it, from the decomposition below: at 0.85 a
      // sconce's LIGHT alone was still worth 0.93% of the board's mean each,
      // four times a mushroom's and three times a wisp's, and a sconce is the
      // emitter a corridor has many of.
      intensity: 0.55,
      reach: 2.0,
      radius: 0.1,
      flicker: 0.16,
      ...o,
    }),
    sprites: [glowSprite(centre, o.textureId ?? 'flame', size, o.uv ?? FULL_UV)],
  };
}

// -------------------------------------------------------------------------
// GLOWING MUSHROOM — static, cool, very faint, and it clusters
// -------------------------------------------------------------------------

/**
 * A mushroom standing on a floor tile.
 *
 * Cool green against the lantern's orange, which is the point: §12.2's real
 * argument for emitters is that a single light in a void has no scale, and a
 * colour the lantern cannot produce is the strongest possible statement that
 * the two are different lights rather than one light at two brightnesses.
 *
 * Reach 2.2 and intensity 1.1 — genuinely faint. A cluster of six of them is
 * six lights in about three bins, which before this milestone would have been
 * most of the entire frame's budget.
 */
export function mushroomEmitter(at: Vec2, o: EmitterOptions = {}): Emitter {
  const size = o.size ?? 0.28;
  const centre: Vec3 = { x: at.x, y: at.y, z: size / 2 };
  return {
    light: emitterLight(glowLightPosition(centre, size), {
      colour: [0.34, 1, 0.55],
      // VERY TINY, taken literally. Half a tile of usable reach and a
      // thirtieth of the lantern's intensity: it does not light the floor it
      // stands on so much as sit in the dark being green. Turn either number up
      // and it stops being a whisper and starts competing, which §12.2 says is
      // the one thing an emitter must not do.
      //
      // The cheapest of the three by a wide margin — eight of them were worth
      // 0.31% of the board's mean EACH against a sconce's 1.5% — so it is
      // trimmed rather than cut, and the trim buys headroom for the density to
      // stay where it is. Mushrooms are the emitter this art direction can
      // afford to have a lot of.
      intensity: 0.3,
      reach: 1.4,
      radius: 0.12,
      flicker: 0.05,
      ...o,
    }),
    sprites: [glowSprite(centre, o.textureId ?? 'mushroom', size, o.uv ?? FULL_UV)],
  };
}

// -------------------------------------------------------------------------
// DRIFTING WISP — the showcase, and the only one that moves
// -------------------------------------------------------------------------

/**
 * A wisp's drift, as a closed-form function of time.
 *
 * NOT a simulation with velocity and state. A pure `position(t)` is what lets
 * the harness pin the clock and render the exact same frame twice — the thing
 * every pixel-diff in this project depends on — and it is what lets the game's
 * reducer stay the only place with state in it.
 *
 * A TETHER, NOT A FENCE, and Paul asked for exactly that: *"they can kind of
 * drift out of the board a bit. that might look nice and play well against the
 * board/objects that might be on the table"*. So the radii are a leash rather
 * than a wall — a wisp wanders where it likes and is always on its way back,
 * and that is what makes it read as alive and local rather than as caged. It
 * is also the better picture: a pinprick of green over dark wood reads far
 * better than the same light inside the lantern's pool, and a wisp that can
 * leave the board is the strongest statement in the whole renderer that the
 * board is an OBJECT sitting in a room (§1.2) rather than the world.
 *
 * Containment is by construction rather than by clamping: the offset is a sum
 * of sines whose amplitudes total exactly 1, so `|x - p.x| <= radiusX` always,
 * with no restoring force to tune and no chance of a wisp escaping on a frame
 * nobody was looking at. Two octaves at incommensurable rates rather than one,
 * because a single sine per axis is an ellipse and the eye reads an ellipse as
 * a track within about two seconds.
 */
export interface WispPath {
  /** Centre of the drift, in tiles. */
  x: number;
  y: number;
  /** Leash length on each axis, in tiles. The wisp never exceeds it. */
  radiusX: number;
  radiusY: number;
  /** Mean height above the board, in tiles. */
  height: number;
  /** Radians per second on the x axis. Slow: these amble. */
  speed: number;
  seed: number;
}

/** Golden ratio, so the two axes never come back into phase. */
const PHI = 0.6180339887;

export function wispPosition(p: WispPath, t: number): Vec3 {
  const a = t * p.speed + p.seed * 1.7;
  const b = t * p.speed * PHI + p.seed * 4.3;
  // 0.62 + 0.38 = 1 exactly, which is the containment guarantee.
  const ox = 0.62 * Math.sin(a) + 0.38 * Math.sin(a * 2.31 + p.seed);
  const oy = 0.62 * Math.sin(b) + 0.38 * Math.sin(b * 1.77 + p.seed * 2.2);
  return {
    x: p.x + p.radiusX * ox,
    y: p.y + p.radiusY * oy,
    // A third rate again, and faster: a wisp that bobs on the same clock it
    // drifts on reads as a bead sliding along a wire.
    z: p.height + 0.16 * Math.sin(t * p.speed * 1.71 + p.seed * 2.9),
  };
}

/**
 * A wisp at time `t`. The one emitter whose light moves every frame.
 *
 * Which is exactly why it is the showcase for binning rather than merely a
 * pretty thing: a moving light re-bins every frame, so if the bin grid were
 * stale, mis-clamped or half a bin off, a wisp is what would show it — the
 * glow would detach from the sprite and lag behind it.
 *
 * LAYER_PIECE, and it matters most for the wisps that stray past the rim. The
 * table sorts at LAYER_TABLE, below the board, and a wisp out over the wood is
 * the one case in the whole scene where a sprite is above the table but not
 * above the board — so a y-sort alone would bury it. That case is why the
 * layer constants exist; see `test/emitters.test.ts`.
 */
export function wispEmitter(path: WispPath, t: number, o: EmitterOptions = {}): Emitter {
  const size = o.size ?? 0.3;
  const centre = wispPosition(path, t);
  return {
    light: emitterLight(glowLightPosition(centre, size), {
      colour: [0.55, 0.95, 0.85],
      // Tiny, and deliberately enough to land on the TABLE. A wisp drifting
      // past the rim throwing a small moving glow across the wood grain is
      // the payoff for letting them leave; a floating dot with no relationship
      // to what it is over would be worse than keeping them fenced in.
      //
      // MEASURED TWICE, in opposite directions, and both measurements stand.
      //
      // The first pass ran 0.7 over 1.9 tiles and the numbers said what the eye
      // could not: the core read at 100/255 against a 3.5 background and the
      // ring of table around it read 3.9 against 3.6 — a bright dot lighting
      // nothing. The board is half a tile PROUD of the table, so a wisp at 0.9
      // above the board is 1.4 above the wood, and 1.4 out of a 1.9-tile reach
      // is where the falloff window has already eaten four fifths of it. Reach
      // decides whether a light LANDS; it is not the same dial as intensity.
      //
      // Then 0.95 over 3.2 went the other way. Five of them on a real Hollow
      // Gate floor were raising the board's mean luminance by 8.6% ON THEIR
      // OWN — more than the sconces and the mushrooms combined, and more than
      // half of the 15.5% collective lift §18.1 item 2 objects to. A wisp had
      // become the brightest thing in this file, which is exactly backwards.
      //
      // So the reach keeps its job and the intensity gives up its second one.
      // 2.7 tiles still clears the 1.4-tile drop to the table with room to
      // spare, and 0.42 is a third of what it was. The sprite does not go with
      // it: `Material.emissiveStrength` is what makes a wisp VISIBLE, and it
      // went UP to compensate — which is the whole reason that field exists.
      intensity: 0.42,
      reach: 2.7,
      radius: 0.16,
      seed: path.seed,
      time: t,
      flicker: 0.18,
      ...o,
    }),
    sprites: [glowSprite(centre, o.textureId ?? 'wisp', size, o.uv ?? FULL_UV)],
  };
}

// -------------------------------------------------------------------------
// PLACEMENT — found, not scattered
// -------------------------------------------------------------------------

/**
 * Deterministic 0..1 from a tile coordinate. The same trick `art/tileArt.tsx`
 * uses for clutter, and for the same reason: a board must look identical every
 * frame and every session, and `Math.random` in a scene builder breaks every
 * pixel-diff measurement in this project.
 */
export function hashCoord(x: number, y: number, salt = 0): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

export interface MushroomSpotOptions {
  /** Fraction of eligible corners that actually grow one, 0..1. */
  density?: number;
  salt?: number;
}

/**
 * Open tiles that sit in a CORNER, which is where Paul asked for mushrooms.
 *
 * A corner is an open tile with two solid neighbours that are perpendicular to
 * each other — an actual angle. Two OPPOSITE solid neighbours is a corridor,
 * and a mushroom every two tiles down a corridor reads as a light fixture
 * somebody installed rather than as something that grew. `isSolid` answers
 * true off-grid, so the board's outer edge counts as wall and the outermost
 * open ring gets its corners too.
 *
 * Thinned by a coordinate hash rather than by a stride, so they cluster
 * unevenly the way growing things do — and identically every session.
 */
export function mushroomSpots(grid: OccluderGrid, o: MushroomSpotOptions = {}): Vec2[] {
  const density = o.density ?? 0.45;
  const salt = o.salt ?? 3;
  const out: Vec2[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (isSolid(grid, x, y)) continue;
      const n = isSolid(grid, x, y - 1);
      const s = isSolid(grid, x, y + 1);
      const w = isSolid(grid, x - 1, y);
      const e = isSolid(grid, x + 1, y);
      const corner = (n && w) || (n && e) || (s && w) || (s && e);
      if (!corner) continue;
      if (hashCoord(x, y, salt) > density) continue;
      // Tucked toward the angle rather than centred on the tile, so it looks
      // like it grew out of the join. A mushroom in the middle of an open
      // square is a decoration; one against the wall is scenery.
      out.push({
        x: x + 0.5 + (w ? -0.26 : e ? 0.26 : 0),
        y: y + 0.5 + (n ? -0.24 : s ? 0.24 : 0),
      });
    }
  }
  return out;
}

export interface WispPathOptions {
  count?: number;
  /** Leash length. Big enough that some of them cross the rim. */
  radius?: number;
  height?: number;
  speed?: number;
  salt?: number;
}

/**
 * Tethers for a board's wisps, deterministic from the board's own size.
 *
 * Centres are spread over the board and deliberately NOT kept away from the
 * edge: a leash of two-and-a-bit tiles on a centre near the rim is what lets a
 * wisp amble out over the table and back, which is the thing worth watching.
 * Nothing here consults the occupancy grid — a wisp is a floaty being and
 * passing over a wall block is fine; it is above them.
 */
export function wispPaths(grid: OccluderGrid, o: WispPathOptions = {}): WispPath[] {
  const count = o.count ?? 6;
  const radius = o.radius ?? 2.4;
  const salt = o.salt ?? 11;
  const out: WispPath[] = [];
  for (let i = 0; i < count; i++) {
    const hx = hashCoord(i + 1, 7, salt);
    const hy = hashCoord(3, i + 1, salt);
    const hs = hashCoord(i + 1, i + 1, salt + 5);
    out.push({
      // -0.5..1.5 of the board, so roughly a third of them are born near or
      // over the rim rather than all being interior.
      x: grid.width * (hx * 1.5 - 0.25),
      y: grid.height * (hy * 1.4 - 0.2),
      radiusX: radius * (0.7 + hs * 0.6),
      radiusY: radius * (0.55 + (1 - hs) * 0.5),
      // Low enough that the table is inside reach, high enough to clear the
      // wall blocks (0.66 to 0.79) it drifts over — a wisp that dips into a
      // block gets sliced by the block's top face and reads as a glitch.
      height: (o.height ?? 0.82) + hs * 0.3,
      // Slow, and all different. Wisps that share a speed pulse together and
      // read as one object with several parts.
      speed: (o.speed ?? 0.34) * (0.6 + hs * 0.9),
      seed: i * 1.618 + 0.37,
    });
  }
  return out;
}

// -------------------------------------------------------------------------
// PROCEDURAL PIXELS
//
// Same split as `scene/piece.ts`: pure functions over Uint8Array here, and
// `gl/procedural.ts` is the only thing that knows what a texture is. These are
// shapes made of arithmetic, so a change to a falloff shows up as a changed
// test rather than as a screenshot somebody has to remember.
// -------------------------------------------------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** smoothstep, the GLSL one, so the CPU and GPU shapes agree by construction. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

/**
 * A flame: a teardrop with a hot core, as RGBA8.
 *
 * The width profile is `t^0.55` tapered at the top, where `t` runs 0 at the
 * tip to 1 at the base. A plain ellipse reads as a leaf; what makes a flame a
 * flame is that it is widest around three quarters of the way down and comes
 * to a POINT, and the exponent below 1 is what puts the shoulder there.
 *
 * The colour ramp runs white-hot at the core to deep orange at the edge, and
 * it is the core that matters: this sprite is lit by its own light through the
 * normal shading path, so the bloom threshold only catches it where the albedo
 * is already near 1. A uniformly orange flame simply never blooms.
 */
export function flamePixels(size = 96): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const tip = 0.08;
  const base = 0.97;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const t = clamp01((v - tip) / (base - tip));
    // Widest near t = 0.8, pointed at t = 0.
    const halfWidth = 0.34 * Math.pow(t, 0.55) * (1 - 0.3 * t * t);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5;
      const d = halfWidth < 1e-4 ? 99 : Math.abs(u) / halfWidth;
      const a = 1 - smoothstep(0.55, 1, d);
      if (a <= 0.002) continue;
      // Hot in the middle and toward the base, cooling to the rim and the tip.
      const heat = clamp01((1 - d * 0.85) * (0.35 + 0.75 * t));
      const i = (y * size + x) * 4;
      px[i] = Math.round(255 * clamp01(0.55 + 0.45 * heat));
      px[i + 1] = Math.round(255 * clamp01(0.14 + 0.86 * heat * heat));
      px[i + 2] = Math.round(255 * clamp01(0.02 + 0.98 * Math.pow(heat, 5)));
      px[i + 3] = Math.round(255 * clamp01(a));
    }
  }
  return px;
}

/**
 * A mushroom: a domed cap on a pale stem, as RGBA8.
 *
 * The cap's UNDERSIDE is the brightest part and that is the whole read. A
 * uniformly glowing lump is a blob; light escaping from under a cap is a
 * mushroom, because the eye infers a shape from where the light is not.
 */
export function mushroomPixels(size = 96): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const capCx = 0.5;
  const capCy = 0.46;
  const capRx = 0.40;
  const capRy = 0.30;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const dx = (u - capCx) / capRx;
      const dy = (v - capCy) / capRy;
      // Upper half of an ellipse only — a full one is a ball, not a cap.
      const inCap = v <= capCy ? 1 - smoothstep(0.86, 1.02, Math.sqrt(dx * dx + dy * dy)) : 0;
      // Stem: a soft-edged column from the cap down to the board.
      const stemHalf = 0.085 + 0.035 * smoothstep(0.45, 0.98, v);
      const inStem = v > capCy - 0.04 && v < 0.985 ? 1 - smoothstep(0.7, 1.05, Math.abs(u - capCx) / stemHalf) : 0;
      const a = Math.max(inCap, inStem * 0.92);
      if (a <= 0.002) continue;
      // Brightest right under the cap's rim, falling off up over the dome.
      const rim = inCap > 0 ? clamp01(1 - (capCy - v) / (capRy * 1.15)) : clamp01(1 - (v - capCy) * 2.4);
      const glow = clamp01(0.25 + 0.75 * rim);
      const i = (y * size + x) * 4;
      px[i] = Math.round(255 * clamp01(0.16 + 0.7 * glow * glow));
      px[i + 1] = Math.round(255 * clamp01(0.42 + 0.58 * glow));
      px[i + 2] = Math.round(255 * clamp01(0.3 + 0.5 * glow * glow));
      px[i + 3] = Math.round(255 * clamp01(a));
    }
  }
  return px;
}

/**
 * THE WISP PROFILE, and the three numbers that decide whether it is a light or
 * a patch of fog. ENGINE_PLAN §18.1 item 3: they read as "large diffuse green
 * washes rather than as tiny drifting motes", and Paul asked for "very tiny"
 * twice.
 *
 * The fix runs the opposite way to the instinct. Making the sprite dimmer only
 * makes a dimmer fog; what reads as a LIGHT is the RATIO between a hot centre
 * and the glow around it. The eye judges "small and bright" from that contrast,
 * not from absolute brightness — so the halo shrinks hard, its weight comes
 * down, and the core is left to saturate.
 *
 * Concretely, at half the quad's radius the old profile still carried alpha
 * 0.19 (that is the fog: a fifth of full opacity, spread over the whole
 * sprite); this one carries 0.010, nineteen times less. The visible disc is
 * confined to about a third of the quad instead of two thirds, and what is
 * left is a point with a fringe.
 *
 * TWO gaussians rather than one is still the shape: a single falloff gives a
 * fuzzy ball with no centre. It is also the profile the bloom chain is
 * happiest with, because the core clears the threshold and the halo does not,
 * so the glow grows out of the sprite instead of doubling it.
 */
const WISP_CORE = 34;
const WISP_HALO = 13;
const WISP_HALO_WEIGHT = 0.25;

/**
 * A wisp: a hot radial core with a tight fringe, as RGBA8.
 */
export function wispPixels(size = 96): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const d = Math.sqrt(dx * dx + dy * dy);
      const core = Math.exp(-d * d * WISP_CORE);
      const halo = Math.exp(-d * d * WISP_HALO);
      // Cut to exactly zero at the rim, so a square sprite has no visible
      // corner where the halo is still faintly on.
      const edge = 1 - smoothstep(0.82, 1, d);
      const a = clamp01((core + halo * WISP_HALO_WEIGHT) * edge);
      if (a <= 0.002) continue;
      const i = (y * size + x) * 4;
      // The core saturates to WHITE rather than to a brighter green. A light is
      // white at its centre and coloured at its edge — that is what separates
      // "a green lamp" from "green mist", and the halo is now small enough that
      // the colour lives almost entirely in the fringe.
      px[i] = Math.round(255 * clamp01(0.4 + 0.6 * core));
      px[i + 1] = Math.round(255 * clamp01(0.8 + 0.2 * core));
      px[i + 2] = Math.round(255 * clamp01(0.62 + 0.38 * core));
      px[i + 3] = Math.round(255 * a);
    }
  }
  return px;
}
