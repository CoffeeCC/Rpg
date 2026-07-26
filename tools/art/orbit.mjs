/**
 * THE ORBIT TEST, headless — does this art have lighting painted into it?
 *
 * Ported from `orbitTest()` in `web/public/lantern-lab.html`, which runs it in
 * WebGL2 and needs a browser. This is the same test on typed arrays so it can
 * be a build step.
 *
 * Why it exists (ENGINE_PLAN.md §9.1): deriving height from luminance assumes
 * the image IS the surface. It is not — it is `albedo x irradiance`, and the
 * gradient of that product is not the surface gradient. Wherever an artist
 * painted a shadow to suggest a recess, the derived normal comes out as a BUMP.
 * The statistics normally quoted for normal maps cannot see this: a map whose
 * volumes are all inside-out has exactly the same mean and range as a correct
 * one. What makes it dangerous is that it is invisible in a still, because lit
 * from the direction the artist implied an inverted surface reproduces the
 * original painting exactly. It only falls apart as the light swings away —
 * which is to say it is invisible in a screenshot and obvious in the one
 * feature the whole engine is being built for.
 *
 * So: swing the light through 360 degrees, correlate each lit frame against the
 * flat albedo, and look at the curve. Art with a baked light direction
 * correlates best when lit from that direction and worst from 180 degrees
 * opposite. Clean art has no preferred direction and the curve is flat.
 *
 * A large spread on its own is not a reject — an anisotropic texture (brushed
 * metal, wood grain, strata) genuinely prefers one axis and that is harmless.
 * The signature of baked light is a large spread AND peak and trough opposed.
 *
 * ---------------------------------------------------------------------------
 * TWO RIGS, AND WHY THE SECOND ONE HAD TO BE ADDED
 * ---------------------------------------------------------------------------
 *
 * The Lab orbits a **point** light 0.34 from the centre. On a tile that is
 * fine: the art is stochastic and roughly uniform, so moving the light does not
 * change which pixels are bright relative to each other, and every wobble in
 * the correlation is the normal map's doing.
 *
 * On a sprite it is not fine, and this was measured rather than assumed. Run
 * the point rig against a **flat** normal map — no material at all, `n =
 * (0,0,1)` everywhere — over the first five monsters and the spread comes back
 * 0.145 to 0.338, with peak and trough 180 degrees apart on three of them. That
 * is a full-blown "FAIL" out of a material that is by construction featureless.
 * The cause is geometric: a point light's falloff is a bright spot that sweeps
 * across the frame, and a sprite's albedo is a creature sitting off-centre in
 * a transparent field, so the product `albedo x falloff` decorrelates by a
 * different amount at every angle no matter what the normals do.
 *
 * So the character path orbits a **directional** light instead: L constant
 * across the whole image, no distance attenuation. Then a flat normal map is
 * lit uniformly, correlates identically at every angle, and scores a spread of
 * zero — which means every point of spread that does show up came from the
 * material. That is the measurement the test was always supposed to be making.
 *
 * Tiles keep the point rig, because the numbers in ART_BRIEF_MATERIALS.md were
 * taken with it and the port has to be checkable against them. Both rigs are
 * recorded for every asset, along with the flat-normal control, so a reject can
 * always be traced to the material rather than to the rig.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The lighting rig, matching the Lab's slider defaults. Changing these changes
 *  every recorded number in the manifest, so they live here as constants. */
export const ORBIT = {
  angles: 16,
  /** Distance of the light from the centre, in uv. */
  radius: 0.34,
  /** Height of the light above the surface. */
  z: 0.35,
  intensity: 1.6,
  falloff: 2.6,
  ambient: 0.07,
  specular: 0.35,
  gloss: 24,
  aoStrength: 0.7,
  lightColour: [1.0, 0.86, 0.66],
  /** Sample every Nth pixel. A correlation over ~200k samples; reading all of
   *  them moves the fourth decimal place. */
  stride: 5,
  failSpread: 0.1,
  failSeparation: 135,
};

/**
 * One lit frame, evaluated only at the sampled pixels. This is P_LIT from the
 * Lab with `view == 0`, including the 8-bit quantisation at the end — the Lab
 * correlates what `readPixels` returns, so the port has to round the same way
 * or the numbers drift in the third decimal.
 */
