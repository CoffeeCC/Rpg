// =========================================================================
// THE PHYSICAL CARD, as geometry.
//
// Every test here is written to REJECT A SPECIFIC WRONG ANSWER rather than to
// confirm the current one, because most of these were wrong first:
//
//   * a card sized from its bounding box (17% too wide once the hand fans)
//   * a card turned by the magnitude of its rotation with the sign thrown away
//     (the left of the fan leaning the same way as the right)
//   * a card unprojected at z = 0 and then drawn at z = h/2 (76px up the screen)
//   * a degenerate rect turned into NaN vertices, which blanks the canvas
//     permanently rather than dropping one frame
// =========================================================================
import { describe, expect, it } from 'vitest';
import {
  CARD_RARITIES,
  CARD_TILT,
  MAT_CARD_BACK,
  MAT_CARD_BORDER,
  MAT_CARD_STOCK,
  buildCardScene,
  cardCamera,
  cardFoilBakeName,
  cardFoilId,
  clampCardZoom,
  composeTransforms,
  decomposeTransform,
  lanternSway,
  placeCard,
  type CardBox,
} from '../cardScene';
import { project } from '../../lantern/scene/camera';
import type { Material } from '../../lantern/scene/scene';

const VIEWPORT = { x: 1280, y: 800 };

function box(over: Partial<CardBox> = {}): CardBox {
  return { key: 'c', cx: 400, cy: 500, w: 132, h: 185, rotate: 0, rarity: 'rare', ...over };
}

/** Every id present, so `buildCardScene` emits every layer it can. */
function allMaterials(): Map<string, Material> {
  const m = new Map<string, Material>();
  const put = (id: string) => m.set(id, { id, albedo: null });
  put(MAT_CARD_STOCK);
  put(MAT_CARD_BORDER);
  put(MAT_CARD_BACK);
  for (const r of CARD_RARITIES) put(cardFoilId(r));
  return m;
}

describe('the foil id is a lookup, not a mapping table', () => {
  it('names every rarity the engine can select', () => {
    // `bake.py` names the shapes after the engine's own strings precisely so
    // this has no branch in it. A rarity that resolved to a fallback would draw
    // the wrong tier's foil and look like a content bug.
    for (const r of CARD_RARITIES) {
      expect(cardFoilId(r)).toBe(`card:foil:${r}`);
      expect(cardFoilBakeName(r)).toBe(`card_foil_${r}`);
    }
  });

  it('has no star tier, because CardRarity has no member for one', () => {
    // The bake emits `card_foil_star`. Nothing can select it until the union
    // gains a member, and adding one here rather than there would produce a
    // request for a texture no card can ever be.
    expect(CARD_RARITIES).toEqual(['starter', 'common', 'uncommon', 'rare']);
    expect(CARD_RARITIES as readonly string[]).not.toContain('star');
  });
});

describe('reading a fanned card off the DOM', () => {
  it('keeps the SIGN of the rotation', () => {
    // The bounding box cannot: it is built from absolute sines and cosines, so
    // a card leaning left and a card leaning right measure identically. A fan
    // turns one way on each side of the middle.
    const left = decomposeTransform('matrix(0.998027, -0.0627905, 0.0627905, 0.998027, 0, 0)');
    const right = decomposeTransform('matrix(0.998027, 0.0627905, -0.0627905, 0.998027, 0, 0)');
    expect((left.rotate * 180) / Math.PI).toBeCloseTo(-3.6, 3);
    expect((right.rotate * 180) / Math.PI).toBeCloseTo(3.6, 3);
    expect(Math.sign(left.rotate)).toBe(-Math.sign(right.rotate));
  });

  it('reads the hover lift as scale, not as a bigger card', () => {
    // `.hand-slot:hover` is `rotate(0deg) translateY(-48px) scale(1.16)`. The
    // translation belongs to the rect's centre and the scale belongs to the
    // size; conflating them draws a hovered card at its resting size.
    const t = decomposeTransform('matrix(1.16, 0, 0, 1.16, 0, -48)');
    expect(t.scale).toBeCloseTo(1.16, 6);
    expect(t.rotate).toBeCloseTo(0, 9);
  });

  it('composes the slot and the card, so the body does not slide as it breathes', () => {
    // The fan is on the slot and `card-idle-breathe` is on the card inside it.
    const slot = decomposeTransform('matrix(0.998027, 0.0627905, -0.0627905, 0.998027, 0, 0)');
    const breathe = decomposeTransform('matrix(0.99997, 0.00785, -0.00785, 0.99997, 0, -3)');
    const both = composeTransforms(slot, breathe);
    // The angles ADD. Neither transform scales, so the scale stays at one —
    // which is the other half of the claim: a breathing card must not also
    // grow.
    expect((both.rotate * 180) / Math.PI).toBeCloseTo(4.05, 1);
    expect(both.scale).toBeCloseTo(1, 4);
  });

  it('treats anything it cannot parse as identity', () => {
    // A missing element, a keyword transform, a truncated matrix and a
    // degenerate one all have to mean "no transform" rather than NaN — this
    // feeds a vertex buffer.
    for (const bad of [null, undefined, '', 'none', 'rotate(3deg)', 'matrix(1,2,3)', 'matrix(a,b,c,d,e,f)', 'matrix(0,0,0,0,0,0)']) {
      const t = decomposeTransform(bad);
      expect(t).toEqual({ scale: 1, rotate: 0 });
    }
  });

  it('reads a matrix3d off its first column', () => {
    const t = decomposeTransform('matrix3d(0.866,0.5,0,0, -0.5,0.866,0,0, 0,0,1,0, 0,0,0,1)');
    expect(t.scale).toBeCloseTo(1, 4);
    expect((t.rotate * 180) / Math.PI).toBeCloseTo(30, 2);
  });
});

