// =========================================================================
// THE MATERIAL LIBRARY — where a Scene's texture ids get pixels.
//
// Split from `floorScene.ts` on purpose. The scene builder is pure and knows
// only ids; this file is the one that touches `gl`, loads PNGs off the network
// and holds handles that have to be freed. Keeping them apart is what lets the
// builder be unit-tested with a `Map` of fakes and no graphics context.
//
// TWO UPLOAD RULES, and both of them have cost hours somewhere in this
// project:
//
//   COLOUR is SRGB8_ALPHA8. Everything past the sampler is linear-light, so
//   handing it gamma-encoded bytes makes every midtone too bright.
//
//   NORMALS are RGBA8, never sRGB. A normal map is three numbers that happen
//   to live in a colour texture; an sRGB decode turns 0.5 — "no tilt on this
//   axis" — into 0.21 and tips every surface.
//
// ASYNCHRONY IS NOT AN ERROR STATE. `SpriteBatcher.draw` skips a batch whose
// texture id is missing from the map, so a floor renders the moment the
// procedural furniture exists and gains its painted tiles, icons and figures
// as they arrive. Nothing waits, nothing flashes, and a 404 on one monster
// costs that monster and nothing else.
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
import { flamePixels, mushroomPixels, wispPixels } from '../lantern/scene/emitters';
import { TILE_TEXTURES, SPRITE_ART, ICON_ART } from '../art/iconArt';
import { PAINTED_MONSTERS } from '../art/paintedCharacters';
import { MAT_BLANK, MAT_GROUND, MAT_HERO, MAT_WALL, iconTextureId } from './floorScene';

export interface MaterialLibrary {
  materials: Map<string, Material>;
  /** Queue a colour texture for `id` from `url`. Idempotent; a repeat is free. */
  request(id: string, url: string, extra?: Partial<Material>): void;
  /** True once at least the procedural furniture is up. */
  ready: boolean;
  dispose(): void;
}

/** Board frame chamfer, per axis — the slab is not square and one fraction
 *  would make the short edges twice as chamfered as the long ones. */
function frameOptions(width: number, height: number, border: number) {
  const w = width + border * 2;
  const h = height + border * 2;
  return { borderU: (border * 0.86) / w, borderV: (border * 0.86) / h };
}

/**
 * Everything a floor needs that is made of arithmetic rather than art.
 *
 * The table, the frame, the rim, the shadow under a piece, the bevel on its
 * base, and the three emitters. None of these should ever be an art file:
 * they are geometry, and a generated one is deterministic, re-tunable without
 * a re-shoot, and unit-testable as a falloff rather than as a screenshot.
 */
