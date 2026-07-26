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
