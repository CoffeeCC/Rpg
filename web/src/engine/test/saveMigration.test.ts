/**
 * Save migration tests.
 *
 * ## How the fixtures are built
 *
 * Rather than hand-writing JSON that *looks* like an old save, each fixture is
 * produced by playing a real game through the reducer, serializing it, and
 * then **down-converting** the result to a historical shape by deleting
 * exactly the fields that `git log -p` proves did not exist yet.
 *
 * That direction is deliberate. A hand-written fixture only tests the fields
 * its author remembered; a down-converted one starts from everything the
 * engine actually writes today, so it keeps the realistic bulk (world,
 * chronicle, quest log, generated floors, real items with affixes) and the
 * deletions are the part that has to be justified from history.
 *
 * Provenance for every deletion, from `git log -p -- web/src/engine`:
 *
 * - `8321492` v5  — SAVE_VERSION 3. `Expedition` was `{gateId, floorIndex, x,
 *   y, opened}`. `Character` had `upgradedCards: string[]` and six equipment
 *   slots. Monsters had no `aspectId`/`personalityId`/`bond`/`charm`/`trinket`.
 *   `GameState` had no `pendingMerchant`/`seen`/`runId`/`fallenSummary`/
 *   `selectedMonsterUid`/`blessingChapter`.
 * - `ef4d381` v6  — SAVE_VERSION 3->4. Added `pendingMerchant` and the
 *   tactical `Expedition` fields `broken`/`units`/`movLeft`/`minibossDown`.
 * - `70f6fd1` v7  — still SAVE_VERSION 4. Added `MonsterInstance.aspectId`.
 * - `172540c` v8  — SAVE_VERSION 4->5. `upgradedCards` -> `upgradedCounts`,
 *   equipment `ring2`/`amulet`/`pendant`, monster `personalityId`/`bond`/
 *   `charm`, state `seen`/`runId`/`fallenSummary`.
 * - `9f23bac` v9  — still SAVE_VERSION 5. Added `trinket`, `selectedMonsterUid`.
 * - `8e675ce` v13 — still SAVE_VERSION 5. Added `blessingChapter`.
 * - `89db3cc` v16 — still SAVE_VERSION 5. Added `Expedition.revealed`.
 *
 * ## Known gaps, stated rather than hidden
 *
 * - A migrated monster keeps its stored `stats`. Backfilling `personalityId`
 *   introduces growth multipliers that `deriveStats()` would apply, and some
 *   are below 1, so recomputing at load would visibly shave stats off a
 *   creature the player raised. We let the engine reconcile on the next
 *   level-up instead. Tested below as an explicit expectation, not an
 *   accident.
 * - `upgradedCards` entries naming cards that no longer exist are dropped;
 *   there is no deck slot left to upgrade.
 */
import { describe, it, expect } from 'vitest';
import { gameReducer, initialGameState, type GameState } from '../game';
import { MonsterInstance } from '../entities/MonsterInstance';
import { Character } from '../entities/Character';
import { SPECIES } from '../data/species';
import { CLASS_DECKS, RACE_CARDS, TAME_CARD_ID } from '../data/cards';
import { buildDeck } from '../systems/cardBattle';
import { serializeGameState, deserializeGameState, readSaveData, SaveLoadError, SAVE_VERSION, MIN_SUPPORTED_VERSION } from '../systems/saveGame';
import { MIGRATIONS, migrateSaveState, normalizeSaveState, isPlainObject, type RawSave } from '../systems/saveMigrations';

// ---------------------------------------------------------------------------
// A realistic run, then down-converters to each historical shape
// ---------------------------------------------------------------------------

/** A hero in town with a tamed beast, a stabled beast, and some history. */
function realRun(): GameState {
  let state = gameReducer(initialGameState(), { type: 'CREATE_CHARACTER', name: 'Aria', race: 'Human', className: 'Warrior' });
  state = gameReducer(state, { type: 'STORY_CONTINUE' });
  const speciesIds = Object.keys(SPECIES);
  const companion = new MonsterInstance({ speciesId: speciesIds[0], level: 6 });
  companion.isTamed = true;
  companion.bond = 4;
  state.party.push(companion);
  const stabled = new MonsterInstance({ speciesId: speciesIds[1], level: 3 });
  stabled.isTamed = true;
  state.stable.push(stabled);
  state.chronicle.artifactsFound.push('artifact-0');
  state.chronicle.beastsSlain.push(speciesIds[2]);
  state.player!.gold = 240;
  state.player!.level = 7;
  return state;
}

