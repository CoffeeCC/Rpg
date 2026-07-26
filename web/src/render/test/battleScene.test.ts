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
import { describe, expect, it } from 'vitest';
import { project, type Camera } from '../../lantern/scene/camera';
import type { Material } from '../../lantern/scene/scene';
import {
  ARENA_DEPTH,
  CANDLE_FRAME_X,
  CORNER_BRASS_SIZE,
  ENEMY_RANK,
  MAT_ARENA,
  MAT_BACKDROP,
  MAT_BLANK,
  MAT_CANDLE,
  MAT_CORNER_BRASS,
  MAT_RAIL_STRIP,
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
  monsterTextureId,
  placeFigure,
  type FigureBox,
} from '../battleScene';

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
