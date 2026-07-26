// =========================================================================
// THE LIGHTING PASS — where the board stops being a picture of a board.
//
// M1 drew albedo: every surface at full brightness, tonemapped. Correct, and
// flat, because nothing was casting anything. This is the pass that makes the
// lantern the only reason you can see.
//
// THE MODEL, and why each term is here rather than being a nice-to-have:
//
//   DIFFUSE     N·L against a normal map. This is the whole reason M2 exists.
//               Without a normal, every texel of a wall faces the camera and
//               a light sweeping past it changes only its brightness, never
//               its shape — which reads as a spotlight on a photograph. With
//               one, the mortar between the bricks catches the light on one
//               side and shades on the other, and the wall becomes a surface.
//
//   SPECULAR    Blinn-Phong, gated on the diffuse term. Damp stone and wet
//               stone are the same albedo and different materials, and the
//               only thing that says so is a highlight that moves when the
//               lantern moves.
//
//   ATTENUATION Inverse-square with a smooth window that reaches exactly zero
//               at `reach`. The window is not cosmetic and this is inherited
//               knowledge, not a guess: 1/(1+14d²) is still 0.067 at the rim,
//               and a falloff whose last stop drops 0.067 -> 0 has a STEP in
//               it. That step, drawn as a circle, is the "it just looks like
//               a yellow circle" failure the old engine spent a rewrite on.
//
//   SHADOW      Marched against the tile occupancy grid, not a shadow volume.
//               See `SHADOW_GLSL`.
//
//   AMBIENT     A flat constant, with a death sentence already written.
//               LIGHTING_PLAN §2 deletes it at M5 when the radiance lattice
//               supplies real bounce. Until then it is an honest placeholder
//               and a dishonest shadow.
// =========================================================================

/** Max lights per draw. Beyond this the uniform block stops being free. */
export const MAX_LIGHTS = 8;

/**
 * Shadowing by marching the occupancy grid.
 *
 * The grid is uploaded as an R8 texture, one texel per tile, sampled NEAREST.
 * A ray from the surface toward the light steps through it; any solid texel
 * on the way blocks. That is exact by construction — a tile is solid or it is
 * not — which is the whole argument from LIGHTING_PLAN §12 for solving in
 * world space rather than measuring rectangles out of the DOM.
 *
 * SOFTNESS comes from the light having SIZE, not from blurring the result.
 * The march is repeated from a few points across the flame's disc and the
 * results averaged, so a receiver that can see part of the flame lands
 * between lit and unlit. That is what a penumbra physically is, and it is
 * why the width grows with distance from the caster for free.
 *
 * The step count is the quality dial's business: `SHADOW_STEPS` is a define,
 * so the Deck can march coarsely and a desktop finely from the same source.
 */
export const SHADOW_GLSL = `
uniform sampler2D uOccupancy;
uniform vec2 uGridSize;
uniform float uShadowSoftness;

/** 1.0 = fully lit, 0.0 = fully blocked. */
float traceShadow(vec2 from, vec2 to) {
  vec2 delta = to - from;
  float dist = length(delta);
  if (dist < 1e-4) return 1.0;
  vec2 dir = delta / dist;

  // Step just under a tile so the march cannot stride over a one-tile wall.
  // A step of exactly 1.0 can skip a thin occluder when the ray enters and
  // leaves it between samples — the classic light-leak, and the reason
  // LIGHTING_PLAN §9.3 also insists on conservative mips for the cascades.
  float stepLen = 0.75;
  int steps = int(min(float(SHADOW_STEPS), dist / stepLen));

  for (int i = 1; i <= SHADOW_STEPS; i++) {
    if (i > steps) break;
    vec2 p = from + dir * (float(i) * stepLen);
    // Skip the tile the receiver is standing on: a surface must not shadow
    // itself, or every wall face goes black and the whole board reads as
    // unlit no matter where the lantern is.
    if (i == 1 && length(p - from) < 0.5) continue;
    // The grid is R8 UNORM, so a solid tile is uploaded as 255 and arrives
    // here as 1.0. Uploading a literal 1 instead would arrive as 1/255 and
    // never clear this test — shadows would silently never cast, which looks
    // exactly like "the shadow code is not wired up".
    float solid = texture(uOccupancy, (floor(p) + 0.5) / uGridSize).r;
    if (solid > 0.5) return 0.0;
  }
  return 1.0;
}

/**
 * Average several traces across the flame's width.
 *
 * The samples are spread perpendicular to the light direction, which is the
 * cheap version of sampling a disc: for shadowing purposes only the component
 * across the ray matters, since spreading along it just moves the sample
 * nearer or further along the same line.
 */
float softShadow(vec2 surface, vec2 lightPos, float radius) {
  vec2 toLight = lightPos - surface;
  vec2 perp = normalize(vec2(-toLight.y, toLight.x)) * radius;
  float sum = 0.0;
  for (int s = 0; s < SHADOW_SAMPLES; s++) {
    float t = (float(s) / float(SHADOW_SAMPLES - 1)) * 2.0 - 1.0;
    sum += traceShadow(surface, lightPos + perp * t);
  }
  return sum / float(SHADOW_SAMPLES);
}
`;

