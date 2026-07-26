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
// The map's bake conventions, reused deliberately: a combatant IS one of the
// bevel assets `render/materials.ts` already resolves, so the fight and the
// floor must agree on which cut of a sprite is the real one.
import { BAKED_ROOT, PIECE_RELIEF, bakedRef } from './materials';
import {
  MAT_ARENA,
  MAT_BACKDROP,
  MAT_BLANK,
  MAT_CANDLE,
  MAT_CORNER_BRASS,
  MAT_RAIL_STRIP,
  MAT_SOCKET,
} from './battleScene';

/**
 * Where `tools/art/blender/bake.py` publishes to (`tools/art/blender/publish.mjs`
 * copies staging's `<name>.png` / `<name>_normal.png` here, mirroring
 * `render/materials.ts`'s `BAKED_ROOT` convention for the bevel/tile bakes).
 *
 * NOT reused from `materials.ts` on purpose: `bakedRef` there parses the
 * EDT-bevel naming (`<set>/<source>_albedo.png`) off a source art URL, and the
 * Blender board bakes are a different pipeline with a different convention —
 * `<name>.png` is itself the albedo, there is no source art to derive a URL
 * from, and AO is never published at all (see the header of `publish.mjs`).
 */
export const BAKED_BOARD_ROOT = 'art/materials/board';

export interface BattleMaterialLibrary {
  materials: Map<string, Material>;
  /** Queue a colour texture for `id` from `url`. Idempotent; a repeat is free. */
  request(id: string, url: string, extra?: Partial<Material>): void;
  /**
   * Queue a Blender-baked board furniture shape (§19.1) by its bake name —
   * `candle_socket`, `board_corner_brass`, `candle_rail_strip`, and so on.
   * Fetches BOTH `${name}.png` (colour) and `${name}_normal.png` (relief) from
   * `BAKED_BOARD_ROOT` and applies the two upload rules stated at the top of
   * this file: colour is `SRGB8_ALPHA8`, the normal is `RGBA8` and never sRGB.
   * `repeat: true` wraps both textures instead of clamping, for a shape
   * authored to tile (the candle rail strip's registered height axis).
   */
  requestFurniture(id: string, name: string, extra?: Partial<Material> & { repeat?: boolean }): void;
  /**
   * A combatant's painted art: the REPAIRED cut plus its carved relief.
   * Prefers `<name>_albedo.png` over the original URL — see `requestFigureArt`
   * for why the fight was drawing ghosts while the floor was not.
   */
  requestFigure(id: string, url: string): void;
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

  /**
   * Load one image into a texture, applying the two upload rules.
   *
   * `srgb` decides `SRGB8_ALPHA8` (colour) versus `RGBA8` (a normal map or any
   * other numeric field) — getting this backwards on a normal map bends every
   * vector toward +z, per this file's header. `repeat` is CLAMP_TO_EDGE unless
   * a shape is authored to tile (the candle rail's registered height axis).
   */
  function loadTexture(
    url: string,
    srgb: boolean,
    repeat: boolean,
    done: (tex: WebGLTexture | null) => void,
  ): void {
    const img = new Image();
    img.onload = () => {
      if (disposed) return done(null);
      const tex = gl.createTexture();
      if (!tex) return done(null);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.generateMipmap(gl.TEXTURE_2D);
      done(tex);
    };
    // A missing asset is not an error worth shouting about.
    img.onerror = () => done(null);
    img.src = url;
  }

  function request(id: string, url: string, extra: Partial<Material> = {}): void {
    if (disposed || materials.has(id) || pending.has(id)) return;
    pending.add(id);
    loadTexture(url, true, false, (tex) => {
      pending.delete(id);
      if (!tex) return;
      own(id, tex);
      materials.set(id, { id, albedo: tex, ...extra });
    });
  }

