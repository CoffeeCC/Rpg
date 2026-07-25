// =========================================================================
// THE RECRUIT DRILL — Watch Captain Bram teaches combat in a mock fight.
//
// Combat used to be taught nowhere. A new player was handed vigor, hand
// size, targeting, block, intents, elements and a loss condition that ends
// the telling, and left to infer all of it in a gate that kills.
//
// This file is the CONTENT of the lesson and nothing else: the opponent's
// shape, the beats, and Bram's lines. The lifecycle lives in game.ts (a real
// battle, started by a real reducer action) and the presentation lives in
// components/DrillCoach.tsx. Deliberately no imports from either — this is
// data, it is what a writer edits, and it must stay readable as prose.
//
// VOICE. Bram is clipped ledger-speak (see npcs.ts): no contractions, ever.
// Fragments as full sentences. He reports his own feelings as findings under
// investigation. Arithmetic is his only lyricism. He does not congratulate —
// he RECORDS. Nothing here may contain an exclamation mark, a "Great job",
// or a modern tutorial cadence. If a line could appear in a mobile game's
// onboarding, it is wrong and should be rewritten colder.
// =========================================================================

/** The article the watch keeps penned for drill. See `beginDrill` in game.ts. */
export const DRILL_OPPONENT = {
  speciesId: 'goober',
  /** Bram has it on the inventory as an item, not an animal. */
  nickname: 'the Exhibit',
  /**
   * Padded, not dangerous. A drill dummy has to SURVIVE the lesson: a level-1
   * goober's 22 HP dies to one good opening turn and the recruit learns three
   * of the seven things. 60 is roughly four turns of a starting deck, which is
   * exactly the length of the beat list below.
   */
  hp: 60,
  /**
   * And it must not hurt. Its attack stat is floored (deriveStats clamps to 1),
   * so the Splat it throws is a number the recruit can watch land on their
   * block without any arithmetic getting frightening.
   */
  strPenalty: -6,
  /** Pinned so the drill is the same drill for every recruit. */
  personalityId: 'stoic',
} as const;

/** What the ledger pays a recruit who completes the drill. Once, ever. */
export const DRILL_REWARD = {
  gold: 30,
  /** Two Herbs: enough to matter on floor one, not enough to change a build. */
  consumable: { name: 'Herb', count: 2 },
} as const;

export type DrillBeatId =
  | 'strike'
  | 'spend'
  | 'endTurn'
  | 'intent'
  | 'guard'
  | 'weakness'
  | 'loss';

export interface DrillBeat {
  id: DrillBeatId;
  /** The ledger heading. Short, numbered by the UI. */
  title: string;
  /** Bram, teaching. Paragraphs, in order. */
  lines: string[];
  /** The single thing the recruit must DO to advance. Imperative, one line. */
  ask: string;
}

/**
 * The beats, in the order a player needs them — NOT in the order a designer
 * finds tidy. Each one is unlocked by having done the previous one, and each
 * is satisfied by an action in the real fight, never by pressing "Next".
 *
 * The ordering rule: teach a thing at the first moment the player could
 * possibly act on it, and never teach two things that must be done at once.
 * Cost and targeting are the exception and are taught together, because you
 * cannot play your first card without doing both.
 */
export const DRILL_BEATS: DrillBeat[] = [
  {
    id: 'strike',
    title: 'Vigor, and where it goes',
    lines: [
      'Drill begins. You are holding cards. I am holding a ledger. Both of us will be making entries.',
      'At your left hand: candles. That is vigor — what a turn is made of. Each card names its price in the corner. Spend the price, the candle goes out, and it does not come back until the turn does.',
      'The article in front of you is watch property and does not mind. Take a card with a blade on it, put the mark on the article, and confirm it.',
    ],
    ask: 'Play an attack card at the Exhibit.',
  },
  {
    id: 'spend',
    title: 'A turn is not one card',
    lines: [
      'Recruits stop after one. I do not know why. I have asked, and the answers are not usable.',
      'A turn is not a card. A turn is every card you can pay for. Nothing ends when you play one — you keep spending until the candles are out or until you say otherwise.',
    ],
    ask: 'Spend the rest of your vigor.',
  },
  {
    id: 'endTurn',
    title: 'Handing it back',
    lines: [
      'Now hand the turn back. The lantern at your right does it.',
      'Two things happen and both surprise people. What is left in your hand is not kept — it goes to the embers, and you are dealt a fresh hand. And the article gets its turn.',
      'The cards are not a hoard. They are a tide. Do not save a card for a moment that the deal will not let you reach.',
    ],
    ask: 'End your turn with the lantern.',
  },
  {
    id: 'intent',
    title: 'It tells you first',
    lines: [
      'Above the article: a mark, and a number. Look at it.',
      'That is not decoration. That is a declaration. It is what the article will do the moment you hand the turn back, and how much of it. A blade means it will strike you for that figure. A shield means it will ward itself. An arrow means it means to make you smaller.',
      'This is the whole of the discipline, and I will only say it once. The dark tells you what it is about to do. Everything that kills a tamer is a tamer who did not read the line.',
    ],
    ask: 'Read the mark above the Exhibit, then take your turn.',
  },
  {
    id: 'guard',
    title: 'Block, and what block is',
    lines: [
      'It has declared. Answer the declaration instead of ignoring it.',
      'A guard card raises block — the shield beside your name. Block is eaten before your flesh is. That is its entire virtue.',
      'And it is spent, not owned. What block is not eaten this turn is gone by the next. Block held over is block wasted. Raise it when the mark says to, not before, and not out of nerves.',
    ],
    ask: 'Play a guard card and raise block.',
  },
  {
    id: 'weakness',
    title: 'The column marked weakness',
    lines: [
      'One more reading, and then we are nearly done with you.',
      'Beside the article, a small sigil. That is what its kind does not survive well. Everything in the gates belongs to a family, and every family has a column it loses in — flame, frost, storm, and the rest.',
      'Match the column and the same card does more. It is not a secret and it is not a trick. It is printed on the creature, in advance, for free. I file this under arithmetic I enjoy.',
    ],
    ask: 'Put one more card into the Exhibit.',
  },
  {
    id: 'loss',
    title: 'The entry I do not like making',
    lines: [
      'Last item. Finish the article and we are finished.',
      'Your hit points are not a resource. They are the telling. Reach zero out there and the draft closes — no second column, no reprieve, no next attempt under the same name. The Chronicler gets a page and I get a form.',
      'Here you are on watch ground and I will not permit it. Past the gate I cannot permit anything. Read the mark, hold the block, count the candles, and come back so that I do not have to write it.',
      'I have written it nine times. I can still spell every one of the names without checking the page. That is not sentiment. That is what happens to a man who keeps the record himself.',
    ],
    ask: 'Finish the Exhibit.',
  },
];

