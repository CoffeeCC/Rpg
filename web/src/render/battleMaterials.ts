// =========================================================================
// THE ARENA'S MATERIALS — where `battleScene.ts`'s texture ids get pixels.
//
// Same split, same two rules, as `render/materials.ts` — which this file
// deliberately does NOT reuse, because the map's library requests wall art,
// eight object icons and a hero sprite that an arena has no use for, and does
// not have the two things an arena does: a candle, and a painted backdrop that
// changes per fight rather than per gate.
//
// THE TWO UPLOAD RULES, restated because both have cost hours in this project:
//
//   COLOUR is SRGB8_ALPHA8. Everything past the sampler is linear-light, so
//   gamma-encoded bytes make every midtone too bright.
//
//   NORMALS are RGBA8, NEVER sRGB. A normal map is three numbers that happen
//   to live in a colour texture; an sRGB decode turns 0.5 — "no tilt on this
//   axis" — into 0.21 and tips every surface.
//
// ASYNCHRONY IS NOT AN ERROR STATE. `SpriteBatcher.draw` skips a batch whose
// texture id is missing, so the arena renders the instant the procedural
// furniture exists and gains its painted figures and backdrop as they arrive.
// A monster with no painting costs that monster a figure and nothing else —
// which is 41 of 92 of them (ENGINE_PLAN §8's cleanup list).
// =========================================================================

import type { Material } from '../lantern/scene/scene';
import { createRGBATexture } from '../lantern/gl/procedural';
import {
  baseDiscNormalPixels,
  baseDiscPixels,
  blockShadowPixels,
  contactShadowPixels,
} from '../lantern/scene/piece';
import {
  boardFrameNormalPixels,
  boardFramePixels,
  boardRimNormalPixels,
  boardRimPixels,
  fieldToAlbedo,
  fieldToNormals,
  woodField,
} from '../lantern/scene/board';
import { flamePixels } from '../lantern/scene/emitters';
import { MAT_ARENA, MAT_BACKDROP, MAT_BLANK, MAT_CANDLE } from './battleScene';

export interface BattleMaterialLibrary {
  materials: Map<string, Material>;
  /** Queue a colour texture for `id` from `url`. Idempotent; a repeat is free. */
  request(id: string, url: string, extra?: Partial<Material>): void;
  /** Drop a texture so a new fight can put a different image behind the same id. */
  forget(id: string): void;
  dispose(): void;
}

// -------------------------------------------------------------------------
// THE CANDLE — pure pixels, so the shape is testable without a context
// -------------------------------------------------------------------------

/**
 * A wax column with a wick, as an upright quad's albedo.
 *
 * Generated rather than drawn for the reason every generator in this engine is
 * generated: it is geometry, so it can be re-tuned without a re-shoot and
 * asserted as a falloff rather than as a screenshot. The column is narrower
 * than the quad so the sprite's own edges are transparent and the silhouette
 * comes from the alpha, not from the quad.
 */
export function candlePixels(size = 64): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const half = 0.24; // column half-width, in UV
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size; // 0 at the TOP of the quad (see procedural.ts)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const dx = u - 0.5;
      const i = (y * size + x) * 4;
      // The wick occupies the top eighth, dead centre.
      if (v < 0.12) {
        if (Math.abs(dx) < 0.022) {
          const soot = 1 - v / 0.12;
          out[i] = 46 + 30 * soot;
          out[i + 1] = 38 + 22 * soot;
          out[i + 2] = 32 + 14 * soot;
          out[i + 3] = 255;
        }
        continue;
      }
      if (Math.abs(dx) > half) continue;
      // Cylindrical shading across the column: bright a third of the way from
      // the left, falling off to a dark right edge. A flat column reads as a
      // strip of paper, and this is the cheapest thing that says "round".
      const across = dx / half; // -1..1
      const lobe = Math.cos((across - 0.32) * 1.25);
      const shade = 0.42 + 0.58 * Math.max(0, lobe) ** 1.4;
      // The top rim of the wax is melted and translucent; the base is dirty.
      const melt = v < 0.2 ? 1.16 : 1;
      const grime = 0.9 + 0.1 * (1 - v);
      const k = shade * melt * grime;
      out[i] = Math.min(255, 236 * k);
      out[i + 1] = Math.min(255, 222 * k);
      out[i + 2] = Math.min(255, 186 * k);
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Tangent-space normals for the column, from the same cylinder. */
export function candleNormalPixels(size = 64): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const half = 0.24;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const dx = u - 0.5;
      const i = (y * size + x) * 4;
      out[i] = 128;
      out[i + 1] = 128;
      out[i + 2] = 255;
      out[i + 3] = 255;
      if (v < 0.12 || Math.abs(dx) > half) continue;
      const across = Math.max(-1, Math.min(1, dx / half));
      const nx = across * 0.92;
      const nz = Math.sqrt(Math.max(1e-4, 1 - nx * nx));
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = 128;
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

/** Board frame chamfer, per axis — one fraction would over-chamfer the short edges. */
function frameOptions(width: number, height: number, border: number) {
  const w = width + border * 2;
  const h = height + border * 2;
  return { borderU: (border * 0.86) / w, borderV: (border * 0.86) / h };
}

/**
 * Everything an arena needs that is made of arithmetic rather than art.
 *
 * Note the board dimensions are a HINT here rather than a fact: the arena's
 * width is solved from the viewport every frame (`battleScene.arenaWidth`), so
 * the frame's chamfer is baked for the first size it saw. That is fine and it
 * is why it is stated — the chamfer is a few percent of a texture that is
 * stretched over the whole slab, and re-baking it on every resize would upload
 * a 512x512 texture during a drag.
 */
