// =========================================================================
// THE BOARD AS AN OBJECT.
//
// ENGINE_PLAN §11 listed "board edge and thickness" and "a table underneath"
// as the two missing cues that stop it reading as a slab, and §13 made them
// load-bearing by framing the whole board every frame.
//
// The failure this file guards hardest is the TABLE SEAM, and it is worth
// naming because it is a class of bug that testing by eye finds late: the
// table's timber repeats, and ordinary value noise leaves a straight line at
// every repeat. Straight lines in a random field are the one thing human
// vision is best at, so the first table looked tiled with lino. It is a
// property of the generator, provable in a unit test, and invisible in any
// single screenshot of the texture itself.
// =========================================================================
import { describe, expect, it } from 'vitest';
import {
  BAKED_FRAME,
  BAKED_RIM_HEIGHT,
  boardFrameNormalPixels,
  boardFramePixels,
  boardRimPixels,
  boardSlabSprites,
  fieldToAlbedo,
  fieldToNormals,
  frameTheBoard,
  ledgeFace,
  slabBounds,
  woodField,
} from '../scene/board';
import { LAYER_BOARD, LAYER_PIECE, LAYER_TABLE, sortForPainting, spriteLayer } from '../scene/sprite';
import { makeCamera } from '../scene/camera';

const SLAB = { width: 22, height: 14, border: 1.35, thickness: 0.5, frameTextureId: 'frame' };

describe('a vertical face wherever the height changes', () => {
  // The rim is not a special case for the board's outline. A wall block's
  // front, a ledge above a drop and the step between two map layers (§14)
  // are all this same quad, which is most of their geometry for free.
  const face = ledgeFace({ x: 3, width: 4, y: 9, top: 0, bottom: -0.5, textureId: 'rim' });

  it('stands up as a fixed plane, not a billboard', () => {
    // A rim does not turn to face anybody. Its normal points along board +y,
    // out toward the near edge of the table.
    expect(face.upright).toBe(true);
    expect(face.billboard).toBeUndefined();
  });

  it('hangs from the surface behind it down to the surface in front', () => {
    expect(face.size.y).toBeCloseTo(0.5, 6);
    expect(face.position.z).toBeCloseTo(-0.5, 6);
    // Anchored at its BASE, which is the lower surface.
    expect(face.pivot).toEqual({ x: 0, y: 1 });
  });

  it('has no area when there is no step', () => {
    expect(ledgeFace({ x: 0, width: 1, y: 0, top: 0.4, bottom: 0.4, textureId: 't' }).size.y).toBe(0);
    // And never negative, which would flip the quad inside out.
    expect(ledgeFace({ x: 0, width: 1, y: 0, top: 0, bottom: 0.4, textureId: 't' }).size.y).toBe(0);
  });
});

