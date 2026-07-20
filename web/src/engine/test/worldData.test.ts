import { describe, it, expect } from 'vitest';
import { GATES, GATE_ORDER } from '../data/gates';
import { EVENTS } from '../data/events';
import { QUESTS } from '../data/quests';
import { STORY } from '../data/story';
import type { GateId } from '../types';

const GATE_IDS: GateId[] = ['verdant', 'hollow', 'sunken', 'storm', 'abyss'];
// Map contract v2 (PLAN4.md): '#' wall, '.' floor, 'S' entrance, '>' stairs
// down, 'B' gate boss, 'M' miniboss, 'e' enemy spawn, 't' tamer, 'm'
// merchant, 'b' breakable, 'C' chest, 'H' shrine, 'E' event, 's' secret.
const WALKABLE = new Set(['.', 'S', '>', 'B', 'M', 'e', 't', 'm', 'b', 'C', 'H', 'E', 's']);
const LEGAL_CHARS = /^[#.S>BMetmbCHEs]+$/;
const ALLOWED_CONSUMABLES = [
  'Herb',
  'Potion',
  'Elixir',
  'Water',
  'Ether',
  'Jerky',
  'Sirloin',
  'PrimeSteak',
];

function countChar(grid: string[], ch: string): number {
  return grid.reduce((n, row) => n + row.split('').filter((c) => c === ch).length, 0);
}

/**
 * BFS from 'S' through 4-directional walkable tiles (breakables 'b' count as
 * passable — they're smashed through); returns unreachable walkable coords.
 */
function unreachableTiles(grid: string[]): string[] {
  const h = grid.length;
  const w = grid[0].length;
  let start: [number, number] | null = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] === 'S') start = [y, x];
    }
  }
  if (!start) return ['no S tile'];
  const seen = new Set<string>([`${start[0]},${start[1]}`]);
  const queue: [number, number][] = [start];
  while (queue.length > 0) {
    const [y, x] = queue.shift() as [number, number];
    for (const [dy, dx] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ny = y + dy;
      const nx = x + dx;
      if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
      const key = `${ny},${nx}`;
      if (seen.has(key)) continue;
      if (!WALKABLE.has(grid[ny][nx])) continue;
      seen.add(key);
      queue.push([ny, nx]);
    }
  }
  const missing: string[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (WALKABLE.has(grid[y][x]) && !seen.has(`${y},${x}`)) {
        missing.push(`(${y},${x})='${grid[y][x]}'`);
      }
    }
  }
  return missing;
}

