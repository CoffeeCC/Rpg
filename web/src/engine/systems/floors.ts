import type { ChronicleState, FloorDef, GateId, GeneratedWorld } from '../types';
import type { Character } from '../entities/Character';
import { GATES } from '../data/gates';
import { speciesMatching, SPECIES } from '../data/species';
import { BALANCE } from '../data/balance';
import { bestowName } from './naming';
import { randInt } from '../random';

// ---------------------------------------------------------------------------
// v6 (PLAN4): floors are TACTICAL. Every fight is a visible unit; the player
// and enemies alternate movement turns with budgeted MOV.
// ---------------------------------------------------------------------------

export const TILE = {
  WALL: '#',
  FLOOR: '.',
  START: 'S',
  STAIRS: '>',
  BOSS: 'B',
  MINIBOSS: 'M',
  ENEMY: 'e',
  TAMER: 't',
  MERCHANT: 'm',
  BREAKABLE: 'b',
  CHEST: 'C',
  SHRINE: 'H',
  EVENT: 'E',
  SECRET: 's',
} as const;

export type Direction = 'north' | 'south' | 'east' | 'west';

export type UnitKind = 'enemy' | 'miniboss' | 'tamer' | 'merchant';

export interface FloorUnit {
  id: string;
  kind: UnitKind;
  x: number;
  y: number;
  label: string;
  /** Species shown on the map (enemies/minibosses). */
  speciesId?: string;
  level?: number;
  /** Links a miniboss to a generated famous beast. */
  famousBeastId?: string;
  /** Set for "Remnant of {figure}" minibosses. */
  figureName?: string;
  mov: number;
}

export interface Expedition {
  gateId: GateId;
  floorIndex: number;
  x: number;
  y: number;
  opened: string[];
  broken: string[];
  units: FloorUnit[];
  movLeft: number;
  minibossDown: boolean;
}

const ENEMY_MOV = 3;
const MINIBOSS_MOV = 2;
const TAMER_MOV = 3;
export const SIGHT_RANGE = 9; // BFS path length at which hostiles notice you

let unitSeq = 0;

export function floorOf(exp: Expedition): FloorDef {
  return GATES[exp.gateId].floors[exp.floorIndex];
}

export function tileAt(floor: FloorDef, x: number, y: number): string {
  if (y < 0 || y >= floor.grid.length) return TILE.WALL;
  const row = floor.grid[y];
  if (x < 0 || x >= row.length) return TILE.WALL;
  return row[x];
}

export function findStart(floor: FloorDef): { x: number; y: number } {
  for (let y = 0; y < floor.grid.length; y++) {
    const x = floor.grid[y].indexOf(TILE.START);
    if (x !== -1) return { x, y };
  }
  return { x: 1, y: 1 };
}

export function openKey(exp: Expedition, x: number, y: number): string {
  return `${exp.gateId}:${exp.floorIndex}:${x},${y}`;
}

export function isOpened(exp: Expedition, x: number, y: number): boolean {
  return exp.opened.includes(openKey(exp, x, y));
}

export function isBroken(exp: Expedition, x: number, y: number): boolean {
  return exp.broken.includes(openKey(exp, x, y));
}

export function floorHasMiniboss(floor: FloorDef): boolean {
  return floor.grid.some((row) => row.includes(TILE.MINIBOSS));
}

const DELTAS: Record<Direction, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

export function delta(dir: Direction): { dx: number; dy: number } {
  return DELTAS[dir];
}

export function unitAt(exp: Expedition, x: number, y: number): FloorUnit | undefined {
  return exp.units.find((u) => u.x === x && u.y === y);
}

/** Walkable for the PLAYER: breakables are enterable (they smash). */
export function playerWalkable(exp: Expedition, x: number, y: number): boolean {
  const ch = tileAt(floorOf(exp), x, y);
  return ch !== TILE.WALL;
}

/** Walkable for UNITS: unbroken breakables and other units block. */
function unitWalkable(exp: Expedition, x: number, y: number): boolean {
  const ch = tileAt(floorOf(exp), x, y);
  if (ch === TILE.WALL) return false;
  if (ch === TILE.BREAKABLE && !isBroken(exp, x, y)) return false;
  if (unitAt(exp, x, y)) return false;
  return true;
}

/** MOV budget (PLAN4): base + DEX + boots + trait. */
export function movFor(hero: Character): number {
  return Math.max(2, 4 + Math.floor(hero.effectiveStat('DEX') / 15) + (hero.equipment.boots ? 1 : 0) + hero.traits.moveBonus);
}

/** BFS distances from (sx, sy) over unit-walkable tiles (plus the target tile). */
function bfsFrom(exp: Expedition, sx: number, sy: number, maxDist: number): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: [number, number, number][] = [[sx, sy, 0]];
  dist.set(`${sx},${sy}`, 0);
  while (queue.length) {
    const [x, y, d] = queue.shift()!;
    if (d >= maxDist) continue;
    for (const { dx, dy } of Object.values(DELTAS)) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (dist.has(key)) continue;
      const ch = tileAt(floorOf(exp), nx, ny);
      if (ch === TILE.WALL) continue;
      if (ch === TILE.BREAKABLE && !isBroken(exp, nx, ny)) continue;
      dist.set(key, d + 1);
      queue.push([nx, ny, d + 1]);
    }
  }
  return dist;
}