describe('the slab', () => {
  it('surrounds the play area by the border on every side', () => {
    const b = slabBounds(SLAB);
    expect(b.x).toBeCloseTo(-1.35, 6);
    expect(b.width).toBeCloseTo(22 + 2.7, 6);
    expect(b.height).toBeCloseTo(14 + 2.7, 6);
    expect(frameTheBoard(SLAB).centre).toEqual({ x: 11, y: 7 });
  });

  it('is table, then its shadow, then frame, then rim — in that order', () => {
    const parts = sortForPainting(
      boardSlabSprites({ ...SLAB, tableTextureId: 'table', shadowTextureId: 'sh', rimTextureId: 'rim' }),
    );
    expect(parts.map((s) => s.textureId)).toEqual(['table', 'sh', 'frame', 'rim']);
  });

  it('THE ORDER: the frame draws before every tile without being told to', () => {
    // One quad rather than a ring of four strips, so the tile grid simply
    // draws over the middle of it — which only works if it sorts first. It
    // does, because its anchor is the slab's outer corner and every tile's
    // board y is strictly greater. Asserted rather than assumed.
    const frame = boardSlabSprites(SLAB)[0];
    expect(spriteLayer(frame)).toBe(LAYER_BOARD);
    expect(frame.position.y).toBeLessThan(0);
  });

  it('THE TRICK: the table sits a slab-thickness BELOW the board', () => {
    // This is the whole of "the board is proud of the table". The projection
    // drops negative z further down the screen, so the table surface appears
    // below the board's and the rim fills the gap. A table at z = 0 is a
    // bigger board.
    const parts = boardSlabSprites({ ...SLAB, tableTextureId: 'table' }, undefined);
    const table = parts.find((s) => s.textureId === 'table')!;
    expect(table.position.z).toBeCloseTo(-0.5, 6);
    expect(spriteLayer(table)).toBe(LAYER_TABLE);
  });

  it('sizes the table to the view when it is given one', () => {
    const camera = makeCamera({ centre: { x: 11, y: 7 }, zoom: 48, viewport: { x: 1280, y: 800 } });
    const wide = boardSlabSprites({ ...SLAB, tableTextureId: 'table' }, camera).find((s) => s.textureId === 'table')!;
    // A table that stops inside the frame is just a bigger board.
    expect(wide.size.x).toBeGreaterThan(slabBounds(SLAB).width);
    expect(wide.size.y).toBeGreaterThan(slabBounds(SLAB).height);
  });

  it('counts REPEATS in the table UV rather than stretching one copy', () => {
    const table = boardSlabSprites({ ...SLAB, tableTextureId: 'table', tableGrain: 4 }, undefined).find(
      (s) => s.textureId === 'table',
    )!;
    // Stretching would leave u1 at 1 and make the grain scale with the
    // camera, which is the tell of wallpaper rather than timber.
    expect(table.uv.u1).toBeCloseTo(table.size.x / 4, 5);
    expect(table.uv.v1).toBeCloseTo(table.size.y / 4, 5);
  });

  it('drops the table, its shadow and the rim when no texture is offered', () => {
    const bare = boardSlabSprites(SLAB);
    expect(bare).toHaveLength(1);
    expect(bare[0].textureId).toBe('frame');
  });

  it('puts the rim on the piece layer, in front of everything on the board', () => {
    const rim = boardSlabSprites({ ...SLAB, rimTextureId: 'rim' }).find((s) => s.textureId === 'rim')!;
    expect(spriteLayer(rim)).toBe(LAYER_PIECE);
    expect(rim.position.y).toBeCloseTo(slabBounds(SLAB).y + slabBounds(SLAB).height, 6);
  });
});

