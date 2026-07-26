// =========================================================================
// THE LIGHT ENGINE — actual light, computed, not painted by hand.
//
// Paul: "i want real lighting not cheap tricks."
//
// lighting.css says of itself, in writing, that its flicker is "the 'subtle
// little trick' version of turbulence" — two opacity animations at offset
// periods, stacked so the eye cannot find the loop. It looks good and it is
// honest about being a trick: nothing in that file knows where the light is,
// what is standing in front of it, or what a shadow is. Every glow in the
// game so far is a radial-gradient a human positioned by eye.
//
// This file is the other thing. It computes:
//
//   REAL FALLOFF     — inverse-square, the way light actually thins with
//                      distance, rather than a hand-tuned gradient stop.
//   REAL OCCLUSION   — the scene's actual geometry casts actual shadows.
//                      Every occluder is a rectangle read from the live DOM,
//                      so what blocks light on screen is exactly what the
//                      player can see blocking it.
//   REAL PENUMBRA    — a flame is an AREA, not a point. Sampling it across
//                      its width is why these shadows have soft edges that
//                      widen with distance from the caster. That is not a
//                      blur filter approximating softness; it is the reason
//                      softness exists, done the way it happens.
//   REAL FLICKER     — value noise with octaves, driving intensity AND the
//                      flame's position, because a flame leans as it gutters.
//                      Not a sine wave, and not two sine waves.
//
// The performance contract in lighting.css still holds and this obeys it by
// a different route: it is ONE canvas, drawn at half resolution, doing a
// bounded number of composite operations per frame — not a per-cell filter
// and not an animated SVG filter graph. See `renderLight` for the budget.
// =========================================================================

import { mergeOccluders } from './occluderMerge';

export interface Vec2 {
  x: number;
  y: number;
}