describe('a card lands exactly where its DOM box is', () => {
  it('projects back to the pixel it was measured at', () => {
    // The whole arrangement in one assertion: measure a centre, unproject it,
    // place a quad there, project it back. If this drifts, every card drifts.
    const cam = cardCamera(VIEWPORT, 132);
    const b = box({ cx: 613, cy: 442 });
    const p = placeCard(b, cam)!;
    const back = project({ x: p.at.x, y: p.at.y, z: p.z }, cam);
    expect(back.x).toBeCloseTo(b.cx, 6);
    expect(back.y).toBeCloseTo(b.cy, 6);
  });

  it('would land 76px high if it were unprojected at z = 0', () => {
    // The bug this replaces, stated as a number so it cannot come back
    // quietly: `project` subtracts z * zoom * sin(tilt) from the screen y.
    const cam = cardCamera(VIEWPORT, 132);
    const p = placeCard(box(), cam)!;
    const naive = project({ x: p.at.x, y: p.at.y, z: 0 }, cam);
    expect(naive.y - 500).toBeCloseTo(p.z * cam.zoom * Math.sin(cam.tilt), 6);
    expect(naive.y - 500).toBeGreaterThan(70);
  });

  it('draws at the pixel size the DOM reserved, whatever the tilt', () => {
    // `width / zoom` and `height / (zoom * sin)` are the inverses of what
    // `buildVertexData` multiplies a standing quad by.
    const cam = cardCamera(VIEWPORT, 132);
    const p = placeCard(box({ w: 132, h: 185 }), cam)!;
    expect(p.width * cam.zoom).toBeCloseTo(132, 6);
    expect(p.height * cam.zoom * Math.sin(cam.tilt)).toBeCloseTo(185, 6);
  });

  it('is one board unit wide when the zoom comes from the card', () => {
    // The bake frames every card shape at 1.0 x 1.4 board units. Matching that
    // is what makes every distance in `cardScene` readable as a fraction of a
    // card.
    const cam = cardCamera(VIEWPORT, 132);
    const p = placeCard(box({ w: 132, h: 185 }), cam)!;
    expect(p.width).toBeCloseTo(1, 6);
  });
});

describe('degenerate boxes yield no card, never a NaN', () => {
  it('refuses a zero-size rect', () => {
    // A hand mid-deal, a slot unmounting as a card is played. One NaN vertex
    // reaches the camera and blanks the canvas for the rest of the session.
    const cam = cardCamera(VIEWPORT, 132);
    expect(placeCard(box({ w: 0, h: 0 }), cam)).toBeNull();
    expect(placeCard(box({ w: 132, h: 1 }), cam)).toBeNull();
  });

  it('refuses a non-finite rect', () => {
    const cam = cardCamera(VIEWPORT, 132);
    expect(placeCard(box({ cx: NaN }), cam)).toBeNull();
    expect(placeCard(box({ cy: Infinity }), cam)).toBeNull();
    expect(placeCard(box({ w: NaN }), cam)).toBeNull();
  });

  it('emits no sprite for one, and keeps the rest of the hand', () => {
    const cam = cardCamera(VIEWPORT, 132);
    const scene = buildCardScene({
      camera: cam,
      time: 0,
      materials: allMaterials(),
      cards: [box({ key: 'good' }), box({ key: 'dead', w: 0, h: 0 }), box({ key: 'good2', cx: 700 })],
    });
    expect(scene.sprites.length).toBe(6);
    for (const s of scene.sprites) {
      expect(Number.isFinite(s.position.x)).toBe(true);
      expect(Number.isFinite(s.position.y)).toBe(true);
      expect(Number.isFinite(s.position.z)).toBe(true);
      expect(Number.isFinite(s.size.x)).toBe(true);
      expect(Number.isFinite(s.size.y)).toBe(true);
    }
  });

  it('survives a hand where nothing measured, with no light and no sprites', () => {
    const scene = buildCardScene({
      camera: cardCamera(VIEWPORT, null),
      time: 0,
      materials: allMaterials(),
      cards: [box({ w: 0, h: 0 })],
    });
    expect(scene.sprites).toEqual([]);
    // A light with no receivers is a light that only costs a bin.
    expect(scene.lights).toEqual([]);
  });

  it('clamps a zoom that came from a collapsed layout', () => {
    expect(clampCardZoom(NaN)).toBe(132);
    expect(clampCardZoom(0)).toBeGreaterThan(0);
    expect(clampCardZoom(1e9)).toBeLessThanOrEqual(640);
    expect(Number.isFinite(cardCamera(VIEWPORT, 0).zoom)).toBe(true);
    expect(Number.isFinite(cardCamera({ x: 0, y: 0 }, 132).zoom)).toBe(true);
  });
});