describe('GATES', () => {
  it('contains exactly the five gate ids, and GATE_ORDER matches', () => {
    expect(Object.keys(GATES).sort()).toEqual([...GATE_IDS].sort());
    expect(GATE_ORDER).toEqual(GATE_IDS);
    for (const id of GATE_IDS) {
      expect(GATES[id].id, `gate ${id} id field`).toBe(id);
    }
  });

  it('has floor counts 4/4/4/4/5 and correct requiredOrbs', () => {
    expect(GATES.verdant.floors).toHaveLength(4);
    expect(GATES.hollow.floors).toHaveLength(4);
    expect(GATES.sunken.floors).toHaveLength(4);
    expect(GATES.storm.floors).toHaveLength(4);
    expect(GATES.abyss.floors).toHaveLength(5);
    for (const id of GATE_IDS) {
      expect(GATES[id].requiredOrbs, `gate ${id} requiredOrbs`).toBe(id === 'abyss' ? 4 : 0);
    }
  });

  it('every grid is rectangular, legal, in size bounds, with a full # border', () => {
    for (const id of GATE_IDS) {
      GATES[id].floors.forEach((floor, i) => {
        const label = `${id} floor ${i + 1}`;
        const grid = floor.grid;
        const w = grid[0].length;
        expect(grid.length, `${label} height`).toBeGreaterThanOrEqual(13);
        expect(grid.length, `${label} height`).toBeLessThanOrEqual(17);
        expect(w, `${label} width`).toBeGreaterThanOrEqual(17);
        expect(w, `${label} width`).toBeLessThanOrEqual(25);
        for (const row of grid) {
          expect(row.length, `${label} rectangular`).toBe(w);
          expect(row, `${label} legal chars`).toMatch(LEGAL_CHARS);
        }
        expect(grid[0], `${label} top border`).toBe('#'.repeat(w));
        expect(grid[grid.length - 1], `${label} bottom border`).toBe('#'.repeat(w));
        for (const row of grid) {
          expect(row[0], `${label} left border`).toBe('#');
          expect(row[w - 1], `${label} right border`).toBe('#');
        }
      });
    }
  });

  it('every floor has exactly one S; > on non-final floors only; B on final floors only', () => {
    for (const id of GATE_IDS) {
      const floors = GATES[id].floors;
      floors.forEach((floor, i) => {
        const label = `${id} floor ${i + 1}`;
        const isFinal = i === floors.length - 1;
        expect(countChar(floor.grid, 'S'), `${label} entrance count`).toBe(1);
        expect(countChar(floor.grid, '>'), `${label} stairs count`).toBe(isFinal ? 0 : 1);
        expect(countChar(floor.grid, 'B'), `${label} boss count`).toBe(isFinal ? 1 : 0);
      });
    }
  });

  it('every non-final floor has exactly one M within 3 tiles of the stairs; final floors have none', () => {
    for (const id of GATE_IDS) {
      const floors = GATES[id].floors;
      floors.forEach((floor, i) => {
        const label = `${id} floor ${i + 1}`;
        const isFinal = i === floors.length - 1;
        const mCount = countChar(floor.grid, 'M');
        expect(mCount, `${label} miniboss count`).toBe(isFinal ? 0 : 1);
        if (!isFinal) {
          const grid = floor.grid;
          let mPos: [number, number] | null = null;
          let stairsPos: [number, number] | null = null;
          for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
              if (grid[y][x] === 'M') mPos = [x, y];
              if (grid[y][x] === '>') stairsPos = [x, y];
            }
          }
          expect(mPos, `${label} miniboss position`).not.toBeNull();
          expect(stairsPos, `${label} stairs position`).not.toBeNull();
          if (mPos && stairsPos) {
            const cheb = Math.max(Math.abs(mPos[0] - stairsPos[0]), Math.abs(mPos[1] - stairsPos[1]));
            expect(cheb, `${label} miniboss Chebyshev distance to stairs`).toBeLessThanOrEqual(3);
          }
        }
      });
    }
  });

  it('every floor keeps tile counts within the map contract v2 ranges', () => {
    for (const id of GATE_IDS) {
      GATES[id].floors.forEach((floor, i) => {
        const label = `${id} floor ${i + 1}`;
        const grid = floor.grid;
        const e = countChar(grid, 'e');
        expect(e, `${label} enemy spawns`).toBeGreaterThanOrEqual(3);
        expect(e, `${label} enemy spawns`).toBeLessThanOrEqual(6);
        const b = countChar(grid, 'b');
        expect(b, `${label} breakables`).toBeGreaterThanOrEqual(4);
        expect(b, `${label} breakables`).toBeLessThanOrEqual(10);
        const chests = countChar(grid, 'C');
        expect(chests, `${label} chests`).toBeGreaterThanOrEqual(1);
        expect(chests, `${label} chests`).toBeLessThanOrEqual(3);
        const s = countChar(grid, 's');
        expect(s, `${label} secrets`).toBeGreaterThanOrEqual(1);
        expect(s, `${label} secrets`).toBeLessThanOrEqual(2);
        expect(countChar(grid, 'H'), `${label} shrines`).toBeLessThanOrEqual(1);
        expect(countChar(grid, 'E'), `${label} event tiles`).toBeLessThanOrEqual(2);
        expect(countChar(grid, 't'), `${label} tamer spawns`).toBeLessThanOrEqual(1);
        expect(countChar(grid, 'm'), `${label} merchant spots`).toBeLessThanOrEqual(1);
      });
    }
  });

  it('every walkable tile on every floor is reachable from S (4-directional BFS)', () => {
    for (const id of GATE_IDS) {
      GATES[id].floors.forEach((floor, i) => {
        const missing = unreachableTiles(floor.grid);
        expect(missing, `${id} floor ${i + 1} unreachable tiles`).toEqual([]);
      });
    }
  });

  it('spawn tables use tiers within 1-5, tierMin <= tierMax, non-negative rising-ish levelBonus', () => {
    for (const id of GATE_IDS) {
      let prevBonus = -1;
      GATES[id].floors.forEach((floor, i) => {
        const label = `${id} floor ${i + 1}`;
        const s = floor.spawn;
        expect(s.families.length, `${label} spawn families`).toBeGreaterThan(0);
        expect(s.tierMin, `${label} tierMin`).toBeGreaterThanOrEqual(1);
        expect(s.tierMax, `${label} tierMax`).toBeLessThanOrEqual(5);
        expect(s.tierMin, `${label} tierMin<=tierMax`).toBeLessThanOrEqual(s.tierMax);
        expect(s.levelBonus, `${label} levelBonus`).toBeGreaterThanOrEqual(0);
        expect(s.levelBonus, `${label} levelBonus non-decreasing`).toBeGreaterThanOrEqual(prevBonus);
        prevBonus = s.levelBonus;
      });
    }
  });

  it('bosses have sane tiers and levels', () => {
    for (const id of GATE_IDS) {
      const g = GATES[id];
      expect(g.bossTier, `${id} bossTier`).toBeGreaterThanOrEqual(1);
      expect(g.bossTier, `${id} bossTier`).toBeLessThanOrEqual(5);
      expect(g.bossLevel, `${id} bossLevel`).toBeGreaterThan(0);
      expect(g.bossName.length, `${id} bossName`).toBeGreaterThan(0);
    }
  });
});

