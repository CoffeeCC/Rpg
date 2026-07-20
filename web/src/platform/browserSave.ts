import type { GameState } from '../engine/game';
import { serializeGameState, deserializeGameState, type SaveData } from '../engine/systems/saveGame';

const SLOT_PREFIX = 'rpg-save-slot-';
export const SLOT_COUNT = 3;

export interface SlotSummary {
  slot: number;
  name: string;
  level: number;
  where: string;
  orbs: number;
  savedAt: string;
}

function slotKey(slot: number): string {
  return `${SLOT_PREFIX}${slot}`;
}

function readSlot(slot: number): SaveData | null {
  const raw = localStorage.getItem(slotKey(slot));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveData;
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

/** Returns the restored state, or an error message string. */
export function loadFromSlot(slot: number): GameState | string {
  const data = readSlot(slot);
  if (!data) return 'Nothing saved in that slot.';
  try {
    return deserializeGameState(data);
  } catch (err) {
    return err instanceof Error ? err.message : 'That save could not be loaded.';
  }
}

export function deleteSlot(slot: number): void {
  localStorage.removeItem(slotKey(slot));
}

export function getSlotSummary(slot: number): SlotSummary | null {
  const data = readSlot(slot);
  if (!data) return null;
  const raw = data.state as { player?: { name?: string; level?: number }; screen?: string; orbs?: string[] } | undefined;
  if (!raw?.player?.name) return null;
  return {
    slot,
    name: raw.player.name,
    level: raw.player.level ?? 1,
    where: raw.screen === 'floor' ? 'Exploring' : 'Everdusk',
    orbs: raw.orbs?.length ?? 0,
    savedAt: data.savedAt,
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
  try {
    const text = await file.text();
    const data = JSON.parse(text) as SaveData;
    return deserializeGameState(data);
  } catch (err) {
    return err instanceof Error ? err.message : 'That file could not be read as a save.';
  }
}