export function createMaterialLibrary(
  gl: WebGL2RenderingContext,
  gateId: string,
  board: { width: number; height: number; border: number },
): MaterialLibrary {
  const materials = new Map<string, Material>();
  const owned: WebGLTexture[] = [];
  let disposed = false;
  const pending = new Set<string>();

  const own = <T extends WebGLTexture>(tex: T): T => {
    owned.push(tex);
    return tex;
  };

  // A single opaque white texel. Tinted black it is the fog; tinted anything
  // it is a flat quad with no art, which is the cheapest possible primitive.
  materials.set(MAT_BLANK, {
    id: MAT_BLANK,
    albedo: own(createRGBATexture(gl, 1, new Uint8Array([255, 255, 255, 255]))),
  });

  materials.set('shadow', {
    id: 'shadow',
    // Alpha-only mask, so NOT sRGB — there is no colour in it to decode.
    albedo: own(createRGBATexture(gl, 96, contactShadowPixels(96), { mipmap: true })),
  });
  materials.set('blockshadow', {
    id: 'blockshadow',
    albedo: own(createRGBATexture(gl, 96, blockShadowPixels(96), { mipmap: true })),
  });
  materials.set('base', {
    id: 'base',
    albedo: own(createRGBATexture(gl, 128, baseDiscPixels(128), { srgb: true, mipmap: true })),
    normal: own(createRGBATexture(gl, 128, baseDiscNormalPixels(128), { mipmap: true })),
    normalStrength: 1,
  });

  const fo = frameOptions(board.width, board.height, board.border);
  materials.set('frame', {
    id: 'frame',
    albedo: own(createRGBATexture(gl, 512, boardFramePixels(512, fo), { srgb: true, mipmap: true })),
    normal: own(createRGBATexture(gl, 512, boardFrameNormalPixels(512, fo), { mipmap: true })),
    normalStrength: 1,
  });
  materials.set('rim', {
    id: 'rim',
    albedo: own(createRGBATexture(gl, 256, boardRimPixels(256), { srgb: true, mipmap: true, repeat: true })),
    normal: own(createRGBATexture(gl, 256, boardRimNormalPixels(256), { mipmap: true, repeat: true })),
    normalStrength: 1,
  });
  const tableField = woodField(256, { grain: 7, warp: 1.5 });
  materials.set('table', {
    id: 'table',
    albedo: own(
      createRGBATexture(gl, 256, fieldToAlbedo(tableField, 256, [30, 21, 14], [92, 64, 40]), {
        srgb: true,
        mipmap: true,
        repeat: true,
      }),
    ),
    normal: own(createRGBATexture(gl, 256, fieldToNormals(tableField, 256, 0.9), { mipmap: true, repeat: true })),
    normalStrength: 1,
  });

  // The faint emitters. Mipmaps ON: a 0.3-tile sprite is a dozen screen pixels
  // and its core would otherwise alias into a scintillating dot as it drifts,
  // which is the firefly case the bloom's Karis average exists for. This is
  // the cheaper half of the same fix.
  for (const [id, pixels, glow] of [
    ['flame', flamePixels(96), 2.4],
    ['mushroom', mushroomPixels(96), 1.7],
    ['wisp', wispPixels(96), 2.6],
  ] as const) {
    materials.set(id, {
      id,
      albedo: own(createRGBATexture(gl, 96, pixels, { srgb: true, mipmap: true })),
      emissiveStrength: glow,
    });
  }

  /**
   * Load a painted PNG/JPG and register it.
   *
   * `crossOrigin` is not set: every one of these is same-origin app art, and
   * asking for CORS on a same-origin request is a way to fail on file:// for
   * no benefit.
   */
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
      owned.push(tex);
      materials.set(id, { id, albedo: tex, ...extra });
    };
    // A missing asset is not an error worth shouting about: the sprite is
    // skipped and the rest of the board draws. 41 of 92 monsters have no
    // painting at all (ENGINE_PLAN §8), so this is the expected path.
    img.onerror = () => pending.delete(id);
    img.src = url;
  }

  const tiles = TILE_TEXTURES[gateId];
  if (tiles) {
    // `inlay` is what stops the floor reading as one continuous slab of rock:
    // every whole-tile boundary gets a seam and a chamfer, so the board
    // resolves into laid pieces the moment the lantern moves (§15.1).
    request(MAT_GROUND, tiles.ground, { inlay: 1 });
    request(MAT_WALL, tiles.wall, { inlay: 0.85 });
  }
  if (SPRITE_ART.player) request(MAT_HERO, SPRITE_ART.player);
  if (SPRITE_ART.merchant) request('sprite:merchant', SPRITE_ART.merchant);
  if (SPRITE_ART.tamer) request('sprite:tamer', SPRITE_ART.tamer);
  for (const icon of ['door', 'stairs', 'boss', 'barrel', 'chest', 'shrine', 'event', 'secret']) {
    const url = ICON_ART[icon];
    if (url) request(iconTextureId(icon), url);
  }

  return {
    materials,
    request,
    ready: true,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const tex of owned) gl.deleteTexture(tex);
      owned.length = 0;
      materials.clear();
    },
  };
}

/** Ask for whatever painted figures this floor's units need. */
export function requestUnitArt(lib: MaterialLibrary, speciesIds: readonly string[]): void {
  for (const id of speciesIds) {
    const url = PAINTED_MONSTERS[id];
    if (url) lib.request(`monster:${id}`, url);
  }
}