describe('EVENTS', () => {
  it('has at least 14 events with unique ids', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(14);
    const ids = EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every event has 2-3 options, each with resultText and at least one outcome', () => {
    for (const e of EVENTS) {
      expect(e.options.length, `event ${e.id} option count`).toBeGreaterThanOrEqual(2);
      expect(e.options.length, `event ${e.id} option count`).toBeLessThanOrEqual(3);
      expect(e.text.length, `event ${e.id} text`).toBeGreaterThan(0);
      for (const o of e.options) {
        expect(o.label.length, `event ${e.id} option label`).toBeGreaterThan(0);
        expect(o.resultText.length, `event ${e.id} resultText`).toBeGreaterThan(0);
        expect(o.outcomes.length, `event ${e.id} outcomes`).toBeGreaterThan(0);
      }
    }
  });

  it('consumable outcomes only use allowed item names, and amounts are positive', () => {
    for (const e of EVENTS) {
      for (const o of e.options) {
        for (const out of o.outcomes) {
          const label = `event ${e.id} option "${o.label}"`;
          if (out.kind === 'consumable') {
            expect(ALLOWED_CONSUMABLES, `${label} consumable name`).toContain(out.name);
            expect(out.count, `${label} consumable count`).toBeGreaterThan(0);
          }
          if (out.kind === 'gold' || out.kind === 'goldLoss') {
            expect(out.amount, `${label} gold amount`).toBeGreaterThan(0);
          }
          if (out.kind === 'damagePct') {
            expect(out.pct, `${label} damagePct`).toBeGreaterThan(0);
            expect(out.pct, `${label} damagePct`).toBeLessThan(100);
          }
          if (out.kind === 'statBoost') {
            expect(out.amount, `${label} statBoost amount`).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('QUESTS', () => {
  it('has at least 12 quests with unique ids', () => {
    expect(QUESTS.length).toBeGreaterThanOrEqual(12);
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every quest has a giver, text, and positive rewards', () => {
    for (const q of QUESTS) {
      expect(q.giver.length, `quest ${q.id} giver`).toBeGreaterThan(0);
      expect(q.text.length, `quest ${q.id} text`).toBeGreaterThan(0);
      expect(q.reward.gold, `quest ${q.id} gold`).toBeGreaterThan(0);
      expect(q.reward.exp, `quest ${q.id} exp`).toBeGreaterThan(0);
    }
  });

  it('consumable rewards only use allowed item names with positive counts', () => {
    for (const q of QUESTS) {
      for (const c of q.reward.consumables ?? []) {
        expect(ALLOWED_CONSUMABLES, `quest ${q.id} consumable`).toContain(c.name);
        expect(c.count, `quest ${q.id} consumable count`).toBeGreaterThan(0);
      }
    }
  });

  it('reachFloor targets exist and defeatBoss gates exist', () => {
    for (const q of QUESTS) {
      const obj = q.objective;
      if (obj.kind === 'reachFloor') {
        expect(GATES[obj.gate], `quest ${q.id} gate`).toBeDefined();
        expect(obj.floor, `quest ${q.id} floor`).toBeGreaterThanOrEqual(1);
        expect(obj.floor, `quest ${q.id} floor in range`).toBeLessThanOrEqual(
          GATES[obj.gate].floors.length,
        );
      }
      if (obj.kind === 'defeatBoss') {
        expect(GATES[obj.gate], `quest ${q.id} gate`).toBeDefined();
      }
      if (obj.kind === 'kill' || obj.kind === 'killFamily' || obj.kind === 'tame' || obj.kind === 'breed') {
        expect(obj.count, `quest ${q.id} count`).toBeGreaterThan(0);
      }
    }
  });

  it('covers a variety of objective kinds', () => {
    const kinds = new Set(QUESTS.map((q) => q.objective.kind));
    for (const kind of ['kill', 'killFamily', 'tame', 'breed', 'reachFloor', 'defeatBoss']) {
      expect(kinds, `objective kind ${kind}`).toContain(kind);
    }
    const families = new Set(
      QUESTS.filter((q) => q.objective.kind === 'killFamily').map((q) =>
        q.objective.kind === 'killFamily' ? q.objective.family : '',
      ),
    );
    expect(families.size, 'distinct killFamily families').toBeGreaterThanOrEqual(3);
  });
});

describe('STORY', () => {
  it('has chapters with ids 0-5 in order', () => {
    expect(STORY.map((c) => c.id)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('every chapter has a title and non-empty paragraphs', () => {
    for (const c of STORY) {
      expect(c.title.length, `chapter ${c.id} title`).toBeGreaterThan(0);
      expect(c.paragraphs.length, `chapter ${c.id} paragraphs`).toBeGreaterThan(0);
      for (const p of c.paragraphs) {
        expect(p.trim().length, `chapter ${c.id} paragraph`).toBeGreaterThan(0);
      }
    }
  });

  it('paragraph counts match the design (intro 4-6, mid 2-4, epilogue 3-5)', () => {
    expect(STORY[0].paragraphs.length).toBeGreaterThanOrEqual(4);
    expect(STORY[0].paragraphs.length).toBeLessThanOrEqual(6);
    for (const id of [1, 2, 3, 4]) {
      expect(STORY[id].paragraphs.length, `chapter ${id}`).toBeGreaterThanOrEqual(2);
      expect(STORY[id].paragraphs.length, `chapter ${id}`).toBeLessThanOrEqual(4);
    }
    expect(STORY[5].paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(STORY[5].paragraphs.length).toBeLessThanOrEqual(5);
  });
});
