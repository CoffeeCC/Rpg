// =========================================================================
// THE ARENA BRIDGE.
//
// The point of these is not that a Scene comes out. It is that the ONE thing
// the battlefield port rests on — the solve that reconciles a measured DOM box
// with a projected board — is exact, and that ENGINE_PLAN §8's traps are
// actually handled rather than described.
//
//   the solve    `arenaCamera` must put the authored ranks on the MEASURED
//                feet lines, checked against `camera.project` itself rather
//                than against a re-derivation of the same algebra. This is the
//                battlefield's counterpart to §20's lattice check, and it fails
//                the same way if it is wrong: every piece stands in the wrong
//                place and it looks like "the canvas is slightly misaligned".
//   the inverse  `placeFigure` must round-trip. A figure's quad has to draw at
//                the pixel size the DOM reserved for it, or the GPU art and the
//                `getBoundingClientRect` the aim line is built from disagree.
//   §8 item 9    the `--vigor-lume` CSS `:has()` count becomes an explicit
//                input. Burning candles are real lights; snuffed ones are not.
//   §8 item 5    nothing here reads a `--bf-scale` or a TSX `size={150}`.
//   robustness   a degenerate measurement (a row that has not been laid out)
//                must produce a finite camera, not a scene full of NaN.
// =========================================================================
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { project, type Camera } from '../../lantern/scene/camera';
import type { Material } from '../../lantern/scene/scene';
import {
  ARENA_DEPTH,
  ARENA_RIM_LAYER,
  BACKDROP_LAYER,
  CANDLE_FRAME_X,
  CORNER_BRASS_SIZE,
  CRADLE_FRAME,
  LOG_FRAME,
  LOG_SLICE,
  LOG_WELL_FRACTION,
  MAT_CRADLE,
  MAT_CRADLE_BRASS,
  MAT_EXHAUST,
  MAT_EXHAUST_BRASS,
  MAT_LOG_WELL,
  MAT_LOG_WELL_BRASS,
  MAT_PILE_TRAY,
  MAT_PILE_TRAY_BRASS,
  MAT_STRAP,
  PILE_FRAME,
  PILE_SLOT,
  STRAP_FRAME,
  STRAP_PITCH,
  lanternCradleBox,
  logWellBox,
  pileTrayBox,
  sliceBands,
  strapCentres,
  ENEMY_RANK,
  MAT_ARENA,
  MAT_BACKDROP,
  MAT_BLANK,
  MAT_CANDLE,
  BEZEL_BORE,
  BEZEL_FRAME,
  BEZEL_SIZES,
  BEZEL_SMALL_FRAME,
  MAT_BEZEL,
  MAT_BEZEL_SMALL,
  MAT_CORNER_BRASS,
  MAT_RAIL_STRIP,
  MAT_RAIL_STRIP_BRASS,
  MAT_SOCKET,
  MAX_ARENA_ZOOM,
  MIN_ARENA_ZOOM,
  PARTY_RANK,
  RAIL_FAR,
  RAIL_NEAR,
  RAIL_STRIP_REPEAT_UNIT,
  RAIL_STRIP_WIDTH,
  arenaCamera,
  arenaExtent,
  arenaWidth,
  buildBattleScene,
  candleFrameRightX,
  candlePositions,
  cornerBrassCentre,
  heroTextureId,
  lanternForVigor,
  furnitureSprites,
  monsterTextureId,
  pickAuthoredSize,
  placeFigure,
  placeFurniture,
  portraitBezelBox,
  type AuthoredFrame,
  type FigureBox,
  type FurnitureBox,
  type MeasuredBox,
} from '../battleScene';
import { LAYER_DECAL, LAYER_PIECE } from '../../lantern/scene/sprite';
import { boardSlabSprites } from '../../lantern/scene/board';

/** Every id the builder can ask for, so nothing is skipped for want of art. */
function allMaterials(extra: string[] = []): Map<string, Material> {
  const ids = [
    MAT_BLANK,
    MAT_ARENA,
    MAT_BACKDROP,
    MAT_CANDLE,
    MAT_SOCKET,
    'shadow',
    'blockshadow',
    'base',
    'frame',
    'rim',
    'table',
    'flame',
    ...extra,
  ];
  return new Map(ids.map((id) => [id, { id, albedo: null } as Material]));
}

const FIELD = { x: 1000, y: 420 };
const ENEMY_FEET = 236;
const PARTY_FEET = 398;

function camera(): Camera {
  return arenaCamera({ viewport: FIELD, enemyFeet: ENEMY_FEET, partyFeet: PARTY_FEET });
}

function figure(over: Partial<FigureBox> = {}): FigureBox {
  return {
    uid: 'e1',
    side: 'enemy',
    cx: 520,
    feetY: ENEMY_FEET,
    w: 120,
    h: 120,
    textureId: monsterTextureId('duskhound'),
    ...over,
  };
}