describe('the layers a card is made of', () => {
  it('draws stock, then gilt, then the rarity foil, in that order', () => {
    const scene = buildCardScene({
      camera: cardCamera(VIEWPORT, 132),
      time: 0,
      materials: allMaterials(),
      cards: [box({ rarity: 'rare' })],
    });
    expect(scene.sprites.map((s) => s.textureId)).toEqual([
      MAT_CARD_STOCK,
      MAT_CARD_BORDER,
      cardFoilId('rare'),
    ]);
  });

  it('emits the foil quad for starter and common too', () => {
    // `bake.py`'s own argument: a missing file is a special case somebody has
    // to remember. Their masks are black, so the quad publishes as a fully
    // transparent image and every pixel fails the shader's alpha test — which
    // is the same code path drawing nothing, not a branch.
    for (const r of ['starter', 'common'] as const) {
      const scene = buildCardScene({
        camera: cardCamera(VIEWPORT, 132),
        time: 0,
        materials: allMaterials(),
        cards: [box({ rarity: r })],
      });
      expect(scene.sprites.map((s) => s.textureId)).toContain(cardFoilId(r));
    }
  });

  it('draws ONE quad for a face-down card, and it is the back', () => {
    const scene = buildCardScene({
      camera: cardCamera(VIEWPORT, 132),
      time: 0,
      materials: allMaterials(),
      cards: [box({ rarity: null })],
    });
    expect(scene.sprites.map((s) => s.textureId)).toEqual([MAT_CARD_BACK]);
  });

  it('skips a layer whose texture has not arrived', () => {
    // Asynchrony is not an error state: a card draws flat stock the instant
    // the first fetch lands and gains its gilt and its foil after.
    const partial = new Map<string, Material>([[MAT_CARD_STOCK, { id: MAT_CARD_STOCK, albedo: null }]]);
    const scene = buildCardScene({
      camera: cardCamera(VIEWPORT, 132),
      time: 0,
      materials: partial,
      cards: [box()],
    });
    expect(scene.sprites.map((s) => s.textureId)).toEqual([MAT_CARD_STOCK]);
  });

  it('turns every layer of a card by the same angle, about its centre', () => {
    // Four quads at one frame is the bake's whole trick. A pivot anywhere but
    // the centre would swing them apart the moment the hand fans.
    const scene = buildCardScene({
      camera: cardCamera(VIEWPORT, 132),
      time: 0,
      materials: allMaterials(),
      cards: [box({ rotate: 0.126 })],
    });
    for (const s of scene.sprites) {
      expect(s.rotate).toBeCloseTo(0.126, 9);
      expect(s.pivot).toEqual({ x: 0.5, y: 0.5 });
      expect(s.billboard).toBe(true);
    }
  });

  it('gives each card its own layer, so the DOM decides what laps what', () => {
    // A fan is a stack of held objects, not a row of pieces on a table:
    // `battle.css` laps each slot 44px over the one before it whatever the arc
    // does to their screen heights. Sorting by board y would let a card behind
    // in the DOM paint over one in front.
    const scene = buildCardScene({
      camera: cardCamera(VIEWPORT, 132),
      time: 0,
      materials: allMaterials(),
      cards: [box({ key: 'a', cx: 300 }), box({ key: 'b', cx: 380 }), box({ key: 'c', cx: 460 })],
    });
    const layers = scene.sprites.map((s) => s.layer ?? 0);
    // Three per card, strictly increasing between cards, equal within one.
    expect(layers.slice(0, 3).every((l) => l === layers[0])).toBe(true);
    expect(layers[3]).toBeGreaterThan(layers[0]);
    expect(layers[6]).toBeGreaterThan(layers[3]);
  });

  it('dims an unplayable card body, not just its printing', () => {
    // `.playing-card.unplayable` is a CSS filter and now only reaches the DOM
    // layer. A lit, gilded body under greyed-out text reads as a fault.
    const scene = buildCardScene({
      camera: cardCamera(VIEWPORT, 132),
      time: 0,
      materials: allMaterials(),
      cards: [box({ dim: true })],
    });
    for (const s of scene.sprites) {
      expect(s.tint).toBeDefined();
      expect(s.tint![0]).toBeLessThan(0.6);
    }
  });
});