export function createBattleMaterialLibrary(
  gl: WebGL2RenderingContext,
  board: { width: number; height: number; border: number },
): BattleMaterialLibrary {
  const materials = new Map<string, Material>();
  const owned = new Map<string, WebGLTexture[]>();
  const pending = new Set<string>();
  let disposed = false;

  const own = (id: string, tex: WebGLTexture): WebGLTexture => {
    const list = owned.get(id);
    if (list) list.push(tex);
    else owned.set(id, [tex]);
    return tex;
  };

  materials.set(MAT_BLANK, {
    id: MAT_BLANK,
    albedo: own(MAT_BLANK, createRGBATexture(gl, 1, new Uint8Array([255, 255, 255, 255]))),
  });
  materials.set('shadow', {
    id: 'shadow',
    // Alpha-only mask, so NOT sRGB — there is no colour in it to decode.
    albedo: own('shadow', createRGBATexture(gl, 96, contactShadowPixels(96), { mipmap: true })),
  });
  materials.set('blockshadow', {
    id: 'blockshadow',
    albedo: own('blockshadow', createRGBATexture(gl, 96, blockShadowPixels(96), { mipmap: true })),
  });
  materials.set('base', {
    id: 'base',
    albedo: own('base', createRGBATexture(gl, 128, baseDiscPixels(128), { srgb: true, mipmap: true })),
    normal: own('base', createRGBATexture(gl, 128, baseDiscNormalPixels(128), { mipmap: true })),
    normalStrength: 1,
  });
  materials.set(MAT_CANDLE, {
    id: MAT_CANDLE,
    albedo: own(MAT_CANDLE, createRGBATexture(gl, 64, candlePixels(64), { srgb: true, mipmap: true })),
    normal: own(MAT_CANDLE, createRGBATexture(gl, 64, candleNormalPixels(64), { mipmap: true })),
    normalStrength: 1,
  });
  materials.set('flame', {
    id: 'flame',
    albedo: own('flame', createRGBATexture(gl, 96, flamePixels(96), { srgb: true, mipmap: true })),
    emissiveStrength: 2.4,
  });

  const fo = frameOptions(board.width, board.height, board.border);
  materials.set('frame', {
    id: 'frame',
    albedo: own('frame', createRGBATexture(gl, 512, boardFramePixels(512, fo), { srgb: true, mipmap: true })),
    normal: own('frame', createRGBATexture(gl, 512, boardFrameNormalPixels(512, fo), { mipmap: true })),
    normalStrength: 1,
  });
  materials.set('rim', {
    id: 'rim',
    albedo: own('rim', createRGBATexture(gl, 256, boardRimPixels(256), { srgb: true, mipmap: true, repeat: true })),
    normal: own('rim', createRGBATexture(gl, 256, boardRimNormalPixels(256), { mipmap: true, repeat: true })),
    normalStrength: 1,
  });
  const tableField = woodField(256, { grain: 7, warp: 1.5 });
  materials.set('table', {
    id: 'table',
    albedo: own(
      'table',
      createRGBATexture(gl, 256, fieldToAlbedo(tableField, 256, [30, 21, 14], [92, 64, 40]), {
        srgb: true,
        mipmap: true,
        repeat: true,
      }),
    ),
    normal: own('table', createRGBATexture(gl, 256, fieldToNormals(tableField, 256, 0.9), { mipmap: true, repeat: true })),
    normalStrength: 1,
  });

  function request(id: string, url: string, extra: Partial<Material> = {}): void {
    if (disposed || materials.has(id) || pending.has(id)) return;
    pending.add(id);
    const img = new Image();
    img.onload = () => {
      pending.delete(id);
      if (disposed) return;
      const tex = gl.createTexture();
      if (!tex) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      own(id, tex);
      materials.set(id, { id, albedo: tex, ...extra });
    };
    // A missing asset is not an error worth shouting about.
    img.onerror = () => pending.delete(id);
    img.src = url;
  }

  /**
   * Free one id so it can be re-requested with a different image.
   *
   * The map never needs this — a floor's tile art is fixed for the life of the
   * device. The arena does: `backdrop` means "the painting behind THIS fight",
   * and walking from Hollow Gate into Sunken Gate must not leave the first
   * gate's painting standing behind the second one's monsters.
   */
  function forget(id: string): void {
    const list = owned.get(id);
    if (list) for (const tex of list) gl.deleteTexture(tex);
    owned.delete(id);
    materials.delete(id);
    pending.delete(id);
  }

  return {
    materials,
    request,
    forget,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const list of owned.values()) for (const tex of list) gl.deleteTexture(tex);
      owned.clear();
      materials.clear();
    },
  };
}

/** What the arena floor is made of. Falls back to a bare slab off-gate. */
export function requestArenaFloor(lib: BattleMaterialLibrary, groundUrl: string | null): void {
  if (groundUrl) lib.request(MAT_ARENA, groundUrl, { inlay: 1 });
}

/** The painting that stands behind the fight (§8 item 6, now that it is data). */
export function requestBackdrop(lib: BattleMaterialLibrary, url: string | null): void {
  if (url) lib.request(MAT_BACKDROP, url);
}

/** Painted figures for whoever is on the field. */
export function requestFigureArt(
  lib: BattleMaterialLibrary,
  art: readonly { textureId: string; url: string }[],
): void {
  for (const a of art) lib.request(a.textureId, a.url);
}