describe('the solve: authored ranks land on measured feet lines', () => {
  it('projects ENEMY_RANK exactly onto the enemy row', () => {
    const cam = camera();
    expect(project({ x: cam.centre.x, y: ENEMY_RANK, z: 0 }, cam).y).toBeCloseTo(ENEMY_FEET, 6);
  });

  it('projects PARTY_RANK exactly onto the party row', () => {
    const cam = camera();
    expect(project({ x: cam.centre.x, y: PARTY_RANK, z: 0 }, cam).y).toBeCloseTo(PARTY_FEET, 6);
  });

  it('holds at every plausible row separation and field size', () => {
    for (const vh of [300, 420, 560, 800]) {
      for (const gap of [80, 140, 210, 300]) {
        const enemyFeet = vh * 0.4;
        const partyFeet = enemyFeet + gap;
        const cam = arenaCamera({ viewport: { x: 1280, y: vh }, enemyFeet, partyFeet });
        // Only meaningful while the solve is inside the zoom guard rails; the
        // clamp deliberately gives up exactness rather than produce a board
        // nobody can read (see MIN/MAX_ARENA_ZOOM).
        if (cam.zoom <= MIN_ARENA_ZOOM || cam.zoom >= MAX_ARENA_ZOOM) continue;
        expect(project({ x: 0, y: ENEMY_RANK, z: 0 }, cam).y).toBeCloseTo(enemyFeet, 6);
        expect(project({ x: 0, y: PARTY_RANK, z: 0 }, cam).y).toBeCloseTo(partyFeet, 6);
      }
    }
  });

  it('centres the board on the field horizontally', () => {
    const cam = camera();
    const ext = arenaExtent(cam);
    expect(cam.centre.x).toBeCloseTo(ext.width / 2, 12);
    expect(project({ x: ext.width / 2, y: 0, z: 0 }, cam).x).toBeCloseTo(FIELD.x / 2, 6);
  });

  it('survives a degenerate measurement instead of producing NaN', () => {
    for (const anchors of [
      { viewport: FIELD, enemyFeet: null, partyFeet: null },
      { viewport: FIELD, enemyFeet: 200, partyFeet: 200 },
      { viewport: FIELD, enemyFeet: 300, partyFeet: 100 },
      { viewport: { x: 0, y: 0 }, enemyFeet: 0, partyFeet: 0 },
    ]) {
      const cam = arenaCamera(anchors);
      expect(Number.isFinite(cam.zoom)).toBe(true);
      expect(Number.isFinite(cam.centre.x)).toBe(true);
      expect(Number.isFinite(cam.centre.y)).toBe(true);
      expect(cam.zoom).toBeGreaterThanOrEqual(MIN_ARENA_ZOOM);
      expect(cam.zoom).toBeLessThanOrEqual(MAX_ARENA_ZOOM);
    }
  });

  it('keeps the play area a whole number of tiles wide', () => {
    for (const vw of [640, 900, 1280, 1920]) {
      const w = arenaWidth(vw, 93);
      expect(Number.isInteger(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('the inverse: a piece stands in its own DOM box', () => {
  it('round-trips the feet point back to the pixel it was measured at', () => {
    const cam = camera();
    for (const [cx, feetY] of [
      [120, 236],
      [520, 236],
      [940, 398],
      [300, 410],
    ] as const) {
      const p = placeFigure(figure({ cx, feetY }), cam);
      const back = project({ x: p.at.x, y: p.at.y, z: 0 }, cam);
      expect(back.x).toBeCloseTo(cx, 6);
      expect(back.y).toBeCloseTo(feetY, 6);
    }
  });

  it('draws the figure at the pixel size the DOM reserved for it', () => {
    const cam = camera();
    const sin = Math.sin(cam.tilt);
    for (const [w, h] of [
      [120, 120],
      [200, 200],
      [106, 132],
    ] as const) {
      const p = placeFigure(figure({ w, h }), cam);
      // `buildVertexData` multiplies a STANDING quad by zoom and zoom*sin —
      // these two lines are its exact inverses, which is the whole reason a
      // measured box and a drawn piece can be the same object.
      expect(p.width * cam.zoom).toBeCloseTo(w, 6);
      expect(p.height * cam.zoom * sin).toBeCloseTo(h, 6);
    }
  });

  it('gives a wider figure a wider plinth', () => {
    const cam = camera();
    const small = placeFigure(figure({ w: 90 }), cam);
    const big = placeFigure(figure({ w: 240 }), cam);
    expect(big.radius).toBeGreaterThan(small.radius);
  });
});

describe('the candle rail is §8 item 9, as geometry', () => {
  it('stands one candle per point of MAX vigor, not per point spent', () => {
    expect(candlePositions({ x: 1, total: 4, lit: 1 })).toHaveLength(4);
    expect(candlePositions({ x: 1, total: 0, lit: 0 })).toHaveLength(0);
  });

  it('fills from the NEAR end, matching .vigor-candles column-reverse', () => {
    const spots = candlePositions({ x: 1, total: 5, lit: 5 });
    for (let i = 1; i < spots.length; i++) expect(spots[i].y).toBeLessThan(spots[i - 1].y);
    // Candle 0 is the last one to gutter out, and it is the nearest.
    expect(spots[0].y).toBeGreaterThan(PARTY_RANK);
    expect(spots[spots.length - 1].y).toBeLessThan(ENEMY_RANK);
  });

  it('puts a single candle between the ranks rather than at an end', () => {
    const [only] = candlePositions({ x: 2, total: 1, lit: 1 });
    expect(only.y).toBeGreaterThan(ENEMY_RANK);
    expect(only.y).toBeLessThan(PARTY_RANK + 1);
  });

  it('lights the board from the burning ones only', () => {
    const cam = camera();
    const base = { camera: cam, time: 0, materials: allMaterials(), figures: [] as FigureBox[] };
    const lit4 = buildBattleScene({ ...base, vigor: { lit: 4, total: 4 } });
    const lit1 = buildBattleScene({ ...base, vigor: { lit: 1, total: 4 } });
    const dark = buildBattleScene({ ...base, vigor: { lit: 0, total: 4 } });
    expect(lit4.lights.length - lit1.lights.length).toBe(3);
    expect(lit1.lights.length - dark.lights.length).toBe(1);
  });

  it('draws the wax whether or not it is burning — a snuffed candle is still there', () => {
    const cam = camera();
    const base = { camera: cam, time: 0, materials: allMaterials(), figures: [] as FigureBox[] };
    const wax = (lit: number) =>
      buildBattleScene({ ...base, vigor: { lit, total: 4 } }).sprites.filter((s) => s.textureId === MAT_CANDLE).length;
    expect(wax(4)).toBe(4);
    expect(wax(0)).toBe(4);
  });

  it('stands on the FRAME, clear of the play area entirely', () => {
    // The rail used to default to board x = 0.7 — inside the field, beside
    // where the DOM `.vigor-rail` happened to be, which is what made it read
    // as a second rail. This asserts the frame band specifically, so a drift
    // back onto the field fails rather than merely looking wrong.
    const cam = camera();
    const ext = arenaExtent(cam);
    const scene = buildBattleScene({
      camera: cam,
      time: 0,
      materials: allMaterials(),
      figures: [] as FigureBox[],
      vigor: { lit: 3, total: 4 },
    });
    const wax = scene.sprites.filter((s) => s.textureId === MAT_CANDLE);
    expect(wax.length).toBe(4);
    for (const s of wax) {
      // Outside the play area on the left...
      expect(s.position.x).toBeLessThan(0);
      // ...and on the frame band, not floating off past the rim onto the table.
      expect(s.position.x).toBeGreaterThan(-ext.border);
    }
    expect(CANDLE_FRAME_X).toBeLessThan(0);
  });

  it('cuts sockets on BOTH bands but seats candles only where there is vigor', () => {
    // Paul's rule, and the point of it: the furniture is symmetric, the state
    // is not. Against a monster the right rail is empty brass, which says "this
    // one does not spend what you spend" rather than looking unfinished.
    const cam = camera();
    const ext = arenaExtent(cam);
    const scene = buildBattleScene({
      camera: cam,
      time: 0,
      materials: allMaterials(),
      figures: [] as FigureBox[],
      vigor: { lit: 2, total: 3 },
    });
    const sockets = scene.sprites.filter((s) => s.textureId === MAT_SOCKET);
    const wax = scene.sprites.filter((s) => s.textureId === MAT_CANDLE);
    // Three sockets a side, six in total...
    expect(sockets.length).toBe(6);
    expect(sockets.filter((s) => s.position.x < 0).length).toBe(3);
    expect(sockets.filter((s) => s.position.x > ext.width).length).toBe(3);
    // ...and every candle on the LEFT, because a monster has no vigor.
    expect(wax.length).toBe(3);
    for (const s of wax) expect(s.position.x).toBeLessThan(0);
  });

  it('lights the opponent rail too, but only in a fight that has one', () => {
    const cam = camera();
    const ext = arenaExtent(cam);
    const base = { camera: cam, time: 0, materials: allMaterials(), figures: [] as FigureBox[] };
    const solo = buildBattleScene({ ...base, vigor: { lit: 3, total: 3 } });
    const duel = buildBattleScene({ ...base, vigor: { lit: 3, total: 3 }, enemyVigor: { lit: 2, total: 3 } });
    // Two more burning candles on the board means two more real lights.
    expect(duel.lights.length - solo.lights.length).toBe(2);
    const foeWax = duel.sprites.filter((s) => s.textureId === MAT_CANDLE && s.position.x > ext.width);
    expect(foeWax.length).toBe(3);
    // A spent candle is still cut and still standing — only the flame is gone.
    expect(foeWax.filter((s) => s.tint).length).toBe(1);
  });

  it('does not move when the HUD moves — board furniture is authored, not measured', () => {
    // The old rail took its x from `.vigor-rail`'s measured right edge, so the
    // narrow breakpoint (which relocates that widget) also relocated the
    // candles. Two very different viewports must now place them identically.
    const wide = arenaCamera({ viewport: { x: 1600, y: 900 }, enemyFeet: 396, partyFeet: 810 });
    const narrow = arenaCamera({ viewport: { x: 620, y: 900 }, enemyFeet: 396, partyFeet: 810 });
    const build = (cam: Camera) =>
      buildBattleScene({
        camera: cam,
        time: 0,
        materials: allMaterials(),
        figures: [] as FigureBox[],
        vigor: { lit: 2, total: 3 },
      }).sprites.filter((s) => s.textureId === MAT_CANDLE).map((s) => s.position.x);
    expect(build(wide)).toEqual(build(narrow));
  });

  it('draws no rail strip or corner brass when the bakes have not loaded', () => {
    // §21.7's scaffolding (`has(MAT_RAIL_STRIP)`/`has(MAT_CORNER_BRASS)`) must
    // actually gate the sprite, not just exist unused — this is the test that
    // would have failed the whole session up to this commit, since neither id
    // was ever requested. `allMaterials()` deliberately omits both.
    const scene = buildBattleScene({
      camera: camera(),
      time: 0,
      materials: allMaterials(),
      figures: [] as FigureBox[],
      vigor: { lit: 2, total: 3 },
    });
    expect(scene.sprites.filter((s) => s.textureId === MAT_RAIL_STRIP)).toHaveLength(0);
    expect(scene.sprites.filter((s) => s.textureId === MAT_CORNER_BRASS)).toHaveLength(0);
  });

  it('lays the rail strip along the exact span the candles stand on, both bands', () => {
    const cam = camera();
    const ext = arenaExtent(cam);
    const scene = buildBattleScene({
      camera: cam,
      time: 0,
      materials: allMaterials([MAT_RAIL_STRIP]),
      figures: [] as FigureBox[],
      vigor: { lit: 1, total: 3 },
      enemyVigor: { lit: 0, total: 3 },
    });
    const strips = scene.sprites.filter((s) => s.textureId === MAT_RAIL_STRIP);
    // One per band, drawn whether or not that side has any candles burning —
    // it is the timber, not a readout.
    expect(strips.length).toBe(2);
    const length = RAIL_NEAR - RAIL_FAR;
    const midY = (RAIL_NEAR + RAIL_FAR) / 2;
    const left = strips.find((s) => s.position.x < 0)!;
    const right = strips.find((s) => s.position.x > ext.width)!;
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    // Centred on the same run the candles occupy, to the float.
    expect(left.position.y).toBeCloseTo(midY, 10);
    expect(left.position.x).toBeCloseTo(CANDLE_FRAME_X, 10);
    expect(right.position.x).toBeCloseTo(candleFrameRightX(ext.width), 10);
    expect(left.size.y).toBeCloseTo(length, 10);
    expect(left.size.x).toBeCloseTo(RAIL_STRIP_WIDTH, 10);
    // Tiled, not stretched: v1 is the run measured in repeat-units, not 1.
    expect(left.uv.v1).toBeCloseTo(length / RAIL_STRIP_REPEAT_UNIT, 10);
    expect(left.uv.v1).not.toBeCloseTo(1, 2);
    expect(left.uv.u0).toBe(0);
    expect(left.uv.u1).toBe(1);
  });

  it('seats exactly one corner brass, at the far-left corner and nowhere else', () => {
    // FAR, not near: `board_corner_brass.png` renders as an L hugging the
    // texture's TOP and LEFT edges, and this engine's own rule (`piece.ts
    // baseDiscNormalPixels`, restated in `bake.py`'s header) is "texture +v
    // down the image is board +y, toward the camera" — so the top edge is the
    // FAR edge. Placing it at the near corner instead was tried, looked wrong
    // once the actual PNG was rendered, and was caught only by looking.
    const cam = camera();
    const ext = arenaExtent(cam);
    const scene = buildBattleScene({
      camera: cam,
      time: 0,
      materials: allMaterials([MAT_CORNER_BRASS]),
      figures: [] as FigureBox[],
      vigor: { lit: 2, total: 3 },
    });
    const corners = scene.sprites.filter((s) => s.textureId === MAT_CORNER_BRASS);
    // Exactly one — the other three are deliberately not mirrored (see the
    // comment at the call site: flipping the UV would corrupt the normal map).
    expect(corners.length).toBe(1);
    const expected = cornerBrassCentre(ext);
    expect(corners[0].position.x).toBeCloseTo(expected.x, 10);
    expect(corners[0].position.y).toBeCloseTo(expected.y, 10);
    expect(corners[0].size.x).toBeCloseTo(CORNER_BRASS_SIZE, 10);
    expect(corners[0].size.y).toBeCloseTo(CORNER_BRASS_SIZE, 10);
    // On the LEFT frame band (same side as the candle rail) and past the FAR
    // edge of the play area — i.e. genuinely in the corner, not merely
    // somewhere on the left band, and not the near corner either.
    expect(expected.x).toBeLessThan(0);
    expect(expected.y).toBeLessThan(0);
  });

  it('draws the rail strip BRASS at the identical rect as its timber', () => {
    // `bake.py`'s `split()` gives `candle_rail_strip` and
    // `candle_rail_strip_brass` one frame precisely so this holds. If either
    // row ever drifts — a different width, a stretched UV instead of a tiled
    // one — the fitting sits crooked on its own timber and it is very hard to
    // see by eye on a 0.56-tile strip.
    const scene = buildBattleScene({
      camera: camera(),
      time: 0,
      materials: allMaterials([MAT_RAIL_STRIP, MAT_RAIL_STRIP_BRASS]),
      figures: [] as FigureBox[],
      vigor: { lit: 1, total: 3 },
    });
    const wood = scene.sprites.filter((s) => s.textureId === MAT_RAIL_STRIP);
    const brass = scene.sprites.filter((s) => s.textureId === MAT_RAIL_STRIP_BRASS);
    expect(wood).toHaveLength(2);
    expect(brass).toHaveLength(2);
    for (let i = 0; i < wood.length; i++) {
      expect(brass[i].position).toEqual(wood[i].position);
      expect(brass[i].size).toEqual(wood[i].size);
      expect(brass[i].uv).toEqual(wood[i].uv);
    }
  });

  it('draws the timber rail alone when only its half of the split has loaded', () => {
    // The two halves arrive as two independent fetches. Whichever lands first
    // must draw on its own rather than waiting for its partner, which is the
    // same asynchrony rule `battleMaterials.ts` states at the top.
    const scene = buildBattleScene({
      camera: camera(),
      time: 0,
      materials: allMaterials([MAT_RAIL_STRIP]),
      figures: [] as FigureBox[],
      vigor: { lit: 1, total: 3 },
    });
    expect(scene.sprites.filter((s) => s.textureId === MAT_RAIL_STRIP)).toHaveLength(2);
    expect(scene.sprites.filter((s) => s.textureId === MAT_RAIL_STRIP_BRASS)).toHaveLength(0);
  });
});

// =========================================================================
// §19.1'S HUD-ANCHORED FITTINGS
//
// The half of §19.1 that cannot be authored against the frame, because each
// fitting exists to surround a widget the flexbox placed. Same solve as
// `placeFigure`, one orientation constant apart — and that constant is what
// most of this block is checking, since `sin` and `cos` differ by only 1.4x at
// the shipping tilt and a fitting that is 40% too tall reads as a bad bake.
// =========================================================================

/** A portrait chip, as the component would hand it over. */
function chip(over: Partial<FurnitureBox> = {}): FurnitureBox {
  return { ...portraitBezelBox({ cx: 90, cy: 120, w: 68, h: 68 }), ...over };
}

describe('the inverse again: a fitting covers its own DOM box', () => {
  it('round-trips the box centre back to the pixel it was measured at', () => {
    const cam = camera();
    for (const [cx, cy] of [
      [90, 120],
      [90, 360],
      [512, 210],
      [960, 400],
    ] as const) {
      const p = placeFurniture(chip({ cx, cy }), cam)!;
      const back = project({ x: p.at.x, y: p.at.y, z: 0 }, cam);
      expect(back.x).toBeCloseTo(cx, 6);
      expect(back.y).toBeCloseTo(cy, 6);
    }
  });

  it('divides height by cos, NOT sin — a lying quad is not a standing one', () => {
    // THE TEST THAT REJECTS THE WRONG IMPLEMENTATION. `buildVertexData` scales
    // a lying quad by `zoom * cos` and a standing one by `zoom * sin`, so
    // reusing `placeFigure`'s divisor here would come out 1.43x short at the
    // 55-degree default. Asserted as the round trip through the exact factor
    // the vertex builder applies, not as a formula restated.
    const cam = camera();
    const cos = Math.cos(cam.tilt);
    const sin = Math.sin(cam.tilt);
    expect(sin / cos).toBeGreaterThan(1.4); // the error this would hide
    for (const [w, h] of [
      [68, 68],
      [216, 394],
      [40, 130],
    ] as const) {
      const p = placeFurniture(chip({ w, h, scale: 1 }), cam)!;
      expect(p.width * cam.zoom).toBeCloseTo(w, 6);
      expect(p.height * cam.zoom * cos).toBeCloseTo(h, 6);
      expect(p.height * cam.zoom * sin).not.toBeCloseTo(h, 2);
    }
  });

  it('scales the bezel so its BORE lands on the chip, not its rim', () => {
    // `build_portrait_bezel`: "the bore is exactly TWO THIRDS of the frame
    // width in both sizes ... the art the engine puts behind this is the
    // bezel's own quad scaled by 2/3 about the same centre". Read backwards,
    // that is this number. Drawing the bezel AT the chip's box instead — the
    // obvious thing — would put brass over the outer third of the portrait.
    const cam = camera();
    const box = portraitBezelBox({ cx: 90, cy: 120, w: 68, h: 68 });
    const p = placeFurniture(box, cam)!;
    expect(p.width * cam.zoom * BEZEL_BORE).toBeCloseTo(68, 6);
    expect(p.height * cam.zoom * Math.cos(cam.tilt) * BEZEL_BORE).toBeCloseTo(68, 6);
    // And it is genuinely bigger than the chip, in the right direction.
    expect(p.width * cam.zoom).toBeGreaterThan(68);
  });

  it('draws a round chip as a CIRCLE on screen, not a board-true ellipse', () => {
    // The trade this file's header records, pinned as a number so it cannot be
    // changed silently. A square DOM box becomes a board rect 1/cos taller
    // than wide, which projects back to a square — so the bezel frames the ring
    // it is fitted to. A board-square quad (the frame-fixed convention the
    // socket and corner brass use) would project to a 1:cos ellipse and frame
    // nothing.
    const cam = camera();
    const p = placeFurniture(chip(), cam)!;
    const screenW = p.width * cam.zoom;
    const screenH = p.height * cam.zoom * Math.cos(cam.tilt);
    expect(screenW).toBeCloseTo(screenH, 6);
    expect(p.height / p.width).toBeCloseTo(1 / Math.cos(cam.tilt), 6);
  });
});

describe('a degenerate measurement produces no sprite, never a NaN', () => {
  // A NaN vertex does not draw badly — it blanks the canvas for the rest of
  // the session. Every one of these is a layout state the frame loop genuinely
  // sees: a chip mid-`.stage-entering` wipe, a camera on the first paint.
  const cam = camera();
  const cases: [string, FurnitureBox | null, Camera | null][] = [
    ['a zero-size rect', chip({ w: 0, h: 0 }), null],
    ['a rect one pixel short of the floor', chip({ w: 1.5, h: 68 }), null],
    ['a collapsed height', chip({ h: 0 }), null],
    ['a NaN centre', chip({ cx: Number.NaN }), null],
    ['a NaN size', chip({ w: Number.NaN }), null],
    ['an infinite size', chip({ h: Number.POSITIVE_INFINITY }), null],
    ['a zero zoom', null, { ...cam, zoom: 0 }],
    ['a negative zoom', null, { ...cam, zoom: -40 }],
    ['a NaN zoom', null, { ...cam, zoom: Number.NaN }],
    ['an edge-on tilt', null, { ...cam, tilt: Math.PI / 2 }],
    ['a NaN tilt', null, { ...cam, tilt: Number.NaN }],
  ];
  for (const [name, box, over] of cases) {
    it(`returns null for ${name}`, () => {
      expect(placeFurniture(box ?? chip(), over ?? cam)).toBeNull();
    });
  }

  it('emits nothing at all for a degenerate box rather than a NaN quad', () => {
    const sprites = furnitureSprites([chip({ w: 0, h: 0 })], cam, () => true);
    expect(sprites).toHaveLength(0);
  });

  it('never lets a NaN reach a sprite from any of these', () => {
    for (const [, box, over] of cases) {
      for (const s of furnitureSprites([box ?? chip()], over ?? cam, () => true)) {
        for (const v of [s.position.x, s.position.y, s.position.z, s.size.x, s.size.y]) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });
});

describe('the fittings, as sprites', () => {
  it('draws nothing when the bake has not loaded', () => {
    // The §21.7 lesson, applied before the same mistake can be made twice: a
    // `has()` gate that nothing ever supplies a material to has never been
    // exercised. `allMaterials()` deliberately omits both bezel ids.
    const scene = buildBattleScene({
      camera: camera(),
      time: 0,
      materials: allMaterials(),
      figures: [] as FigureBox[],
      furniture: [chip()],
      vigor: { lit: 2, total: 3 },
    });
    expect(scene.sprites.filter((s) => s.textureId === MAT_BEZEL)).toHaveLength(0);
    expect(scene.sprites.filter((s) => s.textureId === MAT_BEZEL_SMALL)).toHaveLength(0);
  });

  it('draws no fittings at all when none were measured', () => {
    // The flag-off shape and every pre-existing test: `furniture` omitted must
    // leave the arena byte-for-byte what it was.
    const opts = {
      camera: camera(),
      time: 0,
      materials: allMaterials([MAT_BEZEL, MAT_BEZEL_SMALL]),
      figures: [] as FigureBox[],
      vigor: { lit: 2, total: 3 },
    };
    const without = buildBattleScene(opts);
    const empty = buildBattleScene({ ...opts, furniture: [] });
    expect(without.sprites.map((s) => s.textureId)).toEqual(empty.sprites.map((s) => s.textureId));
    expect(without.sprites.some((s) => s.textureId === MAT_BEZEL)).toBe(false);
  });

  it('stands the fitting where the measured box stands, on the decal layer', () => {
    const cam = camera();
    const scene = buildBattleScene({
      camera: cam,
      time: 0,
      materials: allMaterials([MAT_BEZEL, MAT_BEZEL_SMALL]),
      figures: [] as FigureBox[],
      furniture: [chip({ cx: 90, cy: 120 })],
      vigor: { lit: 2, total: 3 },
    });
    const fitted = scene.sprites.filter(
      (s) => s.textureId === MAT_BEZEL || s.textureId === MAT_BEZEL_SMALL,
    );
    expect(fitted).toHaveLength(1);
    const s = fitted[0];
    // Centre pivot, so the quad's own centre is the measured box's centre —
    // and it projects straight back to it.
    expect(s.pivot).toEqual({ x: 0.5, y: 0.5 });
    const back = project(s.position, cam);
    expect(back.x).toBeCloseTo(90, 6);
    expect(back.y).toBeCloseTo(120, 6);
    // LYING, not standing: a fitting is on the table, not a piece on it.
    expect(s.upright).toBeUndefined();
    expect(s.billboard).toBeUndefined();
    // DECAL, not BOARD — otherwise a floor tile one row nearer slices its
    // front edge off, which is the defect `sprite.ts`'s layer note records.
    expect(s.layer).toBe(LAYER_DECAL);
    expect(s.layer).toBeLessThan(LAYER_PIECE);
  });

  it('puts the brass half on top of its own timber at one rect', () => {
    const cam = camera();
    const box: FurnitureBox = { id: 'wood', brassId: 'brass', cx: 200, cy: 150, w: 80, h: 60 };
    const sprites = furnitureSprites([box], cam, () => true);
    expect(sprites.map((s) => s.textureId)).toEqual(['wood', 'brass']);
    expect(sprites[1].position).toEqual(sprites[0].position);
    expect(sprites[1].size).toEqual(sprites[0].size);
  });

  it('draws the timber alone when its brass half is missing, and vice versa', () => {
    const cam = camera();
    const box: FurnitureBox = { id: 'wood', brassId: 'brass', cx: 200, cy: 150, w: 80, h: 60 };
    expect(furnitureSprites([box], cam, (id) => id === 'wood').map((s) => s.textureId)).toEqual([
      'wood',
    ]);
    expect(furnitureSprites([box], cam, (id) => id === 'brass').map((s) => s.textureId)).toEqual([
      'brass',
    ]);
  });

  it('fits both portrait chips independently', () => {
    const cam = camera();
    const scene = buildBattleScene({
      camera: cam,
      time: 0,
      materials: allMaterials([MAT_BEZEL, MAT_BEZEL_SMALL]),
      figures: [] as FigureBox[],
      furniture: [
        portraitBezelBox({ cx: 90, cy: 60, w: 68, h: 68 }),
        portraitBezelBox({ cx: 90, cy: 380, w: 68, h: 68 }),
      ],
      vigor: { lit: 2, total: 3 },
    });
    const fitted = scene.sprites.filter(
      (s) => s.textureId === MAT_BEZEL || s.textureId === MAT_BEZEL_SMALL,
    );
    expect(fitted).toHaveLength(2);
    // Two different board rows: the enemy chip is up-board of the hero's, and
    // nothing here collapses them onto one authored position the way the
    // frame-fixed furniture does.
    expect(fitted[0].position.y).toBeLessThan(fitted[1].position.y);
    expect(fitted[0].position.x).toBeCloseTo(fitted[1].position.x, 10);
  });
});

describe('two authored sizes of one shape', () => {
  it('takes the bake whose own frame is nearest the size being drawn', () => {
    expect(pickAuthoredSize(BEZEL_SIZES, BEZEL_SMALL_FRAME)).toBe(MAT_BEZEL_SMALL);
    expect(pickAuthoredSize(BEZEL_SIZES, BEZEL_FRAME)).toBe(MAT_BEZEL);
    // Either side of the midpoint, so the boundary is the boundary.
    const mid = (BEZEL_FRAME + BEZEL_SMALL_FRAME) / 2;
    expect(pickAuthoredSize(BEZEL_SIZES, mid - 0.01)).toBe(MAT_BEZEL_SMALL);
    expect(pickAuthoredSize(BEZEL_SIZES, mid + 0.01)).toBe(MAT_BEZEL);
    // And it never runs off the ends.
    expect(pickAuthoredSize(BEZEL_SIZES, 0.01)).toBe(MAT_BEZEL_SMALL);
    expect(pickAuthoredSize(BEZEL_SIZES, 40)).toBe(MAT_BEZEL);
  });

  it('survives an empty or unusable list rather than picking a phantom id', () => {
    expect(pickAuthoredSize([], 1)).toBeNull();
    expect(pickAuthoredSize([{ id: 'x', frame: Number.NaN }], 1)).toBeNull();
  });

  it('BOTH branches are reachable from a real chip, which is what makes it a rule', () => {
    // Dead generality would be worse than hardcoding one id. A big chip on a
    // desktop camera takes the large bake; the small one wins once the
    // `--bf-scale` ladder bottoms out and the chip is a third the size.
    const cam = camera();
    const big = furnitureSprites([portraitBezelBox({ cx: 90, cy: 120, w: 68, h: 68 })], cam, () => true);
    const small = furnitureSprites([portraitBezelBox({ cx: 90, cy: 120, w: 23, h: 23 })], cam, () => true);
    expect(big[0].textureId).toBe(MAT_BEZEL);
    expect(small[0].textureId).toBe(MAT_BEZEL_SMALL);
  });
});

describe('vigor drives the arena lantern', () => {
  it('is brightest at full vigor and dimmest at none', () => {
    expect(lanternForVigor(4, 4)).toBeGreaterThan(lanternForVigor(2, 4));
    expect(lanternForVigor(2, 4)).toBeGreaterThan(lanternForVigor(0, 4));
  });

  it('keeps a floor, unlike the DOM path, because the ambient here is a dungeon', () => {
    // The departure is deliberate and documented on `lanternForVigor`: the DOM
    // path can afford a genuinely zero light because LightLayer runs at ambient
    // 0.52. Blacking the fight out at the moment a card has to be chosen is not
    // the same feature on this path.
    expect(lanternForVigor(0, 4)).toBeGreaterThan(0);
    expect(lanternForVigor(0, 4)).toBeLessThan(lanternForVigor(4, 4) * 0.35);
  });

  it('treats a fight with no vigor system at all as fully lit', () => {
    expect(lanternForVigor(0, 0)).toBeCloseTo(lanternForVigor(4, 4), 6);
  });
});

describe('pieces', () => {
  const cam = camera();
  const build = (figures: FigureBox[], materials = allMaterials([monsterTextureId('duskhound')])) =>
    buildBattleScene({ camera: cam, time: 0, materials, figures, vigor: { lit: 3, total: 4 } });

  it('gives every combatant a plinth and a contact shadow, art or no art', () => {
    const withArt = build([figure()]);
    const withoutArt = build([figure({ textureId: null })]);
    const bases = (s: typeof withArt) => s.sprites.filter((x) => x.textureId === 'base').length;
    // `pieceBaseSprites` is shadow + side + top: two discs per piece either way.
    expect(bases(withArt)).toBe(bases(withoutArt));
    expect(bases(withArt)).toBe(2);
    // A monster with no painting is a bare plinth — 41 of 92 of them are.
    expect(withoutArt.sprites.some((s) => s.textureId === monsterTextureId('duskhound'))).toBe(false);
    expect(withArt.sprites.some((s) => s.textureId === monsterTextureId('duskhound'))).toBe(true);
  });

  it('skips a figure whose texture has not arrived, and still stands its plinth', () => {
    const scene = build([figure()], allMaterials());
    expect(scene.sprites.some((s) => s.textureId === monsterTextureId('duskhound'))).toBe(false);
    expect(scene.sprites.filter((s) => s.textureId === 'base')).toHaveLength(2);
  });

  it('stands the figure UP as a billboard, not flat on the board', () => {
    const scene = build([figure()]);
    const fig = scene.sprites.find((s) => s.textureId === monsterTextureId('duskhound'));
    expect(fig?.billboard).toBe(true);
  });

  it('mirrors the near rank and leaves the far one alone', () => {
    const scene = build([figure({ uid: 'a', flip: true }), figure({ uid: 'b' })]);
    const figs = scene.sprites.filter((s) => s.textureId === monsterTextureId('duskhound'));
    expect(figs[0].uv.u0).toBeGreaterThan(figs[0].uv.u1);
    expect(figs[1].uv.u0).toBeLessThan(figs[1].uv.u1);
  });

  it('fades a felled unit rather than removing it, so the slot keeps its piece', () => {
    const scene = build([figure({ felled: true })]);
    const fig = scene.sprites.find((s) => s.textureId === monsterTextureId('duskhound'));
    expect(fig?.tint?.[3]).toBeLessThan(1);
  });

  it('lifts the acting unit off the board', () => {
    const still = build([figure()]);
    const acting = build([figure({ acting: true })]);
    const z = (s: typeof still) =>
      s.sprites.find((x) => x.textureId === monsterTextureId('duskhound'))!.position.z;
    expect(z(acting)).toBeGreaterThan(z(still));
  });
});

describe('the board', () => {
  it('lays a whole slab of floor tiles under the fight', () => {
    const cam = camera();
    const scene = buildBattleScene({
      camera: cam,
      time: 0,
      materials: allMaterials(),
      figures: [],
      vigor: { lit: 2, total: 3 },
    });
    const ext = arenaExtent(cam);
    expect(scene.sprites.filter((s) => s.textureId === MAT_ARENA)).toHaveLength(ext.width * ARENA_DEPTH);
  });

  it('falls back to a bare chalk floor off-gate, which is the DUEL case', () => {
    // The duel adapter (`MultiplayerScreen.tsx`) reports `gateId: null` — a
    // ring chalked in Everdusk is not in a gate — so there is no tile art to
    // lay the board with. It must still be a board, not a hole: the same slab,
    // the same seams, drawn in flat stone.
    const cam = camera();
    const materials = allMaterials();
    materials.delete(MAT_ARENA);
    const scene = buildBattleScene({
      camera: cam,
      time: 0,
      materials,
      figures: [],
      vigor: { lit: 2, total: 3 },
    });
    const ext = arenaExtent(cam);
    const floor = scene.sprites.filter((s) => s.textureId === MAT_BLANK);
    expect(floor).toHaveLength(ext.width * ARENA_DEPTH);
    expect(floor[0].tint).toBeDefined();
  });

  it('stands the painted backdrop UP behind the board — upright, never a billboard', () => {
    const cam = camera();
    const opts = { camera: cam, time: 0, figures: [] as FigureBox[], vigor: { lit: 2, total: 3 } };
    const scene = buildBattleScene({ ...opts, materials: allMaterials() });
    const flat = scene.sprites.find((s) => s.textureId === MAT_BACKDROP);
    expect(flat?.upright).toBe(true);
    expect(flat?.billboard).toBeUndefined();
    // Behind the far edge of the play area, or it is standing in the fight.
    expect(flat!.position.y).toBeLessThan(0);
  });

  it('draws no backdrop at all when the fight has no painting', () => {
    const cam = camera();
    const materials = allMaterials();
    materials.delete(MAT_BACKDROP);
    const scene = buildBattleScene({
      camera: cam,
      time: 0,
      materials,
      figures: [],
      vigor: { lit: 2, total: 3 },
    });
    expect(scene.sprites.some((s) => s.textureId === MAT_BACKDROP)).toBe(false);
  });

  it('ships an EMPTY occluder grid, never a null one', () => {
    // The bug this rejects cost an hour. `renderer.ts:331` gates lighting on
    // `scene.occluders !== null`, so the honest-looking "an arena has no walls,
    // send null" renders the whole fight UNLIT — flat albedo, no falloff — and
    // reads as a lantern that is merely too bright.
    const cam = camera();
    const scene = buildBattleScene({
      camera: cam,
      time: 0,
      materials: allMaterials(),
      figures: [],
      vigor: { lit: 1, total: 1 },
    });
    expect(scene.occluders).not.toBeNull();
    expect(scene.occluders!.width).toBe(arenaExtent(cam).width);
    expect(scene.occluders!.height).toBe(ARENA_DEPTH);
    // Empty: cleared ground. Nothing on an arena blocks light.
    expect(scene.occluders!.solid.every((v) => v === 0)).toBe(true);
  });

  it('is a pure function of its inputs, so a frame can be diffed', () => {
    const opts = {
      camera: camera(),
      time: 1.75,
      materials: allMaterials([monsterTextureId('duskhound')]),
      figures: [figure(), figure({ uid: 'p1', side: 'ally' as const, feetY: PARTY_FEET, flip: true })],
      vigor: { lit: 2, total: 4 },
    };
    const a = buildBattleScene(opts);
    const b = buildBattleScene(opts);
    expect(JSON.stringify(a.sprites)).toBe(JSON.stringify(b.sprites));
    expect(JSON.stringify(a.lights)).toBe(JSON.stringify(b.lights));
  });
});

describe('texture ids', () => {
  it('namespaces heroes and monsters apart', () => {
    expect(monsterTextureId('duskhound')).not.toBe(heroTextureId('duskhound'));
    expect(heroTextureId('Knight')).toContain('Knight');
  });
});

// =========================================================================
// THE CONSOLE (§19, §19.1) — the three fittings §21.8 could not place.
//
// Two blockers, and only one of them was real. The canvas genuinely did not
// reach the piles or the End Turn lantern; the "5.7x anisotropic stretch" did
// not exist at that size, because it compared the DOM box's BOARD aspect
// against the bake's authored one and the box's board aspect already carries
// the 1/cos `placeFurniture` puts there. So these check the arithmetic FIRST —
// including the wrong answer, by name — and then that each fitting takes the
// mode its own measured distortion calls for.
//
// Per LIGHTING_PLAN §10: prefer a test that REJECTS the old behaviour. The one
// that matters most here is that `log_well` is NINE quads whose corners do not
// move when the box changes shape, because one stretched quad is exactly what
// was refused.
// =========================================================================

/** Real boxes, measured in a real Hollow Gate fight at 1350x860. */
const REAL = {
  /** The whole button — the card plus its count and label. §21.8's anchor. */
  pileWidget: { w: 90, h: 138 },
  /** The card itself, which is what the tray's recess is framed around. */
  cardback: { w: 84, h: 118 },
  lanternTurn: { w: 96, h: 122 },
  logRail: { w: 216, h: 434 },
};

/**
 * How much a bake's image is stretched when its QUAD is drawn over a box.
 *
 * The quad may be bigger than the box — that is what `scale`/`scaleY` are for —
 * so both go in. See the block above `HUD_PORTRAIT_ENEMY`: the cos cancels,
 * which is the whole correction.
 */
const distortion = (box: { w: number; h: number }, a: AuthoredFrame, sx = 1, sy = 1) =>
  ((box.h * sy) / (box.w * sx)) * (a.w / a.h);

describe('the aspect trap, re-measured', () => {
  it('THE CORRECTION: the pile pair is 0.999, and §21.8’s 2.1x is reproduced', () => {
    // First the number that was recorded, exactly, so there is no doubt which
    // quantity it was: the widget's BOARD aspect — already 1/cos taller than
    // its screen aspect, put there by `placeFurniture` so the quad projects
    // back onto the box — against the bake's authored board aspect. Counting
    // the tilt on one side and not the other is the whole of the error.
    const cos = Math.cos(camera().tilt);
    const asRecorded =
      REAL.pileWidget.h / cos / REAL.pileWidget.w / (PILE_FRAME.h / PILE_FRAME.w);
    expect(asRecorded).toBeCloseTo(2.1, 1);
    // Done once, on the anchor and with the contract this pass actually uses:
    // `build_pile_tray`'s recess is "0.64 by 0.90 ... which is a playing card"
    // and `.pile-cardback` is 84x118 = 0.712. The bake and the DOM chose the
    // same playing card independently, so putting the slot on the card leaves
    // a tenth of a percent to correct.
    expect(distortion(REAL.cardback, PILE_FRAME, 1 / PILE_SLOT.u, 1 / PILE_SLOT.v)).toBeCloseTo(1, 2);
    // Even covering the button naively — no contract at all — it is 1.11.
    expect(distortion(REAL.pileWidget, PILE_FRAME)).toBeCloseTo(1.21, 2);
  });

  it('keeps the other two honest: the cradle 1.41, the log well 3.56', () => {
    expect(distortion(REAL.lanternTurn, CRADLE_FRAME)).toBeCloseTo(1.412, 2);
    // The log well takes its u contract, which is part of what it is drawn at.
    expect(distortion(REAL.logRail, LOG_FRAME, 1 / LOG_WELL_FRACTION.u, 1)).toBeCloseTo(2.87, 2);
    expect(distortion(REAL.logRail, LOG_FRAME)).toBeCloseTo(3.587, 2);
    // Which is why they take different modes, and the ordering is the argument.
    expect(
      distortion(REAL.cardback, PILE_FRAME, 1 / PILE_SLOT.u, 1 / PILE_SLOT.v),
    ).toBeLessThan(distortion(REAL.lanternTurn, CRADLE_FRAME));
    expect(distortion(REAL.lanternTurn, CRADLE_FRAME)).toBeLessThan(distortion(REAL.logRail, LOG_FRAME));
    expect(pileTrayBox({ cx: 0, cy: 0, ...REAL.cardback }, false).fit).toBeUndefined();
    expect(lanternCradleBox({ cx: 0, cy: 0, ...REAL.lanternTurn }).fit).toBe('contain');
    expect(logWellBox({ cx: 0, cy: 0, ...REAL.logRail }).fit).toBe('slice');
  });

  it('every authored frame is the published PNG’s own pixel aspect', () => {
    // The whole distortion argument rests on the bakes being orthographic
    // renders at their authored board proportions, with no foreshortening baked
    // in. Checked against the real files rather than asserted — and gated on the
    // directory existing, because `web/public/art/materials/` is a build
    // artifact (same reason `battleMaterials.test.ts` gates its disk checks).
    const dir = join(__dirname, '..', '..', '..', 'public', 'art', 'materials', 'board');
    if (!existsSync(dir)) return;
    const png = (name: string) => {
      const b = readFileSync(join(dir, `${name}.png`));
      // IHDR: 8-byte signature, 4 length, 4 type, then width and height BE32.
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    };
    for (const [name, a] of [
      ['pile_tray', PILE_FRAME],
      ['exhaust_grate', PILE_FRAME],
      ['lantern_cradle', CRADLE_FRAME],
      ['log_well', LOG_FRAME],
      ['brass_strap', STRAP_FRAME],
    ] as const) {
      const p = png(name);
      expect(p.h / p.w).toBeCloseTo(a.h / a.w, 2);
      // Both halves of a split shape share one frame, or they cannot be drawn
      // at one rect.
      if (name !== 'brass_strap') {
        const b = png(`${name}_brass`);
        expect([b.w, b.h]).toEqual([p.w, p.h]);
      }
    }
  });
});

describe('log_well is NINE windows, not one stretched quad', () => {
  const cam = camera();
  const box = (over: Partial<{ w: number; h: number }> = {}) =>
    logWellBox({ cx: 700, cy: 260, ...REAL.logRail, ...over });

  const sprites = (over = {}) =>
    furnitureSprites([box(over)], cam, (id) => id === MAT_LOG_WELL || id === MAT_LOG_WELL_BRASS);

  it('THE POINT: the brass corners do not grow when the box gets taller', () => {
    // This is the assertion the old behaviour fails. Covering a box with one
    // quad scales every texel with the box, so doubling its height doubles the
    // corner bracket; nine-slicing keeps the corner and lengthens the run.
    const short = sprites({ h: 200 }).filter((s) => s.textureId === MAT_LOG_WELL);
    const tall = sprites({ h: 800 }).filter((s) => s.textureId === MAT_LOG_WELL);
    expect(short).toHaveLength(9);
    expect(tall).toHaveLength(9);
    const corner = (list: typeof short) => list[0];
    expect(corner(tall).size.x).toBeCloseTo(corner(short).size.x, 10);
    expect(corner(tall).size.y).toBeCloseTo(corner(short).size.y, 10);
    // And the run between them takes ALL of the difference.
    const middleRow = (list: typeof short) => list[3];
    expect(middleRow(tall).size.y - middleRow(short).size.y).toBeCloseTo(
      600 / (cam.zoom * Math.cos(cam.tilt)),
      6,
    );
  });

  it('cuts the UV at the border the brass was measured at, on both halves', () => {
    const all = sprites();
    const timber = all.filter((s) => s.textureId === MAT_LOG_WELL);
    const brass = all.filter((s) => s.textureId === MAT_LOG_WELL_BRASS);
    expect(timber).toHaveLength(9);
    expect(brass).toHaveLength(9);
    // The brass is drawn at the IDENTICAL nine rects — `split()` renders both
    // halves from one assembly at one frame precisely so this is legal.
    for (let i = 0; i < 9; i++) {
      expect(brass[i].position).toEqual(timber[i].position);
      expect(brass[i].size).toEqual(timber[i].size);
      expect(brass[i].uv).toEqual(timber[i].uv);
    }
    expect(timber[0].uv).toEqual({ u0: 0, v0: 0, u1: LOG_SLICE.u, v1: LOG_SLICE.v });
    expect(timber[8].uv).toEqual({ u0: 1 - LOG_SLICE.u, v0: 1 - LOG_SLICE.v, u1: 1, v1: 1 });
  });

  it('the nine tile the quad exactly — no gap, no overlap', () => {
    const all = sprites().filter((s) => s.textureId === MAT_LOG_WELL);
    const p = placeFurniture(box(), cam)!;
    const left = p.at.x - p.width / 2;
    const top = p.at.y - p.height / 2;
    // Every cell is pivoted at its own corner, so the runs must add up.
    const xs = [...new Set(all.map((s) => s.position.x))].sort((a, b) => a - b);
    const ys = [...new Set(all.map((s) => s.position.y))].sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(left, 10);
    expect(ys[0]).toBeCloseTo(top, 10);
    const row = all.filter((s) => s.position.y === ys[0]).sort((a, b) => a.position.x - b.position.x);
    for (let i = 1; i < row.length; i++) {
      expect(row[i].position.x).toBeCloseTo(row[i - 1].position.x + row[i - 1].size.x, 10);
    }
    const last = row[row.length - 1];
    expect(last.position.x + last.size.x).toBeCloseTo(left + p.width, 10);
  });

  it('draws the corner SQUARE — the band is taken off the width, twice', () => {
    // A corner cell whose height came from the box's height would be stretched
    // exactly as much as the run it is protecting, which is the bug wearing a
    // nine-slice costume. `log_well`'s brackets are 0.30 x 0.30 board units, so
    // the drawn cell must be square ON SCREEN.
    const all = sprites().filter((s) => s.textureId === MAT_LOG_WELL);
    const cos = Math.cos(cam.tilt);
    const c = all[0];
    const screenW = c.size.x * cam.zoom;
    const screenH = c.size.y * cam.zoom * cos;
    // Same ratio the texture's own corner has: slice.u of the width against
    // slice.v of the height, in the PNG's pixel aspect.
    expect(screenH / screenW).toBeCloseTo((LOG_SLICE.v * LOG_FRAME.h) / (LOG_SLICE.u * LOG_FRAME.w), 6);
  });

  it('honours the well’s u contract and deliberately not its v', () => {
    // `build_log_well`: the well is 0.80 x 0.75 of the panel. Read backwards
    // that is the panel's scale. Only u is taken, and the reason is a
    // measurement — see LOG_WELL_FRACTION.
    const b = box();
    expect(b.scale).toBeCloseTo(1 / LOG_WELL_FRACTION.u, 10);
    expect(b.scaleY).toBe(1);
    const p = placeFurniture(b, cam)!;
    expect(p.width * cam.zoom).toBeCloseTo(REAL.logRail.w / LOG_WELL_FRACTION.u, 6);
    expect(p.height * cam.zoom * Math.cos(cam.tilt)).toBeCloseTo(REAL.logRail.h, 6);
  });
});

describe('sliceBands', () => {
  it('gives band / middle / band, and the middle takes the slack', () => {
    const b = sliceBands(10, 6, 1, 0.2);
    expect(b).toHaveLength(3);
    expect(b.map((x) => x.size)).toEqual([1, 4, 1]);
    expect(b.map((x) => x.at)).toEqual([10, 11, 15]);
    expect(b[1].t0).toBeCloseTo(0.2, 10);
    expect(b[1].t1).toBeCloseTo(0.8, 10);
  });

  it('DROPS the middle rather than letting the bands overlap', () => {
    // Two bands wider than the span is the degenerate case, and drawing them
    // both at full width would paint the same texels twice with a negative-width
    // quad between them.
    const b = sliceBands(0, 1.5, 1, 0.25);
    expect(b).toHaveLength(2);
    expect(b.map((x) => x.size)).toEqual([0.75, 0.75]);
    expect(b[0].at + b[0].size).toBeCloseTo(b[1].at, 10);
  });

  it('produces nothing at all for a degenerate span', () => {
    expect(sliceBands(0, 0, 1, 0.2)).toEqual([]);
    expect(sliceBands(0, -3, 1, 0.2)).toEqual([]);
    expect(sliceBands(NaN, 5, 1, 0.2)).toEqual([]);
    expect(sliceBands(0, NaN, 1, 0.2)).toEqual([]);
    // A fraction at or past the half clamps rather than inverting the middle.
    for (const f of [0.5, 0.9, NaN]) {
      for (const band of sliceBands(0, 8, 1, f)) {
        expect(band.t0).toBeLessThan(band.t1);
        expect(Number.isFinite(band.size)).toBe(true);
        expect(band.size).toBeGreaterThan(0);
      }
    }
  });
});

describe('contain keeps the bake’s aspect and covers the box anyway', () => {
  const cam = camera();

  it('draws the cradle at its authored shape, to the pixel', () => {
    const p = placeFurniture(lanternCradleBox({ cx: 500, cy: 300, ...REAL.lanternTurn }), cam)!;
    const cos = Math.cos(cam.tilt);
    const screenW = p.width * cam.zoom;
    const screenH = p.height * cam.zoom * cos;
    expect(screenH / screenW).toBeCloseTo(CRADLE_FRAME.h / CRADLE_FRAME.w, 9);
    // And it CONTAINS the button rather than fitting inside it: the ears run
    // past the base disc, so the housing is wider than the thing it holds.
    expect(screenW).toBeGreaterThanOrEqual(REAL.lanternTurn.w - 1e-6);
    expect(screenH).toBeGreaterThanOrEqual(REAL.lanternTurn.h - 1e-6);
    // Grown by the tighter axis only — one of the two is exact.
    const exact = Math.abs(screenW - REAL.lanternTurn.w) < 1e-6 || Math.abs(screenH - REAL.lanternTurn.h) < 1e-6;
    expect(exact).toBe(true);
  });

  it('grows the OTHER way round when the box is wide', () => {
    const p = placeFurniture(lanternCradleBox({ cx: 500, cy: 300, w: 400, h: 40 }), cam)!;
    const cos = Math.cos(cam.tilt);
    expect((p.height * cam.zoom * cos) / (p.width * cam.zoom)).toBeCloseTo(CRADLE_FRAME.h / CRADLE_FRAME.w, 9);
    expect(p.width * cam.zoom).toBeCloseTo(400, 6);
  });

  it('falls back to covering when there is no authored frame to keep', () => {
    const p = placeFurniture({ id: 'x', fit: 'contain', cx: 500, cy: 300, w: 200, h: 100 }, cam)!;
    expect(p.width * cam.zoom).toBeCloseTo(200, 6);
    expect(p.height * cam.zoom * Math.cos(cam.tilt)).toBeCloseTo(100, 6);
  });

  it('draws the cradle’s brass over its timber at one rect, and gates each', () => {
    // §19.1 asks the brass to catch the light, which needs its own material map
    // and therefore its own quad. The cradle is one shape where that is
    // load-bearing: `build_lantern_cradle` says the EARS are its identity and
    // the ears are brass.
    const box = lanternCradleBox({ cx: 500, cy: 300, ...REAL.lanternTurn });
    const both = furnitureSprites([box], cam, () => true);
    expect(both.map((s) => s.textureId)).toEqual([MAT_CRADLE, MAT_CRADLE_BRASS]);
    expect(both[1].position).toEqual(both[0].position);
    expect(both[1].size).toEqual(both[0].size);
    expect(furnitureSprites([box], cam, (id) => id === MAT_CRADLE_BRASS)).toHaveLength(1);
    expect(furnitureSprites([box], cam, () => false)).toHaveLength(0);
  });
});

describe('the pile pair', () => {
  const cam = camera();
  const ids = new Set([MAT_PILE_TRAY, MAT_PILE_TRAY_BRASS, MAT_EXHAUST, MAT_EXHAUST_BRASS]);
  const has = (id: string) => ids.has(id);

  it('puts the card SLOT on the card back, not the tray’s rim on it', () => {
    // `PILE_SLOT` read backwards, the way `BEZEL_BORE` is. Getting this wrong
    // draws a card-shaped hole the size of the card and the timber outside the
    // widget entirely.
    const p = placeFurniture(pileTrayBox({ cx: 400, cy: 300, ...REAL.cardback }, false), cam)!;
    expect(p.width * cam.zoom * PILE_SLOT.u).toBeCloseTo(REAL.cardback.w, 6);
    expect(p.height * cam.zoom * Math.cos(cam.tilt) * PILE_SLOT.v).toBeCloseTo(REAL.cardback.h, 6);
  });

  it('shares a footprint with the grate and nothing else', () => {
    // §19.1: the pair must be told apart by SILHOUETTE. Same frame, same slot,
    // same rect — different bake.
    const tray = pileTrayBox({ cx: 400, cy: 300, ...REAL.cardback }, false);
    const grate = pileTrayBox({ cx: 400, cy: 300, ...REAL.cardback }, true);
    expect(grate.id).not.toBe(tray.id);
    expect(grate.brassId).not.toBe(tray.brassId);
    expect({ ...grate, id: '', brassId: '' }).toEqual({ ...tray, id: '', brassId: '' });
    const a = placeFurniture(tray, cam)!;
    const b = placeFurniture(grate, cam)!;
    expect(b).toEqual(a);
  });

  it('draws timber then brass at one rect, and each alone if its partner is missing', () => {
    const box = pileTrayBox({ cx: 400, cy: 300, ...REAL.cardback }, false);
    const both = furnitureSprites([box], cam, has);
    expect(both.map((s) => s.textureId)).toEqual([MAT_PILE_TRAY, MAT_PILE_TRAY_BRASS]);
    expect(both[1].position).toEqual(both[0].position);
    expect(both[1].size).toEqual(both[0].size);
    expect(furnitureSprites([box], cam, (id) => id === MAT_PILE_TRAY)).toHaveLength(1);
    expect(furnitureSprites([box], cam, (id) => id === MAT_PILE_TRAY_BRASS)).toHaveLength(1);
    expect(furnitureSprites([box], cam, () => false)).toHaveLength(0);
  });
});

describe('every console fitting refuses a degenerate box', () => {
  const cam = camera();
  const makers = [
    (r: MeasuredBox) => pileTrayBox(r, false),
    (r: MeasuredBox) => pileTrayBox(r, true),
    lanternCradleBox,
    logWellBox,
  ];
  const bad: MeasuredBox[] = [
    { cx: 100, cy: 100, w: 0, h: 0 },
    { cx: 100, cy: 100, w: 1, h: 40 },
    { cx: NaN, cy: 100, w: 40, h: 40 },
    { cx: 100, cy: 100, w: NaN, h: 40 },
    { cx: 100, cy: 100, w: 40, h: Infinity },
  ];

  it('NO SPRITE, never a NaN vertex', () => {
    // A NaN that reaches the camera does not draw badly, it blanks the canvas
    // for the rest of the session. Every guard on this path returns nothing.
    for (const make of makers) {
      for (const r of bad) {
        const b = make(r);
        expect(placeFurniture(b, cam)).toBeNull();
        expect(furnitureSprites([b], cam, () => true)).toHaveLength(0);
      }
    }
  });

  it('and refuses a degenerate CAMERA, including the sliced path', () => {
    const box = logWellBox({ cx: 400, cy: 300, ...REAL.logRail });
    for (const over of [{ zoom: 0 }, { zoom: -5 }, { zoom: NaN }, { tilt: Math.PI / 2 }, { tilt: NaN }]) {
      const bad = { ...cam, ...over } as Camera;
      expect(furnitureSprites([box], bad, () => true)).toHaveLength(0);
    }
  });
});

describe('brass_strap crosses a seam that exists', () => {
  const extent = { width: 6, height: ARENA_DEPTH, border: 1.2 };

  it('sits on the joint at the slab’s near edge, on the TABLE', () => {
    const c = strapCentres(extent, 0.45);
    expect(c.length).toBeGreaterThan(0);
    for (const s of c) {
      expect(s.y).toBeCloseTo(ARENA_DEPTH + 1.2 + STRAP_FRAME.h / 2, 10);
      // z below the board, which is where the table is.
      expect(s.z).toBeCloseTo(-0.45, 10);
    }
  });

  it('lands on the rim’s own four-tile repeat, inside the slab', () => {
    const c = strapCentres(extent, 0.45);
    const left = -extent.border;
    for (const s of c) {
      expect((s.x - left) % STRAP_PITCH).toBeCloseTo(0, 10);
      expect(s.x).toBeGreaterThan(left);
      expect(s.x).toBeLessThan(extent.width + extent.border);
    }
    expect(STRAP_PITCH).toBe(4);
  });

  it('draws at its AUTHORED size, foreshortened like the rest of the carpentry', () => {
    const scene = buildBattleScene({
      camera: camera(),
      time: 0,
      materials: allMaterials([MAT_STRAP]),
      figures: [],
      vigor: { lit: 1, total: 3 },
    });
    const straps = scene.sprites.filter((s) => s.textureId === MAT_STRAP);
    expect(straps.length).toBe(strapCentres(arenaExtent(camera()), 0.45).length);
    for (const s of straps) {
      // NOT divided by cos: a strap is board furniture, not a fitting behind a
      // straight-on widget, so the tilt squashes it exactly as it squashes the
      // socket it shares a board with.
      expect(s.size).toEqual({ x: STRAP_FRAME.w, y: STRAP_FRAME.h });
      expect(s.upright).toBeUndefined();
    }
  });

  it('draws NOTHING when the bake has not arrived', () => {
    const scene = buildBattleScene({
      camera: camera(),
      time: 0,
      materials: allMaterials(),
      figures: [],
      vigor: { lit: 1, total: 3 },
    });
    expect(scene.sprites.some((s) => s.textureId === MAT_STRAP)).toBe(false);
  });

  it('produces no strap for a degenerate slab', () => {
    expect(strapCentres({ width: 0, height: 6, border: 0 }, 0.45)).toEqual([]);
    expect(strapCentres({ width: NaN, height: 6, border: 1.2 }, 0.45)).toEqual([]);
  });
});

describe('the paint order the console needed', () => {
  const cam = camera();
  const opts = {
    camera: cam,
    time: 0,
    figures: [] as FigureBox[],
    vigor: { lit: 2, total: 3 },
  };

  it('THE FIX: the slab’s rim no longer paints across the fittings', () => {
    // An upright quad takes LAYER_PIECE from `layerOf`, and that put the board's
    // own near edge over the discard tray, the exhaust grate and the cradle —
    // all of which unproject PAST that edge and are therefore in front of it.
    const scene = buildBattleScene({ ...opts, materials: allMaterials() });
    const rim = scene.sprites.find((s) => s.textureId === 'rim')!;
    expect(rim.layer).toBe(ARENA_RIM_LAYER);
    expect(ARENA_RIM_LAYER).toBeLessThan(LAYER_DECAL);
    // The map keeps the default, and that is asserted where the default lives.
    const mapRim = boardSlabSprites({ width: 8, height: 6, frameTextureId: 'frame', rimTextureId: 'rim' }).find(
      (s) => s.textureId === 'rim',
    )!;
    expect(mapRim.layer).toBeUndefined();
  });

  it('drops the painted flat below the fittings and keeps it above the floor', () => {
    // The Chronicle's box reaches board y past the flat's base, so at
    // LAYER_PIECE the flat painted a black rectangle over the top of `log_well`.
    const scene = buildBattleScene({ ...opts, materials: allMaterials() });
    const flat = scene.sprites.find((s) => s.textureId === MAT_BACKDROP)!;
    expect(flat.layer).toBe(BACKDROP_LAYER);
    expect(BACKDROP_LAYER).toBeGreaterThan(0);
    expect(BACKDROP_LAYER).toBeLessThan(LAYER_DECAL);
    // Still behind every piece, which is the only thing it ever needed.
    expect(BACKDROP_LAYER).toBeLessThan(LAYER_PIECE);
  });

  it('puts every fitting on LAYER_DECAL, sliced or not', () => {
    const boxes = [
      pileTrayBox({ cx: 300, cy: 300, ...REAL.cardback }, false),
      pileTrayBox({ cx: 400, cy: 300, ...REAL.cardback }, true),
      lanternCradleBox({ cx: 500, cy: 300, ...REAL.lanternTurn }),
      logWellBox({ cx: 700, cy: 260, ...REAL.logRail }),
    ];
    for (const s of furnitureSprites(boxes, cam, () => true)) expect(s.layer).toBe(LAYER_DECAL);
  });
});
