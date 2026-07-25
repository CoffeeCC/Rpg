/**
 * Save migrations — walking an old telling forward until this age can read it.
 *
 * ## Why this exists
 *
 * `deserializeGameState` used to hard-reject any save whose `version` was not
 * the current `SAVE_VERSION`. Because Everdusk ships as an installable PWA,
 * that meant every version bump silently destroyed every in-progress run on
 * the next update. This module replaces the rejection with a chain.
 *
 * ## The one thing to understand before editing
 *
 * **In this codebase the save version number under-counts shape changes.**
 * This is not speculation; it is what `git log -p` shows:
 *
 * | commit    | release | SAVE_VERSION | shape change                                    |
 * |-----------|---------|--------------|-------------------------------------------------|
 * | `8321492` | v5      | 3            | the original format                              |
 * | `ef4d381` | v6      | 3 -> 4       | `pendingMerchant`; tactical `Expedition` fields  |
 * | `70f6fd1` | v7      | 4 (no bump!) | `MonsterInstance.aspectId`                       |
 * | `172540c` | v8      | 4 -> 5       | `upgradedCounts`, new equip slots, `seen`, ...   |
 * | `9f23bac` | v9      | 5 (no bump!) | `MonsterInstance.trinket`, `selectedMonsterUid`  |
 * | `8e675ce` | v13     | 5 (no bump!) | `blessingChapter`                                |
 * | `89db3cc` | v16     | 5 (no bump!) | `Expedition.revealed` (Lantern fog-of-war)       |
 * | `b77fab0` | v19     | 5 (no bump!) | `duelRecord` (optional, so genuinely harmless)   |
 *
 * So "version 4" describes two different shapes, and "version 5" describes
 * four. A save's version number tells you where to *start* the walk; it does
 * not tell you which fields are actually present. Every step therefore
 * **probes rather than assumes**, and every step is **idempotent** — running
 * it on data that already has the field is a no-op. That is also what makes
 * {@link normalizeSaveState} safe to run unconditionally on every load,
 * including current-version saves, which is our only defence against a
 * truncated or hand-edited file.
 *
 * ## Adding a step
 *
 * Bump `SAVE_VERSION` in `saveGame.ts`, append a step here with `from` equal
 * to the old version, and add a test to `saveMigration.test.ts`. Keep the step
 * pure and idempotent. If the new field can crash the app when absent, add it
 * to {@link normalizeSaveState} as well — steps run once, the normalizer runs
 * always.
 *
 * Migrations operate on **plain JSON**, before class instances are revived.
 * That keeps every step a small pure data transform with no engine coupling
 * beyond the static card/personality tables it reads.
 */
import { CLASS_DECKS, RACE_CARDS, TAME_CARD_ID } from '../data/cards';
import { rollPersonality } from '../data/personalities';
import type { ClassName, RaceName } from '../types';

/**
 * The oldest save format we will attempt to read.
 *
 * Version 3 is the format introduced by `8321492`, the first commit in which
 * Everdusk had saving at all — there is no version 1 or 2 in the wild, and no
 * public build ever wrote one. So this floor is not a decision to abandon
 * anyone: it is the whole of recorded history. A save claiming a version below
 * this is not an Everdusk save, and we say so rather than guessing at it.
 */
export const MIN_SUPPORTED_VERSION = 3;

/** Loosely-typed JSON object. Migrations run before class revival. */
export type RawSave = Record<string, unknown>;

export interface MigrationStep {
  /** Version this step reads. */
  from: number;
  /** Version this step produces. */
  to: number;
  /** One line for the load log, in the player's voice where it shows. */
  note: string;
  /** Pure, idempotent transform. Must not throw on malformed input. */
  apply(state: RawSave): RawSave;
}

// ---------------------------------------------------------------------------
// Small defensive helpers
// ---------------------------------------------------------------------------

/**
 * True only for plain objects — arrays and null are excluded.
 *
 * The exclusion matters. The pre-existing backfill used
 * `typeof player.upgradedCounts !== 'object'`, and `typeof [] === 'object'`,
 * so a legacy `upgradedCards` *array* would have sailed through that guard and
 * been treated as a count map, whose lookups all return `undefined`.
 */
export function isPlainObject(value: unknown): value is RawSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Set `key` to `value` only if it is not already present with a usable type. */
function ensure(obj: RawSave, key: string, value: unknown): void {
  if (obj[key] === undefined || obj[key] === null) obj[key] = value;
}

/** Force `key` to an array, keeping the existing one if it already is one. */
function ensureArray(obj: RawSave, key: string): void {
  if (!Array.isArray(obj[key])) obj[key] = [];
}