/** The same run, standing on a dungeon floor. */
function realRunOnFloor(): GameState {
  let state = realRun();
  state = gameReducer(state, { type: 'GOTO', screen: 'gateSelect' });
  state = gameReducer(state, { type: 'ENTER_GATE', gateId: 'verdant' });
  return state;
}

function snapshot(state: GameState): RawSave {
  const data = serializeGameState(state);
  expect(data).not.toBeNull();
  return JSON.parse(JSON.stringify(data!.state)) as RawSave;
}

function monstersOf(state: RawSave): RawSave[] {
  return [...(state.party as RawSave[]), ...(state.stable as RawSave[])];
}

/**
 * Down-convert a current snapshot to the version-3 shape of `8321492`.
 *
 * `upgradedCards` is populated with a real card from the Warrior deck so the
 * rename has something to carry.
 */
function toV3(state: RawSave): RawSave {
  const player = state.player as RawSave;

  // 172540c: upgradedCounts did not exist; upgradedCards did.
  delete player.upgradedCounts;
  player.upgradedCards = [CLASS_DECKS.Warrior[0], TAME_CARD_ID, 'aCardThatNoLongerExists'];

  // 172540c: the hero had six slots, not nine.
  const eq = player.equipment as RawSave;
  delete eq.ring2;
  delete eq.amulet;
  delete eq.pendant;

  for (const m of monstersOf(state)) {
    delete m.aspectId; // 70f6fd1
    delete m.personalityId; // 172540c
    delete m.bond; // 172540c
    delete m.charm; // 172540c
    delete m.trinket; // 9f23bac
  }

  delete state.pendingMerchant; // ef4d381
  delete state.seen; // 172540c
  delete state.runId; // 172540c
  delete state.fallenSummary; // 172540c
  delete state.selectedMonsterUid; // 9f23bac
  delete state.blessingChapter; // 8e675ce

  const exp = isPlainObject(state.expedition) ? state.expedition : null;
  if (exp) {
    // 8321492: Expedition was {gateId, floorIndex, x, y, opened} and no more.
    delete exp.broken; // ef4d381
    delete exp.units; // ef4d381
    delete exp.movLeft; // ef4d381
    delete exp.minibossDown; // ef4d381
    delete exp.revealed; // 89db3cc
  }
  return state;
}

/** Down-convert to version 4 as of `ef4d381` — i.e. before v7 added aspectId. */
function toV4(state: RawSave): RawSave {
  const v3 = toV3(state);
  // ef4d381 restored these four relative to v3.
  const exp = isPlainObject(v3.expedition) ? v3.expedition : null;
  if (exp) {
    exp.broken = [];
    exp.units = [];
    exp.movLeft = 0;
    exp.minibossDown = false;
  }
  v3.pendingMerchant = null;
  return v3;
}

function wrap(version: number, state: RawSave) {
  return { version, savedAt: new Date().toISOString(), state };
}

// ---------------------------------------------------------------------------
// The headline test: a real v3 save, walked all the way forward, playable
// ---------------------------------------------------------------------------

