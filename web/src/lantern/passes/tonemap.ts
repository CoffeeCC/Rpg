// =========================================================================
// TONEMAPPING — getting an HDR scene onto an 8-bit display without lying
// about what colour the lantern was.
//
// The scene is rendered in linear RGBA16F with values well above 1: a flame
// is genuinely twenty times brighter than the wall it lights. The display
// takes [0,1]. Something has to do the compression, and WHICH something is
// not a detail — it is the single biggest influence on what the game's
// colour looks like, applied to every pixel of every frame.
//
// AgX, not ACES. The reason is specific to this game rather than general
// (ENGINE_PLAN §9.6): ACES skews bright saturated warm colours toward yellow
// and then to white. Everdusk is a dark game lit by a warm lantern, so the
// pixels ACES handles worst are the pixels the entire art direction is made
// of. AgX desaturates highlights the way film does — the hue survives much
// further up the exposure range before it washes to white.
//
// `acesNarkowicz` below is kept deliberately. It is not used to render
// anything; it exists so the claim above is a MEASUREMENT in the test suite
// rather than an assertion in a comment. Same argument as `mergeRuns=false`
// in the light engine: a test that cannot run the rejected alternative cannot
// prove the choice was right.
// =========================================================================

export type RGB = [number, number, number];

// -------------------------------------------------------------------------
// AgX
// -------------------------------------------------------------------------

/**
 * The AgX inset matrix.
 *
 * This is the step that does the real work, and it is worth understanding
 * rather than pasting. It pulls the primaries INWARD — mixing each channel
 * with a little of the others before the curve is applied. That deliberate
 * desaturation is what stops a channel from clipping on its own while the
 * others are still climbing, which is exactly the mechanism behind ACES's
 * hue twist: when red pins at 1.0 and green keeps rising, orange becomes
 * yellow. Inset first, curve second, then undo the inset.
 *
 * STORED ROW-MAJOR, and that is worth a warning because it is the one way to
 * get this silently wrong. Every published copy of these numbers is a GLSL
 * `mat3(...)` literal, and GLSL constructors are COLUMN-major — so pasting the
 * literal into a row-major array transposes the matrix. Nothing crashes and
 * the image still looks broadly like a tonemap; what happens is that neutral
 * stops mapping to neutral and every grey in the game picks up a colour cast.
 *
 * The check is the row sums. Read correctly they are 1.0, which is exactly the
 * statement "a neutral input stays neutral". Transposed they come out 0.927 /
 * 1.035 / 1.037, and white renders pink. `tonemap.test.ts` asserts the row
 * sums for this reason.
 */
export const AGX_INSET: number[] = [
  0.842479062253094, 0.0784335999999992, 0.0792237451477643,
  0.0423282422610123, 0.878468636469772, 0.0791661274605434,
  0.0423756549057051, 0.0784336, 0.879142973793104,
];

/** Undoes the inset after the curve, restoring saturation to the midtones. Row-major. */
export const AGX_OUTSET: number[] = [
  1.19687900512017, -0.0980208811401368, -0.0990297440797205,
  -0.0528968517574562, 1.15190312990417, -0.0989611768448433,
  -0.0529716355144438, -0.0980434501171241, 1.15107367264116,
];

/**
 * The exposure window, in stops around middle grey.
 *
 * ~16.5 stops. Everything below `MIN_EV` is black and everything above
 * `MAX_EV` is paper white; the curve lives between them. This range is why
 * AgX suits a game that lives in shadow — the long bottom end means the dark
 * parts of the frame get most of the curve rather than being crushed.
 */
export const AGX_MIN_EV = -12.47393;
export const AGX_MAX_EV = 4.026069;