/** A rectangle that stops light. Screen space, relative to the canvas. */
export interface Occluder {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LightSource {
  /** Where the flame is, before flicker moves it. */
  pos: Vec2;
  /** How far the light still does anything, in px. Beyond this it is cut. */
  reach: number;
  /** Peak intensity at the flame, 0..1. */
  intensity: number;
  /**
   * The flame's physical size. THIS IS WHAT MAKES THE SHADOWS SOFT — a light
   * of zero size casts a knife-edge shadow, which is why point lights look
   * like cutouts. A real lantern flame is roughly this many px across at the
   * scale we draw the town, so the penumbra it throws is roughly correct.
   */
  size: number;
}

// -------------------------------------------------------------------------
// Noise — the flicker's actual source
// -------------------------------------------------------------------------

/**
 * Value noise, smoothly interpolated, seeded and deterministic.
 *
 * `Math.random()` per frame is the obvious way to flicker a flame and it is
 * wrong: it has no temporal coherence, so the light buzzes like a fault in
 * the wiring instead of guttering. Noise is continuous in time — sample it at
 * t and t+dt and you get two *related* values, which is what makes the result
 * read as one flame moving rather than a strobe.
 */
function hash1(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise1D(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  // Smoothstep between integer samples — C1 continuous, so no visible kinks
  // at the sample boundaries (linear interpolation ticks audibly, so to speak).
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

/**
 * Fractal noise: octaves at doubling frequency and halving amplitude.
 *
 * One octave is a slow wander. Four gives a flame: a slow lean with fast
 * guttering riding on top of it, which is what fire actually does and what a
 * pair of stacked sine waves can only imitate from a distance.
 */
export function fractalNoise(t: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise1D(t * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Tileable 2D value noise. Periodic on `period` so the tile seams vanish. */
function hash2(x: number, y: number, period: number): number {
  const xi = ((x % period) + period) % period;
  const yi = ((y % period) + period) % period;
  const s = Math.sin(xi * 127.1 + yi * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function tileNoise2D(x: number, y: number, period: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, period);
  const b = hash2(ix + 1, iy, period);
  const c = hash2(ix, iy + 1, period);
  const d = hash2(ix + 1, iy + 1, period);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

// -------------------------------------------------------------------------
// Murk — what makes the dark a place rather than an absence
// -------------------------------------------------------------------------

/**
 * Bake one tileable cloud of murk.
 *
 * Paul: "I would really like the shadows to look and act more like shadows.
 * Maybe kind of swirly and mysterious. It's just kind of black right now."
 *
 * He is right, and the reason is physical rather than artistic: a shadow
 * rendered as flat darkness is a shadow in a VACUUM. Real dark has air in it —
 * dust, damp, smoke off the lantern — and that air is what a shadow is
 * actually made of. It drifts, so the dark drifts, and the eye reads depth
 * from the drifting.
 *
 * Baked ONCE into a repeating tile rather than evaluated per pixel per frame:
 * 3-octave 2D noise over a screenful, every frame, is six figures of
 * `Math.sin` and would eat the entire budget. A tile scrolled under a
 * transform costs one `fillRect` and the GPU does the rest. The swirl comes
 * from compositing two copies moving against each other (see `drawMurk`) —
 * that counter-motion is what stops it reading as wallpaper sliding past.
 */
export function bakeMurk(size = 160, seed = 0): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return c;
  const img = g.createImageData(size, size);
  const PERIOD = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * PERIOD + seed;
      const v = (y / size) * PERIOD + seed;
      // Three octaves: big slow banks of murk with finer wisps riding on them.
      let n =
        tileNoise2D(u, v, PERIOD) * 0.6 +
        tileNoise2D(u * 2, v * 2, PERIOD * 2) * 0.28 +
        tileNoise2D(u * 4, v * 4, PERIOD * 4) * 0.12;
      // Push it toward wisps rather than an even fog: a gentle curve leaves
      // most of the tile thin and a few places genuinely thick, which is how
      // haze in a still room actually distributes.
      n = Math.pow(n, 1.7);
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(n * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * Two counter-drifting copies of the murk, composited into whatever darkness
 * is already on the canvas.
 *
 * `source-atop` is the whole trick. It draws ONLY where the canvas already has
 * something — which, by the time this runs, is exactly the night and the
 * shadows and nothing else. The lit pool has been cut to transparent, so the
 * murk cannot touch it. Nothing has to be masked and no second buffer exists:
 * the darkness is its own mask, and the shadows get their swirl for free
 * because a shadow IS darkness by this point in the frame.
 *
 * One pass is lighter than the night and one is darker. That is the difference
 * between "fog" and "murk": a single lightening pass just greys the shadow
 * out, but a lightening pass and a deepening pass drifting through each other
 * make the dark look like it has a near side and a far side.
 */
export function drawMurk(
  ctx: CanvasRenderingContext2D,
  murk: MurkTiles,
  width: number,
  height: number,
  t: number,
  strength: number,
): void {
  const passes: [CanvasImageSource, number, number, number, number][] = [
    // tile, scale, drift x px/s, drift y px/s, alpha share
    [murk.haze, 1.0, 5.5, -3.2, 0.62],
    [murk.deep, 1.7, -3.1, 2.4, 0.75],
  ];
  ctx.globalCompositeOperation = 'source-atop';
  for (const [tile, scale, dx, dy, share] of passes) {
    const s = murk.size * scale;
    ctx.save();
    // Wrap the offset into one tile so the transform never grows without
    // bound over a long session (a float that keeps climbing eventually
    // loses the precision the pattern needs and the murk starts to judder).
    const ox = ((t * dx) % s + s) % s;
    const oy = ((t * dy) % s + s) % s;
    ctx.globalAlpha = strength * share;
    ctx.translate(ox - s, oy - s);
    for (let y = 0; y < height + s * 2; y += s) {
      for (let x = 0; x < width + s * 2; x += s) {
        ctx.drawImage(tile, x, y, s, s);
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export interface MurkTiles {
  /** Lighter than the night: haze the lantern is catching from the far side. */
  haze: HTMLCanvasElement;
  /** Deeper than the night: the places the air is thick. */
  deep: HTMLCanvasElement;
  size: number;
}

/** Colour one baked murk tile through its own alpha. Done once, not per frame. */
function tintMurk(src: HTMLCanvasElement, colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  if (!g) return c;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Bake the pair once. Two different seeds, or they drift in lockstep. */
export function bakeMurkTiles(size = 160): MurkTiles {
  return {
    haze: tintMurk(bakeMurk(size), 'rgb(122, 138, 175)'),
    deep: tintMurk(bakeMurk(size, 1.9), 'rgb(2, 3, 8)'),
    size,
  };
}

// -------------------------------------------------------------------------
// Shadow geometry
// -------------------------------------------------------------------------

/**
 * The shadow one edge throws, as a polygon.
 *
 * Standard 2D shadow volume: take the edge's two endpoints, push each one
 * directly away from the light, and the quad between them is the region the
 * edge hides — the actual geometry of "light travels in straight lines".
 *
 * `far` is FINITE and that is a physical claim, not a cheat. A shadow volume
 * extended to infinity is only correct in a vacuum with one light. In a real
 * square, light bounces off the ground, the walls and the fog, and fills a
 * shadow back in over distance; past a few metres from the caster there is no
 * usable shadow left. Projecting to infinity here is exactly what made the
 * first version render the entire town pitch black below the top row of
 * cards: technically correct, and a picture of nothing.
 */
function shadowQuad(a: Vec2, b: Vec2, light: Vec2, far: number): Vec2[] {
  const push = (p: Vec2): Vec2 => {
    const dx = p.x - light.x;
    const dy = p.y - light.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * far, y: p.y + (dy / len) * far };
  };
  return [a, b, push(b), push(a)];
}

/**
 * The edges of a rectangle that actually face the light.
 *
 * Only front faces cast — including the back ones would have the box shadow
 * itself, which shows up as the shadow starting one box-width too late.
 */
function facingEdges(o: Occluder, light: Vec2): [Vec2, Vec2][] {
  const l = { x: o.x, y: o.y };
  const r = { x: o.x + o.w, y: o.y };
  const br = { x: o.x + o.w, y: o.y + o.h };
  const bl = { x: o.x, y: o.y + o.h };
  const edges: [Vec2, Vec2][] = [];
  if (light.y < o.y) edges.push([l, r]);
  if (light.y > o.y + o.h) edges.push([bl, br]);
  if (light.x < o.x) edges.push([l, bl]);
  if (light.x > o.x + o.w) edges.push([r, br]);
  return edges;
}

// -------------------------------------------------------------------------
// The frame
// -------------------------------------------------------------------------

/** How many points across the flame we sample. See the comment in `renderLight`. */
const FLAME_SAMPLES = 7;

/**
 * How many when the player has asked for no motion.
 *
 * Higher, not lower, and the reason is the whole argument for `flameSpin`
 * below. Seven samples make seven discrete steps of penumbra; with motion on,
 * the spin smears them across frames and the eye integrates a smooth edge.
 * Frozen, there are no other frames to smear into, so the steps are all there
 * ever is and they band. More samples is the only remaining answer — and it
 * is free, because a still frame is drawn ONCE. The rAF loop is not running:
 * see LightLayer.
 */
const REDUCED_FLAME_SAMPLES = 11;

/**
 * Where on the flame each sample sits — spread over a DISC, not along a line.
 *
 * Paul: "the lighting still looks a little broken on the map... there are
 * partially lit tiles with a diagonal line through them."
 *
 * That diagonal was this function's predecessor. It placed every sample on one
 * straight line through the source — `{ x: src.x + spread, y: src.y + spread *
 * 0.3 }` — which does not model a flame, it models a glowing STICK lying at a
 * fixed angle. And a stick-shaped light has a very specific failure: an edge
 * running PARALLEL to it is projected to the same place by every sample, so it
 * gets no penumbra whatsoever and comes out knife-sharp, while edges across it
 * soften normally. The penumbra was anisotropic, and every hard shadow edge in
 * the game lay along the same diagonal — the one the stick was pointing down.
 *
 * A real flame has extent in both directions, so the samples need to cover an
 * area. This is a Vogel spiral: `theta` steps by the golden angle and the
 * radius grows as sqrt(i/n), which distributes n points over a disc with equal
 * area per point and no clumping or banding at any n. Every edge orientation
 * now sees the same spread of the source, so every shadow softens the same
 * amount regardless of which way it happens to run.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function flameSample(src: Vec2, size: number, i: number, n: number, rotation = 0): Vec2 {
  // +0.5 keeps the first sample off the exact centre, so no single sample is
  // privileged and the set stays symmetric about the flame.
  const r = Math.sqrt((i + 0.5) / n) * (size / 2);
  const theta = i * GOLDEN_ANGLE + rotation;
  return { x: src.x + Math.cos(theta) * r, y: src.y + Math.sin(theta) * r };
}

/** Rad/s the sample disc turns at. A full revolution in about seven seconds. */
const FLAME_SPIN_RATE = 0.9;

/**
 * The orientation the sample disc sits at when the light is frozen.
 *
 * Any value off the axes; the point is only that it is not zero, which would
 * put sample 0 due east of the flame and hand every vertical wall on screen
 * the same phase of the banding.
 */
const FIXED_SPIN = 0.7;

/**
 * How far round the sample disc has turned by now.
 *
 * SEVEN SAMPLES IS SEVEN STEPS. The penumbra is built by cutting N shadows at
 * partial alpha, so its gradient has exactly N levels in it — and with the
 * sample angles fixed, each level lands in the same place on screen every
 * frame. Fixed steps in a fixed place are a visible contour: the soft edge
 * gets a faint ribbing, strongest at the corners where several edges' penumbrae
 * overlap, which is the other half of the fan of lines Paul keeps reporting.
 *
 * Turning the disc moves where each step falls, so over two or three frames
 * the eye integrates the levels into a continuous ramp. This is temporal
 * dithering, and it is the same bargain the sample count already makes: the
 * cost of a smooth edge is paid in samples, and frames are samples that are
 * already free.
 *
 * A STEADY turn plus a noise wobble, not noise alone. Noise alone never
 * guarantees the disc visits every orientation, and can sit near one for
 * seconds at a time — which is the banding back again, just intermittently.
 * The steady term covers the full circle on a known period; the wobble keeps
 * it from being a metronome, on the same argument `fractalNoise` exists for.
 */
export function flameSpin(timeSeconds: number, animate = true): number {
  if (!animate) return FIXED_SPIN;
  const steady = (timeSeconds * FLAME_SPIN_RATE) % (Math.PI * 2);
  return steady + (fractalNoise(timeSeconds * 0.8 + 13.1) - 0.5) * 1.2;
}

/**
 * How much light survives in full shadow — the bounce term.
 *
 * Nothing outdoors is ever at zero. Light off the ground and the surrounding
 * walls fills shadow back in, and a scene rendered without that reads as a
 * cutout on black rather than as a lit place. 0.34 is enough to keep faces
 * and text readable inside a shadow while still making the shadow obvious.
 */
const AMBIENT_FLOOR = 0.34;

/** How far a shadow stays useful before bounce light has refilled it, in px. */
const SHADOW_LENGTH = 190;

/**
 * The colour of unlit ground.
 *
 * Not black. Night outdoors is a desaturated blue — the eye's own low-light
 * response plus skylight — and darkening a warm painting toward pure black
 * greys it out, while darkening it toward this keeps it looking like a place
 * at night rather than a photo with the brightness pulled down.
 */
const NIGHT: [number, number, number] = [6, 9, 18];

/**
 * Draw one frame of real light into `ctx`.
 *
 * THE METHOD, and why it is one canvas rather than seven:
 *
 * Soft shadows are normally done by rendering the scene once per light sample
 * and averaging, which means N offscreen buffers. There is a cheaper identity
 * available. Penumbra IS "the fraction of the light source this point can
 * see" — so if each of the N flame samples cuts its own shadow out of the
 * SAME light layer with `destination-out` at partial alpha, a point in full
 * shadow gets cut N times and a point that can see part of the flame gets cut
 * fewer. The gradation falls out of the geometry for free.
 *
 * Per-sample alpha is chosen so N cuts leave `ambient`: (1-a)^N = ambient.
 * Budget per frame: one gradient fill + (N x facing edges) polygon fills on a
 * half-resolution canvas. No filters, no blend-mode read-back, no per-cell
 * anything.
 *
 * REACH CULLING is what makes this usable on a dungeon floor rather than only
 * on a screenful of UI cards. A floor is ~250 cells and most of them are wall;
 * handing all of them in would be ~250 boxes x 2 faces x 7 samples of polygon
 * fill per frame, which is the one way to lose the frame budget here. A wall
 * further from the flame than the light reaches cannot occlude anything that
 * is lit, so it is dropped before any geometry is computed. What survives is
 * the handful of walls actually around the hero.
 *
 * MERGING is what makes the survivors look like walls rather than like a row
 * of boxes pretending to be one. A straight run of grid cells becomes a single
 * rectangle before anything is cast, which removes both the doubled-up dark
 * seams between overlapping cells and the leaked bright ones between gapped
 * cells — and cuts the polygon count on that wall by roughly five to one.
 * See `occluderMerge.ts`, which is where the argument lives.
 */
export function renderLight(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  light: LightSource,
  occluders: Occluder[],
  timeSeconds: number,
  animate: boolean,
  /** Light left in full shadow. Lower is a harsher, more enclosed place. */
  ambient: number = AMBIENT_FLOOR,
  /** How dark unlit ground gets, 0..1. Never 1 — see NIGHT. */
  maxDarkness: number = 0.62,
  /** Baked once by the caller. Omit and the dark is flat. */
  murk?: MurkTiles,
  /**
   * How thick the air is, 0..1.
   *
   * A room and a wilderness are not the same amount of fog, and this is the
   * knob that says so. Paul on the battlefield: "I do like the fog in battle.
   * But I just can't see anything." Murk is atmosphere until it is between the
   * player and the thing he is trying to fight, and then it is a blindfold.
   */
  murkStrength: number = 0.5,
  /**
   * Collapse runs of occluders into single rectangles before casting.
   *
   * On by default and there is no good reason to turn it off in the game —
   * it exists so the seams it removes can be MEASURED rather than described.
   * A test that only checks the merged path is green whether or not the bug
   * was ever there; one that can run both proves the old geometry alternated
   * and the new one does not. Doubles as the `?light=debug` switch for looking
   * at what the raw DOM sweep actually handed in.
   */
  mergeRuns: boolean = true,
): {
  flicker: number;
  lean: number;
  bob: number;
  /** Occluders near enough to matter, before merging. */
  casters: number;
  /** Rectangles actually cast from. The polygon budget is this x faces x samples. */
  merged: number;
  /** Where the sample disc is pointing this frame. See `flameSpin`. */
  spin: number;
  src: Vec2;
} {
  ctx.clearRect(0, 0, width, height);

  // --- flicker ---------------------------------------------------------
  // Frozen at its bright resting value when the player asked for no motion —
  // the same bargain lighting.css §9 makes: the light stays, the movement goes.
  const n1 = animate ? fractalNoise(timeSeconds * 1.7) : 0.5;
  const n2 = animate ? fractalNoise(timeSeconds * 1.1 + 31.7) : 0.5;
  const n3 = animate ? fractalNoise(timeSeconds * 2.3 + 71.3) : 0.5;
  // Intensity guttering: never dips below ~78%, because a lantern that nearly
  // goes out reads as a fault rather than as a flame.
  const flicker = 0.78 + n1 * 0.22;
  // The flame LEANS. A couple of px is enough — it is what stops the shadows
  // from looking painted on, because every shadow in the scene swings with it.
  const lean = animate ? (n2 - 0.5) * 7 : 0;
  const bob = animate ? (n3 - 0.5) * 4 : 0;
  const src: Vec2 = { x: light.pos.x + lean, y: light.pos.y + bob };

  const reach = light.reach * (0.94 + n1 * 0.06);
  const peak = light.intensity * flicker;

  // --- the light itself -------------------------------------------------
  //
  // THIS LAYER IS DARKNESS, NOT LIGHT, and that is the correction that matters.
  //
  // The first version painted a warm radial gradient and composited it with
  // `plus-lighter`. Every bit of the physics under it was right and the result
  // still looked, in Paul's words, like "a yellow circle. not real lighting
  // effects" — because ADDING a coloured disc to a dark scene produces a
  // coloured disc, whatever maths chose its profile. Real light does not
  // deposit colour on a room; it makes visible what the dark was hiding.
  //
  // So the canvas is filled with night, and the light CUTS THE NIGHT AWAY.
  // Where the lantern reaches, the art underneath comes through at its own
  // colour; where it does not, the night stays. Shadows put night back. The
  // layer therefore composites as ordinary darkness rather than as glow, and
  // there is no disc to see because there is no disc being drawn.
  const night = `${NIGHT[0]}, ${NIGHT[1]}, ${NIGHT[2]}`;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(${night}, ${maxDarkness.toFixed(4)})`;
  ctx.fillRect(0, 0, width, height);

  // Cut the lit region out of the night.
  //
  // The profile is inverse-square MULTIPLIED BY A SMOOTH WINDOW that reaches
  // exactly zero at `reach`. The window is not cosmetic: 1/(1+14d^2) is still
  // 0.067 at the rim, and a gradient whose last stop drops from 0.067 to 0 has
  // a STEP IN IT. That step, drawn as a circle, was the visible hard edge —
  // the actual mechanism behind "it just looks like a yellow circle". Physics
  // gives the falloff; the window is what makes it end honestly.
  const grad = ctx.createRadialGradient(src.x, src.y, 0, src.x, src.y, reach);
  for (let i = 0; i <= 16; i++) {
    const d = i / 16;
    const falloff = 1 / (1 + 14 * d * d);
    const window = Math.pow(Math.max(0, 1 - d * d), 2);
    const lit = Math.min(1, peak * falloff * window * 3.2);
    grad.addColorStop(d, `rgba(0, 0, 0, ${lit.toFixed(4)})`);
  }
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Handed back so the VISIBLE lamp can be driven by this exact number. A
  // painted lantern bobbing on its own CSS animation while its pool guttered
  // on a different clock would be two lights pretending to be one — the very
  // disagreement this engine exists to remove.
  const spin = flameSpin(timeSeconds, animate);
  const out = { flicker, lean, bob, casters: 0, merged: 0, spin, src };

  // Only what the light can actually reach. Distance to the box, not to its
  // centre, so a long wall running past the hero is not dropped because its
  // midpoint happens to be far away.
  const near = occluders.filter((o) => {
    const dx = Math.max(o.x - src.x, 0, src.x - (o.x + o.w));
    const dy = Math.max(o.y - src.y, 0, src.y - (o.y + o.h));
    return dx * dx + dy * dy <= reach * reach;
  });
  // Cull first, THEN merge: culling is a filter over every wall on the floor
  // and merging is a sort, so the cheap pass belongs on the big list.
  const cast = mergeRuns ? mergeOccluders(near) : near;
  out.casters = near.length;
  out.merged = cast.length;

  // --- shadows ----------------------------------------------------------
  // Shadows PUT NIGHT BACK, now that the layer is darkness. Same identity as
  // before, inverted: each flame sample restores a share of the night, so a
  // point that can see none of the flame ends up fully dark and one that sees
  // part of it lands in between.
  //
  // The sample COUNT is the only thing that changes when motion is off, and
  // the floor does not move with it: `ambient^(1/N)` is solved for whatever N
  // is in hand, so N cuts still leave exactly `ambient` either way. A still
  // frame is a smoother shadow, not a darker one.
  const samples = animate ? FLAME_SAMPLES : REDUCED_FLAME_SAMPLES;
  const cutAlpha = 1 - Math.pow(Math.max(0.001, ambient), 1 / samples);
  ctx.globalCompositeOperation = 'source-over';

  for (let s = 0; s < samples; s++) {
    // Sample over the flame's AREA. This spread IS the penumbra: widen it and
    // every shadow edge in the scene softens, exactly as it would if you
    // swapped a candle for a lamp. Over a disc rather than along a line, so
    // that softening does not depend on which way the edge happens to run —
    // see `flameSample`.
    // `spin` turns the whole disc a little every frame, so the N steps of
    // penumbra do not land in the same place twice and the eye integrates them
    // into a smooth edge instead of reading them as contours. See `flameSpin`.
    const sample = flameSample(src, light.size, s, samples, spin);
    ctx.globalAlpha = cutAlpha;
    for (const o of cast) {
      for (const [a, bEdge] of facingEdges(o, sample)) {
        const mid = { x: (a.x + bEdge.x) / 2, y: (a.y + bEdge.y) / 2 };
        // Each shadow REACHES on its own clock. Bounce light is not a constant
        // — the lantern gutters, and the distance at which the fill light wins
        // moves with it — so a scene of shadows that all end at exactly the
        // same radius, frozen, is the tell that they were drawn rather than
        // cast. Seeded off the edge's own midpoint so neighbouring walls
        // breathe out of step instead of pulsing together like one animation.
        const seed = (mid.x * 0.31 + mid.y * 0.17) % 97;
        const far = SHADOW_LENGTH * (animate ? 0.78 + fractalNoise(timeSeconds * 0.55 + seed, 3) * 0.44 : 1);
        const quad = shadowQuad(a, bEdge, sample, far);
        // The shadow FADES along its own length rather than ending on a hard
        // line. Bounce light does not switch on at a fixed distance, and a
        // shadow quad filled flat leaves a visible straight edge across the
        // scene where the polygon stops.
        const dx = mid.x - sample.x;
        const dy = mid.y - sample.y;
        const len = Math.hypot(dx, dy) || 1;
        const fade = ctx.createLinearGradient(
          mid.x,
          mid.y,
          mid.x + (dx / len) * far,
          mid.y + (dy / len) * far,
        );
        fade.addColorStop(0, `rgba(${night}, ${maxDarkness.toFixed(3)})`);
        fade.addColorStop(0.45, `rgba(${night}, ${(maxDarkness * 0.72).toFixed(3)})`);
        fade.addColorStop(1, `rgba(${night}, 0)`);
        ctx.fillStyle = fade;
        ctx.beginPath();
        ctx.moveTo(quad[0].x, quad[0].y);
        for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  ctx.globalAlpha = 1;

  // --- murk -------------------------------------------------------------
  // Last, and only into what is already dark. See `drawMurk`: the lit pool was
  // cut to transparent several steps ago, so `source-atop` cannot reach it and
  // the shadows — which by now ARE the darkness — get the swirl for nothing.
  if (murk && murkStrength > 0) drawMurk(ctx, murk, width, height, animate ? timeSeconds : 0, murkStrength);

  ctx.globalCompositeOperation = 'source-over';
  return out;
}
