// Smoke test for the per-gate floor/wall tile art layer: every gate x every
// legend char must render non-empty SVG markup without throwing, and the
// same (vx, vy) must always render identical markup (no Math.random()).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GateId } from '../../engine/types';
import { GATE_TILE_THEMES, TileFill } from '../tileArt';

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
