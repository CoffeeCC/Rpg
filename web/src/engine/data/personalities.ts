import type { Stat } from '../types';

/**
 * PLAN5 (#48): DQM-style personalities. A tamed monster's personality shapes
 * how it GROWS (small stat-growth bias) and what it DOES on its own each
 * battle turn (its instinct — fires after your cards, before the enemy acts,
 * fueled by the monster's MP).
 */
export type InstinctKind = 'strike' | 'maul' | 'mend' | 'wardHero' | 'cower' | 'hex' | 'rally' | 'venom';

export interface PersonalityDef {
  id: string;
  name: string;
  /** One line shown to the player: temperament + what the instinct does. */
  blurb: string;
  /** Stat-growth multipliers applied in deriveStats (subtle: 0.92–1.10). */
  growth: Partial<Record<Stat, number>>;
  instinct: InstinctKind;
  instinctText: string;
}

export const INSTINCT_MP_COST = 3;

/** Short action-banner labels for each instinct (v15 battle readability). */
export const INSTINCT_LABEL: Record<InstinctKind, string> = {
  strike: 'Strikes on instinct',
  maul: 'Mauls wildly',
  mend: 'Tends the wounded',
  wardHero: 'Stands guard',
  cower: 'Shows you where to hide',
  hex: 'Weaves a hex',
  rally: 'Rallies you',
  venom: 'Spits venom',
};

export const PERSONALITIES: PersonalityDef[] = [
  {
    id: 'valiant',
    name: 'Valiant',
    blurb: 'It puts itself between danger and the people it loves.',
    growth: { STR: 1.08, DEF: 1.04, DEX: 0.96 },
    instinct: 'strike',
    instinctText: 'Strikes the strongest foe unbidden.',
  },
  {
    id: 'savage',
    name: 'Savage',
    blurb: 'Something in it never fully came out of the dark.',
    growth: { STR: 1.1, DEF: 0.94 },
    instinct: 'maul',
    instinctText: 'Mauls a random foe, hard.',
  },
  {
    id: 'doting',
    name: 'Doting',
    blurb: 'It frets. It fusses. It keeps everyone alive.',
    growth: { INT: 1.08, MANA: 1.06, STR: 0.94 },
    instinct: 'mend',
    instinctText: 'Tends the most wounded ally.',
  },
  {
    id: 'stoic',
    name: 'Stoic',
    blurb: 'It endures, and it teaches you to.',
    growth: { DEF: 1.1, MAGDEF: 1.05, DEX: 0.95 },
    instinct: 'wardHero',
    instinctText: 'Shields you with its own calm.',
  },
  {
    id: 'craven',
    name: 'Craven',
    blurb: 'It is afraid of everything, and quick because of it.',
    growth: { DEX: 1.1, LUCK: 1.04, STR: 0.92 },
    instinct: 'cower',
    instinctText: 'Hides well — and you learn from watching.',
  },
  {
    id: 'sly',
    name: 'Sly',
    blurb: 'It watches for weakness the way others watch for food.',
    growth: { DEX: 1.06, INT: 1.05, DEF: 0.95 },
    instinct: 'hex',
    instinctText: 'Saps the strongest foe’s strength.',
  },
  {
    id: 'bright',
    name: 'Bright',
    blurb: 'It believes in you loudly and constantly.',
    growth: { LUCK: 1.08, MANA: 1.04, MAGDEF: 0.96 },
    instinct: 'rally',
    instinctText: 'Cheers you into hitting harder.',
  },
  {
    id: 'dour',
    name: 'Dour',
    blurb: 'It expects the worst, and sometimes delivers it.',
    growth: { MAGDEF: 1.08, INT: 1.04, LUCK: 0.94 },
    instinct: 'venom',
    instinctText: 'Its bitterness poisons a foe.',
  },
];

/* ------------------------------------------------------------------------- *
 * v20: personality barks (DATA ONLY)
 *
 * The monsters of Everdusk do not speak — so a bark here is the narrator's
 * observation of a companion, not a quip from one. Same register as the town:
 * dry, plain, elegiac; the feeling arrives sideways, through an action.
 * INSTINCT_LABEL is the precedent: a short data-only string a UI reads by key.
 * These are the long form of that, keyed by personality id + event.
 *
 * Slot vocabulary is exactly one token: {monster} — the companion's nickname.
 * A caller substitutes it the way NpcHost does for service barks. Every line
 * must still read correctly if the slot is replaced by a plain noun, so no
 * line depends on the name being possessive or sentence-initial punctuation.
 *
 * NOTHING in the engine reads these yet, by design (no combat logic changed).
 * A future UI hook calls `personalityBark(m.personality, 'winded', seed)`.
 * ------------------------------------------------------------------------- */

