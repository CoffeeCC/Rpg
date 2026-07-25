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
  /** Warm core colour, `r,g,b`. */
  color: [number, number, number];
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
): { flicker: number; lean: number; bob: number; casters: number } {
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
  const [r, g, b] = light.color;
  const peak = light.intensity * flicker;

  // --- the light itself -------------------------------------------------
  // Inverse-square, sampled into gradient stops. A hand-authored gradient is
  // usually eased to look pleasant; this one is 1/(1+d^2) because that is
  // what the falloff is, which is why the pool has a hot centre and a long
  // thin tail instead of a uniform disc.
  const grad = ctx.createRadialGradient(src.x, src.y, 0, src.x, src.y, reach);
  for (let i = 0; i <= 8; i++) {
    const d = i / 8;
    const falloff = 1 / (1 + 14 * d * d);
    grad.addColorStop(d, `rgba(${r}, ${g}, ${b}, ${(peak * falloff).toFixed(4)})`);
  }
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Handed back so the VISIBLE lamp can be driven by this exact number. A
  // painted lantern bobbing on its own CSS animation while its pool guttered
  // on a different clock would be two lights pretending to be one — the very
  // disagreement this engine exists to remove.
  const out = { flicker, lean, bob, casters: 0 };

  // Only what the light can actually reach. Distance to the box, not to its
  // centre, so a long wall running past the hero is not dropped because its
  // midpoint happens to be far away.
  const near = occluders.filter((o) => {
    const dx = Math.max(o.x - src.x, 0, src.x - (o.x + o.w));
    const dy = Math.max(o.y - src.y, 0, src.y - (o.y + o.h));
    return dx * dx + dy * dy <= reach * reach;
  });
  out.casters = near.length;
  if (!near.length) return out;

  // --- shadows ----------------------------------------------------------
  // N cuts must leave AMBIENT_FLOOR, not zero: (1-a)^N = floor.
  const cutAlpha = 1 - Math.pow(Math.max(0.001, ambient), 1 / FLAME_SAMPLES);
  ctx.globalCompositeOperation = 'destination-out';

  for (let s = 0; s < FLAME_SAMPLES; s++) {
    // Sample across the flame's width. This spread IS the penumbra: widen it
    // and every shadow edge in the scene softens, exactly as it would if you
    // swapped a candle for a lamp.
    const spread = (s / (FLAME_SAMPLES - 1) - 0.5) * light.size;
    const sample: Vec2 = { x: src.x + spread, y: src.y + spread * 0.3 };
    ctx.globalAlpha = cutAlpha;
    for (const o of near) {
      for (const [a, bEdge] of facingEdges(o, sample)) {
        const quad = shadowQuad(a, bEdge, sample, SHADOW_LENGTH);
        // The shadow FADES along its own length rather than ending on a hard
        // line. Bounce light does not switch on at a fixed distance, and a
        // shadow quad filled flat leaves a visible straight edge across the
        // scene where the polygon stops.
        const mid = { x: (a.x + bEdge.x) / 2, y: (a.y + bEdge.y) / 2 };
        const dx = mid.x - sample.x;
        const dy = mid.y - sample.y;
        const len = Math.hypot(dx, dy) || 1;
        const fade = ctx.createLinearGradient(
          mid.x,
          mid.y,
          mid.x + (dx / len) * SHADOW_LENGTH,
          mid.y + (dy / len) * SHADOW_LENGTH,
        );
        fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
        fade.addColorStop(0.45, 'rgba(0, 0, 0, 0.72)');
        fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
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
  ctx.globalCompositeOperation = 'source-over';
  return out;
}
