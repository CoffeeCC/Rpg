// =========================================================================
// THE RENDERER — the assembly.
//
// Everything under `lantern/` before this file was a PART: a camera that can
// project, a batcher that can draw quads, a bloom chain, a tonemap, a LUT, a
// frame timer. All individually tested and none of them plugged into anything.
// The frame loop that actually used them lived in `lantern-forge.html`, which
// is a demo page — and a demo page owning the pass order, the render targets
// and the composite shader is the classic tell that the orchestrator has not
// been written yet.
//
// This is the orchestrator. It owns the frame:
//
//     sprites -> HDR   bloom mips   composite + tonemap + grade -> display
//
// and it owns everything that has to survive between frames — targets,
// programs, the vertex buffer, the timers. `render(scene)` is the whole public
// surface, which is what makes `ENGINE_PLAN` §2's rule enforceable rather than
// aspirational: it takes a Scene and draws it, and there is nowhere in the
// signature for a monster, a card or a DOM node to get in.
//
// WHAT IT DOES NOT DO YET, stated plainly so nobody assumes otherwise:
// `scene.lights` and `scene.occluders` are read for the HUD count and then
// ignored. Direct lighting is M2 and the cascade solve is M5. The Scene
// carries them now so those milestones have somewhere to arrive.
// =========================================================================

import type { Device } from './gl/device';
import { ProgramCache, type Program } from './gl/program';
import { bindTarget, createTarget, drawFullscreen, type Target } from './gl/target';
import { SpriteBatcher, SPRITE_FRAG, SPRITE_VERT } from './gl/spriteBatcher';
import { LIT_SPRITE_FRAG, LIT_SPRITE_VERT, MAX_LIGHTS } from './passes/lighting';
import { withDefines } from './gl/program';
import { createIdentityLut, lutGlsl } from './gl/lut';
import { AGX_GLSL } from './passes/tonemap';
import { mipChain, BLOOM_DOWNSAMPLE_GLSL, BLOOM_UPSAMPLE_GLSL } from './passes/bloom';
import { batchGroups, buildVertexData, sortForPainting } from './scene/sprite';
import { cullLights, cullSprites, type Scene } from './scene/scene';
import { visibleBounds } from './scene/camera';
import { FrameTimer, GpuTimer, type HudStats } from './debug/hud';

export type TonemapName = 'agx' | 'aces' | 'none';

export interface RenderOptions {
  /** Scene exposure multiplier, applied before the tonemap. */
  exposure?: number;
  bloomStrength?: number;
  bloomThreshold?: number;
  /** Knee width. 0 collapses to a hard threshold — see `bloom.ts`. */
  bloomKnee?: number;
  /** Karis average on the first downsample. Off is the firefly repro. */
  karis?: boolean;
  tonemap?: TonemapName;
  /** 0 bypasses the grade, 1 applies it fully. */
  lutMix?: number;
  /**
   * Light the scene, rather than drawing flat albedo.
   *
   * On by default now that M2 exists. `false` is the M1 path, kept because it
   * is the only way to see what the lighting is actually contributing — and
   * because a flat render is the right fallback if a scene arrives with no
   * lights at all.
   */
  lit?: boolean;
  /** Global multiplier on the normal map's strength. Per-material overrides win. */
  normalStrength?: number;
  specular?: number;
  gloss?: number;
  /**
   * Tile-seam geometry, for materials that declare an `inlay` strength.
   *
   * Global rather than per-material because they describe the BOARD's
   * construction — how wide the grout is and how the tiles are chamfered —
   * and a board whose tiles were bevelled inconsistently would read as a
   * mistake rather than as variety. `Material.inlay` is the per-surface dial.
   */
  seamWidth?: number;
  seamDarken?: number;
  seamBevel?: number;
  /** False-colour overlay: 0 off, 1 board pos, 2 N.L, 3 attenuation, 4 shadow, 5 normal. */
  debug?: number;
}

const DEFAULTS: Required<RenderOptions> = {
  exposure: 1,
  bloomStrength: 0.55,
  bloomThreshold: 1,
  bloomKnee: 0.6,
  karis: true,
  tonemap: 'agx',
  lutMix: 0,
  lit: true,
  normalStrength: 1,
  specular: 0.25,
  gloss: 24,
  seamWidth: 0.045,
  seamDarken: 0.42,
  seamBevel: 0.85,
  debug: 0,
};