/** The four moments a companion's personality shows itself. */
export type PersonalityBarkEvent =
  | 'instinct'  // its instinct just fired (pairs with INSTINCT_LABEL)
  | 'winded'    // it has dropped to low HP
  | 'levelUp'   // it gained a level
  | 'tamed';    // it just joined you

export const PERSONALITY_BARK_EVENTS: readonly PersonalityBarkEvent[] = [
  'instinct',
  'winded',
  'levelUp',
  'tamed',
];

/** Narrator lines per personality per event. Slot: {monster} = nickname. */
export const PERSONALITY_BARKS: Record<string, Record<PersonalityBarkEvent, string[]>> = {
  valiant: {
    instinct: [
      '{monster} steps in front of you without being asked. It never asks.',
      'No signal, no plan — {monster} simply decides the biggest one dies first.',
      'It moves the way a door closes. Between you and the thing.',
    ],
    winded: [
      '{monster} is bleeding and standing, and considers only one of those facts relevant.',
      'Its legs are going. It turns to check on you first.',
      'Hurt, and furious about who did the hurting — not about being hurt.',
    ],
    levelUp: [
      '{monster} holds the line further out now. It decided the line was too close to you.',
      'Something in it has settled. Braver is the wrong word. Steadier.',
      'It has learned nothing about self-preservation and a great deal about timing.',
    ],
    tamed: [
      '{monster} takes its place at your shoulder as though the place had been kept for it.',
      'It looks you over once, finds you fragile, and appoints itself.',
      'No ceremony. It simply begins guarding you, and does not stop.',
    ],
  },
  savage: {
    instinct: [
      '{monster} goes in low and graceless, and the noise is terrible.',
      'It does not choose a target. It chooses a direction.',
      'Whatever restraint it learned this morning does not survive the smell of blood.',
    ],
    winded: [
      '{monster} is torn open and grinning about it, which is worse.',
      'The pain seems to arrive as information rather than as pain.',
      'It bleeds, snarls, and looks for the nearest thing to make even.',
    ],
    levelUp: [
      '{monster} has grown, and the dark in it has grown by the same measure.',
      'It is stronger. You are careful to be the one holding the leash.',
      'Something old is nearer the surface than it was last week.',
    ],
    tamed: [
      '{monster} follows you. It has not agreed to anything else.',
      'It comes because you are, for now, the most interesting thing in the dark.',
      'You have not tamed it. You have been accepted as an exception.',
    ],
  },
  doting: {
    instinct: [
      '{monster} abandons the fight entirely to see to the worst-off.',
      'It fusses over a wound that is not its own, in the middle of everything.',
      'The battle can wait. Someone is hurt, and that outranks the battle.',
    ],
    winded: [
      '{monster} is failing, and still checking on everybody else first.',
      'It waves you off — actually waves you off — and goes back to worrying.',
      'It hides how bad it is, badly, out of politeness.',
    ],
    levelUp: [
      '{monster} has gotten better at the mending and no calmer about the need for it.',
      'It has learned to be useful faster, which it treats as the only growth worth having.',
      'Stronger, and just as certain that everyone is one bad night from ruin.',
    ],
    tamed: [
      '{monster} comes to you already worrying about your bruises.',
      'It inspects the whole party, one by one, then sighs, then stays.',
      'It has decided you are badly looked after. It intends to correct that.',
    ],
  },
  stoic: {
    instinct: [
      '{monster} sets itself in front of you and stops moving. That is the whole technique.',
      'It takes the blow meant for you and does not comment on it.',
      'No noise at all. It simply becomes the wall you needed.',
    ],
    winded: [
      '{monster} is badly hurt. You would not know it from the breathing.',
      'It shifts its weight to the good leg and waits for the next one.',
      'Nothing in its face has changed since the fight began. Nothing in it will.',
    ],
    levelUp: [
      '{monster} endures a little more than it did. That is all it wanted from growing.',
      'It has learned patience the way stone learns weather.',
      'Steadier — and faintly embarrassed by the attention.',
    ],
    tamed: [
      '{monster} sits down beside you and stays sitting. That is the agreement.',
      'It weighs you for a long moment, then accepts the arrangement without a sound.',
      'It says nothing and does not leave. With this one, that is a vow.',
    ],
  },
  craven: {
    instinct: [
      '{monster} bolts for cover, and watching it, you learn where the cover is.',
      'It flinches early and correctly. You copy the flinch.',
      'Terror has made it an excellent judge of where not to be standing.',
    ],
    winded: [
      '{monster} is hurt and hiding, which is the sensible order of operations.',
      'It has gone very small behind you. It is still watching the enemy.',
      'Frightened past reason, and somehow still in the fight.',
    ],
    levelUp: [
      '{monster} is faster. It has not become braver, and does not intend to.',
      'It has grown better at surviving, which it holds to be the only skill.',
      'Quicker off the mark. Fear, properly trained, is a discipline.',
    ],
    tamed: [
      '{monster} trembles all the way through the taming, and comes anyway.',
      'It chooses you because you are, marginally, less frightening than the alternative.',
      'It shakes, it hides behind your leg, and it does not run. That is courage of a sort.',
    ],
  },
  sly: {
    instinct: [
      '{monster} finds the flaw and presses it, quietly, before anyone notices.',
      'It has been watching that one since the fight began. Now it collects.',
      "Something goes out of the enemy's arm. {monster} is looking elsewhere, innocently.",
    ],
    winded: [
      "{monster} is hurt, and has already worked out how to make that somebody else's problem.",
      'It hides the wound. Weakness is a currency and it does not spend its own.',
      'Bleeding, calculating, and in no particular hurry.',
    ],
    levelUp: [
      '{monster} has learned to see the flaw sooner. It was already unpleasant about it.',
      'Sharper. It looks at you differently now, and you decide not to think about that.',
      'It has grown, and it has grown patient, which is the worse half.',
    ],
    tamed: [
      '{monster} agrees to come with you. You get the distinct sense that terms were set.',
      'It considers your prospects, finds them useful, and joins.',
      'It comes willingly, which is somehow less reassuring than a struggle.',
    ],
  },
  bright: {
    instinct: [
      '{monster} makes a sound like a bell, and you hit harder for hearing it.',
      'It cheers. It is embarrassing, and it works.',
      'There is no tactic here at all. There is only encouragement, and it lands.',
    ],
    winded: [
      '{monster} is hurt, and still telling you in its way that this is going well.',
      'It is bleeding and cheerful, which is a very hard thing to argue with.',
      'It insists on the good news. There is not much good news. It insists anyway.',
    ],
    levelUp: [
      '{monster} has grown, and takes it as proof that you were right about everything.',
      'Louder. Stronger. Somehow more certain of you than before.',
      'It has learned nothing whatever about doubt. You are quietly grateful.',
    ],
    tamed: [
      '{monster} comes to you as though you had been late and it had waited.',
      'It decides, immediately and without evidence, that you are worth following.',
      'There is no negotiation. It simply begins believing in you, and never stops.',
    ],
  },
  dour: {
    instinct: [
      '{monster} spits something bitter, without hope and with great accuracy.',
      'It has been expecting this. It brought poison.',
      'The venom goes out of it like a long-held opinion.',
    ],
    winded: [
      '{monster} is badly hurt and vindicated, and treats that as a fair trade.',
      'It told you this would happen. It does not say so. It does not have to.',
      'Wounded, sour, and entirely unsurprised.',
    ],
    levelUp: [
      '{monster} is stronger, and expects that to make no difference in the end.',
      'It has grown. It regards the growth as a debt coming due.',
      "Better at this now, and gloomier about what 'this' is.",
    ],
    tamed: [
      '{monster} comes with you the way one accepts bad weather.',
      'It expects you to fail it. It comes anyway, which is its version of hope.',
      'It joins without warmth and without hesitation. Both, from this one, are honest.',
    ],
  },
};