function litLuma(out, idx, bitmap, normals, ao, theta, aspect, rig) {
  const { width: w, data } = bitmap;
  const { intensity, falloff, ambient, specular, gloss, aoStrength, lightColour } = ORBIT;
  const lx = 0.5 + ORBIT.radius * Math.cos(theta);
  const ly = 0.5 + ORBIT.radius * Math.sin(theta);
  const lz = ORBIT.z;
  const lpx = lx * aspect;

  // A directional light points the same way everywhere. Its elevation is taken
  // from the point rig's geometry — the direction from the centre of the frame
  // to where the point light would have been — so the two rigs light the
  // surface at the same angle and only the falloff differs.
  const dl = Math.hypot(ORBIT.radius, ORBIT.radius, lz) === 0 ? 1 : Math.hypot(ORBIT.radius * Math.cos(theta), ORBIT.radius * Math.sin(theta), lz);
  const DLx = (ORBIT.radius * Math.cos(theta)) / dl;
  const DLy = (ORBIT.radius * Math.sin(theta)) / dl;
  const DLz = lz / dl;
  const directional = rig === 'directional';

  for (let s = 0; s < idx.length; s++) {
    const i = idx[s];
    const x = i % w;
    const y = (i - x) / w;
    const u = (x + 0.5) / w;
    const v = (y + 0.5) / bitmap.height;

    let Lx = DLx;
    let Ly = DLy;
    let Lz = DLz;
    let dist = 1;
    if (!directional) {
      const tox = lpx - u * aspect;
      const toy = ly - v;
      dist = Math.hypot(tox, toy, lz) || 1e-5;
      Lx = tox / dist;
      Ly = toy / dist;
      Lz = lz / dist;
    }

    // Stored y-down (texture space); flip so +y is up in light space.
    const Nx = normals[i * 3];
    const Ny = -normals[i * 3 + 1];
    const Nz = normals[i * 3 + 2];

    const atten = directional ? 1 : 1 / (1 + falloff * dist * dist);
    const diff = Math.max(Nx * Lx + Ny * Ly + Nz * Lz, 0);

    // Half vector against a view straight down the z axis.
    let hx = Lx;
    let hy = Ly;
    let hz = Lz + 1;
    const hl = Math.hypot(hx, hy, hz) || 1;
    hx /= hl;
    hy /= hl;
    hz /= hl;
    let spec = Math.pow(Math.max(Nx * hx + Ny * hy + Nz * hz, 0), gloss) * specular;
    // No specular where no light lands, or highlights float on unlit geometry.
    if (diff <= 0.001) spec = 0;

    const occ = 1 + (ao[i] - 1) * aoStrength; // mix(1.0, ao, aoStrength)
    let lum = 0;
    const K = [0.2126, 0.7152, 0.0722];
    for (let k = 0; k < 3; k++) {
      const alb = data[i * 4 + k] / 255;
      let c = alb * (ambient * occ + diff * intensity * atten) + lightColour[k] * spec * atten;
      c = c / (1 + c); // Reinhard
      c = Math.pow(c, 1 / 2.2); // gamma
      lum += K[k] * Math.round(clamp(c, 0, 1) * 255);
    }
    out[s] = lum;
  }
}

function correlate(a, b) {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sa = 0;
  let sb = 0;
  let sab = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    sa += x * x;
    sb += y * y;
    sab += x * y;
  }
  return sab / Math.sqrt(sa * sb || 1);
}

/** The rig each asset class is judged under. See the header. */
export const RIG_FOR_MODE = { tiles: 'point', bevel: 'directional' };

/**
 * Run the orbit test on a baked material.
 *
 * @param {{width:number,height:number,data:Uint8ClampedArray}} bitmap albedo
 * @param {{normals:Float32Array, ao:Float32Array, mask?:Uint8Array}} baked
 * @param {'point'|'directional'} rig
 * @returns {{pass:boolean, spread:number, min:number, max:number, peak:number,
 *            trough:number, separation:number, samples:number, rig:string,
 *            correlations:number[]}}
 */
export function orbitTest(bitmap, baked, rig = 'point') {
  const { width: w, height: h, data } = bitmap;
  const aspect = w / h;

  // Which pixels to correlate over. On a sprite the transparent surround is
  // identical at every angle, and including it would drag every correlation
  // toward the same number and quietly turn the test into a pass generator.
  const idxList = [];
  for (let i = 0; i < w * h; i += ORBIT.stride) {
    if (baked.mask && !baked.mask[i]) continue;
    idxList.push(i);
  }
  const idx = Int32Array.from(idxList);
  if (idx.length < 64) {
    return { pass: true, rig, spread: 0, min: 0, max: 0, peak: 0, trough: 0, separation: 0, samples: idx.length, correlations: [], note: 'too few opaque samples to test' };
  }

  // The reference is the flat albedo — the Lab's `view == 2`, straight through
  // with no tonemap and no gamma.
  const flat = new Float64Array(idx.length);
  for (let s = 0; s < idx.length; s++) {
    const i = idx[s];
    flat[s] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
  }

  const lit = new Float64Array(idx.length);
  const cs = [];
  for (let k = 0; k < ORBIT.angles; k++) {
    const th = (k * Math.PI * 2) / ORBIT.angles;
    litLuma(lit, idx, bitmap, baked.normals, baked.ao, th, aspect, rig);
    cs.push(correlate(flat, lit));
  }

  const max = Math.max(...cs);
  const min = Math.min(...cs);
  const spread = max - min;
  const step = 360 / ORBIT.angles;
  const peak = cs.indexOf(max) * step;
  const trough = cs.indexOf(min) * step;
  let separation = Math.abs(peak - trough);
  if (separation > 180) separation = 360 - separation;

  // A real baked light puts peak and trough opposite each other. Anything else
  // is texture anisotropy, which is harmless.
  const fail = spread > ORBIT.failSpread && separation > ORBIT.failSeparation;

  return {
    pass: !fail,
    rig,
    spread,
    min,
    max,
    peak,
    trough,
    separation,
    samples: idx.length,
    correlations: cs,
  };
}

/**
 * The same orbit with the material replaced by a perfectly flat normal map.
 *
 * This is the rig's own contribution — whatever spread survives here came from
 * the light and the albedo, not from anything the baker produced. On tiles it
 * is near zero. On sprites under a point light it is not, which is the whole
 * reason the directional rig exists. Recording it per asset means a FAIL can
 * always be attributed.
 */
export function orbitControl(bitmap, mask, rig = 'point') {
  const n = bitmap.width * bitmap.height;
  const normals = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) normals[i * 3 + 2] = 1;
  const ao = new Float32Array(n).fill(1);
  return orbitTest(bitmap, { normals, ao, mask }, rig);
}
