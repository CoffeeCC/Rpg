// Smoke test for the NPC portrait layer: every NPC in the roster (plus an
// unknown id) must render to SVG markup without throwing, deterministically,
// and with a visually distinct silhouette per NPC. Uses createElement (no
// JSX in .ts) — mirrors artSmoke.test.ts.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { NPC_ACCENTS, NpcPortrait } from '../../art/npcArt';

const NPC_IDS = NPCS.map((npc) => npc.id);

describe('NpcPortrait', () => {
  it('renders an svg for every NPC in the roster', () => {
    expect(NPC_IDS.length).toBeGreaterThan(0);
    for (const npcId of NPC_IDS) {
      const html = renderToStaticMarkup(createElement(NpcPortrait, { npcId, size: 160 }));
      expect(html, `npc ${npcId}`).toContain('<svg');
    }
  });

  it('renders an unknown npcId as a hooded stranger without throwing', () => {
    const html = renderToStaticMarkup(createElement(NpcPortrait, { npcId: 'definitelyNotAnNpc', size: 160 }));
    expect(html).toContain('<svg');
  });

  it('renders deterministically for the same npcId', () => {
    for (const npcId of [...NPC_IDS, 'definitelyNotAnNpc']) {
      const first = renderToStaticMarkup(createElement(NpcPortrait, { npcId, size: 160 }));
      const second = renderToStaticMarkup(createElement(NpcPortrait, { npcId, size: 160 }));
      expect(second, `npc ${npcId}`).toBe(first);
    }
  });

  it('renders pairwise distinct markup for every NPC', () => {
    const markup = NPC_IDS.map((npcId) =>
      renderToStaticMarkup(createElement(NpcPortrait, { npcId, size: 160 }))
    );
    for (let i = 0; i < markup.length; i++) {
      for (let j = i + 1; j < markup.length; j++) {
        expect(markup[i], `${NPC_IDS[i]} vs ${NPC_IDS[j]}`).not.toBe(markup[j]);
      }
    }
  });

  it('every NPC has a distinct accent color, and every NPC id has an accent', () => {
    for (const npcId of NPC_IDS) {
      expect(NPC_ACCENTS[npcId], `accent for ${npcId}`).toBeTruthy();
    }
    const colors = Object.values(NPC_ACCENTS);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