/**
 * The lit-sprite fragment shader.
 *
 * Runs per sprite rather than as a deferred fullscreen pass, deliberately.
 * A G-buffer would be the textbook answer and it is the wrong one here: the
 * board is a few hundred quads with heavy overdraw of *transparent* pixels
 * (every character sprite is mostly alpha), and a deferred pass would have to
 * resolve that transparency anyway. Forward with a small light count is
 * simpler, blends correctly, and at MAX_LIGHTS=8 costs less than the extra
 * fullscreen bandwidth a G-buffer would add. Revisit if the light count ever
 * needs to be large — which, per LIGHTING_PLAN §4 Phase 5, is exactly what the
 * cascade solver is for, and it is O(1) in lights.
 */
export const LIT_SPRITE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUV;
in vec4 vTint;
in vec2 vWorld;       // board position of this fragment, in tiles
flat in float vUpright;

uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform int uHasNormal;

uniform int uLightCount;
uniform vec3 uLightPos[${MAX_LIGHTS}];      // xy board tiles, z height above board
uniform vec3 uLightColour[${MAX_LIGHTS}];
uniform vec3 uLightParams[${MAX_LIGHTS}];   // intensity, reach, radius

uniform float uAmbient;
uniform vec3 uNight;
uniform float uNormalStrength;
uniform float uSpecular;
uniform float uGloss;
uniform float uTilt;

/**
 * False-colour debug output. ENGINE_PLAN section 6 asks for these, and the
 * reason is exactly the session that produced them: debugging light by
 * looking at the final image is how hours get lost, because "the light is
 * contributing nothing" and "the light is contributing correctly but
 * something downstream eats it" are the same picture.
 *
 * 0 off, 1 board position, 2 N dot L, 3 attenuation, 4 shadow, 5 world normal.
 */
uniform int uDebug;

${SHADOW_GLSL}

out vec4 outColor;

