// THE CARD REPACK — pure arithmetic over pixels, and NOTHING ELSE.
// ================================================================
// Split out of `publish.mjs` rather than living in it, for one reason that is
// worth stating: `publish.mjs` imports `../image.mjs`, which imports `pngjs`
// from the REPO ROOT's node_modules. `web/` has its own install and its own
// test runner, so a test that reached into the publisher to check this
// arithmetic would fail to import on any checkout that has run
// `npm --prefix web install` and not the root one — a red that says nothing
// about whether the code is right.
//
// This file imports nothing. `web/src/render/test/cardMaterials.test.ts` reads
// it directly.
//
// WHAT IT IS FOR. `bake.py` emits the foil layer as a MASK: white where the
// card is foil, black where it is plain stock, on a fully opaque card-shaped
// alpha. That is the right thing to bake and the wrong thing to draw — hand it
// to the renderer as a sprite and it paints a black card with white lines on
// it, because the shader multiplies albedo by light and blends on alpha, and
// "this pixel is foil" has nowhere to go. These two functions turn it into
// something a renderer can draw.

/**
 * THE TWO ENDS OF THE CARD'S MATERIAL RANGE, and they are far apart on purpose.
 *
 * Same reasoning as `publish.mjs`'s BRASS/TIMBER: a broad soft highlight reads
 * as pale paint and a small hard one that TRAVELS reads as metal. Card stock is
 * the most matte thing on the board; the gilt and the back are the most
 * polished. Halfway between is a card that looks like neither.
 */
export const CARD_MATERIAL = {
  card_stock: { roughness: 0.86, specular: 0.3 },
  card_border: { roughness: 0.12, specular: 1.0 },
  card_back: { roughness: 0.12, specular: 1.0 },
};

/**
 * The foil, and it is DELIBERATELY NOT AS TIGHT AS THE GILT IT SITS ON.
 *
 * The obvious value is the gilt's own 0.12 — foil is shiny, gilt is shiny. It
 * is wrong, and the reason is the shape of the term it feeds. `lighting.ts`
 * rides iridescence on the Blinn-Phong lobe, and 0.12 maps to an exponent near
 * 200: at that exponent the lobe is above 5% over a span of `dot(N, H)` about
 * 0.01 wide, so the hue sweep has a hundredth of its range to happen in and
 * both flanks of every groove land on the same colour. Measured on screen that
 * is gold corduroy — the grating plainly visible, doing nothing but light and
 * dark.
 *
 * 0.68 maps to an exponent near 60, which spreads the lobe over roughly 0.045
 * of `dot(N, H)` and gives `IRID_BANDS` room to run through nearly three
 * spectral cycles. It is also the physically honest end of the trade: a
 * diffraction grating scatters over a WIDE angle in separated colours, which is
 * the opposite of a mirror, and a foil-stamped panel really is less specular
 * than the polished metal beside it.
 */
export const CARD_FOIL_MATERIAL = { roughness: 0.68, specular: 1.0 };

/**
 * The tiers a card can actually BE, which is not the same as the tiers baked.
 *
 * `bake.py` also emits `card_foil_star` — the tier was asked for by name and
 * the geometry costs nothing — but `CardRarity` in `web/src/engine/types.ts` is
 * `starter | common | uncommon | rare` and has no member for it. A mask waiting
 * for a rarity, in its own words.
 *
 * PUBLISHING IT ANYWAY WOULD BE 1.5 MB OF PAYLOAD NOTHING CAN EVER FETCH, which
 * is the same argument `publish.mjs` already makes for leaving the AO pass in
 * staging. So the list is stated here rather than globbed, and
 * `render/test/cardMaterials.test.ts` pins it to `CARD_RARITIES` from both
 * directions: a tier the union gains and this does not is a missing texture,
 * and a tier published that the union does not have is dead weight.
 */
export const CARD_FOIL_TIERS = ['starter', 'common', 'uncommon', 'rare'];

/**
 * The gilt, cut to the mask — the repack that turns a mask into a sprite.
 *
 * RGB comes from the border and never from a colour invented here. `bake.py`:
 * every white piece of a foil mask is the footprint of a piece of
 * `card_border`, so a sample under the mask is always gilt and the foil cannot
 * introduce a colour the card does not already have.
 *
 * The alpha is the product of BOTH antialiased edges. The mask alone would let
 * the foil spill one texel past the metal it is stamped onto, which at the
 * corner braces is a bright fringe on bare card stock.
 */
export function cutFoilAlbedo(border, mask) {
  const px = Math.min(border.width * border.height, mask.width * mask.height);
  const out = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    out[o] = border.data[o];
    out[o + 1] = border.data[o + 1];
    out[o + 2] = border.data[o + 2];
    out[o + 3] = Math.round((border.data[o + 3] * mask.data[o]) / 255);
  }
  return out;
}

/**
 * Combine the moulding's relief with the grating, as one tangent-space map.
 *
 * THE ALTERNATIVE WAS TO FADE THE FOIL DOWN, and it was worse. The foil quad
 * draws over the border quad at the same rect, so at full alpha it REPLACES
 * the gilt — and with only the grating in its normal, a rare card's frame
 * would lose the two beads and the sunken channel `build_card_border` cuts
 * into it. A rare would then read FLATTER than a common, which is the signal
 * pointed backwards. Dropping the foil's alpha to let the moulding through
 * costs the same relief in proportion and dims the holo by the same fraction.
 *
 * Combining is what a foil-stamped moulding physically is: the bead keeps its
 * shape and carries a grating across it. Whiteout blend — sum the tangents,
 * multiply the normals — which is the standard detail-normal composite and is
 * exact for the small deviations both maps carry.
 *
 * `bake.py` warns against baking a bevel into the foil GEOMETRY, and this is
 * not that: a bevelled mask would put an edge at the boundary of the gilt and
 * the shader would read diffraction that changes direction there. Adding a
 * relief that is already registered to the same pixels adds no such edge.
 *
 * MEASURED. Mean absolute neighbour difference on the red channel, inside the
 * rare tier's mask: the border's moulding 11.8, the grating alone 4.6, the
 * combination 15.9 — both survive, and the mean stays at 127.2, so nothing has
 * been tipped off flat.
 */
export function combineNormals(base, detail) {
  const px = Math.min(base.width * base.height, detail.width * detail.height);
  const out = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    const dx = detail.data[o] / 127.5 - 1;
    const dy = detail.data[o + 1] / 127.5 - 1;
    const dz = detail.data[o + 2] / 127.5 - 1;
    // Outside the gilt the base map has no surface to describe — the bake
    // leaves it at zero, which decodes to (-1,-1,-1) and normalises to
    // nonsense. The published alpha is zero there so nothing samples it, but
    // a texture with garbage in it survives a future change to that alpha.
    let x = dx;
    let y = dy;
    let z = dz;
    if (base.data[o + 3] > 8) {
      const bx = base.data[o] / 127.5 - 1;
      const by = base.data[o + 1] / 127.5 - 1;
      const bz = base.data[o + 2] / 127.5 - 1;
      x = bx + dx;
      y = by + dy;
      z = bz * dz;
    }
    const len = Math.hypot(x, y, z) || 1;
    out[o] = Math.round((x / len) * 127.5 + 127.5);
    out[o + 1] = Math.round((y / len) * 127.5 + 127.5);
    out[o + 2] = Math.round((z / len) * 127.5 + 127.5);
    out[o + 3] = 255;
  }
  return out;
}
