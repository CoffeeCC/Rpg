import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SmithScreen } from '../../components/SmithScreen';
import { GearScreen } from '../../components/GearScreen';
import { EVENTS } from '../data/events';
import { GATES } from '../data/gates';
import { MonsterInstance } from '../entities/MonsterInstance';
import { startBattle, playCard, endTurn } from '../systems/cardBattle';
import type { CardDef, SpawnTable } from '../types';
import { GEAR_SETS, figureForSet, setAttribution, setCardIds, setOfItem, setStandings, wearableMax } from '../data/sets';
import { UNIQUES } from '../data/uniques';
import { ITEM_TYPES } from '../data/items';
import { CARDS, getCard } from '../data/cards';
import { eligibleUniqueIds, forgeUnique, generateItem } from '../systems/lootGen';
import { generateWorld } from '../systems/worldgen';
import { Character } from '../entities/Character';
import { gameReducer, initialGameState, recastCandidates, recastCost, type GameState } from '../game';
import {
  MAX_VAULT_SLOTS,
  VAULT_SLOT_COSTS,
  buyVaultSlot,
  canLift,
  depositToVault,
  loadTellings,
  nextVaultSlotCost,
  vaultKeepOnTriumph,
  vaultRejection,
  withdrawFromVault,
} from '../../platform/tellings';
import type { ItemV2 } from '../types';

// ---------------------------------------------------------------------------
// Gear sets and Grude's back wall.
//
// The load-bearing test in this file is the OBTAINABILITY block. Everdusk has
// been bitten before by a chase goal gated behind something the game could not
// actually produce (three species existed in the data and were never spawned by
// any floor, quietly making a completion counter unreachable forever). A set
// piece that no drop can roll, or a set bonus naming a card id that no longer
// exists, would be exactly the same bug wearing different clothes — and the
// second one would be SILENT, because buildDeck filters unknown card ids out
// without complaining.
// ---------------------------------------------------------------------------

// The Tellings book lives in localStorage and this suite runs under node,
// where there is none. tellings.ts swallows that in a try/catch and degrades to
// a fresh book on every call — which would make every persistence assertion
// below vacuously true. Same in-memory shim the Next Draft suite uses.
const KEY = 'everdusk.tellings.v1';

function installStorage() {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = store;
  return map;
}

let raw: Map<string, string>;

beforeEach(() => {
  raw = installStorage();
});

/** Write a book straight into storage, bypassing the guarded setters. */
function seedBook(patch: Record<string, unknown>) {
  raw.set(KEY, JSON.stringify(patch));
}

/** Build a real Legendary for a given unique id, as a drop would. */
function pieceOf(uniqueId: string): ItemV2 {
  const item = forgeUnique(uniqueId, 20);
  if (!item) throw new Error(`no unique named ${uniqueId}`);
  return item;
}

