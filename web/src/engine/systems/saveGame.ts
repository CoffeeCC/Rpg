import { Character } from '../entities/Character';
import { MonsterInstance } from '../entities/MonsterInstance';
import type { GameState } from '../game';

export const SAVE_VERSION = 5;

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
  const snapshot: GameState = { ...state, battle: null, lastFx: [], lastTalk: null, pendingReward: null, pendingLegend: null, pendingMerchant: null };
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(snapshot)),
  };
}

function revive<T extends object>(ctor: { prototype: object }, data: unknown): T {
  return Object.assign(Object.create(ctor.prototype), data) as T;
}

export function deserializeGameState(save: SaveData): GameState {
  if (save.version !== SAVE_VERSION) {
    throw new Error(`This save is from an older age of the game (v${save.version}) and can't be loaded.`);
  }
  const raw = save.state as GameState;
  const player = raw.player ? revive<Character>(Character, raw.player) : null;
  // Fields added after the first v3 saves shipped get safe defaults.
  if (player && typeof player.upgradedCounts !== 'object') player.upgradedCounts = {};
  if (player) {
    for (const key of ['ring2', 'amulet', 'pendant'] as const) {
      if (!(key in player.equipment)) (player.equipment as Record<string, unknown>)[key] = null;
    }
  }
  return {
    ...raw,
    blessingChapter: raw.blessingChapter ?? -99, // v11 field; older saves get "never used"
    player,
    party: raw.party.map((m) => revive<MonsterInstance>(MonsterInstance, m)),
    stable: raw.stable.map((m) => revive<MonsterInstance>(MonsterInstance, m)),
    battle: null,
    pendingEvent: null,
    pendingStory: null,
    pendingReward: null,
    pendingLegend: null,
    pendingMerchant: null,
    lastTalk: null,
    lastFx: [],
  };
}