/**
 * v12 click-to-move: shortest path (as a list of steps) from the player to
 * (tx,ty), or null if unreachable within maxDist. Walls, unbroken breakables,
 * and units block the way — EXCEPT the destination tile itself, which may be a
 * unit or breakable so the final step bumps (→ battle) or smashes it. The
 * component dispatches these MOVE steps one at a time, reusing all the normal
 * per-step logic (pickups, stairs, enemy phase).
 */
export function pathToTile(exp: Expedition, tx: number, ty: number, maxDist: number): Direction[] | null {
  const start = `${exp.x},${exp.y}`;
  const goal = `${tx},${ty}`;
  if (start === goal) return null;
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, { key: string; dir: Direction }>();
  const queue: [number, number][] = [[exp.x, exp.y]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const d = dist.get(`${x},${y}`)!;
    if (d >= maxDist) continue;
    for (const dir of Object.keys(DELTAS) as Direction[]) {
      const { dx, dy } = DELTAS[dir];
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (dist.has(key)) continue;
      const isGoal = key === goal;
      const ch = tileAt(floorOf(exp), nx, ny);
      if (ch === TILE.WALL) continue;
      const blocked = (ch === TILE.BREAKABLE && !isBroken(exp, nx, ny)) || unitAt(exp, nx, ny) !== undefined;
      if (blocked && !isGoal) continue;
      dist.set(key, d + 1);
      prev.set(key, { key: `${x},${y}`, dir });
      if (isGoal) {
        const path: Direction[] = [];
        let cur = goal;
        while (cur !== start) {
          const p = prev.get(cur)!;
          path.unshift(p.dir);
          cur = p.key;
        }
        return path;
      }
      queue.push([nx, ny]);
    }
  }
  return null;
}

/** v12: tiles the player can freely walk onto within maxDist (empty, no unit,
 * no unbroken breakable). Keys are "x,y". Used to highlight the move budget. */
export function reachableTiles(exp: Expedition, maxDist: number): Set<string> {
  const start = `${exp.x},${exp.y}`;
  const seen = new Set<string>([start]);
  const dist = new Map<string, number>([[start, 0]]);
  const queue: [number, number][] = [[exp.x, exp.y]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const d = dist.get(`${x},${y}`)!;
    if (d >= maxDist) continue;
    for (const { dx, dy } of Object.values(DELTAS)) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      const ch = tileAt(floorOf(exp), nx, ny);
      if (ch === TILE.WALL) continue;
      if (ch === TILE.BREAKABLE && !isBroken(exp, nx, ny)) continue;
      if (unitAt(exp, nx, ny)) continue;
      seen.add(key);
      dist.set(key, d + 1);
      queue.push([nx, ny]);
    }
  }
  seen.delete(start);
  return seen;
}

/**
 * Enemy phase: every hostile unit that can path to the player within
 * SIGHT_RANGE advances up to its MOV along the shortest path. Returns the
 * unit that reached the player (contact = battle), if any.
 */
export function advanceHostiles(exp: Expedition): FloorUnit | null {
  const fromPlayer = bfsFrom(exp, exp.x, exp.y, SIGHT_RANGE + 1);
  for (const unit of exp.units) {
    if (unit.kind === 'merchant') continue;
    const startKey = `${unit.x},${unit.y}`;
    const pathLen = fromPlayer.get(startKey);
    if (pathLen === undefined || pathLen > SIGHT_RANGE) continue;

    let steps = unit.mov;
    while (steps > 0) {
      const current = fromPlayer.get(`${unit.x},${unit.y}`);
      if (current === undefined) break;
      if (current <= 1) {
        // Adjacent — step onto the player: contact.
        unit.x = exp.x;
        unit.y = exp.y;
        return unit;
      }
      // Greedy descent along the BFS gradient toward the player.
      let moved = false;
      for (const { dx, dy } of Object.values(DELTAS)) {
        const nx = unit.x + dx;
        const ny = unit.y + dy;
        const d = fromPlayer.get(`${nx},${ny}`);
        if (d !== undefined && d < current && unitWalkable(exp, nx, ny)) {
          unit.x = nx;
          unit.y = ny;
          moved = true;
          break;
        }
      }
      if (!moved) break;
      steps--;
    }
  }
  return null;
}