/** Force `key` to a finite number, else `fallback`. */
function ensureNumber(obj: RawSave, key: string, fallback: number): void {
  if (typeof obj[key] !== 'number' || !Number.isFinite(obj[key])) obj[key] = fallback;
}

/** Every monster in the save: party and stable both. */
function monstersOf(state: RawSave): RawSave[] {
  const out: RawSave[] = [];
  for (const key of ['party', 'stable']) {
    const list = state[key];
    if (Array.isArray(list)) {
      for (const m of list) if (isPlainObject(m)) out.push(m);
    }
  }
  return out;
}

function playerOf(state: RawSave): RawSave | null {
  return isPlainObject(state.player) ? state.player : null;
}

/**
 * Stable 32-bit hash. Used to pick a backfilled personality from a monster's
 * uid, so migrating the same save twice yields the same creature rather than
 * rerolling its temperament on every load.
 */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Step: version 3 -> 4   (commit ef4d381, release v6 "Tactical Floors")
// ---------------------------------------------------------------------------

/**
 * v6 turned floors into a tactical grid and gave the town a travelling
 * merchant. `Expedition` grew from `{gateId, floorIndex, x, y, opened}` to
 * additionally carry `broken`, `units`, `movLeft` and `minibossDown`.
 *
 * The expedition fields are not cosmetic: `cloneCore` (game.ts) spreads
 * `[...state.expedition.broken]` and maps `state.expedition.units` on **every
 * reducer action**, so a v3 save taken mid-dungeon throws a `TypeError` on the
 * player's next keypress without this step.
 *
 * `movLeft` is set to 0 rather than a full allowance: the player is mid-floor
 * and the map turn will refresh it, and 0 cannot be exploited into a free
 * extra move.
 */
export const step3to4: MigrationStep = {
  from: 3,
  to: 4,
  note: 'The floors became ground you could cross a step at a time.',
  apply(state) {
    ensure(state, 'pendingMerchant', null);
    const exp = isPlainObject(state.expedition) ? state.expedition : null;
    if (exp) {
      ensureArray(exp, 'opened');
      ensureArray(exp, 'broken');
      ensureArray(exp, 'units');
      ensureNumber(exp, 'movLeft', 0);
      if (typeof exp.minibossDown !== 'boolean') exp.minibossDown = false;
    }
    return state;
  },
};

// ---------------------------------------------------------------------------
// Step: version 4 -> 5   (commit 172540c, release v8 "The Tellings")
// ---------------------------------------------------------------------------

/**
 * The largest single shape change in the game's history.
 *
 * - `Character.upgradedCards: string[]` became
 *   `Character.upgradedCounts: Record<string, number>` — see
 *   {@link migrateUpgradedCards} for the semantics.
 * - The hero gained three equipment slots: `ring2`, `amulet`, `pendant`.
 * - Monsters gained `personalityId`, `bond` and `charm`.
 * - `GameState` gained `seen`, `runId` and `fallenSummary`.
 *
 * `aspectId` is also backfilled here even though it landed mid-version-4
 * (commit `70f6fd1`, release v7): a version-4 save may be from either side of
 * it, so we probe instead of trusting the number. This is the concrete case
 * that the module docblock warns about.
 */
export const step4to5: MigrationStep = {
  from: 4,
  to: 5,
  note: 'The smith learned to count copies, and every beast found a temperament.',
  apply(state) {
    const player = playerOf(state);
    if (player) {
      migrateUpgradedCards(player);
      ensureHeroEquipment(player);
    }
    for (const m of monstersOf(state)) {
      // Landed at v7, still under SAVE_VERSION 4 — probe, never assume.
      if (m.aspectId === undefined) m.aspectId = null;
      ensurePersonality(m);
      ensureNumber(m, 'bond', 0);
      ensure(m, 'charm', null);
    }
    ensureSeen(state);
    ensureRunId(state);
    ensure(state, 'fallenSummary', null);
    return state;
  },
};

/**
 * `upgradedCards` -> `upgradedCounts`, preserving what the player actually had.
 *
 * Under v3/v4 the smith upgraded a *card type*: `upgradedCards.includes(id)`
 * meant every copy of that card in the deck was upgraded
 * (`cardBattle.ts` @ `8321492`). Under v5+ the smith upgrades *copies*, and
 * `buildDeck` marks a copy upgraded only while its running index is
 * `<= upgradedCounts[id]`.
 *
 * So the faithful mapping is not `1` — that would quietly nerf a deck where
 * the class list holds three copies of a card. It is the number of copies the
 * hero's persistent deck actually contains, computed exactly as the smith
 * computes it today (`game.ts`, `UPGRADE_CARD`): class deck + race cards +
 * the tame card.
 *
 * A card id that no longer exists in the tables yields 0 copies and is
 * dropped. That is the honest outcome — there is no deck slot left to upgrade.
 */
