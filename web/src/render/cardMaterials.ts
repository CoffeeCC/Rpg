// =========================================================================
// THE CARD'S MATERIALS — where `cardScene.ts`'s texture ids get pixels.
//
// A separate library from `battleMaterials.ts` and NOT a parameterised version
// of it, for the same reason that file is not a parameterised `materials.ts`:
// the arena's library is a candle, a backdrop, procedural board furniture and a
// combatant-art fallback chain, none of which a card has, and it resolves
// everything against `art/materials/board`, which is not where the card set
// lives. What the two genuinely share is the THREE UPLOAD RULES, and those are
// restated here rather than imported because every one of them has cost hours:
//
//   COLOUR is SRGB8_ALPHA8. Everything past the sampler is linear-light, so
//   gamma-encoded bytes make every midtone too bright.
//
//   NORMALS are RGBA8, NEVER sRGB. A normal map is three numbers that happen
//   to live in a colour texture; an sRGB decode turns 0.5 — "no tilt on this
//   axis" — into 0.21 and tips every surface.
//
//   THE MATERIAL MAP is RGBA8, NEVER sRGB, and it matters most here. All four
//   channels are data: R roughness, G specular, B iridescence, A occlusion. An
//   sRGB decode turns the gilt's 0.12 roughness into 0.014 and makes every
//   card's border a mirror — and it would do it to the foil's iridescence at
//   the same time, so the one channel this whole feature exists for would be
//   wrong in a way that still produced a picture.
//
// ASYNCHRONY IS NOT AN ERROR STATE. `SpriteBatcher.draw` skips a batch whose
// texture id is missing and `buildCardScene` only emits a quad for a material
// that has arrived, so the hand gains its stock, then its gilt, then its foil
// as the fetches land, in whatever order they land.
// =========================================================================

import type { CardRarity } from '../engine/types';
import type { Material } from '../lantern/scene/scene';
import {
  CARD_RARITIES,
  MAT_CARD_BACK,
  MAT_CARD_BORDER,
  MAT_CARD_STOCK,
  cardFoilBakeName,
  cardFoilId,
} from './cardScene';

/**
 * Where `tools/art/blender/publish.mjs`'s `publishCards` writes.
 *
 * Its own root, not a subfolder of the board's, because the two are different
 * publishes: the board set is copied straight out of staging, and the card set
 * is REPACKED there — a foil mask is not a sprite and has to be cut into the
 * gilt before anything can draw it. See that function's header.
 */
export const BAKED_CARD_ROOT = 'art/materials/cards';

export interface CardMaterialLibrary {
  materials: Map<string, Material>;
  /**
   * Queue one baked card shape by its bake name. Fetches all three maps —
   * `<name>.png` (colour, sRGB), `<name>_normal.png` and
   * `<name>_material.png` (both data, never sRGB) — and publishes the moment
   * the albedo lands so a card draws flat-shaded rather than not at all.
   * Idempotent; a repeat is free.
   */
  request(id: string, name: string, extra?: Partial<Material>): void;
  dispose(): void;
}

/**
 * How hard the card's relief is applied.
 *
 * FULL, like a combatant's and unlike a floor tile's. `render/materials.ts`
 * pulls tiles down to `TILE_RELIEF` because a tile is seen at a grazing angle
 * where a normal map exaggerates; a card is a billboard and is seen square on,
 * which is the angle the bake was rendered at. Anything less and the moulding's
 * two beads and the channel between them stop being three features.
 */
export const CARD_RELIEF = 1;

export function createCardMaterialLibrary(gl: WebGL2RenderingContext): CardMaterialLibrary {
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

  /**
   * Load one image into a texture, applying the upload rules.
   *
   * CLAMP_TO_EDGE always: nothing in the card set tiles. A card's frame IS its
   * silhouette, so a repeat wrap would wrap the gilt's own edge texel round to
   * the far side of the card and paint a second, wrong border there.
   */
  function loadTexture(url: string, srgb: boolean, done: (tex: WebGLTexture | null) => void): void {
    const img = new Image();
    img.onload = () => {
      if (disposed) return done(null);
      const tex = gl.createTexture();
      if (!tex) return done(null);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      // MIPMAPS ARE NOT OPTIONAL ON THIS SET. The bake is 731x1024 and a hand
      // card draws at 132x185, so every fetch is a 5.5x minification. Point
      // sampling that would alias the 4px foil grating into exactly the
      // crawling sparkle `bake.py` measured the pitch to avoid; the mip chain
      // is the box filter its pitch sweep modelled.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      done(tex);
    };
    // A missing asset is not an error worth shouting about: the card set is
    // published by a Blender bake that a fresh clone has not run.
    img.onerror = () => done(null);
    img.src = url;
  }

  function request(id: string, name: string, extra: Partial<Material> = {}): void {
    if (disposed || materials.has(id) || pending.has(id)) return;
    pending.add(id);
    const draft: {
      albedo: WebGLTexture | null;
      normal: WebGLTexture | null;
      material: WebGLTexture | null;
    } = { albedo: null, normal: null, material: null };
    const publish = () => {
      if (disposed || !draft.albedo) return;
      materials.set(id, {
        id,
        albedo: draft.albedo,
        normal: draft.normal ?? undefined,
        material: draft.material ?? undefined,
        normalStrength: CARD_RELIEF,
        ...extra,
      });
    };
    loadTexture(`${BAKED_CARD_ROOT}/${name}.png`, true, (tex) => {
      pending.delete(id);
      if (!tex) return;
      draft.albedo = own(id, tex);
      publish();
    });
    loadTexture(`${BAKED_CARD_ROOT}/${name}_normal.png`, false, (tex) => {
      if (!tex) return;
      draft.normal = own(id, tex);
      publish();
    });
    loadTexture(`${BAKED_CARD_ROOT}/${name}_material.png`, false, (tex) => {
      if (!tex) return;
      draft.material = own(id, tex);
      publish();
    });
  }

  return {
    materials,
    request,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const list of owned.values()) for (const tex of list) gl.deleteTexture(tex);
      owned.clear();
      materials.clear();
    },
  };
}

/**
 * Every layer a hand can need, requested once.
 *
 * ALL FOUR RARITIES, INCLUDING THE TWO THAT DRAW NOTHING. `starter` and
 * `common` publish as fully transparent images — foil is a rarity signal, so the
 * baseline has none — and fetching them anyway is what keeps `cardFoilId` a
 * lookup with no branch in it. They cost about 340 KB between them and every
 * pixel of them fails the shader's alpha test.
 *
 * Idempotent and safe to call from a mount effect: `request` no-ops once an id
 * is loaded or already in flight.
 */
export function requestCardFurniture(lib: CardMaterialLibrary): void {
  lib.request(MAT_CARD_STOCK, 'card_stock');
  lib.request(MAT_CARD_BORDER, 'card_border');
  lib.request(MAT_CARD_BACK, 'card_back');
  for (const rarity of CARD_RARITIES) {
    lib.request(cardFoilId(rarity as CardRarity), cardFoilBakeName(rarity as CardRarity));
  }
}
