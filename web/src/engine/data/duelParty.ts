// ---------------------------------------------------------------------------
// Rival tamers — the authored opposition for Duel mode (PLAN8 #11).
//
// PURE DATA. `engine/systems/duel.ts` instantiates these into real
// Character/MonsterInstance objects; nothing here imports systems code, so the
// file stays safe for a future headless server build (PLAN6 phase 3) and for
// content agents to extend without touching engine logic.
//
// Rules for authoring a rival:
//  - every `speciesId` MUST exist in data/species.ts AND have an entry in
//    SPECIES_CARDS (data/cards.ts) — a beast with no cards contributes nothing
//    to its tamer's deck. `duel.test.ts` enforces both.
//  - every `personalityId` MUST exist in data/personalities.ts; the personality
//    is what makes the beast act on instinct during its tamer's turn.
//  - `levelOffset` is applied to the duel's agreed level band, so one roster
//    entry stays usable across a range of player levels.
//  - keep lineups to 2-3 beasts (DUEL_PARTY_MAX) — that is the ring's rule.
// ---------------------------------------------------------------------------
import type { ClassName, RaceName, Stat } from '../types';

export interface RivalBeast {
  speciesId: string;
  /** Added to the duel's level band. Negative = a weak link in the lineup. */
  levelOffset: number;
  personalityId: string;
  /** The beast's given name — rivals name their beasts too. */
  nickname: string;
}

export interface RivalTamer {
  id: string;
  name: string;
  /** Souls-flavored epithet shown under the name. */
  title: string;
  blurb: string;
  race: RaceName;
  className: ClassName;
  /** Recommended player level. Used to sort/flag the roster, never to lock it. */
  band: number;
  /** Stat priority for spending the rival's level-up attribute points. */
  statPriority: Stat[];
  beasts: RivalBeast[];
  taunt: string;
  victoryLine: string;
  defeatLine: string;
}

/** The ring's rule: no tamer brings more than three beasts. */
export const DUEL_PARTY_MAX = 3;

