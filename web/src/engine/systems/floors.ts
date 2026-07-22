import type { ChronicleState, FloorDef, GateId, GeneratedWorld } from '../types';
import type { Character } from '../entities/Character';
import { GATES } from '../data/gates';
import { speciesMatching, SPECIES } from '../data/species';
import { BALANCE } from '../data/balance';
import { bestowName } from './naming';
import { randInt, SeededRng } from '../random';
import { generateFloor } from './floorgen';

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
  /** Tiles the Lantern has ever lit on this floor (fog-of-war memory). Keyed like `opened`/`broken`. */
  revealed: string[];
  units: FloorUnit[];
  movLeft: number;
  minibossDown: boolean;
  /** Set only for an Unmapped Wilds expedition: floors past the gate's hand-
   * authored ones, generated on demand and cached here (so ascending then
   * descending again doesn't reroll a floor you've already seen). */
  wild?: WildParams;
}

export interface WildParams {
  seed: number;
  floors: FloorDef[];
}

const ENEMY_MOV = 3;
const MINIBOSS_MOV = 2;
const TAMER_MOV = 3;
export const SIGHT_RANGE = 9; // BFS path length at which hostiles notice you

let unitSeq = 0;

export function floorOf(exp: Expedition): FloorDef {
  return exp.wild ? floorAt(exp.gateId, exp.floorIndex, exp.wild) : GATES[exp.gateId].floors[exp.floorIndex];
}

/** Depth (0 = the floor just past the gate's own hand-authored ones) escalates
 * difficulty and floor size from wherever the gate's own last floor left off —
 * the Wilds continue the gate's danger curve rather than resetting it. */
function wildFloorOptions(gateId: GateId, depth: number) {
  const gate = GATES[gateId];
  const base = gate.floors[gate.floors.length - 1].spawn;
  return {
    width: 17 + Math.min(6, Math.floor(depth / 3)),
    height: 11 + Math.min(4, Math.floor(depth / 4)),
    families: base.families,
    tierMin: Math.min(5, base.tierMin + Math.floor(depth / 3)),
    tierMax: Math.min(5, base.tierMax + 1 + Math.floor(depth / 2)),
    levelBonus: base.levelBonus + 1 + depth,
  };
}

/** Generates (and caches, in place, on `wild.floors`) whatever floors are
 * needed to satisfy `floorIndex`. A no-op once that floor already exists —
 * ascending back to a floor you've generated before never rerolls it. */