function mul3(m: number[], v: RGB): RGB {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/**
 * The sigmoid, as a degree-6 polynomial fit.
 *
 * A polynomial rather than the real piecewise curve because this runs per
 * pixel per frame and the fit is visually indistinguishable. It is only valid
 * on [0,1] — outside that the polynomial diverges hard, which is why the log
 * encode above it clamps rather than trusting the input.
 */
function agxContrast(x: number): number {
  const x2 = x * x;
  const x4 = x2 * x2;
  return (
    15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232
  );
}

/**
 * Linear scene-referred RGB to display-referred [0,1].
 *
 * Inset, log-encode into the exposure window, sigmoid, un-inset. The clamps
 * are load-bearing in both directions: `log2(0)` is -Infinity, and the
 * polynomial only behaves on [0,1].
 */
export function agx(c: RGB): RGB {
  let v = mul3(AGX_INSET, [Math.max(0, c[0]), Math.max(0, c[1]), Math.max(0, c[2])]);
  const span = AGX_MAX_EV - AGX_MIN_EV;
  v = v.map((x) => {
    const ev = Math.log2(Math.max(x, 1e-10));
    const t = (Math.min(AGX_MAX_EV, Math.max(AGX_MIN_EV, ev)) - AGX_MIN_EV) / span;
    return agxContrast(t);
  }) as RGB;
  v = mul3(AGX_OUTSET, v);
  return v.map((x) => Math.min(1, Math.max(0, x))) as RGB;
}

// -------------------------------------------------------------------------
// ACES — the rejected alternative, kept so the rejection is testable
// -------------------------------------------------------------------------

/**
 * Narkowicz's fitted ACES approximation — the one nearly every engine ships.
 *
 * NOT USED TO RENDER. It is here so `tonemap.test.ts` can measure the hue
 * twist on a warm saturated colour and show that AgX holds the hue where this
 * does not. Delete it only along with the tests that cite it.
 */
export function acesNarkowicz(c: RGB): RGB {
  const a = 2.51;
  const b = 0.03;
  const d = 2.43;
  const e = 0.59;
  const f = 0.14;
  return c.map((x) => {
    const v = Math.max(0, x);
    return Math.min(1, Math.max(0, (v * (a * v + b)) / (v * (d * v + e) + f)));
  }) as RGB;
}

// -------------------------------------------------------------------------
// Colour helpers, for tests and for the debug HUD
// -------------------------------------------------------------------------

/** Hue in degrees, 0 = red, 60 = yellow. NaN for greys, which have no hue. */
export function hue(c: RGB): number {
  const max = Math.max(c[0], c[1], c[2]);
  const min = Math.min(c[0], c[1], c[2]);
  const d = max - min;
  if (d < 1e-9) return NaN;
  let h: number;
  if (max === c[0]) h = ((c[1] - c[2]) / d) % 6;
  else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
  else h = (c[0] - c[1]) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** HSV saturation. 0 is a grey, 1 is fully saturated. */
export function saturation(c: RGB): number {
  const max = Math.max(c[0], c[1], c[2]);
  const min = Math.min(c[0], c[1], c[2]);
  return max < 1e-9 ? 0 : (max - min) / max;
}

// -------------------------------------------------------------------------
// The shader
// -------------------------------------------------------------------------

const mat3glsl = (m: number[]) =>
  // GLSL mat3 constructors are COLUMN-major, and these matrices are written
  // row-major above. Transposing here rather than storing them transposed
  // keeps the numbers in the file matching every published reference, which
  // is what anyone checking this against a source will compare against.
  `mat3(${[0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => m[i].toFixed(15)).join(', ')})`;

/**
 * AgX as GLSL, generated from the constants above so the two cannot drift.
 *
 * The alternative — a hand-copied second set of numbers in a template string —
 * is the kind of duplication that stays correct exactly until someone tunes
 * one of them.
 */
export const AGX_GLSL = `
const mat3 AGX_INSET = ${mat3glsl(AGX_INSET)};
const mat3 AGX_OUTSET = ${mat3glsl(AGX_OUTSET)};
const float AGX_MIN_EV = ${AGX_MIN_EV};
const float AGX_MAX_EV = ${AGX_MAX_EV};

vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
       - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

vec3 agx(vec3 col) {
  col = AGX_INSET * max(col, vec3(0.0));
  col = clamp(log2(max(col, vec3(1e-10))), AGX_MIN_EV, AGX_MAX_EV);
  col = (col - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV);
  col = agxContrast(col);
  return clamp(AGX_OUTSET * col, 0.0, 1.0);
}
`;
