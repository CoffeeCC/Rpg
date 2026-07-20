import type { FloorDef, GateId } from '../types';
import { GATES } from '../data/gates';

/** Where the party currently is inside a gate. */
export interface Expedition {
  gateId: GateId;
  floorIndex: number;
  x: number;
  y: number;
  /** Keys of consumed one-shot tiles (chests/shrines/events/bosses). */
  opened: string[];
}

export type Direction = 'north' | 'south' | 'east' | 'west';

export const TILE = {
  WALL: '#',
  FLOOR: '.',
  START: 'S',
  STAIRS: '>',
  BOSS: 'B',
  CHEST: 'C',
  SHRINE: 'H',
  EVENT: 'E',
} as const;

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

const DELTAS: Record<Direction, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

export interface StepResult {
  moved: boolean;
  x: number;
  y: number;
  tile: string;
}

export function step(exp: Expedition, dir: Direction): StepResult {
  const { dx, dy } = DELTAS[dir];
  const nx = exp.x + dx;
  const ny = exp.y + dy;
  const tile = tileAt(floorOf(exp), nx, ny);
  if (tile === TILE.WALL) {
    return { moved: false, x: exp.x, y: exp.y, tile };
  }
  return { moved: true, x: nx, y: ny, tile };
}

export function newExpedition(gateId: GateId): Expedition {
  const start = findStart(GATES[gateId].floors[0]);
  return { gateId, floorIndex: 0, x: start.x, y: start.y, opened: [] };
}

export function descend(exp: Expedition): Expedition {
  const nextIndex = Math.min(exp.floorIndex + 1, GATES[exp.gateId].floors.length - 1);
  const start = findStart(GATES[exp.gateId].floors[nextIndex]);
  return { ...exp, floorIndex: nextIndex, x: start.x, y: start.y };
}
