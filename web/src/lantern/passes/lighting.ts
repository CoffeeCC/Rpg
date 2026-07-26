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
/**
 * How tall the occupancy grid's solid tiles stand, in tiles.
 *
 * The grid is 2D and binary, so it says WHERE a wall is and not how tall.
 * That is fine while every receiver is on the board, and wrong the moment
 * walls become BLOCKS with tops you can see (ENGINE_PLAN section 12.1): a
 * block top standing at 0.7 is above the wall layer and cannot be shadowed
 * by it, but a flat grid shadows it from every neighbour and a whole run of
 * wall goes black. One number closes that, honestly and cheaply.
 *
 * IT IS A PLACEHOLDER WITH A KNOWN EXPIRY. ENGINE_PLAN section 14 takes the
 * map vertical — climbable tiles, a second and third layer — so blocks stop
 * all being the same height and one global number stops meaning anything.
 * The replacement is a per-tile column height in the grid, and the march
 * below is already the right shape for it: the early-out becomes a
 * comparison against the tile the ray is currently standing over, and the
 * ray height at that step is a lerp from the receiver height toward the
 * light. Do not add a second consumer of this uniform in the meantime; the
 * migration cost is per-consumer.
 */
uniform float uOccluderHeight;

/** 1.0 = fully lit, 0.0 = fully blocked. */
float traceShadow(vec3 from, vec2 to) {
  // Above the wall layer there is nothing left to hide behind. Without this,
  // every block top is shadowed by its own neighbours.
  if (from.z >= uOccluderHeight) return 1.0;

  vec2 delta = to - from.xy;
  float dist = length(delta);
  if (dist < 1e-4) return 1.0;
  vec2 dir = delta / dist;

  // Step just under a tile so the march cannot stride over a one-tile wall.
  // A step of exactly 1.0 can skip a thin occluder when the ray enters and
  // leaves it between samples — the classic light-leak, and the reason
  // LIGHTING_PLAN §9.3 also insists on conservative mips for the cascades.
  float stepLen = 0.75;
  int steps = int(min(float(SHADOW_STEPS), dist / stepLen));
  // A surface must not shadow itself. The first version skipped by DISTANCE,
  // which fails on any receiver that sits INSIDE a solid tile — the top face
  // of a wall block being exactly that — because the sample lands back in the
  // block's own footprint and the cap goes black. Every wall read as a hole
  // punched in the board. Skipping by TILE is what the grid actually means:
  // a tile is solid or it is not, and the tile you are standing on cannot be
  // between you and anything.
  vec2 originTile = floor(from.xy);

  for (int i = 1; i <= SHADOW_STEPS; i++) {
    if (i > steps) break;
    vec2 p = from.xy + dir * (float(i) * stepLen);
    vec2 tile = floor(p);
    if (all(equal(tile, originTile))) continue;
    // The grid is R8 UNORM, so a solid tile is uploaded as 255 and arrives
    // here as 1.0. Uploading a literal 1 instead would arrive as 1/255 and
    // never clear this test — shadows would silently never cast, which looks
    // exactly like "the shadow code is not wired up".
    float solid = texture(uOccupancy, (tile + 0.5) / uGridSize).r;
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
float softShadow(vec3 surface, vec2 lightPos, float radius) {
  vec2 toLight = lightPos - surface.xy;
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
in float vHeight;     // height of this fragment above the board, in tiles

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
 * INLAY — how much this material reads as individual tiles rather than as one
 * continuous rock texture. 0 off.
 *
 * ENGINE_PLAN section 11 lists tile seams as a board cue for a reason worth
 * stating: a continuous texture reads as TERRAIN, and terrain is a place you
 * are inside. Pieces with edges read as a board, which is a thing you are
 * looking at. Same pixels, different object.
 *
 * Per MATERIAL rather than per vertex, because "this surface is laid as
 * separate tiles" is a fact about the material and not about any one quad —
 * and a uniform costs no vertex bandwidth at all.
 */
uniform float uInlay;
/** Seam half-width, in tiles. */
uniform float uSeamWidth;
/** How dark the seam paints, 0..1 as a multiplier at the very edge. */
uniform float uSeamDarken;
/** How far the tile's chamfer tips the normal outward at its edge. */
uniform float uSeamBevel;

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

  // Bring the tangent-space normal into board space. Three cases, and which
  // one applies is the whole difference between a floor, a wall and a piece.
  //
  // WHICH WAY IS THE CAMERA? Board +y. Everything in the projection agrees on
  // this and it is worth pinning down because the first version got it
  // backwards: project() sends larger y further DOWN the screen, sortKey
  // paints larger y LAST, and visibleBounds widens maxY so that tall pieces
  // standing below the viewport still poke into it. Near is +y. The image
  // plane is spanned by (1,0,0) and (0,cos,-sin), so its normal — the
  // direction from a surface toward the viewer — is (0, sin(tilt), cos(tilt)).
  //
  // THE BUG THIS REPLACES: a standing quad mapped texture +z to board MINUS
  // y, i.e. into the board and away from the viewer. Wall faces were
  // therefore lit only by lights BEHIND them, and every character sprite —
  // whose normal is horizontal — met its own lantern at exactly 90 degrees
  // and contributed zero, so the hero rendered as a black silhouette in the
  // middle of his own pool of light. Both symptoms, one sign.
  vec3 worldN;
  if (vUpright > 1.5) {
    // BILLBOARD (a game piece). The quad turns to face the viewer, so its
    // surface normal IS the view direction. Its own vertical axis leans back
    // accordingly: perpendicular to the view and to board x.
    float c = cos(uTilt), s = sin(uTilt);
    worldN = vec3(N.x, 0.0, 0.0)
           + vec3(0.0, -c, s) * N.y
           + vec3(0.0, s, c) * N.z;
  } else if (vUpright > 0.5) {
    // VERTICAL FACE (a wall). Fixed plane: texture +y is board +z, and the
    // face looks out along board +y toward the near edge of the table.
    worldN = vec3(N.x, N.z, N.y);
  } else {
    // LYING DOWN. Texture +z is board +z.
    worldN = vec3(N.x, N.y, N.z);
  }
  worldN = normalize(worldN);

  // --- INLAY: laid as separate tiles, not poured as one surface --------
  //
  // Two things happen at a seam and only one of them is the dark line. The
  // line alone is a drawn line — it does not move, so the eye files it as
  // texture. The CHAMFER is what makes it an edge: tip the normal outward as
  // it approaches the seam and the near side of every tile catches the
  // lantern while the far side falls away, so the whole board resolves into
  // separate pieces the moment the light moves. That is the same argument
  // this pass exists for, one scale down.
  //
  // A lying quad seams on the board grid. A standing one seams on x only —
  // the vertical groove between two blocks in a wall run, which is what stops
  // a run reading as a single slab. Its height coordinate is carried too, so
  // a block also gets a chamfer where it meets the board.
  if (uInlay > 0.001) {
    vec2 sc = vUpright > 0.5 ? vec2(vWorld.x, vHeight) : vWorld;
    vec2 f = fract(sc);
    vec2 d = min(f, 1.0 - f);
    vec2 w = 1.0 - smoothstep(vec2(0.0), vec2(uSeamWidth), d);
    float seam = max(w.x, w.y) * uInlay;
    albedo.rgb *= mix(1.0, uSeamDarken, seam);
    vec2 outward = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0) * w;
    vec3 tip = vUpright > 0.5 ? vec3(outward.x, 0.0, 0.0) : vec3(outward, 0.0);
    worldN = normalize(worldN + tip * uSeamBevel * uInlay);
  }

  if (uDebug == 1) { outColor = vec4(fract(vWorld * 0.1), 0.0, 1.0); return; }
  if (uDebug == 5) { outColor = vec4(worldN * 0.5 + 0.5, 1.0); return; }

  vec3 lit = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 lp = uLightPos[i];
    float intensity = uLightParams[i].x;
    float reach = uLightParams[i].y;
    float radius = uLightParams[i].z;

    // Where this fragment actually is. vHeight interpolates up a standing
    // quad and is constant across a lying one, so the top of a wall block's
    // face is correctly nearer the lantern than its base — which the old
    // hardcoded 0.35 could not express, and which is most of what makes a
    // block look like it has a top at all.
    vec3 surface = vec3(vWorld, vHeight);
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
    float shadow = softShadow(surface, lp.xy, radius);

    if (uDebug == 2) { outColor = vec4(vec3(ndl), 1.0); return; }
    if (uDebug == 3) { outColor = vec4(vec3(atten), 1.0); return; }
    if (uDebug == 4) { outColor = vec4(vec3(shadow), 1.0); return; }

    vec3 contribution = uLightColour[i] * intensity * atten * ndl * shadow;

    // Blinn-Phong, gated on diffuse: a highlight floating on a surface the
    // light cannot reach is the tell of a specular term added without one.
    // Toward the viewer, who is on the +y side of the board. Same derivation
    // as the normal basis above, and it had the same sign error.
    vec3 V = vec3(0.0, sin(uTilt), cos(uTilt));
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
layout(location = 3) in vec4 aWorld;   // board xy, upright flag, height above the board

uniform vec2 uViewport;

out vec2 vUV;
out vec4 vTint;
out vec2 vWorld;
flat out float vUpright;
out float vHeight;

void main() {
  vec2 ndc = (aPos / uViewport) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  vUV = aUV;
  vTint = aTint;
  vWorld = aWorld.xy;
  // FLAT, because a quad is one object and cannot be half standing up.
  vUpright = aWorld.z;
  // NOT flat: height is the axis a standing quad spans, so interpolating it
  // is the whole point.
  vHeight = aWorld.w;
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