export function drillBeatAt(index: number): DrillBeat {
  return DRILL_BEATS[Math.max(0, Math.min(DRILL_BEATS.length - 1, index))];
}

/**
 * Fired the first time a status lands on the recruit during the drill.
 *
 * Statuses are NOT a beat, because they cannot be guaranteed — the slime kit
 * rolls Acid Ooze about one turn in seven and no beat may depend on a die. So
 * this is an aside instead: if the dice teach it, Bram names it; if they do
 * not, nothing is missing from the lesson.
 */
export const DRILL_STATUS_ASIDE = [
  'Something has stuck to you. Beside your name — that is a status, and it has a count on it.',
  'It will do its work at the end of each of your turns and tick down by one. Some burn, some rot, some hold you still. They expire. They are survivable. They are also how a careless tamer dies four turns after the mistake.',
];

/** Bram, when the recruit is about to be given the standing order in town. */
export const DRILL_OFFER = {
  heading: 'Standing order: recruit drill',
  giver: 'Watch Captain Bram',
  text: 'Before you walk through a gate I am required to establish that you can hold a card and a thought at the same time. The watch keeps an article penned for exactly this. It is padded, it is bored, and it cannot kill you. Nothing that happens in the yard is entered against your name.',
  ask: 'One mock engagement, on watch ground, at no risk.',
  /** Shown where the note has already been signed off. */
  recorded: 'Logged. Filed. The column is closed and you may leave it closed.',
};

/** The nudge, once per telling, when a first-timer first goes looking at gates. */
export const DRILL_NUDGE =
  'Watch Captain Bram, without looking up: "You have not drilled. The article is penned and the yard is empty. Not an order. An observation, entered in the usual column."';

/**
 * Bram, when the drill is passed. He records; he does not congratulate.
 *
 * The third line is the lived-in gesture: the watch has been sending people
 * through that gate for nine years, and this ledger is where their names went.
 * Deliberately a LINE and not a system — but it is not idle either, because
 * rival tamers already spawn as floor units, so "look at the face" describes
 * something the player will genuinely walk into.
 */
export const DRILL_PASS_LINES = [
  'The article is down. Drill concluded.',
  'Entered as "competent". That is not praise, it is the second of five words the ledger allows and the first one is "deceased".',
  'You are the fortieth name in this column. Thirty-one of them came back at least once. If you meet a tamer out past the gate, look at the face before you reach for a card — I have been sending people through it for nine years, and the ledger does not record where all of them stopped.',
];

/** Bram, when a recruit would have fallen. The drill cannot kill; he halts it. */
export const DRILL_HALT_LINES = [
  'Halt. Hands down. That would have been the end of you, and on watch ground I do not permit endings.',
  'You are restored and nothing is entered against your name. Past the gate there is no captain calling halt. That is the entire difference between the yard and the dark, and it is a larger difference than it sounds.',
];

/** Bram, when a recruit tries to tame the drill dummy. */
export const DRILL_TAME_LINE =
  'The article is already on the inventory. You may not tame municipal property. I have recorded the attempt without prejudice — reaching out is the correct instinct, filed in the wrong yard.';

/** Bram, when a recruit walks out of the drill early. Never a scold. */
export const DRILL_LEAVE_LINE =
  'Drill abandoned. Entered without comment. The article will be here, and so will I, which is the one promise the watch can keep.';

/** Where the drill points a graduate next. See the report on buried content. */
export const DRILL_AFTERWORD = {
  covenant:
    'One more thing and it is not mine. What you do out there is not only killing. Ott at the stable keeps the Covenant written out — what taming actually is, and what it costs the thing you tame. Read it before you reach for something living.',
  marginalia:
    'And the Chronicler keeps a marginalia: every term I have used today, written down properly by someone who enjoys writing. I do not. Consult it when a word here fails you.',
};