export const RIVAL_TAMERS: RivalTamer[] = [
  {
    id: 'wren',
    name: 'Wren of the Low Fields',
    title: 'the Unblooded',
    blurb: 'Barely a season into it. Talks to her beasts more than she talks to people, and it shows — they listen.',
    race: 'Human',
    className: 'Thief',
    band: 1,
    statPriority: ['DEX', 'LUCK', 'STR', 'DEF'],
    beasts: [
      { speciesId: 'fangPup', levelOffset: 0, personalityId: 'valiant', nickname: 'Biscuit' },
      { speciesId: 'goober', levelOffset: -1, personalityId: 'craven', nickname: 'Puddle' },
      { speciesId: 'peckerel', levelOffset: 0, personalityId: 'bright', nickname: 'Chit' },
    ],
    taunt: '"I know I look new at this. So did everyone who ever beat you."',
    victoryLine: '"Oh. Oh, I actually — sorry. Sorry! Good match."',
    defeatLine: '"Fair. Fair. Biscuit, we are going home to think about this."',
  },
  {
    id: 'halbrecht',
    name: 'Halbrecht',
    title: 'the Kennelmaster',
    blurb: 'Kept the watch-hounds of Everdusk for thirty years. Believes a beast is only as steady as the hand on its lead.',
    race: 'Human',
    className: 'Knight',
    band: 5,
    statPriority: ['DEF', 'STR', 'MAGDEF', 'MANA'],
    beasts: [
      { speciesId: 'duskhound', levelOffset: 1, personalityId: 'valiant', nickname: 'Sentry' },
      { speciesId: 'bristleBoar', levelOffset: 0, personalityId: 'stoic', nickname: 'Anvil' },
      { speciesId: 'gelKnight', levelOffset: 0, personalityId: 'stoic', nickname: 'Squire' },
    ],
    taunt: '"Hold the lead. Hold the line. That is the whole of it, and most never learn either."',
    victoryLine: '"No shame in it. You were taught wrong, is all. Come back when you have been taught right."',
    defeatLine: '"Well struck. Sentry — down. Down, I said. Yes. Well struck indeed."',
  },
  {
    id: 'ilsabet',
    name: 'Sister Ilsabet',
    title: 'of the Quiet Ward',
    blurb: 'Tends the dying and keeps what wanders out of them. Her beasts are all things that should have gone somewhere else.',
    race: 'Elf',
    className: 'Mage',
    band: 9,
    statPriority: ['INT', 'MANA', 'MAGDEF', 'LUCK'],
    beasts: [
      { speciesId: 'gloomShroom', levelOffset: 1, personalityId: 'dour', nickname: 'Vespers' },
      { speciesId: 'wailingWisp', levelOffset: 0, personalityId: 'sly', nickname: 'The Third Bell' },
      { speciesId: 'lanternMoth', levelOffset: 1, personalityId: 'doting', nickname: 'Candlewake' },
    ],
    taunt: '"I have sat with a great many endings. Yours will be politely handled."',
    victoryLine: '"There. Breathe. It is only a duel — I have watched worse things finish."',
    defeatLine: '"Ah. Then the ward keeps its lesson and I keep my dead. Go well."',
  },
  {
    id: 'orrick',
    name: 'Orrick Coldforge',
    title: 'Warden of the Sealed Doors',
    blurb: 'Fights the way a wall fights: by still being there afterwards. Has never once been in a hurry.',
    race: 'Dwarf',
    className: 'Warrior',
    band: 13,
    statPriority: ['STR', 'DEF', 'MAGDEF', 'LUCK'],
    beasts: [
      { speciesId: 'livingArmor', levelOffset: 1, personalityId: 'stoic', nickname: 'Third Gate' },
      { speciesId: 'gargoyle', levelOffset: 0, personalityId: 'valiant', nickname: 'Roostwarden' },
      { speciesId: 'boneshambler', levelOffset: 1, personalityId: 'savage', nickname: 'Old Mason' },
    ],
    taunt: '"Take your swings. I have been swung at by better and by heavier."',
    victoryLine: '"Aye. Stone wins most arguments. Rest up."',
    defeatLine: '"Hm. Something in the mortar, then. I will see to it."',
  },
  {
    id: 'vaskell',
    name: 'Vaskell',
    title: 'the Ninefold',
    blurb: 'Nine duels, nine wins, nine beasts buried. Does not consider the last part a cost.',
    race: 'Orc',
    className: 'Bard',
    band: 18,
    statPriority: ['DEX', 'STR', 'LUCK', 'MANA'],
    beasts: [
      { speciesId: 'shadowPanther', levelOffset: 2, personalityId: 'savage', nickname: 'Ninth' },
      { speciesId: 'nightTerror', levelOffset: 1, personalityId: 'sly', nickname: 'Small Hours' },
      { speciesId: 'razorMantis', levelOffset: 1, personalityId: 'savage', nickname: 'Quick Answer' },
    ],
    taunt: '"I will remember your name. I remember all of them. It is the least I can do."',
    victoryLine: '"Ten, then. I will find something kind to say about you later."',
    defeatLine: '"Nine. Still nine. You have taken something from me that I cannot buy back."',
  },
  {
    id: 'ashgrave',
    name: 'The Widow Ashgrave',
    title: 'who Bargained Twice',
    blurb: 'Came back from the Abyssal Gate with more than she went in with. Nobody has asked what she left behind.',
    race: 'Human',
    className: 'Mage',
    band: 25,
    statPriority: ['INT', 'MANA', 'MAGDEF', 'DEF'],
    beasts: [
      { speciesId: 'cryptTyrant', levelOffset: 2, personalityId: 'dour', nickname: 'My Husband' },
      { speciesId: 'archfiend', levelOffset: 1, personalityId: 'sly', nickname: 'The Second Signature' },
      { speciesId: 'phoenixling', levelOffset: 2, personalityId: 'bright', nickname: 'Recompense' },
    ],
    taunt: '"You are welcome to try. Everything else has."',
    victoryLine: '"Keep your beasts close tonight. The dark counts what it is shown."',
    defeatLine: '"Then the terms were poor. I will renegotiate."',
  },
];

const BY_ID = new Map(RIVAL_TAMERS.map((t) => [t.id, t]));

export function rivalById(id: string): RivalTamer | undefined {
  return BY_ID.get(id);
}

/**
 * Roster ordered by how well each rival suits `level` — closest band first.
 * Nothing is ever hidden: a level-2 tamer may walk into the Widow's ring and
 * find out exactly what that costs.
 */
export function rivalsForLevel(level: number): RivalTamer[] {
  return [...RIVAL_TAMERS].sort((a, b) => Math.abs(a.band - level) - Math.abs(b.band - level) || a.band - b.band);
}

/** True when this rival is roughly a fair fight at `level` (UI badge only). */
export function isFairMatch(tamer: RivalTamer, level: number): boolean {
  return Math.abs(tamer.band - level) <= 5;
}
