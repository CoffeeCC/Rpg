import { describe, it, expect } from 'vitest';
import { generateFloor, type FloorGenOptions } from '../systems/floorgen';
import { TILE } from '../systems/floors';
import { SeededRng } from '../random';

const BASE_OPTS: FloorGenOptions = {
  width: 17,
  height: 11,
  families: ['Slime', 'Bug'],
  tierMin: 1,
  tierMax: 2,
  levelBonus: 1,
};

function countTile(grid: string[], tile: string): number {
  return grid.reduce((n, row) => n + [...row].filter((c) => c === tile).length, 0);
}

function findTile(grid: string[], tile: string): { x: number; y: number } | null {
  for (let y = 0; y < grid.length; y++) {
    const x = grid[y].indexOf(tile);
    if (x !== -1) return { x, y };
  }
  return null;
}

function bfsReachable(grid: string[], start: { x: number; y: number }): Set<string> {
  const seen = new Set<string>([`${start.x},${start.y}`]);
  const queue: [number, number][] = [[start.x, start.y]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [1, 0],
      [-1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[ny].length) continue;
      if (grid[ny][nx] === TILE.WALL) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

describe('generateFloor', () => {
  it('is deterministic for a given seed', () => {
    const a = generateFloor(new SeededRng(12345), BASE_OPTS);
    const b = generateFloor(new SeededRng(12345), BASE_OPTS);
    expect(a.grid).toEqual(b.grid);
  });

  it('varies with the seed', () => {
    const a = generateFloor(new SeededRng(1), BASE_OPTS);
    const b = generateFloor(new SeededRng(2), BASE_OPTS);
    expect(a.grid).not.toEqual(b.grid);
  });

  it('produces a rectangular, wall-bordered grid', () => {
    const floor = generateFloor(new SeededRng(7), BASE_OPTS);
    const width = floor.grid[0].length;
    for (const row of floor.grid) expect(row.length).toBe(width);
    expect([...floor.grid[0]].every((c) => c === TILE.WALL)).toBe(true);
    expect([...floor.grid[floor.grid.length - 1]].every((c) => c === TILE.WALL)).toBe(true);
    for (const row of floor.grid) {
      expect(row[0]).toBe(TILE.WALL);
      expect(row[row.length - 1]).toBe(TILE.WALL);
    }
  });

  it('is fully solvable: every non-final floor has exactly one S and a reachable stairs guarded by at most one miniboss, across many seeds', () => {
    for (let seed = 0; seed < 40; seed++) {
      const floor = generateFloor(new SeededRng(seed), BASE_OPTS);
      expect(countTile(floor.grid, TILE.START)).toBe(1);
      expect(countTile(floor.grid, TILE.STAIRS)).toBe(1);
      expect(countTile(floor.grid, TILE.MINIBOSS)).toBeLessThanOrEqual(1);
      expect(countTile(floor.grid, TILE.BOSS)).toBe(0);

      const start = findTile(floor.grid, TILE.START)!;
      const stairs = findTile(floor.grid, TILE.STAIRS)!;
      const reachable = bfsReachable(floor.grid, start);
      expect(reachable.has(`${stairs.x},${stairs.y}`)).toBe(true);

      // Every scattered content tile must also be reachable from the start —
      // otherwise a chest/enemy/event could spawn behind an unreachable wall.
      for (const tile of [TILE.ENEMY, TILE.CHEST, TILE.SHRINE, TILE.EVENT, TILE.TAMER, TILE.MERCHANT, TILE.BREAKABLE]) {
        for (let y = 0; y < floor.grid.length; y++) {
          for (let x = 0; x < floor.grid[y].length; x++) {
            if (floor.grid[y][x] === tile) expect(reachable.has(`${x},${y}`)).toBe(true);
          }
        }
      }
    }
  });

  it('places a boss with no stairs/miniboss when isFinal is set', () => {
    for (let seed = 0; seed < 10; seed++) {
      const floor = generateFloor(new SeededRng(seed), { ...BASE_OPTS, isFinal: true });
      expect(countTile(floor.grid, TILE.BOSS)).toBe(1);
      expect(countTile(floor.grid, TILE.STAIRS)).toBe(0);
      expect(countTile(floor.grid, TILE.MINIBOSS)).toBe(0);
      const start = findTile(floor.grid, TILE.START)!;
      const boss = findTile(floor.grid, TILE.BOSS)!;
      expect(bfsReachable(floor.grid, start).has(`${boss.x},${boss.y}`)).toBe(true);
    }
  });

  it('carries the spawn table through unchanged', () => {
    const floor = generateFloor(new SeededRng(3), { ...BASE_OPTS, tierMin: 2, tierMax: 4, levelBonus: 5 });
    expect(floor.spawn).toEqual({ families: ['Slime', 'Bug'], tierMin: 2, tierMax: 4, levelBonus: 5 });
  });
});
