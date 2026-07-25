import type { GameState } from '../engine/game';
import { serializeGameState, readSaveData, SAVE_VERSION, type SaveData } from '../engine/systems/saveGame';

const SLOT_PREFIX = 'rpg-save-slot-';
export const SLOT_COUNT = 3;

export interface SlotSummary {
  slot: number;
  name: string;
  level: number;
  where: string;
  orbs: number;
  savedAt: string;
  /**
   * Where this save sits relative to the running build. 'older' saves are
   * carried forward by the migration chain on load; 'later' ones cannot be
   * read and say so when the player tries.
   */
  age: 'older' | 'current' | 'later';
}

function slotKey(slot: number): string {
  return `${SLOT_PREFIX}${slot}`;
}

function readSlot(slot: number): SaveData | null {
  const raw = localStorage.getItem(slotKey(slot));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // JSON.parse happily returns numbers, strings and null. Anything that is
    // not an object is not a save, and letting it through means every reader
    // below has to re-check.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as SaveData;
  } catch {
    return null;
  }
}

export function saveToSlot(slot: number, state: GameState): boolean {
  const data = serializeGameState(state);
  if (!data) return false;
  localStorage.setItem(slotKey(slot), JSON.stringify(data));
  return true;
}

/**
 * Returns the restored state, or an error message string.
 *
 * `readSaveData` never throws and its failure messages are already written in
 * the player's voice, so the message goes straight to the screen. The old
 * try/catch here could surface a raw `TypeError` text ("Cannot read properties
 * of undefined") when a save was structurally broken.
 */
export function loadFromSlot(slot: number): GameState | string {
  const data = readSlot(slot);
  if (!data) return 'Nothing saved in that slot.';
  const result = readSaveData(data);
  return result.ok ? result.state : result.message;
}

export function deleteSlot(slot: number): void {
  localStorage.removeItem(slotKey(slot));
}

export function getSlotSummary(slot: number): SlotSummary | null {
  const data = readSlot(slot);
  if (!data) return null;
  const raw = data.state as { player?: { name?: string; level?: number }; screen?: string; orbs?: string[] } | undefined;
  if (!raw?.player?.name) return null;
  const version = typeof data.version === 'number' && Number.isFinite(data.version) ? Math.floor(data.version) : 0;
  return {
    slot,
    name: raw.player.name,
    level: typeof raw.player.level === 'number' ? raw.player.level : 1,
    where: raw.screen === 'floor' ? 'Exploring' : 'Everdusk',
    orbs: Array.isArray(raw.orbs) ? raw.orbs.length : 0,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
    age: version === SAVE_VERSION ? 'current' : version > SAVE_VERSION ? 'later' : 'older',
  };
}

export function hasAnySave(): boolean {
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    if (getSlotSummary(slot)) return true;
  }
  return false;
}

export function exportSaveToFile(state: GameState): boolean {
  const data = serializeGameState(state);
  if (!data) return false;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const player = (data.state as { player?: { name?: string } }).player;
  link.download = `${(player?.name ?? 'hero').replace(/[^a-z0-9]+/gi, '_')}-save.json`;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

/** Returns the restored state, or an error message string. */
export async function importSaveFromFile(file: File): Promise<GameState | string> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    // Only malformed JSON or an unreadable file lands here; a well-formed but
    // wrong-shaped file is readSaveData's business, and it phrases it better.
    return 'That file could not be read as a save.';
  }
  const result = readSaveData(data);
  return result.ok ? result.state : result.message;
}