/**
 * The composite.
 *
 * Order is not negotiable and each step is where it is for a reason:
 * bloom is added in LINEAR space (it is light, and light adds), exposure
 * scales before the curve (it is an exposure, not a brightness slider), the
 * tonemap converts scene-referred to display-referred, and the LUT comes
 * LAST because a 3D LUT is undefined outside [0,1] — grading HDR values
 * clips them in whatever way the sampler happens to.
 */
function compositeSource(): string {
  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene, uBloom;
uniform float uBloomAmount, uExposure;
uniform int uTonemap;
// NOTE: uLut and uLutMix are declared by lutGlsl() below, not here.
// Redeclaring either is a GLSL redefinition error, and GLSL is not
// typechecked by the build - it fails at runtime, on the frame that first
// needs the program. (No backticks in this comment: it lives inside a
// template literal, and a backtick would end the string.)
${AGX_GLSL}
${lutGlsl()}
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
void main() {
  vec3 col = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomAmount;
  col *= uExposure;
  vec3 mapped;
  // AgX already returns display-referred values. ACES and the clipping path
  // are scene-referred fits, so they need the sRGB encode applied here.
  if (uTonemap == 0) mapped = agx(col);
  else if (uTonemap == 1) mapped = pow(aces(col), vec3(1.0 / 2.2));
  else mapped = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  // applyLut already fades by uLutMix internally. Wrapping it in a second
  // mix would square the fade, so a half-strength grade would land at a
  // quarter - a bug that looks like "the LUT is too weak" rather than a bug.
  outColor = vec4(applyLut(mapped), 1.0);
}`;
}

const PREFILTER = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
${BLOOM_DOWNSAMPLE_GLSL}
void main() { outColor = vec4(bloomPrefilter(bloomDownsample(vUv)), 1.0); }`;

const DOWNSAMPLE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
${BLOOM_DOWNSAMPLE_GLSL}
void main() { outColor = vec4(bloomDownsample(vUv), 1.0); }`;

const UPSAMPLE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
${BLOOM_UPSAMPLE_GLSL}
void main() { outColor = vec4(bloomUpsample(vUv), 1.0); }`;

const TONEMAP_ID: Record<TonemapName, number> = { agx: 0, aces: 1, none: 2 };

export class Renderer {
  private readonly device: Device;
  private readonly cache: ProgramCache;
  private readonly batcher: SpriteBatcher;
  private readonly cpuTimer = new FrameTimer();
  private readonly gpuTimer: GpuTimer;

  private scene: Target | null = null;
  private mips: Target[] = [];
  private lut: WebGLTexture | null = null;
  private width = 0;
  private height = 0;
  private disposed = false;
  /** The occupancy grid, as an R8 texture. Re-uploaded only when it changes. */
  private occupancy: WebGLTexture | null = null;
  private occupancyKey = '';
  /** A 1x1 flat normal, so the lit shader has something valid to sample. */
  private flatNormal: WebGLTexture | null = null;

  constructor(device: Device) {
    this.device = device;
    this.cache = new ProgramCache(device.gl);
    this.batcher = new SpriteBatcher(device.gl);
    this.gpuTimer = new GpuTimer(device.gl);
    this.lut = createIdentityLut(device.gl);
    // A restored context hands back dead handles for everything. Rebuilding
    // from the Scene is possible precisely because the Scene is data we still
    // hold — the argument for keeping the renderer stateless about the world.
    device.onRestored(() => this.rebuild());
  }

  /** Drop and re-make every GPU resource. Safe to call at any time. */
  private rebuild(): void {
    const gl = this.device.gl;
    this.cache.clear();
    this.scene?.dispose();
    this.scene = null;
    for (const m of this.mips) m.dispose();
    this.mips = [];
    this.lut = createIdentityLut(gl);
    // Dead handles after a context loss. Null them so the next frame
    // re-uploads rather than binding a texture the driver has forgotten.
    this.occupancy = null;
    this.occupancyKey = '';
    this.flatNormal = null;
    this.width = 0;
    this.height = 0;
  }

  /** Replace the grading LUT. Takes ownership; the previous one is deleted. */
  setLut(texture: WebGLTexture): void {
    if (this.lut) this.device.gl.deleteTexture(this.lut);
    this.lut = texture;
  }

  private ensureTargets(): void {
    const { width, height } = this.device.size();
    const steps = this.device.quality().bloomSteps;
    if (width === this.width && height === this.height && this.scene) return;
    const gl = this.device.gl;
    this.scene?.dispose();
    for (const m of this.mips) m.dispose();
    this.width = width;
    this.height = height;
    this.scene = createTarget(gl, width, height, { format: 'rgba16f' });
    this.mips = mipChain(width, height, steps).map((s) => createTarget(gl, s.width, s.height, { format: 'rgba16f' }));
  }

  /**
   * Draw one frame.
   *
   * Returns the HUD stats rather than rendering them: the renderer knows the
   * numbers and has no business knowing where they are displayed. That is the
   * same boundary as everywhere else in this file.
   */
  render(scene: Scene, options: RenderOptions = {}): HudStats {
    const opts = { ...DEFAULTS, ...options };
    const gl = this.device.gl;
    const start = performance.now();

    // A lost context is a black frame, not a blown-out one — this renderer
    // owns the world, so drawing nothing is legible failure. Bail before
    // touching any handle, all of which are dead until the restore fires.
    if (this.disposed || this.device.status() !== 'ok') {
      return this.stats(0, 0, 0, start);
    }

    this.ensureTargets();
    const sceneRT = this.scene;
    if (!sceneRT) return this.stats(0, 0, 0, start);

    this.gpuTimer.begin?.();

    // --- 1. the board, into HDR -----------------------------------------
    const bounds = visibleBounds(scene.camera);
    const visible = cullSprites(scene.sprites, bounds);
    const sorted = sortForPainting(visible);
    const batches = batchGroups(sorted);

    bindTarget(gl, sceneRT);
    gl.clearColor(scene.night[0], scene.night[1], scene.night[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const lights = cullLights(scene.lights, bounds).slice(0, MAX_LIGHTS);
    const useLighting = opts.lit && lights.length > 0 && scene.occluders !== null;

    let drawCalls = 0;
    if (sorted.length) {
      const q = this.device.quality();
      const prog = useLighting
        ? this.cache.get(
            'lit-sprite',
            // Shadow cost is the quality dial's business, and it is a compile
            // constant because a loop bound must be one in GLSL ES. The cache
            // keys on source text, so each tier gets its own program rather
            // than one program branching per pixel.
            withDefines(LIT_SPRITE_FRAG, {
              SHADOW_STEPS: q.name === 'floor' ? 12 : 24,
              SHADOW_SAMPLES: q.name === 'ceiling' ? 5 : 3,
            }),
            LIT_SPRITE_VERT,
          )
        : this.cache.get('sprite', SPRITE_FRAG, SPRITE_VERT);
      gl.useProgram(prog.handle);
      gl.uniform2f(prog.u('uViewport'), sceneRT.width, sceneRT.height);

      if (useLighting) {
        const grid = scene.occluders!;
        const occ = this.ensureOccupancy(scene);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, occ);
        gl.uniform1i(prog.u('uOccupancy'), 2);
        gl.uniform2f(prog.u('uGridSize'), grid.width, grid.height);

        gl.uniform1i(prog.u('uLightCount'), lights.length);
        for (let i = 0; i < lights.length; i++) {
          const l = lights[i];
          gl.uniform3f(prog.u(`uLightPos[${i}]`), l.position.x, l.position.y, l.position.z);
          gl.uniform3f(prog.u(`uLightColour[${i}]`), l.colour[0], l.colour[1], l.colour[2]);
          gl.uniform4f(prog.u(`uLightParams[${i}]`), l.intensity, l.reach, l.radius, l.castsShadow === false ? 0 : 1);
        }
        gl.uniform1f(prog.u('uAmbient'), scene.ambient);
        gl.uniform3f(prog.u('uNight'), scene.night[0], scene.night[1], scene.night[2]);
        gl.uniform1f(prog.u('uNormalStrength'), opts.normalStrength);
        gl.uniform1f(prog.u('uSpecular'), opts.specular);
        gl.uniform1f(prog.u('uGloss'), opts.gloss);
        gl.uniform1f(prog.u('uTilt'), scene.camera.tilt);
        gl.uniform1f(prog.u('uOccluderHeight'), scene.occluderHeight);
        gl.uniform1f(prog.u('uSeamWidth'), opts.seamWidth);
        gl.uniform1f(prog.u('uSeamDarken'), opts.seamDarken);
        gl.uniform1f(prog.u('uSeamBevel'), opts.seamBevel);
        gl.uniform1i(prog.u('uDebug'), opts.debug);
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.batcher.upload(buildVertexData(sorted, scene.camera));
      const textures = new Map<string, WebGLTexture>();
      for (const [id, mat] of scene.materials) if (mat.albedo) textures.set(id, mat.albedo);
      drawCalls = useLighting
        ? this.drawLit(prog, batches, scene, textures, opts)
        : this.batcher.draw(prog, batches, textures);
      gl.disable(gl.BLEND);
    }

    // --- 2. bloom -------------------------------------------------------
    this.bloom(sceneRT, opts);

    // --- 3. composite ---------------------------------------------------
    const comp = this.cache.get('composite', compositeSource());
    gl.useProgram(comp.handle);
    bindTarget(gl, null, this.width, this.height);
    this.bind(comp, { uScene: sceneRT.texture, uBloom: (this.mips[0] ?? sceneRT).texture });
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, this.lut);
    gl.uniform1i(comp.u('uLut'), 2);
    gl.uniform1f(comp.u('uBloomAmount'), this.mips.length ? opts.bloomStrength : 0);
    gl.uniform1f(comp.u('uExposure'), opts.exposure);
    gl.uniform1f(comp.u('uLutMix'), opts.lutMix);
    gl.uniform1i(comp.u('uTonemap'), TONEMAP_ID[opts.tonemap]);
    drawFullscreen(gl);

    this.gpuTimer.end?.();
    return this.stats(drawCalls, lights.length, sorted.length, start, useLighting);
  }

  private bloom(sceneRT: Target, opts: Required<RenderOptions>): void {
    if (!this.mips.length) return;
    const gl = this.device.gl;
    let src: Target = sceneRT;
    for (let i = 0; i < this.mips.length; i++) {
      const prog = this.cache.get(i === 0 ? 'bloom-prefilter' : 'bloom-down', i === 0 ? PREFILTER : DOWNSAMPLE);
      gl.useProgram(prog.handle);
      bindTarget(gl, this.mips[i]);
      this.bind(prog, { uSrc: src.texture });
      gl.uniform2f(prog.u('uTexel'), 1 / src.width, 1 / src.height);
      // Karis on the FIRST downsample only. Applying it all the way down
      // progressively dims the bloom — a different bug that reads as the
      // effect simply not working.
      gl.uniform1i(prog.u('uKaris'), i === 0 && opts.karis ? 1 : 0);
      gl.uniform1f(prog.u('uThreshold'), opts.bloomThreshold);
      gl.uniform1f(prog.u('uKnee'), Math.max(opts.bloomKnee, 1e-4));
      drawFullscreen(gl);
      src = this.mips[i];
    }
    // Accumulate on the way up, so each level is blurred again by every step
    // above it. That is what makes the falloff multi-scale rather than a
    // single wide blur pasted on.
    const up = this.cache.get('bloom-up', UPSAMPLE);
    gl.useProgram(up.handle);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.mips.length - 1; i > 0; i--) {
      bindTarget(gl, this.mips[i - 1]);
      this.bind(up, { uSrc: this.mips[i].texture });
      gl.uniform2f(up.u('uTexel'), 1 / this.mips[i].width, 1 / this.mips[i].height);
      gl.uniform1f(up.u('uRadius'), 1);
      drawFullscreen(gl);
    }
    gl.disable(gl.BLEND);
  }

  /**
   * Upload the occupancy grid, but only when it actually changed.
   *
   * The grid is per-floor, not per-frame — it changes when a wall is broken
   * or the hero takes stairs, which is a handful of times a minute against
   * sixty uploads a second. Keyed on dimensions plus a cheap checksum rather
   * than comparing the whole array: a floor is a few hundred bytes, so the
   * checksum is far cheaper than the upload it avoids.
   */
  private ensureOccupancy(scene: Scene): WebGLTexture | null {
    const gl = this.device.gl;
    const grid = scene.occluders;
    if (!grid) return null;
    let sum = 0;
    for (let i = 0; i < grid.solid.length; i++) sum = (sum + grid.solid[i] * (i + 1)) | 0;
    const key = `${grid.width}x${grid.height}:${sum}`;
    if (key === this.occupancyKey && this.occupancy) return this.occupancy;

    if (!this.occupancy) this.occupancy = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.occupancy);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // Expand 0/1 to 0/255. R8 is a UNORM format, so the shader receives
    // value/255 — uploading a literal 1 arrives as 0.0039 and fails every
    // sensible threshold, which makes shadows silently never cast.
    const bytes = new Uint8Array(grid.solid.length);
    for (let i = 0; i < grid.solid.length; i++) bytes[i] = grid.solid[i] ? 255 : 0;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, grid.width, grid.height, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
    // NEAREST, always. A tile is solid or it is not, and filtering the grid
    // would invent half-solid tiles at every wall edge — which reads as light
    // bleeding through the first half-tile of every wall.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // Clamp is now belt-and-braces only: `traceShadow` bounds-checks before
    // it samples, because off the board is a TABLE rather than more rock (see
    // the note there). This deliberately differs from `isSolid`, which still
    // answers true off-grid — that is a GAMEPLAY claim about where a piece
    // may stand, not a claim about what stops light. Two different questions
    // that happened to share an answer while the board was the whole world.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.occupancyKey = key;
    return this.occupancy;
  }

  /** A single flat-normal texel, so the lit shader never samples a null. */
  private ensureFlatNormal(): WebGLTexture {
    const gl = this.device.gl;
    if (this.flatNormal) return this.flatNormal;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // (0.5, 0.5, 1.0) decodes to (0, 0, 1) — straight out of the surface.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.flatNormal = tex;
    return tex;
  }

  /**
   * The lit draw: same batches, plus each material's normal map on unit 1.
   *
   * A material without a normal gets the 1x1 flat one rather than being
   * skipped, so an un-baked asset still lights — flatly, but correctly, and
   * visibly enough to notice it needs baking. Leaving the previous batch's
   * normal bound would be the alternative, and that shades the hero with the
   * wall's bricks, which is a memorable bug to debug.
   *
   * EVERY per-material uniform is set on EVERY batch, never conditionally.
   * The conditional version reads as an optimisation and is a leak: a batch
   * that does not set a uniform inherits whatever the previous batch left
   * there, so one material's normal strength (or inlay) silently applies to
   * the next one, and which materials are affected depends on paint order —
   * i.e. on where the hero is standing. Exactly the same trap the flat-normal
   * fallback above exists to close, one uniform along.
   */
  private drawLit(
    prog: Program,
    batches: Parameters<SpriteBatcher['draw']>[1],
    scene: Scene,
    textures: ReadonlyMap<string, WebGLTexture>,
    opts: Required<RenderOptions>,
  ): number {
    const gl = this.device.gl;
    const flat = this.ensureFlatNormal();
    return this.batcher.draw(prog, batches, textures, (textureId) => {
      const mat = scene.materials.get(textureId);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, mat?.normal ?? flat);
      gl.uniform1i(prog.u('uNormal'), 1);
      gl.uniform1i(prog.u('uHasNormal'), mat?.normal ? 1 : 0);
      gl.uniform1f(prog.u('uNormalStrength'), mat?.normalStrength ?? opts.normalStrength);
      gl.uniform1f(prog.u('uInlay'), mat?.inlay ?? 0);
    });
  }

  private bind(program: Program, textures: Record<string, WebGLTexture | null>): void {
    const gl = this.device.gl;
    let unit = 0;
    for (const [name, tex] of Object.entries(textures)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(program.u(name), unit);
      unit++;
    }
  }

  private stats(drawCalls: number, lightCount: number, _sprites: number, start: number, lit = false): HudStats {
    const frameMs = performance.now() - start;
    this.cpuTimer.push(frameMs);
    return {
      tier: this.device.quality().name,
      frameMs,
      p50: this.cpuTimer.percentile(0.5),
      p99: this.cpuTimer.percentile(0.99),
      drawCalls,
      lightCount,
      gpuMs: this.gpuTimer.available ? this.gpuTimer.ms : null,
      lit,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cache.clear();
    this.batcher.dispose();
    this.scene?.dispose();
    for (const m of this.mips) m.dispose();
    this.mips = [];
    const gl = this.device.gl;
    if (this.lut) gl.deleteTexture(this.lut);
    if (this.occupancy) gl.deleteTexture(this.occupancy);
    if (this.flatNormal) gl.deleteTexture(this.flatNormal);
    this.lut = null;
    this.occupancy = null;
    this.flatNormal = null;
  }
}
