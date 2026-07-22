// The Unmapped Wilds: procedurally generated floors, in the same FloorDef
// shape ({ grid: string[], spawn: SpawnTable }) the hand-authored Gate floors
// use — so floors.ts / FloorScreen.tsx need zero changes to consume them.
// Rooms + sequential corridors guarantee a single connected component (each
// room links to the previous one); a few extra corridors between random
// rooms add the loops that make the hand floors feel "knotted" rather than
// a straight line. See [[project-everdusk-rpg]] for why this exists: the
// hand floors are the known, storied Gates; this is what lies past them.
import type { FloorDef, MonsterFamily } from '../types';
import { SeededRng } from '../random';
import { TILE } from './floors';

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface FloorGenOptions {
  /** Interior width/height, excluding the outer wall border. */
  width: number;
  height: number;
  /** Wilds never have a fixed final floor — this only exists so the
   * generator could support one later without an API change. */
  isFinal?: boolean;
  families: MonsterFamily[];
  tierMin: number;
  tierMax: number;
  levelBonus: number;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function carveRoom(grid: string[][], r: Room) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) grid[y][x] = TILE.FLOOR;
  }
}

function carveCorridor(grid: string[][], a: Room, b: Room, rng: SeededRng) {
  let x = a.cx;
  let y = a.cy;
  const tx = b.cx;
  const ty = b.cy;
  const horizFirst = rng.chance(0.5);
  const stepX = () => {
    while (x !== tx) {
      grid[y][x] = TILE.FLOOR;
      x += x < tx ? 1 : -1;
    }
  };
  const stepY = () => {
    while (y !== ty) {
      grid[y][x] = TILE.FLOOR;
      y += y < ty ? 1 : -1;
    }
  };
  if (horizFirst) {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
  grid[ty][tx] = TILE.FLOOR;
}

/** BFS over non-wall tiles from (sx,sy). Used both to guarantee solvability
 * and to find the tile farthest from the start (where stairs/boss go). */
function bfsDistances(grid: string[][], sx: number, sy: number): Map<string, number> {
  const h = grid.length;
  const w = grid[0].length;
  const dist = new Map<string, number>([[key(sx, sy), 0]]);
  const queue: [number, number][] = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const d = dist.get(key(x, y))!;
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [1, 0],
      [-1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || ny >= h || nx >= w) continue;
      if (grid[ny][nx] === TILE.WALL) continue;
      const k = key(nx, ny);
      if (dist.has(k)) continue;
      dist.set(k, d + 1);
      queue.push([nx, ny]);
    }
  }
  return dist;
}

export function generateFloor(rng: SeededRng, opts: FloorGenOptions): FloorDef {
  const W = opts.width + 2;
  const H = opts.height + 2;
  const grid: string[][] = Array.from({ length: H }, () => Array<string>(W).fill(TILE.WALL));

  const rooms: Room[] = [];
  const targetRooms = 6 + rng.int(3);
  let attempts = 0;
  while (rooms.length < targetRooms && attempts < 300) {
    attempts++;
    const w = 3 + rng.int(4);
    const h = 3 + rng.int(3);
    const x = 1 + rng.int(Math.max(1, W - w - 2));
    const y = 1 + rng.int(Math.max(1, H - h - 2));
    const overlaps = rooms.some((r) => x <= r.x + r.w && x + w >= r.x - 1 && y <= r.y + r.h && y + h >= r.y - 1);
    if (overlaps) continue;
    rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
  }
  // Pathological RNG luck could leave too few rooms to place start+stairs
  // sensibly — fall back to two fixed corners so generation never fails.
  if (rooms.length < 2) {
    rooms.push({ x: 1, y: 1, w: 3, h: 3, cx: 2, cy: 2 });
    rooms.push({ x: W - 4, y: H - 4, w: 3, h: 3, cx: W - 3, cy: H - 3 });
  }

  for (const r of rooms) carveRoom(grid, r);
  for (let i = 1; i < rooms.length; i++) carveCorridor(grid, rooms[i - 1], rooms[i], rng);
  // Extra loop connections — a few random room pairs beyond the guaranteed
  // spanning chain, so the floor reads as a knotted loop, not a corridor.
  const extraLoops = 1 + rng.int(Math.max(1, Math.floor(rooms.length / 2)));
  for (let i = 0; i < extraLoops; i++) {
    const a = rng.pick(rooms);
    const b = rng.pick(rooms);
    if (a !== b) carveCorridor(grid, a, b, rng);
  }

  const startRoom = rooms[0];
  grid[startRoom.cy][startRoom.cx] = TILE.START;
  const dist = bfsDistances(grid, startRoom.cx, startRoom.cy);

  let far = { x: startRoom.cx, y: startRoom.cy };
  let bestDist = -1;
  for (const [k, d] of dist) {
    if (d > bestDist) {
      const [xs, ys] = k.split(',').map(Number);
      far = { x: xs, y: ys };
      bestDist = d;
    }
  }

  const reserved = new Set<string>([key(startRoom.cx, startRoom.cy)]);
  if (opts.isFinal) {
    grid[far.y][far.x] = TILE.BOSS;
    reserved.add(key(far.x, far.y));
  } else {
    grid[far.y][far.x] = TILE.STAIRS;
    reserved.add(key(far.x, far.y));
    const guardSpot = [
      [far.x, far.y - 1],
      [far.x, far.y + 1],
      [far.x - 1, far.y],
      [far.x + 1, far.y],
    ].find(([gx, gy]) => grid[gy]?.[gx] === TILE.FLOOR);
    if (guardSpot) {
      grid[guardSpot[1]][guardSpot[0]] = TILE.MINIBOSS;
      reserved.add(key(guardSpot[0], guardSpot[1]));
    }
  }

  // Scatter content across the remaining open floor. Shuffle deterministically
  // via the same seeded RNG so a given seed always builds the same floor.
  const openTiles: [number, number][] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] === TILE.FLOOR && !reserved.has(key(x, y))) openTiles.push([x, y]);
    }
  }
  const used = new Set<number>();
  const place = (tile: string, count: number) => {
    for (let i = 0; i < count && used.size < openTiles.length; i++) {
      const idx = (() => {
        let guess = rng.int(openTiles.length);
        let guard = 0;
        while (used.has(guess) && guard++ < 200) guess = rng.int(openTiles.length);
        return guess;
      })();
      used.add(idx);
      const [x, y] = openTiles[idx];
      grid[y][x] = tile;
    }
  };

  const roomCount = rooms.length;
  place(TILE.ENEMY, 3 + rng.int(Math.max(1, roomCount)));
  place(TILE.BREAKABLE, rng.int(4));
  if (rng.chance(0.7)) place(TILE.CHEST, 1);
  if (rng.chance(0.5)) place(TILE.SHRINE, 1);
  if (rng.chance(0.4)) place(TILE.EVENT, 1);
  if (rng.chance(0.35)) place(TILE.TAMER, 1);
  if (rng.chance(0.3)) place(TILE.MERCHANT, 1);
  if (rng.chance(0.5)) place(TILE.SECRET, 1);

  return {
    grid: grid.map((row) => row.join('')),
    spawn: { families: opts.families, tierMin: opts.tierMin, tierMax: opts.tierMax, levelBonus: opts.levelBonus },
  };
}
