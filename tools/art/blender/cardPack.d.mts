// Types for `cardPack.mjs`, so `web/`'s TypeScript project can import the pure
// packing arithmetic in a test. The publisher itself is plain node ESM and is
// not part of that project.
//
// The shape below is what `tools/art/image.mjs`'s `readImage` returns.
export interface RawImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface CardSurface {
  roughness: number;
  specular: number;
}

/** Roughness and specular per card shape, for the material map's R and G. */
export const CARD_MATERIAL: Record<'card_stock' | 'card_border' | 'card_back', CardSurface>;

/** The foil's own numbers — a broader lobe than the gilt, on purpose. */
export const CARD_FOIL_MATERIAL: CardSurface;

/** The tiers a card can be, which is not the same as the tiers baked. */
export const CARD_FOIL_TIERS: readonly string[];

/** The gilt, cut to a rarity's foil mask: RGB from the border, A = both edges. */
export function cutFoilAlbedo(border: RawImage, mask: RawImage): Uint8ClampedArray;

/** The moulding's relief with the grating carried on top of it. */
export function combineNormals(base: RawImage, detail: RawImage): Uint8ClampedArray;
