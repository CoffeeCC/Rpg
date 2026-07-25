// Smoke test for the per-gate floor/wall tile art layer: every gate x every
// legend char must render non-empty SVG markup without throwing, and the
// same (vx, vy) must always render identical markup (no Math.random()).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GateId } from '../../engine/types';
import type { TilePropKind } from '../tileArt';
import {
  GATE_PROP_POOL,
  GATE_TILE_THEMES,
  TILE_PROP_KINDS,
  TileFill,
  TilePropArt,
  pickTileProp,
} from '../tileArt';

const GATE_IDS: GateId[] = ['verdant', 'hollow', 'sunken', 'storm', 'abyss'];

// '#' wall, '.' floor, plus every non-wall legend char from engine/systems/floors.ts
const LEGEND_CHARS = ['#', '.', 'S', '>', 'B', 'M', 'e', 't', 'm', 'b', 'C', 'H', 'E', 's'];

const COORD_PAIRS: [number, number][] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [3, 7],
  [12, 4],
  [-2, 5],
  [8, -3],
];

describe('TileFill', () => {
  it('renders non-empty svg markup for every gate x legend char x coordinate', () => {
    for (const gateId of GATE_IDS) {
      for (const tile of LEGEND_CHARS) {
        for (const [vx, vy] of COORD_PAIRS) {
          const html = renderToStaticMarkup(<TileFill gateId={gateId} tile={tile} vx={vx} vy={vy} size={48} />);
          expect(html, `${gateId} / '${tile}' @ (${vx},${vy})`).toBeTruthy();
          expect(html, `${gateId} / '${tile}' @ (${vx},${vy})`).toContain('<svg');
        }
      }
    }
  });

  it('is deterministic: identical (gateId, tile, vx, vy) always renders identical markup', () => {
    for (const gateId of GATE_IDS) {
      for (const tile of LEGEND_CHARS) {
        for (const [vx, vy] of COORD_PAIRS) {
          const a = renderToStaticMarkup(<TileFill gateId={gateId} tile={tile} vx={vx} vy={vy} size={48} />);
          const b = renderToStaticMarkup(<TileFill gateId={gateId} tile={tile} vx={vx} vy={vy} size={48} />);
          expect(a, `${gateId} / '${tile}' @ (${vx},${vy})`).toBe(b);
        }
      }
    }
  });

  it('varies floor decoration across coordinates so rooms do not look stamped', () => {
    const markups = COORD_PAIRS.map(([vx, vy]) =>
      renderToStaticMarkup(<TileFill gateId="verdant" tile="." vx={vx} vy={vy} size={48} />)
    );
    const unique = new Set(markups);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('renders wall art distinct from floor art for the same coordinates', () => {
    const wall = renderToStaticMarkup(<TileFill gateId="hollow" tile="#" vx={2} vy={9} size={48} />);
    const floor = renderToStaticMarkup(<TileFill gateId="hollow" tile="." vx={2} vy={9} size={48} />);
    expect(wall).not.toBe(floor);
  });

  it('exposes a theme entry for every gate', () => {
    for (const gateId of GATE_IDS) {
      const theme = GATE_TILE_THEMES[gateId];
      expect(theme, gateId).toBeTruthy();
      expect(theme.floorBase, `${gateId} floorBase`).toMatch(/^#/);
      expect(theme.wallBase, `${gateId} wallBase`).toMatch(/^#/);
      expect(theme.accent, `${gateId} accent`).toMatch(/^#/);
    }
  });
});

// ---------------------------------------------------------------------------
// Ground clutter. Paul, on the shipped 4-prop rotation: "those are 2 identical
// tree branches and it looks cheap." These tests pin both halves of the fix —
// enough props, and no two instances rendering byte-identical — without ever
// giving up determinism.
// ---------------------------------------------------------------------------

/** Every (vx, vy) on a floor-sized map, which is how FloorScreen calls this. */
const MAP_COORDS: [number, number][] = [];
for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) MAP_COORDS.push([x, y]);

function picksFor(gateId: GateId | undefined) {
  return MAP_COORDS.map(([x, y]) => pickTileProp(x, y, gateId)).filter((p) => p !== null);
}

describe('ground clutter props', () => {
  it('offers a wide prop set, not the four that read as tiling', () => {
    expect(TILE_PROP_KINDS.length).toBeGreaterThanOrEqual(16);
    expect(new Set(TILE_PROP_KINDS).size).toBe(TILE_PROP_KINDS.length);
  });

  it('renders every prop kind as non-empty markup', () => {
    for (const kind of TILE_PROP_KINDS) {
      const html = renderToStaticMarkup(<TilePropArt prop={{ kind, seed: 12345 }} size={64} />);
      expect(html, kind).toBeTruthy();
      expect(html, kind).toMatch(/<svg|<img/);
    }
  });

  it('is deterministic: the same tile always rolls the same prop and the same markup', () => {
    for (const gateId of [...GATE_IDS, undefined]) {
      for (const [x, y] of MAP_COORDS.slice(0, 120)) {
        const a = pickTileProp(x, y, gateId);
        const b = pickTileProp(x, y, gateId);
        expect(a, `${gateId} @ (${x},${y})`).toEqual(b);
        // Narrow BOTH: toEqual proves they match at runtime, but the compiler
        // still sees `b` as possibly null on the line below.
        if (!a || !b) continue;
        expect(
          renderToStaticMarkup(<TilePropArt prop={a} size={64} />),
          `${gateId} @ (${x},${y})`
        ).toBe(renderToStaticMarkup(<TilePropArt prop={b} size={64} />));
      }
    }
  });

  it('never renders two instances of the SAME prop kind identically', () => {
    // This is literally the bug Paul reported: two `roots` on screen were the
    // same drawing twice. Group every rolled instance by kind and assert each
    // group is fully distinct.
    for (const gateId of GATE_IDS) {
      const byKind = new Map<TilePropKind, string[]>();
      for (const pick of picksFor(gateId)) {
        const html = renderToStaticMarkup(<TilePropArt prop={pick} size={64} />);
        const bucket = byKind.get(pick.kind) ?? [];
        bucket.push(html);
        byKind.set(pick.kind, bucket);
      }
      for (const [kind, htmls] of byKind) {
        expect(new Set(htmls).size, `${gateId}/${kind}: ${htmls.length} instances`).toBe(htmls.length);
      }
    }
  });

  it('varies rotation, scale, mirroring and tint per instance', () => {
    // Pin each axis independently so a regression in one is not masked by the
    // others still varying.
    const htmls = picksFor('verdant').map((p) => renderToStaticMarkup(<TilePropArt prop={p} size={64} />));
    const transforms = htmls.map((h) => /transform="([^"]*)"/.exec(h)?.[1] ?? '').filter(Boolean);
    expect(transforms.length).toBeGreaterThan(10);
    const rotations = new Set(transforms.map((t) => /rotate\(([-\d.]+)/.exec(t)?.[1]));
    const scales = new Set(transforms.map((t) => /scale\(([-\d.]+) ([\d.]+)\)/.exec(t)?.[0]));
    expect(rotations.size, 'distinct rotations').toBeGreaterThan(5);
    expect(scales.size, 'distinct scales').toBeGreaterThan(5);
    // mirroring shows up as a negative x-scale on some instances but not all
    const mirrored = transforms.filter((t) => /scale\(-/.test(t)).length;
    expect(mirrored).toBeGreaterThan(0);
    expect(mirrored).toBeLessThan(transforms.length);
    // tint: the same kind drawn twice must not use the identical colour set
    const rootsHtml = picksFor('verdant')
      .filter((p) => p.kind === 'roots')
      .map((p) => renderToStaticMarkup(<TilePropArt prop={p} size={64} />));
    if (rootsHtml.length > 1) {
      const palettes = rootsHtml.map((h) => (h.match(/#[0-9a-f]{6}/g) ?? []).join(','));
      expect(new Set(palettes).size, 'distinct root palettes').toBeGreaterThan(1);
    }
  });

  it('draws from a gate-appropriate pool — no rain puddles on a wind-scoured peak', () => {
    for (const gateId of GATE_IDS) {
      const pool = new Set(GATE_PROP_POOL[gateId]);
      for (const kind of pool) expect(TILE_PROP_KINDS, `${gateId}/${kind}`).toContain(kind);
      for (const pick of picksFor(gateId)) {
        expect(pool, `${gateId} rolled ${pick.kind}`).toContain(pick.kind);
      }
    }
    // the tonal rules that made the old set feel generic
    expect(GATE_PROP_POOL.storm).not.toContain('puddle');
    expect(GATE_PROP_POOL.storm).not.toContain('kelp');
    expect(GATE_PROP_POOL.storm).not.toContain('mushrooms');
    expect(GATE_PROP_POOL.verdant).not.toContain('frost');
    expect(GATE_PROP_POOL.verdant).not.toContain('emberseam');
    expect(GATE_PROP_POOL.sunken).toContain('kelp');
    expect(GATE_PROP_POOL.abyss).toContain('emberseam');
    expect(GATE_PROP_POOL.hollow).toContain('bones');
  });

  it('gives each gate several different props on one floor', () => {
    for (const gateId of GATE_IDS) {
      const kinds = new Set(picksFor(gateId).map((p) => p.kind));
      expect(kinds.size, `${gateId} distinct kinds on one map`).toBeGreaterThanOrEqual(5);
    }
  });

  it('keeps clutter sparse — roughly 1 tile in 15, unchanged', () => {
    const hits = picksFor('verdant').length;
    expect(hits / MAP_COORDS.length).toBeGreaterThan(0.02);
    expect(hits / MAP_COORDS.length).toBeLessThan(0.12);
  });

  it('stays cheap: no per-instance SVG filters or gradient ids to collide', () => {
    for (const kind of TILE_PROP_KINDS) {
      const html = renderToStaticMarkup(<TilePropArt prop={{ kind, seed: 99 }} size={64} />);
      expect(html, `${kind} must not use <filter>`).not.toMatch(/<filter|filter="url/);
      expect(html, `${kind} must not mint ids`).not.toMatch(/\bid="/);
    }
  });

  it('keeps node counts sane for a ~250-cell map on a Steam Deck', () => {
    for (const kind of TILE_PROP_KINDS) {
      const html = renderToStaticMarkup(<TilePropArt prop={{ kind, seed: 7 }} size={64} />);
      const nodes = (html.match(/<[a-z]/g) ?? []).length;
      expect(nodes, `${kind} element count`).toBeLessThanOrEqual(40);
    }
  });

  it('still renders when handed the legacy bare-string prop form', () => {
    const html = renderToStaticMarkup(<TilePropArt prop="bones" size={64} />);
    expect(html).toContain('<svg');
  });

  it('falls back to a neutral pool when no gate is supplied', () => {
    const kinds = new Set(picksFor(undefined).map((p) => p.kind));
    expect(kinds.size).toBeGreaterThan(1);
    for (const kind of kinds) expect(TILE_PROP_KINDS).toContain(kind);
  });
});