/** Build the floor's units from grid markers + generated history. */
export function spawnFloorUnits(
  gateId: GateId,
  floorIndex: number,
  world: GeneratedWorld | null,
  chronicle: ChronicleState,
  hasTamed: boolean
): FloorUnit[] {
  const gate = GATES[gateId];
  const floor = gate.floors[floorIndex];
  const units: FloorUnit[] = [];

  for (let y = 0; y < floor.grid.length; y++) {
    for (let x = 0; x < floor.grid[y].length; x++) {
      const ch = floor.grid[y][x];
      if (ch === TILE.ENEMY) {
        const pool = speciesMatching(floor.spawn.families, floor.spawn.tierMin, floor.spawn.tierMax);
        const species = pool.length ? pool[randInt(pool.length)] : Object.values(SPECIES)[0];
        units.push({
          id: `u${++unitSeq}`,
          kind: 'enemy',
          x,
          y,
          label: species.name,
          speciesId: species.id,
          level: Math.max(1, 1 + floor.spawn.levelBonus + randInt(BALANCE.wildLevelJitter)),
          mov: ENEMY_MOV,
        });
      } else if (ch === TILE.MINIBOSS) {
        // History made flesh: the gate's unslain famous beast, or a figure's remnant.
        const beast = world?.beasts.find((b) => b.gateId === gateId && !chronicle.beastsSlain.includes(b.id));
        if (beast) {
          units.push({
            id: `u${++unitSeq}`,
            kind: 'miniboss',
            x,
            y,
            label: `${beast.name}, ${beast.epithet}`,
            speciesId: beast.speciesId,
            level: Math.max(2, 3 + floor.spawn.levelBonus + beast.might),
            famousBeastId: beast.id,
            mov: MINIBOSS_MOV,
          });
        } else {
          const fallen = world?.figures.filter((f) => f.diedYear !== null) ?? [];
          const figure = fallen.length ? fallen[randInt(fallen.length)] : null;
          const pool = speciesMatching(floor.spawn.families, floor.spawn.tierMin, Math.min(5, floor.spawn.tierMax + 1));
          const species = pool.length ? pool[randInt(pool.length)] : Object.values(SPECIES)[0];
          units.push({
            id: `u${++unitSeq}`,
            kind: 'miniboss',
            x,
            y,
            label: figure ? `Remnant of ${figure.name} ${figure.title}` : 'The Nameless Warden',
            speciesId: species.id,
            level: Math.max(2, 4 + floor.spawn.levelBonus),
            figureName: figure ? `${figure.name} ${figure.title}` : undefined,
            mov: MINIBOSS_MOV,
          });
        }
      } else if (ch === TILE.TAMER && hasTamed && randInt(100) < 40) {
        units.push({
          id: `u${++unitSeq}`,
          kind: 'tamer',
          x,
          y,
          label: `${bestowName()} the Tamer`,
          level: Math.max(1, 2 + floor.spawn.levelBonus),
          mov: TAMER_MOV,
        });
      } else if (ch === TILE.MERCHANT && randInt(100) < 50) {
        units.push({ id: `u${++unitSeq}`, kind: 'merchant', x, y, label: 'Traveling Merchant', mov: 0 });
      }
    }
  }
  return units;
}

export function newExpedition(gateId: GateId, world: GeneratedWorld | null, chronicle: ChronicleState, hasTamed: boolean): Expedition {
  const start = findStart(GATES[gateId].floors[0]);
  return {
    gateId,
    floorIndex: 0,
    x: start.x,
    y: start.y,
    opened: [],
    broken: [],
    units: spawnFloorUnits(gateId, 0, world, chronicle, hasTamed),
    movLeft: 4,
    minibossDown: false,
  };
}

export function descend(exp: Expedition, world: GeneratedWorld | null, chronicle: ChronicleState, hasTamed: boolean): Expedition {
  const nextIndex = Math.min(exp.floorIndex + 1, GATES[exp.gateId].floors.length - 1);
  const start = findStart(GATES[exp.gateId].floors[nextIndex]);
  return {
    ...exp,
    floorIndex: nextIndex,
    x: start.x,
    y: start.y,
    units: spawnFloorUnits(exp.gateId, nextIndex, world, chronicle, hasTamed),
    minibossDown: false,
  };
}

export function ascend(exp: Expedition, world: GeneratedWorld | null, chronicle: ChronicleState, hasTamed: boolean): Expedition {
  const prevIndex = Math.max(0, exp.floorIndex - 1);
  const start = findStart(GATES[exp.gateId].floors[prevIndex]);
  return {
    ...exp,
    floorIndex: prevIndex,
    x: start.x,
    y: start.y,
    units: spawnFloorUnits(exp.gateId, prevIndex, world, chronicle, hasTamed),
    minibossDown: true, // already earned the way down once
  };
}

/**
 * Exact FE-style threat: every tile a hostile that can currently see the
 * player could stand on after its next move (enemy AI is deterministic).
 */
export function threatTiles(exp: Expedition): Set<string> {
  const threat = new Set<string>();
  const fromPlayer = bfsFrom(exp, exp.x, exp.y, SIGHT_RANGE + 1);
  for (const unit of exp.units) {
    if (unit.kind === 'merchant') continue;
    const seen = fromPlayer.get(`${unit.x},${unit.y}`);
    if (seen === undefined || seen > SIGHT_RANGE) continue; // dormant: won't move
    const reach = bfsFrom(exp, unit.x, unit.y, unit.mov);
    for (const key of reach.keys()) threat.add(key);
  }
  return threat;
}
