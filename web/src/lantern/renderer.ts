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
}

const DEFAULTS: Required<RenderOptions> = {
  exposure: 1,
  bloomStrength: 0.55,
  bloomThreshold: 1,
  bloomKnee: 0.6,
  karis: true,
  tonemap: 'agx',
  lutMix: 0,
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

    let drawCalls = 0;
    if (sorted.length) {
      const prog = this.cache.get('sprite', SPRITE_FRAG, SPRITE_VERT);
      gl.useProgram(prog.handle);
      gl.uniform2f(prog.u('uViewport'), sceneRT.width, sceneRT.height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.batcher.upload(buildVertexData(sorted, scene.camera));
      const textures = new Map<string, WebGLTexture>();
      for (const [id, mat] of scene.materials) if (mat.albedo) textures.set(id, mat.albedo);
      drawCalls = this.batcher.draw(prog, batches, textures);
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
    return this.stats(drawCalls, cullLights(scene.lights, bounds).length, sorted.length, start);
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

  private stats(drawCalls: number, lightCount: number, _sprites: number, start: number): HudStats {
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
    if (this.lut) this.device.gl.deleteTexture(this.lut);
    this.lut = null;
  }
}
