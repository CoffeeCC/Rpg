// =========================================================================
// THE DEVICE — everything that knows the word "WebGL".
//
// The renderer above this file talks about targets, programs and draws. It
// does not talk about `gl.`. That boundary is deliberate and it is the only
// concession this project makes to WebGPU: the research (ENGINE_PLAN §9.2) is
// clear that a second backend would be a mistake TODAY — the workload is a
// texture-fetch-bound per-texel gather that compute barely helps, both Steam
// targets are AMD/SteamOS where WebGPU is still flag-gated, and the web build
// could not be WebGPU-only anyway. But "wrong now" is not "wrong forever", and
// a seam costs almost nothing while a retrofit costs everything.
//
// So: one WebGL2 path, behind an interface narrow enough that a second one
// could be written later by someone with a profiler and a reason.
// =========================================================================

import { TIERS, tierFromRenderer, type Quality, type TierName } from '../quality';

export interface DeviceCaps {
  /** What the driver calls itself. A hint for tier selection, never a guarantee. */
  renderer: string | null;
  vendor: string | null;
  /** Float render targets. Not optional — see `createDevice`. */
  colorBufferFloat: boolean;
  /** GPU timer queries, for the debug HUD. Absent on plenty of drivers. */
  timerQuery: boolean;
  maxTextureSize: number;
  /** Anisotropic filtering, for the board seen at a raking angle. */
  maxAnisotropy: number;
}

export type DeviceStatus = 'ok' | 'no-webgl2' | 'no-float-targets' | 'context-lost';

export interface Device {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  readonly caps: DeviceCaps;
  status(): DeviceStatus;
  /** The live tier. Mutable — the frame timer moves it. See `quality.ts`. */
  quality(): Quality;
  setTier(t: TierName): void;
  /** Size in device px, after DPR and render scale. */
  size(): { width: number; height: number };
  /** Re-read the canvas box and resize the drawing buffer. Returns true if it changed. */
  resize(cssWidth: number, cssHeight: number, dpr: number): boolean;
  /** Called when the GL context comes back and every resource must be rebuilt. */
  onRestored(fn: () => void): () => void;
  dispose(): void;
}

/**
 * How much of the frame we are willing to spend on device pixels.
 *
 * A 4K monitor at DPR 2 is 33 megapixels of lighting work for a game drawn at
 * tile scale, which is a straight waste — the art is nowhere near that
 * resolution and the light has no high-frequency content at all. Cap the
 * buffer and let CSS scale it up.
 */
const MAX_DEVICE_PIXELS = 2560 * 1440;

export interface DeviceResult {
  device: Device | null;
  status: DeviceStatus;
  /** Why it failed, in words a human can act on. */
  reason?: string;
}

/**
 * Stand up a device, or explain precisely why not.
 *
 * FAILS LOUDLY ON MISSING FLOAT TARGETS, on purpose. `EXT_color_buffer_float`
 * is universal on WebGL2-capable hardware, and every part of this renderer
 * assumes an HDR pipeline: the cascade merge needs alpha to carry
 * transmittance, bloom needs values above 1 to have anything to bloom, and AgX
 * needs a scene-referred range to tonemap. A silent 8-bit fallback would not
 * be a lesser version of this renderer, it would be a different and much worse
 * one, shipped without anybody noticing. Better to refuse and let the DOM
 * renderer keep the game running.
 */
export interface DeviceOptions {
  /**
   * Give the drawing buffer an alpha channel, so the page shows through where
   * nothing was drawn.
   *
   * OFF BY DEFAULT, AND THAT IS THE RIGHT DEFAULT. A board renderer owns its
   * whole box: the map and the arena both paint a table under everything and
   * an opaque buffer is measurably cheaper to composite, which is why
   * `alpha: false` was chosen in the first place.
   *
   * The case that needs the other answer is a canvas that OVERLAYS the game
   * rather than backing it. `render/LanternCards.tsx` spans the entire battle
   * stage because a hand card rides up over the battlefield, and it draws about
   * eight cards in that box — with an opaque buffer the other 90% of it is a
   * flat slab of `scene.night` painted over the whole fight.
   *
   * Costs one branch here and `RenderOptions.transparent` in the renderer,
   * which must be set to match: the buffer having an alpha channel and the
   * composite writing one are two separate facts.
   */
  transparent?: boolean;
}