describe('the lantern over the hand', () => {
  it('stands between the cards and the viewer, not overhead', () => {
    // A billboard's normal IS the view direction, so a light straight above
    // arrives near edge-on and the whole hand goes matte. `battleScene` records
    // paying for this once already.
    const cam = cardCamera(VIEWPORT, 132);
    const scene = buildCardScene({ camera: cam, time: 0, materials: allMaterials(), cards: [box()] });
    const card = placeCard(box(), cam)!;
    const lantern = scene.lights[0];
    // Toward the near edge of the table (+y) and above the card's middle.
    expect(lantern.position.y).toBeGreaterThan(card.at.y);
    expect(lantern.position.z).toBeGreaterThan(card.z);
  });

  it('is pushed off the view axis, or the grating cannot band', () => {
    // dot(N, H) is an EVEN function of the grating's tilt, so with the light on
    // the view axis a groove's two flanks land on the same spectral band and
    // the diffraction cancels itself out. Measured on screen, that is gold
    // corduroy: bright and dark, no colour.
    const cam = cardCamera(VIEWPORT, 132);
    const scene = buildCardScene({ camera: cam, time: 0, materials: allMaterials(), cards: [box()] });
    const card = placeCard(box(), cam)!;
    expect(Math.abs(scene.lights[0].position.x - card.at.x)).toBeGreaterThan(0.2);
  });

  it('swings, and never repeats a figure the eye can learn', () => {
    // Nothing else on this screen moves the light, the camera or the tangent
    // frame, and a holo that never sweeps is glitter.
    const a = lanternSway(0);
    const b = lanternSway(2.4);
    const c = lanternSway(5.1);
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThan(0.05);
    expect(Math.abs(b.x - c.x) + Math.abs(b.y - c.y)).toBeGreaterThan(0.05);
    // Under half a card in either direction: a hanging light breathing, not
    // something sliding about.
    for (const t of [0, 0.7, 1.9, 3.3, 6.6, 11.2]) {
      const s = lanternSway(t);
      expect(Math.abs(s.x)).toBeLessThan(0.5);
      expect(Math.abs(s.y)).toBeLessThan(0.5);
    }
  });

  it('moves the light and nothing else as time passes', () => {
    const cam = cardCamera(VIEWPORT, 132);
    const mk = (time: number) =>
      buildCardScene({ camera: cam, time, materials: allMaterials(), cards: [box()] });
    const s0 = mk(0);
    const s1 = mk(3.7);
    expect(s1.lights[0].position.x).not.toBeCloseTo(s0.lights[0].position.x, 4);
    expect(s1.sprites).toEqual(s0.sprites);
  });
});

describe('the scene the renderer is handed', () => {
  it('carries an occluder grid, because null means NOT LIT AT ALL', () => {
    // `renderer.ts`: useLighting = lit && lights.length > 0 && occluders !== null.
    // A scene with no grid comes back at flat albedo, which looks exactly like
    // a lantern turned up too far. `battleScene.ts` records losing an hour here.
    const scene = buildCardScene({
      camera: cardCamera(VIEWPORT, 132),
      time: 0,
      materials: allMaterials(),
      cards: [box()],
    });
    expect(scene.occluders).not.toBeNull();
    expect(scene.lights.length).toBeGreaterThan(0);
  });

  it('uses the arena’s tilt, because the bake was rendered at it', () => {
    // `lighting.ts` rebuilds a billboard's world normal from `uTilt`, and
    // `bake.py`'s `billboard_basis()` encoded the normal pass against the same
    // axes at DEFAULT_TILT. Decoding at another angle lights every chamfer as
    // though it were cut differently.
    expect(cardCamera(VIEWPORT, 132).tilt).toBe(CARD_TILT);
  });

  it('keeps every card above the board', () => {
    // pivot y 0.5 straddles z = 0 unless the placement lifts it, and a quad
    // below the board takes the shader's `belowBoard` path.
    const cam = cardCamera(VIEWPORT, 132);
    const p = placeCard(box(), cam)!;
    expect(p.z - p.height / 2).toBeCloseTo(0, 9);
    expect(p.z).toBeGreaterThan(0);
  });
});