describe('gear sets: obtainability (the failure mode this codebase has had before)', () => {
  it('every set member names a unique that actually exists in UNIQUES', () => {
    for (const set of GEAR_SETS) {
      for (const id of set.members) {
        const def = UNIQUES.find((u) => u.id === id);
        expect(def, `set ${set.id} names missing unique "${id}"`).toBeDefined();
      }
    }
  });

  it('every set piece can actually be forged into an item', () => {
    for (const set of GEAR_SETS) {
      for (const id of set.members) {
        const item = forgeUnique(id, 25);
        expect(item, `unique ${id} could not be materialized`).not.toBeNull();
        expect(item!.rarity).toBe('Legendary');
        expect(item!.uniqueId).toBe(id);
      }
    }
  });

  it('every set piece is reachable by a real Legendary drop at a level the game reaches', () => {
    // buildLegendary's window is `minIlvl <= ilvl + 2`. ilvl 30 is comfortably
    // past anything a run produces, so a piece missing from this pool could
    // never drop at all.
    const reachable = new Set(eligibleUniqueIds(30));
    for (const set of GEAR_SETS) {
      for (const id of set.members) {
        expect(reachable.has(id), `set piece ${id} can never drop`).toBe(true);
      }
    }
  });

  it('no set piece is gated so deep that a normal run could never see it', () => {
    // Gate chests roll at roughly player level + levelBonus + 1. A piece whose
    // minIlvl sat above the whole game's reach would be data-only.
    for (const set of GEAR_SETS) {
      for (const id of set.members) {
        const def = UNIQUES.find((u) => u.id === id)!;
        expect(def.minIlvl, `${id} minIlvl`).toBeLessThanOrEqual(20);
        expect(def.minIlvl, `${id} minIlvl`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('every card a set bonus grants exists in CARDS', () => {
    // This is the silent one. buildDeck() drops unknown ids on the floor, so a
    // typo here would cost the player their whole set bonus with no error
    // anywhere — the set would simply do nothing.
    for (const set of GEAR_SETS) {
      for (const bonus of set.bonuses) {
        expect(bonus.cards.length, `${set.id} @${bonus.pieces} grants nothing`).toBeGreaterThan(0);
        for (const cardId of bonus.cards) {
          expect(getCard(cardId), `set ${set.id} @${bonus.pieces} grants unknown card "${cardId}"`).toBeDefined();
          expect(CARDS[cardId].id).toBe(cardId);
        }
      }
    }
  });

  it('a Legendary roll biased toward a set can produce every piece of it', () => {
    // Affinity must not be able to lock a piece OUT. Roll a lot of biased
    // Legendaries and confirm the whole Duskbound Vigil shows up.
    const vigil = GEAR_SETS.find((s) => s.id === 'duskbound-vigil')!;
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      // bias 3 + high luck floors the rarity roll into Legendary territory.
      const item = generateItem(24, 40, 9, vigil.members);
      if (item.uniqueId) seen.add(item.uniqueId);
    }
    for (const id of vigil.members) {
      expect(seen.has(id), `affinity never produced ${id}`).toBe(true);
    }
  });
});

describe('gear sets: shape', () => {
  it('set ids and names are unique', () => {
    expect(new Set(GEAR_SETS.map((s) => s.id)).size).toBe(GEAR_SETS.length);
    expect(new Set(GEAR_SETS.map((s) => s.name)).size).toBe(GEAR_SETS.length);
  });

  it('no unique belongs to two sets at once', () => {
    const seen = new Set<string>();
    for (const set of GEAR_SETS) {
      for (const id of set.members) {
        expect(seen.has(id), `${id} is in more than one set`).toBe(false);
        seen.add(id);
      }
    }
  });

  it('every threshold is reachable — no bonus needs more pieces than can be worn', () => {
    // The Vigil names six pieces but two are weapons, so its ceiling is five.
    // A 6-piece threshold on it would be a promise the slot count cannot keep.
    for (const set of GEAR_SETS) {
      const max = wearableMax(set);
      for (const bonus of set.bonuses) {
        expect(bonus.pieces, `${set.id} @${bonus.pieces} exceeds its wearable max ${max}`).toBeLessThanOrEqual(max);
        expect(bonus.pieces).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('thresholds ascend and each restates the whole grant', () => {
    for (const set of GEAR_SETS) {
      const sorted = [...set.bonuses].sort((a, b) => a.pieces - b.pieces);
      expect(set.bonuses.map((b) => b.pieces)).toEqual(sorted.map((b) => b.pieces));
      // A higher tier must be a superset of the one below it: the UI shows each
      // threshold as the complete grant at that tier, not as a delta.
      for (let i = 1; i < sorted.length; i++) {
        for (const card of sorted[i - 1].cards) {
          expect(sorted[i].cards, `${set.id} @${sorted[i].pieces} drops ${card}`).toContain(card);
        }
      }
    }
  });

  it("wearableMax counts slots, not members, and rings count twice", () => {
    const vigil = GEAR_SETS.find((s) => s.id === 'duskbound-vigil')!;
    // Six members, but Duskfang and Cinderwake share the weapon slot.
    expect(vigil.members.length).toBe(6);
    expect(wearableMax(vigil)).toBe(5);
  });

  it('every set piece maps to a slot a hero can actually wear', () => {
    // Charms and trinkets are worn by MONSTERS. A set piece in one of those
    // slots could never count toward a threshold.
    for (const set of GEAR_SETS) {
      for (const id of set.members) {
        const def = UNIQUES.find((u) => u.id === id)!;
        const slot = ITEM_TYPES[def.baseType].slot;
        expect(slot, `${id} sits in a monster-only slot`).not.toBe('charm');
        expect(slot, `${id} sits in a monster-only slot`).not.toBe('trinket');
      }
    }
  });
});

describe('gear sets: standings and card grants', () => {
  it('an item outside any set reports no set', () => {
    expect(setOfItem(null)).toBeNull();
    expect(setOfItem({ uid: 'x', uniqueId: 'gooberfang' } as ItemV2)).toBeNull();
  });

  it('grants nothing below the first threshold', () => {
    const worn = [pieceOf('duskfang')];
    expect(setCardIds(worn)).toEqual([]);
    const [standing] = setStandings(worn);
    expect(standing.worn).toBe(1);
    expect(standing.active).toBeNull();
    expect(standing.next!.pieces).toBe(2);
  });

  it('grants the 2-piece bonus at exactly two worn pieces', () => {
    const worn = [pieceOf('duskfang'), pieceOf('duskwardensPlate')];
    expect(setCardIds(worn)).toEqual(['aegisOath']);
  });

  it('escalates to the 4- and 5-piece bonuses', () => {
    const four = [pieceOf('duskfang'), pieceOf('duskwardensPlate'), pieceOf('duskboundVow'), pieceOf('duskfallStriders')];
    expect(setCardIds(four).sort()).toEqual(['aegisOath', 'retribution']);

    const five = [...four, pieceOf('lastLanternChime')];
    expect(setCardIds(five).sort()).toEqual(['adamantBulwark', 'aegisOath', 'retribution']);
  });

  it('two pieces that share a slot cannot both count', () => {
    // Duskfang and Cinderwake are both weapons. Wearing "both" is not a state
    // the equipment model can reach, but the counter must not be fooled by a
    // caller that passes a bag item in as worn.
    const worn = [pieceOf('duskfang'), pieceOf('cinderwake')];
    const [standing] = setStandings(worn);
    // Both are distinct members, so the raw count is 2 — this is why the UI
    // reads against wearableMax and the reducer reads real equipment slots.
    expect(standing.worn).toBe(2);
    expect(standing.max).toBe(5);
  });

  it('duplicates of the same piece count once', () => {
    const worn = [pieceOf('duskfang'), pieceOf('duskfang')];
    expect(setStandings(worn)[0].worn).toBe(1);
    expect(setCardIds(worn)).toEqual([]);
  });

  it('separates worn pieces from bagged ones', () => {
    const standing = setStandings([pieceOf('duskfang')], [pieceOf('duskwardensPlate')])[0];
    expect(standing.worn).toBe(1);
    expect(standing.held).toBe(2);
    expect(standing.bagIds).toEqual(['duskwardensPlate']);
    // A bagged piece grants nothing. You have to wear it.
    expect(standing.active).toBeNull();
  });

  it('a piece that is both worn and bagged is not double-counted', () => {
    const standing = setStandings([pieceOf('duskfang')], [pieceOf('duskfang')])[0];
    expect(standing.held).toBe(1);
    expect(standing.bagIds).toEqual([]);
  });

  it('sets the hero owns nothing of are not reported at all', () => {
    expect(setStandings([], [])).toEqual([]);
    expect(setStandings([pieceOf('duskfang')])).toHaveLength(1);
  });

  it('two active sets both contribute their cards', () => {
    const worn = [
      pieceOf('duskfang'),
      pieceOf('duskwardensPlate'),
      pieceOf('pallbearersHood'),
      pieceOf('quietHands'),
    ];
    const cards = setCardIds(worn).sort();
    expect(cards).toEqual(['aegisOath', 'stolenBreath']);
  });
});

describe('gear sets: attribution to the generated world', () => {
  it('names a figure from this world, deterministically', () => {
    const world = generateWorld(4242);
    for (const set of GEAR_SETS) {
      const figure = figureForSet(world, set);
      expect(figure, `${set.id} got no figure`).not.toBeNull();
      expect(world.figures.some((f) => f.id === figure!.id)).toBe(true);
      // Same world, same set, same answer — there is no stored state behind
      // this, so it must be a pure function of the two.
      expect(figureForSet(world, set)!.id).toBe(figure!.id);
    }
  });

  it('prefers a figure whose role matches the set, when the world generated one', () => {
    const world = generateWorld(99);
    for (const set of GEAR_SETS) {
      const matching = world.figures.filter((f) => f.role === set.figureRole);
      if (matching.length === 0) continue;
      expect(matching.some((f) => f.id === figureForSet(world, set)!.id)).toBe(true);
    }
  });

  it('different worlds attribute the same set to different people', () => {
    const a = generateWorld(1);
    const b = generateWorld(2);
    const set = GEAR_SETS[0];
    // Not a guarantee for every seed pair, but these two must differ or the
    // per-world flavour is not actually per-world.
    expect(setAttribution(a, set)).not.toBe(setAttribution(b, set));
  });

  it('degrades to an empty line rather than throwing when there is no world yet', () => {
    expect(setAttribution(null, GEAR_SETS[0])).toBe('');
    expect(figureForSet(null, GEAR_SETS[0])).toBeNull();
  });

  it('leaves no unfilled {slot} in an attribution', () => {
    const world = generateWorld(7);
    for (const set of GEAR_SETS) {
      expect(setAttribution(world, set)).not.toMatch(/\{\w+\}/);
    }
  });
});

// ---------------------------------------------------------------------------
// The back wall
// ---------------------------------------------------------------------------

describe("Grude's back wall", () => {
  it('starts with no hooks and holds nothing', () => {
    const meta = loadTellings();
    expect(meta.vaultSlots).toBe(0);
    expect(meta.vault).toEqual([]);
    expect(nextVaultSlotCost(meta)).toBe(VAULT_SLOT_COSTS[0]);
  });

  it('a book written before the wall existed still loads', () => {
    // The exact shape the Next Draft wrote, with no vault fields at all.
    seedBook(
      ({ telling: 3, verses: 40, purchased: ['scars'], fallen: [], binding: null, depth: 0 }),
    );
    const meta = loadTellings();
    expect(meta.telling).toBe(3);
    expect(meta.verses).toBe(40);
    expect(meta.vaultSlots).toBe(0);
    expect(meta.vault).toEqual([]);
    expect(meta.lastVaultRun).toBeNull();
  });

  it('drops vault entries that no longer describe an item, freeing the hook', () => {
    seedBook(
      ({ telling: 1, vaultSlots: 2, vault: [{ telling: 1, item: { uid: 'x' } }, null, 'nonsense'] }),
    );
    expect(loadTellings().vault).toEqual([]);
  });

  it('refuses to sell more hooks than exist, at escalating prices', () => {
    seedBook({ telling: 1, verses: 1000 });
    const costs: number[] = [];
    for (let i = 0; i < MAX_VAULT_SLOTS; i++) {
      costs.push(nextVaultSlotCost(loadTellings())!);
      expect(buyVaultSlot()).not.toBeNull();
    }
    expect(costs).toEqual(VAULT_SLOT_COSTS);
    expect(nextVaultSlotCost(loadTellings())).toBeNull();
    expect(buyVaultSlot()).toBeNull();
    expect(loadTellings().vaultSlots).toBe(MAX_VAULT_SLOTS);
  });

  it('will not sell a hook you cannot pay for', () => {
    seedBook({ telling: 1, verses: 0 });
    expect(buyVaultSlot()).toBeNull();
    expect(loadTellings().vaultSlots).toBe(0);
  });

  it('costs verses, and the same verses the Bindings want', () => {
    seedBook({ telling: 1, verses: 30 });
    buyVaultSlot();
    expect(loadTellings().verses).toBe(30 - VAULT_SLOT_COSTS[0]);
  });

  describe('what it will and will not keep', () => {
    beforeEach(() => {
      seedBook({ telling: 4, verses: 500, vaultSlots: 3 });
    });

    it('refuses ordinary steel', () => {
      const rare: ItemV2 = { ...pieceOf('duskfang'), rarity: 'Rare', uniqueId: undefined };
      expect(vaultRejection(loadTellings(), rare)).toMatch(/ordinary steel/i);
      expect(depositToVault(rare)).toBeNull();
    });

    it('keeps a Legendary, and remembers which telling left it', () => {
      const item = pieceOf('duskfang');
      expect(vaultRejection(loadTellings(), item)).toBeNull();
      const meta = depositToVault(item)!;
      expect(meta.vault).toHaveLength(1);
      expect(meta.vault[0].item.uid).toBe(item.uid);
      expect(meta.vault[0].telling).toBe(4);
    });

    it('will not hold two pieces of the same set — the rule that keeps sets earned', () => {
      depositToVault(pieceOf('duskfang'));
      const second = pieceOf('duskwardensPlate');
      expect(vaultRejection(loadTellings(), second)).toMatch(/same kit/i);
      expect(depositToVault(second)).toBeNull();
      expect(loadTellings().vault).toHaveLength(1);
    });

    it('will hold one piece each of DIFFERENT sets', () => {
      expect(depositToVault(pieceOf('duskfang'))).not.toBeNull();
      expect(depositToVault(pieceOf('pallbearersHood'))).not.toBeNull();
      expect(depositToVault(pieceOf('verdictEdge'))).not.toBeNull();
      expect(loadTellings().vault).toHaveLength(3);
    });

    it('will hold non-set Legendaries without complaint', () => {
      expect(depositToVault(pieceOf('gooberfang'))).not.toBeNull();
      expect(depositToVault(pieceOf('mourneblade'))).not.toBeNull();
      expect(loadTellings().vault).toHaveLength(2);
    });

    it('refuses once the wall is full', () => {
      seedBook({ telling: 1, vaultSlots: 1 });
      depositToVault(pieceOf('gooberfang'));
      expect(vaultRejection(loadTellings(), pieceOf('mourneblade'))).toMatch(/full/i);
    });

    it('refuses everything when no hook has been bought', () => {
      seedBook({ telling: 1, vaultSlots: 0 });
      expect(vaultRejection(loadTellings(), pieceOf('gooberfang'))).toMatch(/no place on the wall/i);
    });

    it('depositing the same piece twice is a no-op, not a duplicate', () => {
      const item = pieceOf('duskfang');
      depositToVault(item);
      expect(depositToVault(item)).not.toBeNull();
      expect(loadTellings().vault).toHaveLength(1);
    });
  });

  describe('taking a piece down', () => {
    beforeEach(() => {
      seedBook({ telling: 2, vaultSlots: 2 });
    });

    it('gives the item back and empties the hook — the wall does not reproduce', () => {
      const item = pieceOf('duskfang');
      depositToVault(item);
      const taken = withdrawFromVault(item.uid)!;
      expect(taken.item.uid).toBe(item.uid);
      expect(taken.meta.vault).toHaveLength(0);
      expect(loadTellings().vault).toHaveLength(0);
      // And it is gone for good: a second withdrawal finds nothing.
      expect(withdrawFromVault(item.uid)).toBeNull();
    });

    it('only a hero who can carry it may take it down', () => {
      const item = pieceOf('duskfallStriders'); // minIlvl 18
      expect(item.ilvl).toBeGreaterThanOrEqual(18);
      expect(canLift(item, 1)).toBe(false);
      expect(canLift(item, item.ilvl - 1)).toBe(false);
      expect(canLift(item, item.ilvl)).toBe(true);
      expect(canLift(item, item.ilvl + 5)).toBe(true);
    });
  });

  describe('what a triumph leaves behind', () => {
    beforeEach(() => {
      seedBook({ telling: 5, vaultSlots: 2 });
    });

    it('keeps the best pieces it can, up to the slot count', () => {
      const carried = [pieceOf('gooberfang'), pieceOf('mourneblade'), pieceOf('twigg')];
      const meta = vaultKeepOnTriumph('run-a', carried);
      expect(meta.vault).toHaveLength(2);
      // Highest ilvl first: Mourneblade (20) outranks Twigg (4) and Gooberfang (3).
      expect(meta.vault[0].item.uniqueId).toBe('mourneblade');
    });

    it('still honours one-per-set, so a full set leaves exactly one plate', () => {
      const fullVigil = ['duskfang', 'duskwardensPlate', 'duskboundVow', 'duskfallStriders'].map(pieceOf);
      const meta = vaultKeepOnTriumph('run-b', fullVigil);
      expect(meta.vault).toHaveLength(1);
      expect(setOfItem(meta.vault[0].item)!.id).toBe('duskbound-vigil');
    });

    it('ignores ordinary steel entirely', () => {
      const junk: ItemV2 = { ...pieceOf('duskfang'), rarity: 'Normal', uniqueId: undefined };
      expect(vaultKeepOnTriumph('run-c', [junk]).vault).toHaveLength(0);
    });

    it('is idempotent per run — StrictMode cannot bank a triumph twice', () => {
      const carried = [pieceOf('gooberfang')];
      vaultKeepOnTriumph('run-d', carried);
      const again = vaultKeepOnTriumph('run-d', [pieceOf('mourneblade')]);
      expect(again.vault).toHaveLength(1);
      expect(again.vault[0].item.uniqueId).toBe('gooberfang');
    });

    it('keeps nothing at all when no hook has been bought', () => {
      seedBook({ telling: 1, vaultSlots: 0 });
      expect(vaultKeepOnTriumph('run-e', [pieceOf('mourneblade')]).vault).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Reducer wiring
// ---------------------------------------------------------------------------

function heroAtForge(): GameState {
  let state = gameReducer(initialGameState(), { type: 'CREATE_CHARACTER', name: 'Set', race: 'Human', className: 'Warrior' });
  state = gameReducer(state, { type: 'STORY_CONTINUE' });
  return { ...state, screen: 'smith' };
}

describe('reducer: the wall and the recast', () => {
  it('VAULT_DEPOSIT takes the piece out of the bag', () => {
    const state = heroAtForge();
    const item = pieceOf('duskfang');
    state.player!.addItem(item);
    const after = gameReducer(state, { type: 'VAULT_DEPOSIT', uid: item.uid });
    expect(after.player!.items.some((i) => i.uid === item.uid)).toBe(false);
  });

  it('VAULT_DEPOSIT applied twice does not throw or corrupt the bag', () => {
    // The StrictMode case: same input state, applied twice.
    const state = heroAtForge();
    const item = pieceOf('duskfang');
    state.player!.addItem(item);
    const once = gameReducer(state, { type: 'VAULT_DEPOSIT', uid: item.uid });
    const twice = gameReducer(state, { type: 'VAULT_DEPOSIT', uid: item.uid });
    expect(once.player!.items).toHaveLength(twice.player!.items.length);
  });

  it('VAULT_WITHDRAW puts the piece in the bag exactly once', () => {
    const state = heroAtForge();
    const item = pieceOf('duskfang');
    const after = gameReducer(state, { type: 'VAULT_WITHDRAW', item });
    expect(after.player!.items.filter((i) => i.uid === item.uid)).toHaveLength(1);
    // Re-applying to the RESULT must not add a second copy.
    const again = gameReducer(after, { type: 'VAULT_WITHDRAW', item });
    expect(again.player!.items.filter((i) => i.uid === item.uid)).toHaveLength(1);
  });

  it('the wall is a town service — neither action does anything off the forge screen', () => {
    const state = { ...heroAtForge(), screen: 'floor' as const };
    const item = pieceOf('duskfang');
    expect(gameReducer(state, { type: 'VAULT_WITHDRAW', item }).player!.items).toHaveLength(0);
  });

  it('recastCandidates is empty until a set has been begun', () => {
    const hero = new Character('A', 'Human', 'Warrior');
    expect(recastCandidates(hero)).toEqual([]);
  });

  it('recastCandidates names the missing pieces of a begun set, and only reachable ones', () => {
    const hero = new Character('A', 'Human', 'Warrior');
    hero.level = 10;
    hero.addItem(pieceOf('pallbearersHood'));
    const wanted = recastCandidates(hero);
    expect(wanted).toContain('quietHands'); // minIlvl 9
    expect(wanted).not.toContain('pallbearersHood'); // already held
    // processionalBell is minIlvl 13, past a level-10 hero's window (level + 2).
    expect(wanted).not.toContain('processionalBell');
  });

  it('RECAST_SET_PIECE trades a Legendary and gold for a missing piece', () => {
    const state = heroAtForge();
    state.player!.level = 12;
    state.player!.gold = 99999;
    state.player!.addItem(pieceOf('pallbearersHood'));
    const offering = pieceOf('gooberfang');
    state.player!.addItem(offering);

    const after = gameReducer(state, { type: 'RECAST_SET_PIECE', uid: offering.uid });
    expect(after.player!.items.some((i) => i.uid === offering.uid), 'the offering was consumed').toBe(false);
    const gained = after.player!.items.filter((i) => i.uniqueId && i.uniqueId !== 'pallbearersHood');
    expect(gained).toHaveLength(1);
    // At level 12 the whole rest of the Procession is inside the level+2
    // window, so any of the three missing pieces is a correct outcome.
    expect(['quietHands', 'ringOfTheUncounted', 'processionalBell']).toContain(gained[0].uniqueId);
    expect(after.player!.gold).toBe(99999 - recastCost(state.player!));
  });

  it('RECAST_SET_PIECE refuses without a begun set, and keeps the offering', () => {
    const state = heroAtForge();
    state.player!.gold = 99999;
    const offering = pieceOf('gooberfang');
    state.player!.addItem(offering);
    const after = gameReducer(state, { type: 'RECAST_SET_PIECE', uid: offering.uid });
    expect(after.player!.items.some((i) => i.uid === offering.uid)).toBe(true);
    expect(after.player!.gold).toBe(99999);
  });

  it('RECAST_SET_PIECE refuses ordinary steel as the offering', () => {
    const state = heroAtForge();
    state.player!.level = 12;
    state.player!.gold = 99999;
    state.player!.addItem(pieceOf('pallbearersHood'));
    const junk: ItemV2 = { ...pieceOf('gooberfang'), rarity: 'Rare', uniqueId: undefined };
    state.player!.addItem(junk);
    const after = gameReducer(state, { type: 'RECAST_SET_PIECE', uid: junk.uid });
    expect(after.player!.items.some((i) => i.uid === junk.uid)).toBe(true);
    expect(after.player!.gold).toBe(99999);
  });

  it('cannot be afforded on an empty purse, and takes nothing when it fails', () => {
    const state = heroAtForge();
    state.player!.level = 12;
    state.player!.gold = 0;
    state.player!.addItem(pieceOf('pallbearersHood'));
    const offering = pieceOf('gooberfang');
    state.player!.addItem(offering);
    const after = gameReducer(state, { type: 'RECAST_SET_PIECE', uid: offering.uid });
    expect(after.player!.items.some((i) => i.uid === offering.uid)).toBe(true);
  });
});

describe('set bonuses reach a real battle deck', () => {
  it('worn set pieces put their cards in the deck, and the deck knows them', () => {
    const hero = new Character('B', 'Human', 'Warrior');
    hero.equip(pieceOf('duskfang'));
    hero.equip(pieceOf('duskwardensPlate'));
    const granted = setCardIds(Object.values(hero.equipment));
    expect(granted).toEqual(['aegisOath']);
    // buildDeck silently drops ids it does not recognise, so the only real
    // proof a grant survives is that getCard resolves it.
    for (const id of granted) expect(getCard(id)).toBeDefined();
  });

  it('a hero wearing nothing matched grants no cards', () => {
    const hero = new Character('C', 'Elf', 'Mage');
    expect(setCardIds(Object.values(hero.equipment))).toEqual([]);
  });

  it('END TO END: a worn set puts its card in a REAL battle deck, through the real reducer', () => {
    // The one test that proves the whole feature works rather than proving its
    // parts do. Everything before this asserts against helpers; this drives
    // CREATE_CHARACTER -> ENTER_GATE -> a fight and then reads the draw pile
    // that cardBattle actually built.
    let s: GameState = gameReducer(initialGameState(), { type: 'CREATE_CHARACTER', name: 'V', race: 'Human', className: 'Warrior' });
    s = gameReducer(s, { type: 'STORY_CONTINUE' });
    s.player!.equip(pieceOf('duskfang'));
    s.player!.equip(pieceOf('duskwardensPlate'));
    s = gameReducer(s, { type: 'GOTO', screen: 'gateSelect' });
    s = gameReducer(s, { type: 'ENTER_GATE', gateId: 'verdant' });
    expect(s.expedition, 'the expedition never opened').toBeTruthy();

    const ev = EVENTS.find((e) => e.options.some((o) => o.outcomes.some((x) => x.kind === 'fight')))!;
    const optIdx = ev.options.findIndex((o) => o.outcomes.some((x) => x.kind === 'fight'));
    s = { ...s, pendingEvent: { eventId: ev.id }, screen: 'event' };
    s = gameReducer(s, { type: 'EVENT_CHOICE', optionIndex: optIdx });

    expect(s.battle, 'no battle started').toBeTruthy();
    const inDeck = [...s.battle!.drawPile, ...s.battle!.hand].map((c) => c.cardId);
    expect(inDeck, 'the 2-piece grant never reached the deck').toContain('aegisOath');
  });

  it('END TO END: an unmatched hero gets no free card in the same fight', () => {
    // The control. Without this, the assertion above could be passing because
    // aegisOath happens to be in a Warrior's starting deck.
    let s: GameState = gameReducer(initialGameState(), { type: 'CREATE_CHARACTER', name: 'W', race: 'Human', className: 'Warrior' });
    s = gameReducer(s, { type: 'STORY_CONTINUE' });
    s = gameReducer(s, { type: 'GOTO', screen: 'gateSelect' });
    s = gameReducer(s, { type: 'ENTER_GATE', gateId: 'verdant' });
    const ev = EVENTS.find((e) => e.options.some((o) => o.outcomes.some((x) => x.kind === 'fight')))!;
    const optIdx = ev.options.findIndex((o) => o.outcomes.some((x) => x.kind === 'fight'));
    s = { ...s, pendingEvent: { eventId: ev.id }, screen: 'event' };
    s = gameReducer(s, { type: 'EVENT_CHOICE', optionIndex: optIdx });
    const inDeck = [...s.battle!.drawPile, ...s.battle!.hand].map((c) => c.cardId);
    expect(inDeck).not.toContain('aegisOath');
  });
});

// ---------------------------------------------------------------------------
// Balance guard.
//
// The brief asked for this to extend balanceSim.test.ts. That file is an
// EXISTING test file and this task's file ownership forbids touching it, so the
// equivalent guard lives here instead, built on the same greedy policy so the
// two read alike. Reported rather than worked around.
//
// The measurement isolates the SET BONUS from the set's raw stats: both arms
// wear the identical four Legendaries, and the only difference is whether the
// granted cards are in the deck. A win-rate delta here is therefore the cards
// and nothing else. Bands are deliberately wide — this is a regression guard,
// not the tuning instrument, and real tuning needs playtesting.
// ---------------------------------------------------------------------------

const VIGIL_FOUR = ['duskfang', 'duskwardensPlate', 'duskboundVow', 'duskfallStriders'];

function simulate(hero: Character, spawn: SpawnTable, extras: string[], trials: number): number {
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    hero.hp = hero.maxHp;
    hero.mp = hero.maxMp;
    hero.statusEffects = [];
    hero.activeMods = [];
    const enemies = [MonsterInstance.createWild(spawn), MonsterInstance.createWild(spawn)];
    const battle = startBattle(hero, [], enemies, { isBossFight: false, gateId: null, expeditionExtras: extras });
    let outcome: 'victory' | 'defeat' = 'defeat';
    let turnGuard = 0;
    outer: while (turnGuard++ < 60) {
      let cardGuard = 0;
      while (cardGuard++ < 25) {
        if (!hero.isAlive()) break outer;
        if (battle.enemies.every((e) => !e.isAlive())) {
          outcome = 'victory';
          break outer;
        }
        const playable = battle.hand
          .map((c, i) => ({ i, card: getCard(c.cardId) }))
          .filter((x): x is { i: number; card: CardDef } => !!x.card && x.card.cost <= battle.energy && !x.card.effects.some((e) => e.kind === 'tame'));
        if (playable.length === 0) break;
        const hpFrac = hero.hp / hero.maxHp;
        const hasBlock = (x: { card: CardDef }) => x.card.effects.some((e) => e.kind === 'block');
        const hasDamage = (x: { card: CardDef }) => x.card.effects.some((e) => e.kind === 'damage');
        const chosen = hpFrac < 0.4 ? (playable.find(hasBlock) ?? playable.find(hasDamage)) : (playable.find(hasDamage) ?? playable.find(hasBlock));
        if (!chosen) break;
        const living = battle.enemies.filter((e) => e.isAlive());
        let targetUid: string | undefined;
        if ((chosen.card.target === 'enemy' || chosen.card.target === 'randomEnemy') && living.length) {
          targetUid = [...living].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0].uid;
        }
        const r = playCard(hero, [], battle, chosen.i, targetUid);
        if (r.outcome === 'victory') {
          outcome = 'victory';
          break outer;
        }
      }
      if (!hero.isAlive()) break;
      const r = endTurn(hero, [], battle);
      if (r.outcome === 'victory') {
        outcome = 'victory';
        break;
      }
      if (r.outcome === 'defeat') break;
    }
    if (outcome === 'victory') wins++;
  }
  return Math.round((wins / trials) * 100);
}

function vigilHero(level: number): Character {
  const hero = new Character('Vigil', 'Human', 'Warrior');
  let idx = 0;
  const cycle = ['STR', 'DEF', 'DEX', 'MANA'] as const;
  while (hero.level < level) {
    hero.gainExp(hero.expToNext());
    while (hero.attributePoints > 0) hero.spendAttributePoint(cycle[idx++ % cycle.length]);
  }
  for (const id of VIGIL_FOUR) hero.equip(pieceOf(id));
  hero.recomputeDerived();
  hero.hp = hero.maxHp;
  return hero;
}

/* MEASURED MATRIX (300-trial cells, 5 reps each, greedy policy, level-14/16
 * Warrior wearing the same four Vigil Legendaries in BOTH arms — the only
 * variable is whether the granted cards are in the deck):
 *
 *   storm floor-1,  lv14:  bare 95-98%  set 95-98%   delta -1..+2
 *   abyss floor-1,  lv14:  bare 81-85%  set 86-89%   delta +2..+8
 *   abyss last,     lv16:  bare 47-53%  set 58-65%   delta +10..+16
 *   (for scale: the same lv14 hero wearing NO Legendaries wins 54-62% at
 *    storm floor-1, so the four Legendaries alone are worth ~40 points and the
 *    set bonus adds ~12 more at the band where the game is actually hard.)
 *
 * READING: the grant is invisible in saturated cells and worth roughly twelve
 * points of win rate where difficulty is real, which is the shape a set bonus
 * should have. It is a strong build, not a solved game — the full four-piece
 * still only reaches ~60% on the deepest floor.
 *
 * The guard below therefore measures the abyss cell. The storm cell was tried
 * first and flaked, because at 96% there is no room left for a bonus to show.
 */
describe('balance: what the set bonus is actually worth', () => {
  const deepSpawn = GATES.abyss.floors[GATES.abyss.floors.length - 1].spawn;

  it('the 4-piece grant is a real gain where difficulty is real, not decoration', () => {
    const bare = simulate(vigilHero(16), deepSpawn, [], 400);
    const matched = simulate(vigilHero(16), deepSpawn, ['aegisOath', 'retribution'], 400);
    // Measured delta +10..+16. Floor of +3 so this only fires if the grant has
    // genuinely stopped mattering, not on ordinary variance.
    expect(matched - bare, `matched ${matched}% vs bare ${bare}%`).toBeGreaterThanOrEqual(3);
  });

  it('but it does not trivialise the band — death stays reachable in full kit', () => {
    // The whole point of a vault-and-set system is that it raises the ceiling
    // without removing the floor. Measured 58-65%; a cell above 90 would mean
    // the set had ended the difficulty curve.
    const matched = simulate(vigilHero(16), deepSpawn, ['aegisOath', 'retribution'], 400);
    expect(matched, 'a full set made the deepest floor nearly unloseable').toBeLessThan(90);
  });

  it('deck dilution is real: the grant adds cards, so the base deck thins', () => {
    // Not a win-rate claim — a structural one. Four extra cards in a ~14-card
    // deck is a 30% change to what you draw, which is why the sets grant
    // cards worth drawing rather than merely more cards.
    const hero = vigilHero(16);
    const bare = startBattle(hero, [], [MonsterInstance.createWild(deepSpawn)], { isBossFight: false, gateId: null, expeditionExtras: [] });
    const bareSize = bare.drawPile.length + bare.hand.length;
    const matched = startBattle(hero, [], [MonsterInstance.createWild(deepSpawn)], {
      isBossFight: false,
      gateId: null,
      expeditionExtras: ['aegisOath', 'retribution'],
    });
    const matchedSize = matched.drawPile.length + matched.hand.length;
    expect(matchedSize).toBe(bareSize + 2);
    expect(matchedSize / bareSize).toBeLessThan(1.5);
  });
});

describe('the screens render', () => {
  // Cheap guards against a crash in markup nobody would otherwise execute until
  // Paul opened the forge. Both screens read the Tellings book directly.
  it('the Forge renders the wall at every stage: unbought, empty, and holding', () => {
    let s: GameState = gameReducer(initialGameState(), { type: 'CREATE_CHARACTER', name: 'S', race: 'Dwarf', className: 'Knight' });
    s = gameReducer(s, { type: 'STORY_CONTINUE' });
    s = { ...s, screen: 'smith' };

    const render = () => renderToStaticMarkup(createElement(SmithScreen, { state: s, dispatch: () => {} }));
    expect(render()).toContain('The Back Wall');

    seedBook({ telling: 2, verses: 200, vaultSlots: 2 });
    expect(render()).toContain('Empty hook');

    depositToVault(pieceOf('duskfang'));
    const held = render();
    expect(held).toContain('Duskfang');
    // minIlvl 6, and this hero is level 1 — the wall must say so rather than
    // silently offering a piece they cannot carry.
    expect(held).toMatch(/Come back at level/);
  });

  it('the Gear screen renders a set panel once a piece is held', () => {
    let s: GameState = gameReducer(initialGameState(), { type: 'CREATE_CHARACTER', name: 'G', race: 'Human', className: 'Warrior' });
    s = gameReducer(s, { type: 'STORY_CONTINUE' });
    s.player!.equip(pieceOf('duskfang'));
    s.player!.addItem(pieceOf('duskwardensPlate'));
    s = { ...s, screen: 'equipment' };
    const html = renderToStaticMarkup(createElement(GearScreen, { state: s, backScreen: 'town' as const, dispatch: () => {} }));
    expect(html).toContain('Matched gear');
    expect(html).toContain('The Duskbound Vigil');
    expect(html).toContain('1/5 worn');
    // The attribution is drawn from this telling's own generated history.
    expect(html).toMatch(/Issued to .+, and never handed back in\./);
  });
});
