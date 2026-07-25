import { Character } from '../entities/Character';
import { MonsterInstance } from '../entities/MonsterInstance';
import type { GameState } from '../game';
import { MIN_SUPPORTED_VERSION, isPlainObject, migrateSaveState, normalizeSaveState, type RawSave } from './saveMigrations';

/**
 * Current save format.
 *
 * Deliberately still 5. Everdusk's history (see `saveMigrations.ts`) shows
 * that fields have repeatedly been added *without* bumping this number, so the
 * intra-version drift between the four distinct shapes that all call
 * themselves "version 5" cannot be distinguished by version at all — it is
 * handled by the always-run `normalizeSaveState` probe instead. Bumping now
 * would be cosmetic and would not migrate anything the normalizer does not
 * already cover.
 *
 * The point of this work is that the *next* bump is safe: add a step to
 * `MIGRATIONS`, raise this number, and old saves walk forward instead of dying.
 */
export const SAVE_VERSION = 5;

export { MIN_SUPPORTED_VERSION };

/** Safe save points: town, or on a floor outside battle/events/rewards/story. */
export function isSavable(state: GameState): boolean {
  return (
    !!state.player &&
    (state.screen === 'town' || state.screen === 'floor') &&
    !state.battle &&
    !state.pendingEvent &&
    !state.pendingReward &&
    state.pendingStory === null
  );
}

export interface SaveData {
  version: number;
  savedAt: string;
  state: unknown;
}

export function serializeGameState(state: GameState): SaveData | null {
  if (!isSavable(state)) return null;
  const snapshot: GameState = { ...state, battle: null, lastFx: [], lastTalk: null, pendingReward: null, pendingLegend: null, pendingLeaving: null, pendingMerchant: null };
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(snapshot)),
  };
}

function revive<T extends object>(ctor: { prototype: object }, data: unknown): T {
  return Object.assign(Object.create(ctor.prototype), data) as T;
}

/**
 * A save that cannot be read, carrying a message already written in the
 * player's voice. Everything thrown out of {@link deserializeGameState} is one
 * of these, so no raw `TypeError` string ever reaches the screen.
 */
export class SaveLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveLoadError';
  }
}

export type SaveLoadResult =
  | { ok: true; state: GameState; migratedFrom: number | null; notes: string[] }
  | { ok: false; message: string };

/**
 * Structural floor for a rescuable save.
 *
 * We ask only for what no migration could invent: a hero with a name. Party
 * and stable are repaired by the normalizer if they are merely missing, but a
 * save with no hero has nothing to restore a run *to* — every real save has
 * one, because `isSavable` refuses to write without `state.player`.
 */
function hasRescuableShape(state: unknown): state is RawSave {
  if (!isPlainObject(state)) return false;
  const player = state.player;
  return isPlainObject(player) && typeof player.name === 'string' && player.name.length > 0;
}

/**
 * Read a save from untrusted data. Never throws.
 *
 * This is the entry point callers should use. The failure modes it
 * distinguishes, each with its own message:
 *
 * - not an object / no version number -> not a save file at all
 * - version newer than this build     -> a stale cached PWA bundle; do NOT
 *                                        attempt to read it, because a future
 *                                        format may have moved or dropped
 *                                        fields we would misread as present
 * - version below the floor           -> older than any format that shipped
 * - too little structure to migrate   -> honest refusal, phrased by age
 * - anything thrown mid-walk          -> caught and reported, never surfaced
 *                                        as a raw JS error string
 */
export function readSaveData(input: unknown): SaveLoadResult {
  if (!isPlainObject(input) || typeof input.version !== 'number' || !Number.isFinite(input.version)) {
    return { ok: false, message: 'This is not a telling Everdusk set down. Nothing here can be read.' };
  }
  const version = Math.floor(input.version);

  // A save from a LATER age. Real case: the PWA is serving a cached older
  // bundle while localStorage already holds a newer save. Refuse deliberately
  // and tell the player the one thing that fixes it.
  if (version > SAVE_VERSION) {
    return {
      ok: false,
      message: `This telling was set down in a later age of the game (v${version}) than this one can read (v${SAVE_VERSION}). Reload Everdusk to let it catch up, and it will open again.`,
    };
  }

  if (version < MIN_SUPPORTED_VERSION) {
    return {
      ok: false,
      message: `This save is from an older age of the game (v${version}) than any that was ever written down. It cannot be recovered.`,
    };
  }

  if (!hasRescuableShape(input.state)) {
    // Phrase the refusal by age: a legacy save that did not survive intact
    // reads differently from a current one that was damaged.
    return {
      ok: false,
      message:
        version < SAVE_VERSION
          ? `This save is from an older age of the game (v${version}), and too little of it survives to be read.`
          : 'This telling is damaged past reading — too little of it survives.',
    };
  }

  try {
    // Deep-clone first: migrations mutate, and the caller's object (which may
    // still be sitting in localStorage-backed memory) must not be touched.
    const raw = JSON.parse(JSON.stringify(input.state)) as RawSave;
    const { state: walked, notes } = migrateSaveState(raw, version, SAVE_VERSION);
    // Always runs — catches the fields added without a version bump, and any
    // gap left by truncation or hand-editing at the current version.
    const normalized = normalizeSaveState(walked);
    return {
      ok: true,
      state: reviveGameState(normalized),
      migratedFrom: version < SAVE_VERSION ? version : null,
      notes,
    };
  } catch {
    return { ok: false, message: 'This save could not be carried forward; the telling breaks partway through.' };
  }
}

/** Rebuild class instances and clear everything that must never persist. */
function reviveGameState(raw: RawSave): GameState {
  const state = raw as unknown as GameState;
  const player = state.player ? revive<Character>(Character, state.player) : null;
  return {
    ...state,
    player,
    party: state.party.map((m) => revive<MonsterInstance>(MonsterInstance, m)),
    stable: state.stable.map((m) => revive<MonsterInstance>(MonsterInstance, m)),
    battle: null,
    pendingEvent: null,
    pendingStory: null,
    pendingReward: null,
    pendingLegend: null,
    pendingLeaving: null,
    pendingMerchant: null,
    lastTalk: null,
    lastFx: [],
  };
}

/**
 * Throwing form, kept for callers and tests that predate {@link readSaveData}.
 *
 * Guaranteed to throw only {@link SaveLoadError}, whose message is already
 * player-facing. Prefer `readSaveData` in new code.
 */
export function deserializeGameState(save: SaveData): GameState {
  const result = readSaveData(save);
  if (!result.ok) throw new SaveLoadError(result.message);
  return result.state;
}