describe('save migration: a version-3 save is carried forward and is playable', () => {
  it('walks a real v3 town save to the current version and keeps the run intact', () => {
    const original = realRun();
    const save = wrap(3, toV3(snapshot(original)));

    const result = readSaveData(save);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(3);
    expect(result.notes.length).toBe(2); // 3->4 and 4->5

    const state = result.state;

    // --- the run itself survived, not just its shape ---
    expect(state.player).toBeInstanceOf(Character);
    expect(state.player!.name).toBe('Aria');
    expect(state.player!.gold).toBe(240);
    expect(state.player!.level).toBe(7);
    expect(state.world?.name).toBe(original.world?.name);
    expect(state.chronicle.artifactsFound).toContain('artifact-0');
    expect(state.party).toHaveLength(1);
    expect(state.stable).toHaveLength(1);
    expect(state.party[0]).toBeInstanceOf(MonsterInstance);

    // --- methods work on revived instances (the prototype really was attached) ---
    expect(state.party[0].isAlive()).toBe(true);
    expect(state.party[0].displayName()).toBeTruthy();
    expect(state.player!.isAlive()).toBe(true);
    expect(state.player!.getAttack()).toBeGreaterThan(0);

    // --- and it is genuinely playable: the reducer runs without throwing ---
    // This is the real assertion. GameState.seen is read unguarded by the town
    // screen and cloneCore touches half a dozen migrated fields on EVERY
    // action, so a missed backfill surfaces here.
    let played: GameState = state;
    expect(() => {
      played = gameReducer(played, { type: 'REST' });
      played = gameReducer(played, { type: 'GOTO', screen: 'stable' });
      played = gameReducer(played, { type: 'GOTO', screen: 'town' });
    }).not.toThrow();
    expect(played.player!.hp).toBe(played.player!.maxHp);

    // --- a battle can be built from the migrated hero ---
    expect(() => buildDeck(played.player!, played.party, played.expeditionExtras)).not.toThrow();
  });

  it('walks a real v3 save taken mid-dungeon, and the map still advances', () => {
    const save = wrap(3, toV3(snapshot(realRunOnFloor())));
    const result = readSaveData(save);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const exp = result.state.expedition!;
    // ef4d381 fields
    expect(Array.isArray(exp.broken)).toBe(true);
    expect(Array.isArray(exp.units)).toBe(true);
    expect(typeof exp.movLeft).toBe('number');
    expect(exp.minibossDown).toBe(false);
    // 89db3cc field — cloneCore spreads this on every single action
    expect(Array.isArray(exp.revealed)).toBe(true);

    // cloneCore + revealLantern run on every dispatch when an expedition
    // exists; without the backfills this throws on the first keypress.
    expect(() => gameReducer(result.state, { type: 'END_MAP_TURN' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Individual steps, each proven on its own
// ---------------------------------------------------------------------------

describe('migration steps are individually correct', () => {
  it('the chain is ordered and contiguous from the floor to the current version', () => {
    let version = MIN_SUPPORTED_VERSION;
    for (const step of MIGRATIONS) {
      expect(step.from).toBe(version);
      expect(step.to).toBe(version + 1);
      version = step.to;
    }
    expect(version).toBe(SAVE_VERSION);
  });

  it('3->4 restores the tactical expedition fields and pendingMerchant', () => {
    const raw = toV3(snapshot(realRunOnFloor()));
    const exp = raw.expedition as RawSave;
    expect(exp.broken).toBeUndefined();

    const { state, notes } = migrateSaveState(raw, 3, 4);
    expect(notes).toHaveLength(1);
    const after = state.expedition as RawSave;
    expect(after.broken).toEqual([]);
    expect(after.units).toEqual([]);
    expect(after.movLeft).toBe(0);
    expect(after.minibossDown).toBe(false);
    expect(state.pendingMerchant).toBeNull();
    // Not this step's job — proves the steps are actually separable.
    expect((state.player as RawSave).upgradedCounts).toBeUndefined();
  });

  it('4->5 renames upgradedCards to per-copy counts, preserving what the player had', () => {
    const raw = toV4(snapshot(realRun()));
    const upgradedId = CLASS_DECKS.Warrior[0];
    const copiesInDeck =
      CLASS_DECKS.Warrior.filter((c) => c === upgradedId).length + RACE_CARDS.Human.filter((c) => c === upgradedId).length;

    const { state } = migrateSaveState(raw, 4, 5);
    const counts = (state.player as RawSave).upgradedCounts as Record<string, number>;

    // The v3 semantic was "every copy of this card is upgraded", so the count
    // must be the number of copies the deck holds — not a flat 1.
    expect(counts[upgradedId]).toBe(copiesInDeck);
    expect(copiesInDeck).toBeGreaterThan(0);
    expect(counts[TAME_CARD_ID]).toBe(1);
    // A card that no longer exists has no deck slot left to upgrade.
    expect(counts.aCardThatNoLongerExists).toBeUndefined();
    expect((state.player as RawSave).upgradedCards).toBeUndefined();
  });

  it('4->5 gives the hero the three new equipment slots', () => {
    const { state } = migrateSaveState(toV4(snapshot(realRun())), 4, 5);
    const eq = (state.player as RawSave).equipment as RawSave;
    for (const key of ['ring2', 'amulet', 'pendant']) {
      expect(key in eq).toBe(true);
      expect(eq[key]).toBeNull();
    }
    // Pre-existing gear was not clobbered.
    expect(eq.weapon).not.toBeNull();
  });

  it('4->5 gives every monster a temperament, deterministically', () => {
    const raw = toV4(snapshot(realRun()));
    const first = migrateSaveState(JSON.parse(JSON.stringify(raw)), 4, 5).state;
    const second = migrateSaveState(JSON.parse(JSON.stringify(raw)), 4, 5).state;

    for (const m of monstersOf(first)) {
      expect(typeof m.personalityId).toBe('string');
      expect(m.personalityId).toBeTruthy();
      expect(m.bond).toBe(0);
      expect(m.charm).toBeNull();
      expect(m.aspectId).toBeNull(); // 70f6fd1 landed mid-v4: probed, not assumed
    }
    // Same save migrated twice must yield the same creature, not a reroll.
    expect(monstersOf(second).map((m) => m.personalityId)).toEqual(monstersOf(first).map((m) => m.personalityId));
  });

  it('4->5 gives the state a real runId, so death does not bank Verses twice', () => {
    // bankFall guards StrictMode double-invocation with lastBankedRun ===
    // runId. An undefined runId is dropped by JSON.stringify, the guard never
    // matches, and the player's Verses are banked twice.
    const { state } = migrateSaveState(toV4(snapshot(realRun())), 4, 5);
    expect(typeof state.runId).toBe('string');
    expect((state.runId as string).length).toBeGreaterThan(0);
    const seen = state.seen as RawSave;
    expect(seen.questCount).toBe(0);
    expect(seen.tavernChapter).toBe(0);
  });

  it('every step is idempotent — running it twice changes nothing', () => {
    for (const step of MIGRATIONS) {
      const base = step.from === 3 ? toV3(snapshot(realRunOnFloor())) : toV4(snapshot(realRunOnFloor()));
      const once = step.apply(JSON.parse(JSON.stringify(base)));
      const twice = step.apply(step.apply(JSON.parse(JSON.stringify(base))));
      // runId is generated, so compare everything else.
      delete (once as RawSave).runId;
      delete (twice as RawSave).runId;
      expect(twice).toEqual(once);
    }
  });
});

// ---------------------------------------------------------------------------
// The normalizer: drift that no version number can describe
// ---------------------------------------------------------------------------

describe('normalizeSaveState covers fields added without a version bump', () => {
  it('restores trinket, selectedMonsterUid, blessingChapter and revealed on a v5 save', () => {
    // A genuine pre-v16 "version 5" save: the number says current, the shape
    // is four commits behind. Only a probe can catch this.
    const raw = snapshot(realRunOnFloor());
    for (const m of monstersOf(raw)) delete m.trinket; // 9f23bac
    delete raw.selectedMonsterUid; // 9f23bac
    delete raw.blessingChapter; // 8e675ce
    delete (raw.expedition as RawSave).revealed; // 89db3cc

    const result = readSaveData(wrap(5, raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No version step ran — the save already claimed the current version.
    expect(result.migratedFrom).toBeNull();
    expect(result.notes).toEqual([]);

    expect(result.state.blessingChapter).toBe(-99);
    expect(result.state.selectedMonsterUid).toBeNull();
    expect(Array.isArray(result.state.expedition!.revealed)).toBe(true);
    for (const m of [...result.state.party, ...result.state.stable]) expect(m.trinket).toBeNull();
    expect(() => gameReducer(result.state, { type: 'END_MAP_TURN' })).not.toThrow();
  });

  it('repairs a truncated save at the current version', () => {
    const raw = snapshot(realRun());
    // Simulate a file cut short / hand-edited: collections gone entirely.
    delete raw.questLog;
    delete raw.gearStock;
    delete raw.orbs;
    delete raw.seen;
    delete (raw.chronicle as RawSave).deeds;
    delete (raw.player as RawSave).inventory;

    const result = readSaveData(wrap(5, raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.questLog).toEqual([]);
    expect(result.state.orbs).toEqual([]);
    expect(result.state.seen).toEqual({ questCount: 0, tavernChapter: 0 });
    expect(result.state.chronicle.deeds).toEqual([]);
    expect(result.state.player!.inventory).toEqual([]);
    expect(() => gameReducer(result.state, { type: 'REST' })).not.toThrow();
  });

  it('does not mistake a legacy upgradedCards array for a count map', () => {
    // typeof [] === 'object', so the old guard would have accepted an array
    // as the count map and every lookup would silently return undefined.
    const state = normalizeSaveState({ player: { name: 'x', className: 'Warrior', race: 'Human', upgradedCounts: [] } } as RawSave);
    const counts = (state.player as RawSave).upgradedCounts;
    expect(Array.isArray(counts)).toBe(false);
    expect(counts).toEqual({});
  });

  it('coerces a NaN-poisoned bond back to a number', () => {
    // cardBattle does `m.bond++`; on undefined that is NaN, which serializes
    // to null and silently resets the bond to 1 on the following load.
    const state = normalizeSaveState({ party: [{ uid: 'a', speciesId: 's', bond: null }], stable: [] } as unknown as RawSave);
    expect((state.party as RawSave[])[0].bond).toBe(0);
  });

  it('is idempotent', () => {
    const base = toV3(snapshot(realRunOnFloor()));
    const once = normalizeSaveState(JSON.parse(JSON.stringify(base)));
    const twice = normalizeSaveState(normalizeSaveState(JSON.parse(JSON.stringify(base))));
    delete (once as RawSave).runId;
    delete (twice as RawSave).runId;
    expect(twice).toEqual(once);
  });
});

// ---------------------------------------------------------------------------
// Failure modes — all graceful, none of them a raw exception on screen
// ---------------------------------------------------------------------------

describe('unreadable saves fail gracefully and in voice', () => {
  it('refuses a save from a LATER version instead of misreading it', () => {
    // Real case: the PWA serves a stale cached bundle while localStorage
    // already holds a save written by the newer one.
    const result = readSaveData(wrap(SAVE_VERSION + 3, snapshot(realRun())));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/later age/);
    expect(result.message).toMatch(/[Rr]eload/);
  });

  it('refuses a version below the supported floor', () => {
    const result = readSaveData(wrap(2, snapshot(realRun())));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/older age/);
  });

  it('rejects things that are not saves at all, without throwing', () => {
    for (const junk of [null, undefined, 42, 'a string', [], {}, { version: 'five' }, { version: NaN }]) {
      const result = readSaveData(junk);
      expect(result.ok).toBe(false);
    }
  });

  it('refuses a save with no hero, phrasing the refusal by age', () => {
    const old = readSaveData(wrap(3, {} as RawSave));
    expect(old.ok).toBe(false);
    if (!old.ok) expect(old.message).toMatch(/older age/);

    const current = readSaveData(wrap(SAVE_VERSION, {} as RawSave));
    expect(current.ok).toBe(false);
    if (!current.ok) expect(current.message).toMatch(/damaged/);
  });

  it('never leaks a raw JS error to the player', () => {
    // A hero that exists but whose party is a hostile shape.
    const result = readSaveData(wrap(5, { player: { name: 'Aria' }, party: 'not an array' } as unknown as RawSave));
    if (!result.ok) {
      expect(result.message).not.toMatch(/undefined|TypeError|Cannot read/);
    }
  });

  it('deserializeGameState throws only SaveLoadError, with a player-facing message', () => {
    try {
      deserializeGameState({ version: 99, savedAt: '', state: {} });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SaveLoadError);
      expect((err as Error).message).toMatch(/later age/);
    }
  });

  it('does not mutate the caller’s save object', () => {
    // localStorage-backed objects are re-read for slot summaries; migrating
    // must not rewrite them in place.
    const save = wrap(3, toV3(snapshot(realRun())));
    const before = JSON.stringify(save);
    readSaveData(save);
    expect(JSON.stringify(save)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// The round trip still holds
// ---------------------------------------------------------------------------

describe('current-version saves are untouched by any of this', () => {
  it('round-trips a current save and can immediately re-save it', () => {
    const state = realRun();
    const restored = deserializeGameState(serializeGameState(state)!);
    expect(restored.player!.name).toBe('Aria');
    expect(restored.party[0]).toBeInstanceOf(MonsterInstance);
    // The companion's bond was 4 before saving and must not be reset to 0 by
    // the normalizer's default.
    expect(restored.party[0].bond).toBe(4);
    const again = serializeGameState(restored);
    expect(again).not.toBeNull();
    expect(again!.version).toBe(SAVE_VERSION);
  });

  it('a migrated v3 save can be saved again as a current save', () => {
    const result = readSaveData(wrap(3, toV3(snapshot(realRun()))));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const resaved = serializeGameState(result.state);
    expect(resaved).not.toBeNull();
    expect(resaved!.version).toBe(SAVE_VERSION);
    // And it reads back as a current save with nothing left to migrate.
    const round = readSaveData(resaved!);
    expect(round.ok).toBe(true);
    if (round.ok) expect(round.migratedFrom).toBeNull();
  });
});
