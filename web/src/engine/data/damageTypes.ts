// ---------------------------------------------------------------------------
// What counts as magical damage.
//
// MAGDEF (Magic Defense) is a mitigation stat: it is subtracted from incoming
// damage instead of DEF when the blow is magical. That means every damage site
// needs a yes/no answer to "is this magic?", and the answer has to be derivable
// from data that is actually present at that site. This file is the only place
// that question is answered, so the resolver, the intent telegraph and the
// character sheet can never disagree about it.
//
// THE RULE, in one sentence:
//   A blow is magical if it declares an element other than 'None', or if it is
//   powered by magic rather than muscle (INT/MINT scaling, or a `spell` card).
//
// Why that rule and not something narrower:
//   - Element is the engine's existing, authored marker for "this is Fire/Ice/
//     Dark/…". Anything carrying one is unambiguously magic.
//   - INT/MINT scaling is the engine's existing marker for "this number comes
//     out of Magic Power". A drain that reads INT is magic even with no element
//     (e.g. Ferryman's Toll).
//   - CardType 'spell' is what the player reads off the card face. Including it
//     means there is no card whose type says "spell" while the rules quietly
//     treat it as muscle. (Exactly one card needs this clause today:
//     `itsNotSafeToSwimToday`, a tidal wave that scales STR.)
//
// The awkward case: enemy AI kit moves (data/enemyAi.ts) carry NO element
// field, so their school cannot be read off the move. They are physical by
// default — claws, jaws, stone fists — and the ones that are plainly not are
// listed by id in MOVE_ELEMENTS below, with a status-payload fallback so a
// newly authored Burned/Frozen move is magical without anyone editing here.
// engine/test/magdef.test.ts asserts every id in that table still exists in a
// kit, so a rename in enemyAi.ts fails loudly instead of silently going stale.
// ---------------------------------------------------------------------------

import type { CardDef, CardEffect, Element, Intent, SkillDef } from '../types';
import type { EnemyMove } from './enemyAi';

export type DamageSchool = 'physical' | 'magical';

type RealElement = Exclude<Element, 'None'>;

/** Enemy kit moves that are magic despite enemyAi.ts having no element field.
 *  Keyed by EnemyMove.id. Absent = physical. */
export const MOVE_ELEMENTS: Record<string, RealElement> = {
  // --- Family kits ---
  dragon_breath: 'Fire', // "Stoking the Flame"
  devil_bargain: 'Dark', // "Cursed Bargain"
  devil_nibble: 'Dark', // "Soul Nibble" — a drain on the soul, not the body
  undead_rattle: 'Dark', // "Death Rattle"
  undead_chill: 'Ice', // "Chilling Touch" (debuff — carries no damage today)
  undead_wither: 'Dark', // "Withering Grip"
  // plant_sap ("Sap Drain") is deliberately absent: a vine physically drinking
  // sap is muscle, not sorcery. Devil/Undead drains take what isn't blood.

  // --- Boss kits ---
  curate_rite: 'Ice', // "Drowning Rite"
  curate_rites: 'Dark', // "Last Rites"
  curate_enrage: 'Ice', // "The Deep Answers"
  galewing_thunder: 'Electric', // "Thunderclap" (debuff — no damage today)
  galewing_enrage: 'Electric', // "Eye of the Storm"
  sovereign_decree: 'Dark', // "Sovereign's Decree"
  sovereign_feast: 'Dark', // "Feast of Despair"
  sovereign_enrage1: 'Dark', // "The Abyss Opens"
  sovereign_enrage2: 'Dark', // "Last Judgment"
  // rootwarden_* (vines, roots, bark), cairnking_* (stone) and elite_* are all
  // physical by intent, not by omission.
};

/** Fallback for kit moves not listed above: a move that sets someone alight or
 *  freezes them solid is elemental whatever its id. */
const STATUS_ELEMENT: Record<string, RealElement> = { Burned: 'Fire', Frozen: 'Ice' };

/** The element an enemy kit move lands with. 'None' = physical. */
export function moveElement(move: Pick<EnemyMove, 'id' | 'status'>): Element {
  const explicit = MOVE_ELEMENTS[move.id];
  if (explicit) return explicit;
  const status = move.status;
  if (status && status.target !== 'self') {
    const byStatus = STATUS_ELEMENT[status.id];
    if (byStatus) return byStatus;
  }
  return 'None';
}

/** Skills declare their element and their scaling stat outright. */
export function skillSchool(skill: SkillDef): DamageSchool {
  return skill.element !== 'None' || skill.scaling === 'INT' ? 'magical' : 'physical';
}

/** A hero/monster card effect. `card` is optional so effect-only callers (the
 *  card-face preview) get the same answer the resolver will. */
export function cardEffectSchool(effect: CardEffect, card?: CardDef): DamageSchool {
  if (card?.type === 'spell') return 'magical';
  if ('element' in effect && effect.element && effect.element !== 'None') return 'magical';
  if ('scaling' in effect && (effect.scaling === 'INT' || effect.scaling === 'MINT')) return 'magical';
  return 'physical';
}

/**
 * The school of a telegraphed enemy intent, recomputed from the ids the Intent
 * already carries (`moveId` / `skillId` / `moveStatus`). Deriving it rather
 * than storing it on the Intent keeps `types.ts` untouched and guarantees the
 * telegraph and the resolution can never disagree — both call this.
 *
 * A plain unarmed swing (no move, no skill) is physical. That is the defensible
 * default: it is a creature hitting you.
 */
export function intentSchool(intent: Pick<Intent, 'moveId' | 'moveStatus' | 'skillId'>, lookupSkill: (id: string) => SkillDef | undefined): DamageSchool {
  if (intent.moveId) {
    return moveElement({ id: intent.moveId, status: intent.moveStatus }) === 'None' ? 'physical' : 'magical';
  }
  if (intent.skillId) {
    const skill = lookupSkill(intent.skillId);
    if (skill) return skillSchool(skill);
  }
  return 'physical';
}