export function createDevice(canvas: HTMLCanvasElement, options: DeviceOptions = {}): DeviceResult {
  const gl = canvas.getContext('webgl2', {
    alpha: options.transparent === true,
    antialias: false,
    depth: false,
    stencil: false,
    // The scene is opaque and repainted every frame, so there is nothing worth
    // preserving and preserving it costs a copy.
    preserveDrawingBuffer: false,
    // We composite over page background ourselves; premultiplied is what the
    // compositor wants and what avoids a fringe on every alpha edge.
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
    // NOT `willReadFrequently`. LIGHTING_PLAN §7 commits to never setting it:
    // it forces a software-backed canvas. Nothing in the frame path reads the
    // buffer back — the debug HUD and the material baker do, and they are
    // allowed to be slow.
  }) as WebGL2RenderingContext | null;

  if (!gl) {
    return {
      device: null,
      status: 'no-webgl2',
      reason: 'WebGL2 is unavailable. The DOM renderer stays in charge.',
    };
  }

  const float = gl.getExtension('EXT_color_buffer_float');
  if (!float) {
    return {
      device: null,
      status: 'no-float-targets',
      reason:
        'EXT_color_buffer_float is missing, so HDR render targets are impossible. ' +
        'Refusing rather than silently rendering an 8-bit version of a renderer built around high dynamic range.',
    };
  }

  // Linear filtering of half-float is CORE in WebGL2 (the extension is a WebGL1
  // thing), and cascade upsampling depends on it. Worth stating where someone
  // will look for it rather than leaving its absence to be discovered.

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const caps: DeviceCaps = {
    renderer: dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string) : gl.getParameter(gl.RENDERER),
    vendor: dbg ? (gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) as string) : gl.getParameter(gl.VENDOR),
    colorBufferFloat: true,
    timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    maxAnisotropy: aniso ? (gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) : 1,
  };

  const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  let tier: TierName = tierFromRenderer(caps.renderer, deviceMemory);
  let lost = false;
  let width = 1;
  let height = 1;
  const restoredHandlers = new Set<() => void>();

  /**
   * Context loss, and why it is handled rather than ignored.
   *
   * LIGHTING_PLAN §5 rejected WebGL partly because "a lost context means no
   * darkness, i.e. the scene at full brightness" — the old light layer WAS the
   * darkness, so an empty canvas was a blown-out scene.
   *
   * That inverts here and the inversion is the point: this renderer owns the
   * whole world, so a lost context is a BLACK frame, not a bright one. Black
   * is a legible failure. And unlike the old arrangement it is recoverable —
   * preventDefault on the loss event asks the browser for a restore, and every
   * resource gets rebuilt from the scene, which is data we still hold.
   */
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    lost = false;
    for (const fn of restoredHandlers) fn();
  };
  canvas.addEventListener('webglcontextlost', onLost as EventListener, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  const device: Device = {
    gl,
    canvas,
    caps,
    status: () => (lost || gl.isContextLost() ? 'context-lost' : 'ok'),
    quality: () => TIERS[tier],
    setTier: (t) => {
      tier = t;
    },
    size: () => ({ width, height }),
    resize: (cssWidth, cssHeight, dpr) => {
      const scale = TIERS[tier].renderScale;
      let w = Math.max(1, Math.round(cssWidth * dpr * scale));
      let h = Math.max(1, Math.round(cssHeight * dpr * scale));
      // Clamp total pixels rather than either axis, so an ultrawide keeps its
      // shape instead of being squared off.
      const pixels = w * h;
      if (pixels > MAX_DEVICE_PIXELS) {
        const k = Math.sqrt(MAX_DEVICE_PIXELS / pixels);
        w = Math.max(1, Math.round(w * k));
        h = Math.max(1, Math.round(h * k));
      }
      w = Math.min(w, caps.maxTextureSize);
      h = Math.min(h, caps.maxTextureSize);
      if (w === width && h === height) return false;
      width = w;
      height = h;
      // Only on a real change. Assigning `canvas.width` clears the drawing
      // buffer even when the value is unchanged — the same trap the old
      // LightLayer documented, and the same one-frame flash if it is tripped
      // from a resize observer that fires on every layout.
      canvas.width = w;
      canvas.height = h;
      return true;
    },
    onRestored: (fn) => {
      restoredHandlers.add(fn);
      return () => restoredHandlers.delete(fn);
    },
    dispose: () => {
      restoredHandlers.clear();
      canvas.removeEventListener('webglcontextlost', onLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      // Best-effort: tell the driver to drop the context now rather than at GC.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };

  return { device, status: 'ok' };
}