void main() {
  vec4 albedo = texture(uAlbedo, vUV) * vTint;
  // Alpha-test before doing any lighting work. Character sprites are mostly
  // transparent, so this is the difference between shading the hero and
  // shading the hero's bounding box.
  if (albedo.a < 0.01) discard;

  // Tangent-space normal. Without a map, a flat surface facing "up" out of
  // the board, or facing the camera for an upright piece — which is what
  // makes an unlit-mapped sprite still respond to light direction sensibly.
  vec3 N;
  if (uHasNormal == 1) {
    vec3 t = texture(uNormal, vUV).rgb * 2.0 - 1.0;
    t.xy *= uNormalStrength;
    N = normalize(t);
  } else {
    N = vec3(0.0, 0.0, 1.0);
  }

  // Bring the tangent-space normal into board space. A quad lying on the
  // board has its surface normal pointing straight up (+z); a quad standing
  // up faces along -y. Getting this wrong is the classic "lighting is
  // inverted on half the objects" bug, and it is invisible until a light
  // passes the object rather than sitting in front of it.
  vec3 worldN;
  if (vUpright > 0.5) {
    // Standing: texture +y maps to board +z, texture +z faces -y (toward camera).
    worldN = vec3(N.x, -N.z, N.y);
  } else {
    // Lying down: texture +z is board +z.
    worldN = vec3(N.x, N.y, N.z);
  }
  worldN = normalize(worldN);

  if (uDebug == 1) { outColor = vec4(fract(vWorld * 0.1), 0.0, 1.0); return; }
  if (uDebug == 5) { outColor = vec4(worldN * 0.5 + 0.5, 1.0); return; }

  vec3 lit = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 lp = uLightPos[i];
    float intensity = uLightParams[i].x;
    float reach = uLightParams[i].y;
    float radius = uLightParams[i].z;

    // Surface sits on the board plane, or partway up it if standing.
    vec3 surface = vec3(vWorld, vUpright > 0.5 ? 0.35 : 0.0);
    vec3 toLight = lp - surface;
    float dist = length(toLight);
    if (dist > reach) continue;
    vec3 L = toLight / max(dist, 1e-4);

    float d = dist / reach;
    // Inverse-square times a window that reaches EXACTLY zero at the rim.
    // See the header: without the window the profile has a step in it and
    // the pool reads as a drawn circle rather than as light running out.
    float falloff = 1.0 / (1.0 + 14.0 * d * d);
    float window = pow(max(0.0, 1.0 - d * d), 2.0);
    float atten = falloff * window;

    float ndl = max(dot(worldN, L), 0.0);
    float shadow = softShadow(vWorld, lp.xy, radius);

    if (uDebug == 2) { outColor = vec4(vec3(ndl), 1.0); return; }
    if (uDebug == 3) { outColor = vec4(vec3(atten), 1.0); return; }
    if (uDebug == 4) { outColor = vec4(vec3(shadow), 1.0); return; }

    vec3 contribution = uLightColour[i] * intensity * atten * ndl * shadow;

    // Blinn-Phong, gated on diffuse: a highlight floating on a surface the
    // light cannot reach is the tell of a specular term added without one.
    vec3 V = vec3(0.0, -sin(uTilt), cos(uTilt));
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(worldN, H), 0.0), uGloss) * uSpecular;
    contribution += uLightColour[i] * spec * atten * shadow * step(0.001, ndl);

    lit += contribution;
  }

  // AMBIENT IS LIGHT, NOT A WASH.
  //
  // The first version added uNight * (1 - uAmbient) to every pixel, which
  // flooded the whole frame — including the brightly lit pool — with a flat
  // blue-grey and made the board look like it was behind fog. Night is not
  // something added on top of a scene; it is the only light there is when the
  // lantern is not reaching, so it belongs in the same place the lantern's
  // contribution does: multiplying the albedo.
  //
  // uNight is used as a HUE here, normalised so it sets the colour of that
  // dim light without also setting its brightness — uAmbient does that.
  // Otherwise the two dials fight, and turning the ambient down makes the
  // scene bluer rather than darker.
  vec3 nightTint = uNight / max(max(uNight.r, max(uNight.g, uNight.b)), 1e-4);
  vec3 colour = albedo.rgb * (uAmbient * nightTint + lit);
  outColor = vec4(colour, albedo.a);
}`;

/**
 * The matching vertex shader.
 *
 * Passes the BOARD position through alongside the screen position, because
 * every lighting calculation above happens in world space. Reconstructing it
 * in the fragment shader from screen coordinates would mean inverting the
 * projection per pixel, and would be wrong for upright quads, whose screen
 * position no longer maps to a single board tile.
 */
export const LIT_SPRITE_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aTint;
layout(location = 3) in vec3 aWorld;   // board xy + upright flag

uniform vec2 uViewport;

out vec2 vUV;
out vec4 vTint;
out vec2 vWorld;
flat out float vUpright;

void main() {
  vec2 ndc = (aPos / uViewport) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  vUV = aUV;
  vTint = aTint;
  vWorld = aWorld.xy;
  vUpright = aWorld.z;
}`;

/**
 * Smooth falloff, on the CPU, matching the shader exactly.
 *
 * Exported so the profile can be tested without a GPU, and so anything that
 * needs to agree with the light (a fog-of-war reveal radius, a UI hint about
 * what is visible) can ask rather than approximate. Two implementations of a
 * falloff that must match is how the map's "lit" and "reachable" claims
 * drifted apart in the first place.
 */
export function attenuation(distance: number, reach: number): number {
  if (distance >= reach) return 0;
  const d = distance / reach;
  const falloff = 1 / (1 + 14 * d * d);
  const window = Math.pow(Math.max(0, 1 - d * d), 2);
  return falloff * window;
}