describe('procedural timber', () => {
  const SIZE = 64;

  it('THE REPRO: the wood must be seamless across a repeat', () => {
    // The table texture is sampled with REPEAT, so column 0 sits against
    // column SIZE-1 in the rendered image. Non-periodic noise leaves a hard
    // discontinuity there, and a straight line in a random field is the one
    // artifact human vision picks out instantly.
    const field = woodField(SIZE);
    const at = (x: number, y: number) => field[y * SIZE + x];

    // The step across the wrap must be no worse than a typical step INSIDE
    // the texture, PER AXIS. Per axis matters: the grain runs across v, so a
    // neighbouring-row step is naturally several times a neighbouring-column
    // one, and comparing the v seam against the u interior fails a texture
    // that is in fact seamless.
    const meanStep = (axis: 'x' | 'y') => {
      let sum = 0;
      for (let y = axis === 'y' ? 1 : 0; y < SIZE; y++) {
        for (let x = axis === 'x' ? 1 : 0; x < SIZE; x++) {
          sum += Math.abs(at(x, y) - (axis === 'x' ? at(x - 1, y) : at(x, y - 1)));
        }
      }
      return sum / (SIZE * (SIZE - 1));
    };

    let seamX = 0;
    for (let y = 0; y < SIZE; y++) seamX += Math.abs(at(0, y) - at(SIZE - 1, y));
    seamX /= SIZE;

    let seamY = 0;
    for (let x = 0; x < SIZE; x++) seamY += Math.abs(at(x, 0) - at(x, SIZE - 1));
    seamY /= SIZE;

    expect(seamX).toBeLessThan(meanStep('x') * 3);
    expect(seamY).toBeLessThan(meanStep('y') * 3);
  });

  it('is deterministic — the same board every run', () => {
    expect(Array.from(woodField(32))).toEqual(Array.from(woodField(32)));
  });

  it('stays inside 0..1 so the colouring cannot clip', () => {
    for (const v of woodField(SIZE)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('colours the field between two endpoints, opaque', () => {
    const field = new Float32Array([0, 1, 0.5, 0]);
    const px = fieldToAlbedo(field, 2, [10, 20, 30], [110, 120, 130]);
    expect([px[0], px[1], px[2], px[3]]).toEqual([10, 20, 30, 255]);
    expect([px[4], px[5], px[6]]).toEqual([110, 120, 130]);
    expect(px[8]).toBe(60);
  });

  it('derives normals from the SAME field the albedo came from', () => {
    // The registration problem ENGINE_PLAN §7 spends a section on. Here we
    // own both channels, so it is free — but only if they are generated from
    // one source, which is why woodField is separate from the pixels.
    const field = woodField(32);
    const a = fieldToNormals(field, 32, 1);
    const b = fieldToNormals(woodField(32), 32, 1);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('wraps the Sobel, so a repeating texture has no flat seam in its normals', () => {
    // Clamping instead would put a line of dead-flat normals down the middle
    // of the table every few tiles: invisible in the texture, glaring under a
    // moving light.
    const field = woodField(32);
    const px = fieldToNormals(field, 32, 1);
    let edgeFlat = 0;
    for (let y = 0; y < 32; y++) if (px[(y * 32) * 4] === 128 && px[(y * 32) * 4 + 1] === 128) edgeFlat++;
    expect(edgeFlat).toBeLessThan(16);
  });

  it('every generated normal decodes to a unit vector', () => {
    const px = fieldToNormals(woodField(32), 32, 1.5);
    for (let i = 0; i < px.length; i += 4) {
      const x = (px[i] / 127.5) - 1;
      const y = (px[i + 1] / 127.5) - 1;
      const z = (px[i + 2] / 127.5) - 1;
      expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 1);
    }
  });
});

describe('the frame chamfer', () => {
  const SIZE = 64;
  const opts = { borderU: 0.12, borderV: 0.12 };

  it('darkens toward the outer edge and leaves the middle alone', () => {
    const plain = fieldToAlbedo(woodField(SIZE), SIZE, [34, 23, 16], [92, 63, 40]);
    const framed = boardFramePixels(SIZE, opts);
    const at = (px: Uint8Array, x: number, y: number) => px[(y * SIZE + x) * 4];
    const c = SIZE / 2;
    expect(at(framed, c, c)).toBe(at(plain, c, c));
    expect(at(framed, 0, c)).toBeLessThan(at(plain, 0, c));
    expect(at(framed, SIZE - 1, c)).toBeLessThan(at(plain, SIZE - 1, c));
  });

  it('THE POINT: the chamfer tips the NORMAL outward, on all four sides', () => {
    // A painted edge gradient looks the same from every light angle, which is
    // to say it looks painted. A tipped normal brightens on the lantern's
    // side and falls away on the other, so the slab reads as machined the
    // moment anything moves. If both sides tipped the same way the edge would
    // light like a ramp instead of a bevel.
    const px = boardFrameNormalPixels(SIZE, opts);
    const nx = (x: number, y: number) => px[(y * SIZE + x) * 4] / 127.5 - 1;
    const ny = (x: number, y: number) => px[(y * SIZE + x) * 4 + 1] / 127.5 - 1;
    const c = SIZE / 2;
    expect(nx(0, c)).toBeLessThan(-0.4);
    expect(nx(SIZE - 1, c)).toBeGreaterThan(0.4);
    expect(ny(c, 0)).toBeLessThan(-0.4);
    expect(ny(c, SIZE - 1)).toBeGreaterThan(0.4);
    // Flat in the middle, where the tiles cover it anyway.
    expect(Math.abs(nx(c, c))).toBeLessThan(0.35);
  });

  it('takes a separate border fraction per axis, because the slab is not square', () => {
    // One fraction on a 24x16 slab puts a chamfer half again as wide on the
    // short edges as on the long ones, which reads as a mitring mistake.
    const px = boardFrameNormalPixels(SIZE, { borderU: 0.05, borderV: 0.25 });
    const nx = (x: number, y: number) => px[(y * SIZE + x) * 4] / 127.5 - 1;
    const ny = (x: number, y: number) => px[(y * SIZE + x) * 4 + 1] / 127.5 - 1;
    const c = SIZE / 2;
    // A tenth of the way in: past the narrow u chamfer, still inside the v one.
    expect(Math.abs(nx(Math.round(SIZE * 0.1), c))).toBeLessThan(0.3);
    expect(Math.abs(ny(c, Math.round(SIZE * 0.1)))).toBeGreaterThan(0.3);
  });

  it('the rim is darkest where it meets the table', () => {
    // No light reaches the very bottom of a slab edge. Painting that in is
    // cheaper and steadier than asking the lighting for it, and it is what
    // stops a rim reading as a floating stripe.
    const px = boardRimPixels(SIZE);
    const at = (y: number) => px[(y * SIZE + SIZE / 2) * 4];
    expect(at(SIZE - 1)).toBeLessThan(at(SIZE / 2));
  });
});

// =========================================================================
// THE BLENDER FRAME, CUT INTO WINDOWS.
//
// The bug these exist to reject is the one that would be easiest to ship:
// dropping `board_frame` into the existing single quad. It type-checks, it
// loads, it draws — and the timber band's width is then a fixed FRACTION of a
// slab whose aspect is nothing like the bake's, so the brass bead lands
// several tiles inside the play area and every tile draws over it. That is
// invisible in a unit test that only asserts "a frame sprite exists", so
// these assert REGISTRATION: where the bake's own features land in tiles.
// =========================================================================
describe('the baked frame registers with the board it is drawn on', () => {
  const WINDOWS = { textureId: 'board_frame', brassTextureId: 'board_frame_brass' };
  const ring = (o: Partial<typeof SLAB> = {}) =>
    boardSlabSprites({ ...SLAB, ...o, frameWindows: WINDOWS }).filter((s) => s.textureId === 'board_frame');

  /** The texture coordinate of the slab's outer edge, and of a window's inner one. */
  const outer = BAKED_FRAME.play + BAKED_FRAME.border * 2;
  const tex = outer * BAKED_FRAME.margin;
  const pad = (tex - outer) / 2;

  it('THE REPRO: the corner keeps its size in tiles whatever the aspect is', () => {
    // A single stretched quad cannot do this — its border band is a fraction
    // of the quad, so a 22x14 slab gets a top band 1.57x the width of its side
    // band. Corner windows are the fix and this is the assertion that they
    // work: same corner, in tiles, on a wide board and on a tall one.
    const band = BAKED_FRAME.window * (1.35 / BAKED_FRAME.border);
    for (const shape of [{ width: 22, height: 14 }, { width: 8, height: 30 }]) {
      const corner = ring(shape)[0];
      expect(corner.size.x).toBeCloseTo(band, 6);
      expect(corner.size.y).toBeCloseTo(band, 6);
    }
  });

  it('THE REGISTRATION: the frame band ends exactly where the play area begins', () => {
    // The one number that has to be right. The bake is 1.1 tiles of timber
    // around 4 tiles of play; the board is 1.35 around 22. Interpolate the
    // corner window's UV to board x = 0 and it must land on the bake's own
    // play boundary — otherwise the bead, the rebate and the mitre all sit at
    // the wrong radius and no amount of eyeballing says by how much.
    const slab = slabBounds(SLAB);
    const corner = ring()[0];
    const t = (0 - corner.position.x) / corner.size.x;
    const u = corner.uv.u0 + t * (corner.uv.u1 - corner.uv.u0);
    expect(u).toBeCloseTo((pad + BAKED_FRAME.border) / tex, 6);
    // ...and on the other axis, and on the far side, which a formula that
    // happened to work only from the origin would fail.
    const far = ring()[ring().length - 1];
    const tv = (14 - far.position.y) / far.size.y;
    const v = far.uv.v0 + tv * (far.uv.v1 - far.uv.v0);
    expect(v).toBeCloseTo(1 - (pad + BAKED_FRAME.border) / tex, 6);
    expect(far.position.x + far.size.x).toBeCloseTo(slab.x + slab.width, 6);
  });

  it('omits the middle, because the tile grid draws it', () => {
    // Eight quads, not nine. The ninth would be a full-board quad of the
    // bake's rebate floor sitting under every tile for nothing.
    expect(ring()).toHaveLength(8);
    for (const s of ring()) {
      const insideX = s.position.x > 0.5 && s.position.x + s.size.x < 22 - 0.5;
      const insideY = s.position.y > 0.5 && s.position.y + s.size.y < 14 - 0.5;
      expect(insideX && insideY).toBe(false);
    }
  });

  it('THE ORDER: a ring has a near side, so it must be told to draw first', () => {
    // The single quad sorted before every tile for free — its anchor was the
    // outer corner and every tile's y was greater. Two of a ring's eight quads
    // anchor PAST the last row of tiles, so without a layer they would paint
    // timber across the front of the dungeon.
    const slab = slabBounds(SLAB);
    const near = ring().filter((s) => s.position.y > 13);
    expect(near.length).toBe(3);
    for (const s of ring()) expect(spriteLayer(s)).toBeLessThan(LAYER_BOARD);
    for (const s of ring()) expect(spriteLayer(s)).toBeGreaterThan(LAYER_TABLE);
    expect(near[0].position.y + near[0].size.y).toBeCloseTo(slab.y + slab.height, 6);
  });

  it('draws the brass as its own quads, at the identical rects', () => {
    // `split()` renders the timber and the brass from one assembly through one
    // camera frame precisely so they can be two draws with two material maps —
    // roughness 0.12 against 0.86. Merged, the inlay lights like oak, which is
    // the whole thing §19.1 asks for undone.
    const all = boardSlabSprites({ ...SLAB, frameWindows: WINDOWS });
    const brass = all.filter((s) => s.textureId === 'board_frame_brass');
    expect(brass).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      expect(brass[i].position).toEqual(ring()[i].position);
      expect(brass[i].size).toEqual(ring()[i].size);
      expect(brass[i].uv).toEqual(ring()[i].uv);
      // Over its own timber, never under it.
      expect(spriteLayer(brass[i])).toBeGreaterThan(spriteLayer(ring()[i]));
    }
  });

  it('falls back to the one generated quad when there is no bake', () => {
    // `web/public/art/materials/` is a build artifact. A fresh clone has no
    // frame at all and must draw yesterday's board, not a hole.
    const bare = boardSlabSprites(SLAB);
    expect(bare).toHaveLength(1);
    expect(bare[0].textureId).toBe('frame');
    expect(spriteLayer(bare[0])).toBe(LAYER_BOARD);
  });
});

describe('the baked rim keeps its aspect', () => {
  it('scales the repeat length with the slab thickness, so bolts stay round', () => {
    // `board_rim` is 4 tiles long and 0.34 tall. Drawn on a 0.5-thick slab at
    // the flat 4-tile repeat it is stretched 1.47x vertically and the strap's
    // bolt heads come out as ovals — a distortion that is obvious on screen
    // and completely invisible in "is there a rim sprite" test.
    const repeat = (4 * 0.5) / BAKED_RIM_HEIGHT;
    const rim = boardSlabSprites({ ...SLAB, rimTextureId: 'rim:baked', rimRepeat: repeat }).find(
      (s) => s.textureId === 'rim:baked',
    )!;
    // One repeat of the texture must be as many times wider than it is tall as
    // the bake itself is.
    const tilesPerRepeat = rim.size.x / rim.uv.u1;
    expect(tilesPerRepeat / rim.size.y).toBeCloseTo(4 / BAKED_RIM_HEIGHT, 5);
  });

  it('lays the brass strap over the timber at the identical rect', () => {
    const parts = boardSlabSprites({ ...SLAB, rimTextureId: 'rim:baked', rimBrassTextureId: 'rim:brass' });
    const timber = parts.find((s) => s.textureId === 'rim:baked')!;
    const brass = parts.find((s) => s.textureId === 'rim:brass')!;
    expect(brass.position).toEqual(timber.position);
    expect(brass.size).toEqual(timber.size);
    expect(brass.uv).toEqual(timber.uv);
    // Same position and layer, so only the stable sort keeps brass on top.
    expect(parts.indexOf(brass)).toBeGreaterThan(parts.indexOf(timber));
  });

  it('keeps the flat four-tile repeat when the rim is the generated one', () => {
    const rim = boardSlabSprites({ ...SLAB, rimTextureId: 'rim' }).find((s) => s.textureId === 'rim')!;
    expect(rim.uv.u1).toBeCloseTo(slabBounds(SLAB).width / 4, 6);
  });
});