export function migrateUpgradedCards(player: RawSave): void {
  const legacy = player.upgradedCards;
  // Guard the target with isPlainObject, not `typeof === 'object'`: an array
  // would pass the latter and become a count map with no usable keys.
  if (!isPlainObject(player.upgradedCounts)) player.upgradedCounts = {};
  const counts = player.upgradedCounts as Record<string, number>;

  if (Array.isArray(legacy)) {
    const className = player.className as ClassName;
    const race = player.race as RaceName;
    const classDeck = CLASS_DECKS[className] ?? [];
    const raceCards = RACE_CARDS[race] ?? [];
    for (const id of legacy) {
      if (typeof id !== 'string' || counts[id] !== undefined) continue;
      const copies =
        classDeck.filter((c) => c === id).length +
        raceCards.filter((c) => c === id).length +
        (id === TAME_CARD_ID ? 1 : 0);
      if (copies > 0) counts[id] = copies;
    }
  }
  delete player.upgradedCards;

  // Drop anything non-numeric that a hand-edited file may have left behind.
  for (const [id, n] of Object.entries(counts)) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) delete counts[id];
  }
}

/**
 * Guarantee all nine hero equipment keys exist.
 *
 * `ring2`, `amulet` and `pendant` arrived at `172540c`. Absence is benign for
 * stat maths (every reader skips falsy slots) but `Character.equip` reads
 * `this.equipment.ring2` to decide which finger a ring goes on, so a missing
 * key is worth filling rather than relying on `undefined` being falsy.
 */
export function ensureHeroEquipment(player: RawSave): void {
  if (!isPlainObject(player.equipment)) player.equipment = {};
  const eq = player.equipment as RawSave;
  for (const key of ['weapon', 'armor', 'headpiece', 'gloves', 'boots', 'ring', 'ring2', 'amulet', 'pendant']) {
    if (!(key in eq)) eq[key] = null;
  }
}

/**
 * Give a monster a temperament if it predates them.
 *
 * Chosen deterministically from the monster's uid so a given creature keeps
 * the same personality across reloads. We deliberately do **not** re-run
 * `deriveStats()` afterwards: personality growth multipliers can be below 1,
 * and recomputing at load would visibly shave stats off a monster the player
 * raised. The stored stats stand; the engine reconciles them on the next
 * level-up. See the "known gaps" note in the test file.
 */
export function ensurePersonality(monster: RawSave): void {
  if (typeof monster.personalityId === 'string' && monster.personalityId) return;
  const uid = typeof monster.uid === 'string' ? monster.uid : String(monster.speciesId ?? 'beast');
  monster.personalityId = rollPersonality(hashString(uid)).id;
}

/** Town badge bookkeeping. Both sub-keys, not just the object — see below. */
export function ensureSeen(state: RawSave): void {
  if (!isPlainObject(state.seen)) state.seen = {};
  const seen = state.seen as RawSave;
  // Defaulting only the object is not enough: game.ts does
  // `Math.max(seen.tavernChapter, state.storyChapter)`, and Math.max with an
  // undefined operand yields NaN, which then persists into the next save.
  ensureNumber(seen, 'questCount', 0);
  ensureNumber(seen, 'tavernChapter', 0);
}

/**
 * Give the run a unique id.
 *
 * This one is not cosmetic. `bankFall` in `platform/tellings.ts` guards
 * against React StrictMode double-invocation with
 * `meta.lastBankedRun === runId`. With `runId` undefined it writes
 * `lastBankedRun: undefined`, `JSON.stringify` drops the key entirely, and the
 * comparison never matches again — so the player's death banks Verses twice
 * and writes a duplicate epitaph into the Chronicle. A migrated save must
 * carry a real, unique id.
 */