const BY_ID = new Map(PERSONALITIES.map((p) => [p.id, p]));

export function personalityById(id: string | null | undefined): PersonalityDef | null {
  return id ? BY_ID.get(id) ?? null : null;
}

export function rollPersonality(roll: number): PersonalityDef {
  return PERSONALITIES[Math.abs(roll) % PERSONALITIES.length];
}

/**
 * Pick one bark for a personality + event. Deterministic for a given roll, so
 * a caller can seed it from battle state and not have it reroll on re-render
 * (same contract as rollPersonality). Returns null when the personality is
 * unknown, so a UI can simply render nothing.
 *
 * The {monster} slot is left in place — substitution is the caller's job:
 *   personalityBark(m.personality, 'winded', seed)?.replaceAll('{monster}', m.nickname)
 */
export function personalityBark(
  personalityId: string | null | undefined,
  event: PersonalityBarkEvent,
  roll: number,
): string | null {
  if (!personalityId) return null;
  const pool = PERSONALITY_BARKS[personalityId]?.[event];
  if (!pool || pool.length === 0) return null;
  return pool[Math.abs(Math.trunc(roll)) % pool.length];
}

/** Bond thresholds: instincts hit harder the longer a companion survives. */
export function bondPowerMult(bond: number): number {
  if (bond >= 25) return 1.5;
  if (bond >= 10) return 1.25;
  return 1;
}