  /**
   * The furniture path: two fetches (colour + normal) rather than one, so it
   * cannot reuse `request`'s single-texture draft. Publishes the moment the
   * ALBEDO lands — same rule as `render/materials.ts`'s draft pattern — so a
   * socket or a strip is drawn (flat-shaded) the instant its colour arrives
   * rather than waiting on both fetches, and the normal fills in whenever it
   * finishes, in whichever order the two requests land.
   */
  /**
   * A COMBATANT: the repaired cut, then the carved relief.
   *
   * Two fetches like `requestFurniture`, but the albedo has a FALLBACK CHAIN
   * rather than a fixed name — `<name>_albedo.png` first, the original URL
   * second. See `requestFigureArt` for why that order is the whole point.
   *
   * `disposed` is checked before falling back, not only inside the load: React
   * StrictMode builds a library, throws it away and builds another, and without
   * this the dead one answers its own baked load with "null, because I am
   * disposed" and then fetches the original as though the bake were missing.
   * Harmless, but it puts a phantom request for every ghostly original in the
   * network log — which is precisely the evidence someone would use to conclude
   * this feature does not work. `materials.ts` paid for that lesson already.
   */
  function requestFigure(id: string, url: string): void {
    if (disposed || materials.has(id) || pending.has(id)) return;
    pending.add(id);
    const baked = bakedRef(url);
    const draft: { albedo: WebGLTexture | null; normal: WebGLTexture | null } = {
      albedo: null,
      normal: null,
    };
    const publish = () => {
      if (disposed || !draft.albedo) return;
      materials.set(id, {
        id,
        albedo: draft.albedo,
        normal: draft.normal ?? undefined,
        ...(baked ? { normalStrength: PIECE_RELIEF } : {}),
      });
    };
    const takeAlbedo = (tex: WebGLTexture | null) => {
      pending.delete(id);
      if (!tex) return;
      draft.albedo = own(id, tex);
      publish();
    };
    if (baked && baked.bevel) {
      loadTexture(`${BAKED_ROOT}/${baked.set}/${baked.name}_albedo.png`, true, false, (tex) => {
        if (tex) return takeAlbedo(tex);
        if (disposed) return;
        loadTexture(url, true, false, takeAlbedo);
      });
    } else {
      loadTexture(url, true, false, takeAlbedo);
    }
    if (baked) {
      // NEVER sRGB — an sRGB decode turns 0.5 ("no tilt") into 0.21 and every
      // surface lights as though tilted hard.
      loadTexture(`${BAKED_ROOT}/${baked.set}/${baked.name}_normal.png`, false, false, (tex) => {
        if (!tex) return;
        draft.normal = own(id, tex);
        publish();
      });
    }
  }

  function requestFurniture(
    id: string,
    name: string,
    extra: Partial<Material> & { repeat?: boolean } = {},
  ): void {
    if (disposed || materials.has(id) || pending.has(id)) return;
    pending.add(id);
    const { repeat = false, ...matExtra } = extra;
    const draft: { albedo: WebGLTexture | null; normal: WebGLTexture | null } = {
      albedo: null,
      normal: null,
    };
    const publish = () => {
      if (disposed || !draft.albedo) return;
      materials.set(id, { id, albedo: draft.albedo, normal: draft.normal ?? undefined, ...matExtra });
    };
    loadTexture(`${BAKED_BOARD_ROOT}/${name}.png`, true, repeat, (tex) => {
      pending.delete(id);
      if (!tex) return;
      draft.albedo = own(id, tex);
      publish();
    });
    loadTexture(`${BAKED_BOARD_ROOT}/${name}_normal.png`, false, repeat, (tex) => {
      if (!tex) return;
      draft.normal = own(id, tex);
      publish();
    });
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
    requestFurniture,
    requestFigure,
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

/**
 * Painted figures for whoever is on the field.
 *
 * THIS USED TO PASS THE RAW URL, and that is why Paul kept seeing ghosts.
 *
 * `render/materials.ts` fixed the map by preferring `<name>_albedo.png` — the
 * source art wearing a REPAIRED matte. The originals were cut with a
 * luminance key, so dark cloth keyed out as low alpha and the alpha channel is
 * legibly a drawing of the character rather than a silhouette; mean
 * fully-opaque across the set is 59.6% before the repair and 91.6% after, and
 * `hero` alone goes 41.14% -> 95.26%. A figure at two thirds alpha is two
 * thirds of a figure and one third of the board behind it.
 *
 * The battle path never got that preference, so the fight kept drawing the
 * ghostly originals while the floor drew the repaired ones — the same pieces,
 * two different answers, which is exactly the shape of bug that survives
 * because each screen looks self-consistent.
 *
 * It also collects `_normal.png`, so a combatant lights as the carved relief
 * §15 asks for rather than as a flat card, at `PIECE_RELIEF` — full strength,
 * because a billboard never sees the grazing angle that forced tiles down to
 * `TILE_RELIEF`.
 *
 * Falls back to the original URL when there is no bake, so an unbaked species
 * still appears rather than vanishing.
 */
export function requestFigureArt(
  lib: BattleMaterialLibrary,
  art: readonly { textureId: string; url: string }[],
): void {
  for (const a of art) lib.requestFigure(a.textureId, a.url);
}

/**
 * The Blender-baked board furniture (§19.1) that has a fixed position on the
 * arena's own frame — no DOM measuring, unlike the portrait bezels, lantern
 * cradle, log well and pile trays, which need a `.bf-*` rect to sit behind and
 * are not requested here (ENGINE_PLAN §21.7).
 *
 * Idempotent and safe to call every frame's mount effect: `requestFurniture`
 * no-ops once the id is loaded or already in flight, same as `request`.
 */
export function requestBoardFurniture(lib: BattleMaterialLibrary): void {
  lib.requestFurniture(MAT_SOCKET, 'candle_socket');
  lib.requestFurniture(MAT_RAIL_STRIP, 'candle_rail_strip', { repeat: true });
  lib.requestFurniture(MAT_CORNER_BRASS, 'board_corner_brass');
}