export function ensureRunId(state: RawSave): void {
  if (typeof state.runId === 'string' && state.runId) return;
  state.runId = `run-migrated-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
}

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

/** Ordered, contiguous. Index into this by `from`. */
export const MIGRATIONS: MigrationStep[] = [step3to4, step4to5];

export interface MigrationOutcome {
  state: RawSave;
  /** Human-readable notes, oldest step first. Empty if nothing was migrated. */
  notes: string[];
}

/**
 * Walk `state` from `fromVersion` up to `toVersion`, one step at a time.
 *
 * Throws only if the chain is broken (a missing step), which is a programming
 * error rather than a bad save; callers treat it as an unreadable save.
 */
export function migrateSaveState(state: RawSave, fromVersion: number, toVersion: number): MigrationOutcome {
  const notes: string[] = [];
  let current = state;
  let version = fromVersion;
  while (version < toVersion) {
    const step = MIGRATIONS.find((s) => s.from === version);
    if (!step) throw new Error(`No migration step from save version ${version}.`);
    current = step.apply(current);
    notes.push(step.note);
    version = step.to;
  }
  return { state: current, notes };
}

// ---------------------------------------------------------------------------
// The always-run normalizer
// ---------------------------------------------------------------------------

/**
 * Backfill every field whose absence crashes or corrupts the game, regardless
 * of what the save's version number claims.
 *
 * This runs on **every** load, including a save written by this exact build,
 * and it is the counterpart to the version chain rather than a duplicate of
 * it. Two reasons it has to exist:
 *
 * 1. Fields were added at `70f6fd1`, `9f23bac`, `8e675ce` and `89db3cc`
 *    without a version bump. No version-keyed step can catch those, because
 *    the saves on both sides of each change report the same number.
 * 2. Saves are `JSON.parse`'d untrusted input. A file truncated by a full disk
 *    or edited by hand can be missing anything at all while still reporting
 *    the current version, and the chain would never touch it.
 *
 * Idempotent and total: it never throws, and it only fills gaps.
 */
export function normalizeSaveState(state: RawSave): RawSave {
  // --- GameState scalars and collections -----------------------------------
  ensure(state, 'pendingMerchant', null);
  ensure(state, 'fallenSummary', null);
  ensure(state, 'selectedMonsterUid', null); // 9f23bac / v9, no version bump
  ensure(state, 'world', null);
  ensure(state, 'expedition', null);
  // -99 means "the blessing was never used"; 8e675ce / v13, no version bump.
  ensureNumber(state, 'blessingChapter', -99);
  ensureNumber(state, 'storyChapter', -1);
  for (const key of ['expeditionExtras', 'orbs', 'defeatedBosses', 'questLog', 'gearStock', 'log', 'party', 'stable']) {
    ensureArray(state, key);
  }
  ensureSeen(state);
  ensureRunId(state);

  if (!isPlainObject(state.chronicle)) state.chronicle = {};
  const chronicle = state.chronicle as RawSave;
  for (const key of ['beastsSlain', 'artifactsFound', 'deeds']) ensureArray(chronicle, key);

  // --- Hero ----------------------------------------------------------------
  const player = playerOf(state);
  if (player) {
    migrateUpgradedCards(player); // also repairs a hand-edited count map
    ensureHeroEquipment(player);
    for (const key of ['knownSkills', 'items', 'inventory', 'statusEffects', 'activeMods']) ensureArray(player, key);
    if (!isPlainObject(player.stats)) player.stats = {};
    if (typeof player.defending !== 'boolean') player.defending = false;
    ensureNumber(player, 'level', 1);
    ensureNumber(player, 'exp', 0);
    ensureNumber(player, 'gold', 0);
    ensureNumber(player, 'attributePoints', 0);
  }

  // --- Monsters ------------------------------------------------------------
  for (const m of monstersOf(state)) {
    if (m.aspectId === undefined) m.aspectId = null; // 70f6fd1 / v7
    ensurePersonality(m); // 172540c / v8
    ensure(m, 'charm', null); // 172540c / v8
    ensure(m, 'trinket', null); // 9f23bac / v9, no version bump
    // `bond` must be a real number: cardBattle does `m.bond++`, and
    // `undefined++` is NaN, which JSON-serializes to null and silently resets
    // the bond to 1 on the following load.
    ensureNumber(m, 'bond', 0);
    ensureNumber(m, 'tameBonus', 0);
    ensureNumber(m, 'exp', 0);
    ensureNumber(m, 'plus', 0);
    if (typeof m.defending !== 'boolean') m.defending = false;
    if (typeof m.isTamed !== 'boolean') m.isTamed = false;
    if (typeof m.isBoss !== 'boolean') m.isBoss = false;
    if (typeof m.customSkills !== 'boolean') m.customSkills = false;
    for (const key of ['knownSkills', 'statusEffects', 'activeMods']) ensureArray(m, key);
    if (!isPlainObject(m.stats)) m.stats = {};
    if (!isPlainObject(m.bonusStats)) m.bonusStats = { STR: 0, DEF: 0, DEX: 0, MANA: 0, MAGDEF: 0, INT: 0, LUCK: 0 };
  }

  // --- Expedition ----------------------------------------------------------
  const exp = isPlainObject(state.expedition) ? state.expedition : null;
  if (exp) {
    for (const key of ['opened', 'broken', 'units']) ensureArray(exp, key);
    // 89db3cc / v16 Lantern fog-of-war, no version bump. cloneCore spreads
    // this on every action, so a missing array throws on the next keypress.
    ensureArray(exp, 'revealed');
    ensureNumber(exp, 'movLeft', 0);
    ensureNumber(exp, 'floorIndex', 0);
    if (typeof exp.minibossDown !== 'boolean') exp.minibossDown = false;
  }

  return state;
}