function floorAt(gateId: GateId, floorIndex: number, wild: WildParams): FloorDef {
  while (wild.floors.length <= floorIndex) {
    const depth = wild.floors.length;
    wild.floors.push(generateFloor(new SeededRng(wild.seed + depth), wildFloorOptions(gateId, depth)));
  }
  return wild.floors[floorIndex];
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

export function isRevealed(exp: Expedition, x: number, y: number): boolean {
  return exp.revealed.includes(openKey(exp, x, y));
}

/** How far the Last Lantern's light reaches. LUCK nudges it wider — the same
 * stat the Chronicler's "lantern-luck" perk invests in. */
export function lanternRadius(hero: Character): number {
  return BALANCE.lanternRadius + Math.floor(hero.effectiveStat('LUCK') / 20);
}

/** Tiles currently lit by the Lantern (BFS from the hero, blocked by walls
 * and unbroken breakables — same reachability rules as sight/threat). Keys
 * are bare "x,y", NOT floor-scoped (caller decides how to persist them).
 *
 * bfsFrom deliberately never travels THROUGH a wall (light doesn't pass
 * beyond one), which means walls themselves never appear in its result -
 * they were never getting lit AT ALL, even standing right next to one, so
 * every wall in the game rendered as permanently opaque fog-black despite
 * having real painted textures. Seeing a wall's face doesn't require light
 * to pass through it, just to reach it, so add any wall adjacent to a lit
 * floor tile into the result (without changing bfsFrom itself, which
 * reachableTiles/threatTiles also use for movement math that must keep
 * excluding walls). */
export function litTiles(exp: Expedition, radius: number): Set<string> {
  const lit = new Set(bfsFrom(exp, exp.x, exp.y, radius).keys());
  const floor = floorOf(exp);
  for (const key of [...lit]) {
    const [x, y] = key.split(',').map(Number);
    for (const { dx, dy } of Object.values(DELTAS)) {
      const nx = x + dx;
      const ny = y + dy;
      if (tileAt(floor, nx, ny) === TILE.WALL) lit.add(`${nx},${ny}`);
    }
  }
  return lit;
}

/** Merge newly-lit tiles into the floor's fog-of-war memory. Returns the same
 * Expedition reference if nothing new was revealed (keeps the reducer's
 * "no-op returns state unchanged" contract intact for blocked moves). */
export function revealLantern(exp: Expedition, hero: Character): Expedition {
  const lit = litTiles(exp, lanternRadius(hero));
  const added: string[] = [];
  for (const key of lit) {
    const scoped = `${exp.gateId}:${exp.floorIndex}:${key}`;
    if (!exp.revealed.includes(scoped)) added.push(scoped);
  }
  if (added.length === 0) return exp;
  return { ...exp, revealed: [...exp.revealed, ...added] };
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
  floor: FloorDef,
  gateId: GateId,
  world: GeneratedWorld | null,
  chronicle: ChronicleState,
  hasTamed: boolean
): FloorUnit[] {
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
  const floor0 = GATES[gateId].floors[0];
  const start = findStart(floor0);
  return {
    gateId,
    floorIndex: 0,
    x: start.x,
    y: start.y,
    opened: [],
    broken: [],
    revealed: [],
    units: spawnFloorUnits(floor0, gateId, world, chronicle, hasTamed),
    movLeft: 4,
    minibossDown: false,
  };
}

/** Enter the Unmapped Wilds past a gate whose Warden has already fallen —
 * same biome/family flavor, but every floor beyond is generated, keyed off
 * `seed` so a given expedition's floors are reproducible (e.g. across a
 * save/load) without precomputing floors the player may never reach. */
export function newWildExpedition(
  gateId: GateId,
  seed: number,
  world: GeneratedWorld | null,
  chronicle: ChronicleState,
  hasTamed: boolean
): Expedition {
  const wild: WildParams = { seed, floors: [] };
  const floor0 = floorAt(gateId, 0, wild);
  const start = findStart(floor0);
  return {
    gateId,
    floorIndex: 0,
    x: start.x,
    y: start.y,
    opened: [],
    broken: [],
    revealed: [],
    units: spawnFloorUnits(floor0, gateId, world, chronicle, hasTamed),
    movLeft: 4,
    minibossDown: false,
    wild,
  };
}

export function descend(exp: Expedition, world: GeneratedWorld | null, chronicle: ChronicleState, hasTamed: boolean): Expedition {
  const wild = exp.wild ? { seed: exp.wild.seed, floors: [...exp.wild.floors] } : undefined;
  const nextIndex = wild ? exp.floorIndex + 1 : Math.min(exp.floorIndex + 1, GATES[exp.gateId].floors.length - 1);
  const floor = wild ? floorAt(exp.gateId, nextIndex, wild) : GATES[exp.gateId].floors[nextIndex];
  const start = findStart(floor);
  return {
    ...exp,
    wild,
    floorIndex: nextIndex,
    x: start.x,
    y: start.y,
    units: spawnFloorUnits(floor, exp.gateId, world, chronicle, hasTamed),
    minibossDown: false,
  };
}

export function ascend(exp: Expedition, world: GeneratedWorld | null, chronicle: ChronicleState, hasTamed: boolean): Expedition {
  const wild = exp.wild ? { seed: exp.wild.seed, floors: [...exp.wild.floors] } : undefined;
  const prevIndex = Math.max(0, exp.floorIndex - 1);
  const floor = wild ? floorAt(exp.gateId, prevIndex, wild) : GATES[exp.gateId].floors[prevIndex];
  const start = findStart(floor);
  return {
    ...exp,
    wild,
    floorIndex: prevIndex,
    x: start.x,
    y: start.y,
    units: spawnFloorUnits(floor, exp.gateId, world, chronicle, hasTamed),
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
