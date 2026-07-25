// ---------------------------------------------------------------------------
// The Retelling — the player-facing explanation of why Everdusk repeats.
//
// The Tellings (src/platform/tellings.ts) and The Next Draft
// (src/engine/data/bindings.ts) were both fully built and almost entirely
// unexplained: the fiction existed in the code and never reached the player.
// This file is the whole of what the player is ever told about the loop, and
// where each piece of it is told.
//
// The beats, in the order a player meets them:
//   1. FRONTISPIECE_FIRST   — StoryOverlay, chapter 0, first telling. Plants
//                             the book. Says nothing about dying; that would
//                             spend the first death before it happens.
//   2. RITE_OF_THE_PAGE     — FallenScreen, first death. The premise lands
//                             here, in full, once, at the only moment the
//                             player is actually asking the question.
//   3. TURNING_LESSONS      — FallenScreen, every death after. One new thing
//                             per page turn, in the order it becomes useful.
//   4. FRONTISPIECE_AGAIN   — StoryOverlay, chapter 0, every telling after the
//                             first. Restates the frame and — importantly —
//                             explains why the Chronicle's deep history is
//                             different this time (the world IS regenerated).
//   5. TELLINGS_PREFACE     — opt-in, at the desk and in the Chronicle. The
//                             canonical account, for the player who wants it.
//   6. MARGINALIA           — the Chronicler's annotations: the game's actual
//                             systems, in voice, each with a plain reading.
//   7. VICTORY_READING      — VictoryScreen. An ending is a place to read from.
//
// VOICE (see the VOICE_BIBLE in data/npcs.ts, chronicler entry): clinical
// archival register, institutional patience, speaks of the player as "the
// subject", prefixes asides with "[margin note]", constantly distinguishes
// what happened from what will be remembered. Never a face, never a name,
// never claims to be a person. No exclamation marks anywhere in this file.
//
// Slots are plain {name}-style substrings, replaced by the consuming
// component. Only use the slots documented on each export.
// ---------------------------------------------------------------------------

/**
 * Shown once, before the opening crawl of the very first telling. Three
 * paragraphs, no more — the player has not earned a lore dump and has not
 * asked for one. This plants the image the first death pays off, and nothing
 * else. It deliberately does not mention death, drafts, verses or repetition.
 * No slots.
 */
export const FRONTISPIECE_FIRST: string[] = [
  'This account is kept at the parish house in Everdusk, by the Chronicler, who did not volunteer for the work and has not been relieved of it.',
  'The book it is kept in is older than the oldest wall of the town it describes. Most of it is other people. The page it lies open at now is blank, ruled, dated, and has your name already inked at the top of it — which the Chronicler will not explain, and which you are welcome to find unsettling.',
  '[margin note] The subject has not yet asked why the book is so long for a town this small. They ask eventually. They always ask eventually.',
];

/**
 * Shown before the opening crawl of every telling after the first, indexed by
 * (telling - 2) and then cycling. Each set restates the frame in one breath
 * and teaches one further thing — the second set carries the load, because it
 * explains why the Chronicle's deep history reads differently this time.
 *
 * This is not decoration: RESTART regenerates the world (eras, figures, beasts
 * of legend, the realm's name) while the six story chapters, the Lantern and
 * the four gates stay fixed. That is precisely what a retelling is, and the
 * player is otherwise never told that it happened.
 *
 * Slots: {telling} (ordinal word), {name} (the new hero's name).
 */
export const FRONTISPIECE_AGAIN: string[][] = [
  [
    'The {telling} telling of the same story. The Chronicler has ruled a fresh page and dated it, and the date is the only part that is new.',
    'The lantern still gutters. The four gates still stand open. What comes out different is everything further back than living memory — the eras, the names inside them, the beasts the old accounts cannot agree about. That part of the book is remembered rather than recorded, and memory does not come out the same way twice.',
    '[margin note] The subject is not the previous subject. The Chronicler is aware of this and has decided it does not change the filing.',
  ],
  [
    'The {telling} telling. The struck drafts are getting to be a stack rather than a page, and the Chronicler has moved them to the left of the inkwell, where the arm rests.',
    'None of them were wasted. A story attempted three times is a better-understood story than one attempted once, and the archive was built by people who believed that before there was anything in it worth believing it about.',
    '[margin note] {name} begins where they all begin. The Chronicler has stopped writing down the weather on opening days. It is always the same weather.',
  ],
  [
    'The {telling} telling. The Chronicler no longer asks whether this one will finish, having found the question does not affect the answer and does dull the quill.',
    'What the earlier drafts earned is still at the desk, which is the closest thing to mercy the trade allows: nothing carries but what was written down, and what was written down carries entirely.',
    '[margin note] The subject arrives without scars and with the benefit of them. This is the arrangement. It is not required to make sense to the subject.',
  ],
  [
    'The {telling} telling, and the lantern in the square is exactly as thin as it was on the first. It has been waiting, in its patient and unhelpful way, for someone to finish.',
    'The Chronicler sets out the ink, dates the page, and begins where the story begins, because that is the only place a story can be begun from, however many times it has been begun from there.',
    '[margin note] {name}, at the top of the page. The hand is steady. It has had practice.',
  ],
];

/**
 * THE KEY BEAT. Shown on the Fallen screen at the end of the FIRST telling,
 * and only then. This is the entire premise, delivered once, at the moment the
 * player is actually asking "why would I do that again".
 *
 * Slots: {name} (hero), {place} (where the telling ended).
 */
export const RITE_OF_THE_PAGE: string[] = [
  '"Well," the Chronicler says, and sets the quill down for the first time in some hours. "Now you have asked."',
  'Here is the arrangement, plainly, once. Nothing that happened has been undone. The dusk did not roll back an hour to spare anyone. {name} died at {place}, and it is written, and it stays written. I do not erase. I have never erased anything in this building.',
  'What I do is turn the page. The story of Everdusk is not finished — the lantern is still guttering, the four gates still stand open, the thing beneath the well-stone is still knocking — and an unfinished story gets told again. Not undone. Told again, from the beginning. That is the next telling. There will be a new name at the top of it. It will not be yours, and it will be you, and I have long since stopped trying to reconcile those two facts on paper.',
  'The town will not remember you. The town half-remembers something. I remember exactly, and I keep the draft — struck through, dated, filed under Attempts, Instructive — beside every other draft that stopped somewhere short. That is not sentiment. I am an archivist before I am anything else, and a story attempted twice is better understood than a story attempted once.',
  'What the attempt was worth comes back with you, as verses. Bring them to my desk at the tavern. I will spend them on the next telling, this one having stopped requiring them.',
];

/**
 * One paragraph per page turn after the first, indexed by (telling - 2) and
 * then cycling. Progressive disclosure: each teaches the next thing the player
 * is about to be able to use, in the order the systems actually open up.
 * Slots: {name}, {place}.
 */
export const TURNING_LESSONS: string[] = [
  // Second death — the world itself is re-remembered. Explains worldgen.
  'The Chronicler files the draft without comment and reaches for an older stack. "The next one will not match this one further back than living memory," they say. "The eras, the figures, the beasts the ballads argue over — I hold those by memory, not by record, and memory is not a copying press. The lantern and the four gates I hold by record. Those you will find exactly where you left them."',
  // Third death — the standing record.
  'The Chronicler turns to the thinner ledger, the one kept alongside. "Two counts run across every draft, no matter how any single draft ends: what you have faced, and which Wardens have fallen to you. Those numbers do not reset. They are the only thing in this room that has never once gone backwards."',
  // Fourth death — bindings.
  '"You have been telling the same draft with better arithmetic," the Chronicler says, dating the page. "There is another ledger at the desk. Premises — conditions I write into a telling before it starts, in exchange for verses. Not kindnesses. Shapes. A story with a shape is a different story, which is more than a stronger one."',
  // Fifth death — boons, and the honest accounting of what they are.
  '"The boons are the plain half," the Chronicler says. "Coin left for you, herbs in the pack, old scars your body has not yet earned. Small, permanent, unromantic. I record them the same as everything else, and I would not spend the last of your verses on them."',
  // Sixth and after — the long view.
  'The Chronicler dates the page, files it left of the inkwell, and rules the next one without being asked. "Some tellings end at the second gate. Some end at the fifth. I stopped being surprised by either a long while ago, and I have not stopped ruling pages."',
];

/** Headings for the plain carry-over ledger on the Fallen screen. */
export const CARRY_HEADINGS = {
  kept: 'What the desk keeps',
  lost: 'What the page does not',
} as const;

/**
 * The honest, plain accounting of what survives a death. This is the one place
 * the fiction steps aside far enough to be checked against the code — see
 * TellingsMeta in src/platform/tellings.ts for the kept column, and
 * initialGameState()/CREATE_CHARACTER in src/engine/game.ts for the lost one.
 */
export const CARRIED_OVER: string[] = [
  'Verses, and everything ever inscribed with them.',
  'The premise standing for the next draft, and how deep it is read.',
  'The standing record: every species faced, every Warden felled.',
  'Every struck draft, and every ending ever reached.',
];

export const NOT_CARRIED: string[] = [
  'The hero — their name, their levels, their gold and their gear.',
  'The party and the stable. Every beast tamed, every promise kept.',
  'The orbs returned, and every stretch of ground already walked.',
  "The realm's deep history. It comes back. It does not come back the same.",
];

/**
 * The canonical account, opt-in: expanded at the Chronicler's desk and read as
 * a page of the Chronicle. Written for the player who has decided they want
 * the whole thing, so it may be longer than a screen otherwise permits.
 */
export const TELLINGS_PREFACE_TITLE = 'On the Keeping of This Book';

export const TELLINGS_PREFACE: string[] = [
  'A telling is one attempt at the story: a hero made, a lantern failing, four gates open, and however far that hero gets before the story stops going. When it stops, it has not been cancelled. It has been attempted. I date it, strike it through, and keep it.',
  'I am asked, in the drafts where anyone thinks to ask, why I do not simply write a better one. The answer is that I do not invent this book. I keep it. What Everdusk does, it does; I record it and I am not consulted. The story is unfinished, and an unfinished story in this town has a way of being told again, and again, until something in it finally holds.',
  'What is fixed across every telling: the dusk, the Last Lantern and its guttering, the four gates and the Wardens behind them, the four orbs, and what is waiting under the well-stone once all four are home. I hold those by record. What is not fixed: everything older than living memory — the eras, the figures, the beasts the old ballads cannot agree about, the very name the realm goes by. Those I hold by memory, and memory retells. Read the timeline in this book twice, across two tellings, and you will find it does not say the same thing. That is not an error. That is what the word retelling means.',
  'Verses are what a telling was worth. They are earned by how far it got, whether it ended well or badly, and they do not stay with the hero, who no longer has use for anything. They stay with the desk. At the desk they buy two different kinds of thing. Boons are plain and permanent: coin, provisions, an old strength the next body has not earned. Premises — I call them bindings — are conditions written into a draft before it begins. A binding does not make a telling easier. It makes it a different telling, and asks something back for the privilege.',
  'The standing record is the third ledger, the thin one. It counts what I have been shown across all drafts together: how many species have been faced, how many Wardens have fallen, how deep the book has been read. It never decreases. It is the only count in this room that never has. Some premises I will not write until the record supports them; I do not set down a condition I have no evidence for.',
];

/**
 * Appended to the preface only once the book has been read all the way
 * through. The Depths are deliberately not mentioned before that — see
 * NextDraftPanel, which makes the same promise and must not be contradicted.
 */
export const TELLINGS_PREFACE_DEPTH: string[] = [
  'And there are readings beneath the reading. I did not mention them earlier, because until the book had been finished once, mentioning them would only have been cruel. An ending is not a place to stop. It is a place to read from. Each reading down is the same story carried in a harder hand, and I will not offer one deeper than a step below the deepest ever carried to the end. You do not skip a reading. Nobody does.',
];

/** One entry in the Chronicler's marginalia — the practical glossary. */
export interface MarginNote {
  id: string;
  title: string;
  /** In voice. What the Chronicler would actually say about it. */
  note: string;
  /** The plain reading. Numbers and rules, no prose. Shown as a margin note. */
  plain: string;
}

/**
 * THE GLOSSARY. Everdusk has no tutorial, no help screen and no onboarding of
 * any kind; a new player is handed cards, taming, breeding, gates, fog,
 * affixes and a meta-progression layer at once.
 *
 * The compromise between voice and clarity is structural rather than tonal:
 * every entry says the true thing twice. Once as the Chronicler would say it,
 * and once flatly, as a margin note — which is a form the character already
 * uses for exactly this purpose (see the VOICE_BIBLE: "prefixes asides with
 * [margin note]", "distinguishes constantly between what happened and what
 * will be remembered"). The plain half is not a lapse in register. It is the
 * register's own escape hatch, and the only reason this can be honest.
 *
 * Ordered by when a player first needs it, not alphabetically.
 */
export const MARGINALIA: MarginNote[] = [
  {
    id: 'telling',
    title: 'A Telling',
    note: 'One attempt at the story, from a hero made to a hero stopped. Struck through when it ends badly, shelved separately when it ends well, kept either way.',
    plain: 'A run. Death ends it and begins the next one. Nothing is lost that was written at the desk.',
  },
  {
    id: 'lantern',
    title: 'The Last Lantern',
    note: 'One flame, three centuries, and a promise nobody has yet broken. It holds the dusk exactly where it is. Let the dusk fall the rest of the way and what sleeps beneath the town does not.',
    plain: 'The premise of the story, and the reason the four orbs must be brought home. Also the turn marker in battle: bright when the turn is yours, dim while the dark moves.',
  },
  {
    id: 'gates',
    title: 'The Four Gates',
    note: 'The Verdant, the Hollow, the Sunken and the Storm. Each descends, each is older at the bottom than at the top, and behind each stands a Warden holding one of the four orbs.',
    plain: 'Four dungeons of increasing danger. Clear a gate to take its orb. Four orbs opens the fifth gate, the Abyssal, and the Hollow Sovereign at the end of it.',
  },
  {
    id: 'floors',
    title: 'The Descent',
    note: 'A gate is walked a floor at a time. Something always squats on the stair — the accounts are consistent on this, across every telling I have kept.',
    plain: 'Each floor has a miniboss guarding the stairs down. Beat it to descend. The last floor holds the gate Warden instead.',
  },
  {
    id: 'lantern-light',
    title: 'The Reach of the Light',
    note: 'You see as far as the lantern throws and no further. It throws further for the lucky, which the keepers have always maintained is not a metaphor.',
    plain: 'Fog of war. Your view radius is fixed, plus one tile for every 20 points of LUCK.',
  },
  {
    id: 'cards',
    title: 'Boons and the Deck',
    note: 'The dark hands things over on the way down — a trick, a turn of speed, a way of standing. It hands them over for the descent, and takes them back at the top of the stairs.',
    plain: 'Cards won on an expedition are added to your deck for that expedition only, then cleared when you return to town. Some premises change this.',
  },
  {
    id: 'taming',
    title: 'The Covenant of Names',
    note: 'A wild thing in the gates is not guarding the dark. It is running from it. To name one is to walk it the rest of the way up, across the threshold, into kept light. The stable was never once called a cage in three hundred years of records.',
    plain: 'Weaken a wild monster and attempt to tame it. A tamed beast joins your party, normally two levels below yours. Two may be active at once; the rest wait in the stable.',
  },
  {
    id: 'stable',
    title: 'The Stable, and Breeding',
    note: 'Old Maribel keeps a book of keepings and Ott keeps the stalls, and neither of them will tell you the arrangement counts what happens there. It counts it.',
    plain: 'The stable holds beasts beyond your active party. Two stabled beasts can be bred to produce an egg that inherits from both.',
  },
  {
    id: 'gear',
    title: 'Gear and its Affixes',
    note: 'The smith reads a blade the way I read a page: the shape of it first, and then the smaller writing further down, which is usually where the meaning is.',
    plain: 'Equipment carries a base type plus rolled affixes that modify your stats. Rarity governs how many affixes it may carry.',
  },
  {
    id: 'verses',
    title: 'Verses',
    note: 'What a telling was worth, measured in how far it got. The hero has no further use for them. The desk does.',
    plain: 'The meta-currency. Earned when a telling ends, either way. Kept across every telling and spent at the Chronicler\'s desk in the tavern.',
  },
  {
    id: 'boons-desk',
    title: 'The Desk: Boons',
    note: 'Coin left where you will find it. Herbs in the pack. Scars the body has not yet earned. Small mercies, bought once and kept for good.',
    plain: 'Permanent purchases. Each is bought once with verses and applies at the start of every telling thereafter.',
  },
  {
    id: 'bindings',
    title: 'The Desk: Premises',
    note: 'A condition written into a draft before it begins. Not a kindness — a shape. The two are often confused, and I have stopped correcting the confusion out loud.',
    plain: 'Bindings. Bought once with verses, then selectable for free forever. A binding changes how a telling plays, giving and taking at the same time. It is fixed when the hero is made and cannot be changed mid-telling.',
  },
  {
    id: 'record',
    title: 'The Standing Record',
    note: 'The thin ledger, kept alongside the thick one. It counts across all drafts together and it has never once gone backwards.',
    plain: 'Species faced and Wardens felled, totalled across every telling. Some premises stay sealed until the record supports them.',
  },
];

/** Marginalia only shown once the book has been finished at least once. */
export const MARGINALIA_DEPTH: MarginNote = {
  id: 'depths',
  title: 'The Readings Beneath',
  note: 'The book goes down further than the story does. It always has. An ending is a place to read from, not a place to stop.',
  plain: 'Depths. Unlocked by finishing the game once. Each level makes everything in the dark older and more numerous, and multiplies verses earned. You may only select one step below the deepest you have carried to the end.',
};

/**
 * Shown on the Victory screen, under the ending. This is where the Depths are
 * first mentioned to the player at all — the desk has been refusing to raise
 * the subject until now, on purpose.
 * Slots: {name}, {telling} (ordinal of the telling that just closed).
 */
export const VICTORY_READING: string[] = [
  'The Chronicler writes the ending down twice, to be sure of it, and then sits for a while without writing anything.',
  '"The {telling} telling holds," they say at last. "{name} walked back out, which the earlier drafts had begun to suggest was not among the available endings. I have put it on the shorter shelf. I dust that one more often than is strictly required."',
  '"There is a thing I have not mentioned. Until now it would only have been cruel." The finished draft comes up off the desk, and there is another beneath it, in the same hand, harder to read. "The book goes down further than the story does. An ending is a place to read from. Come to the desk when you want the deeper reading, and I will tell you how far down I am willing to go."',
];

/** One line above the generated eras in the Chronicle timeline. No slots. */
export const TIMELINE_PREAMBLE =
  'Everything above the present telling is held by memory rather than by record, and memory retells. The Chronicler does not apologise for this and does not expect it to read the same way twice.';

/** Shown at the Chronicler's desk, above the ledgers, on the first telling. */
export const DESK_FIRST_TELLING =
  'The desk is stacked with drafts, all of them somebody. Yours is the top one, and it is still blank, and the Chronicler has not yet found anything about that worth remarking on.';

/** Fill {slot} substrings from a plain record. Unlisted slots are left alone. */
export function fillSlots(text: string, slots: Record<string, string | number>): string {
  let out = text;
  for (const [key, value] of Object.entries(slots)) {
    out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}

/** The frontispiece for a telling: the first is its own thing, the rest cycle. */
export function frontispieceFor(telling: number, slots: Record<string, string | number>): string[] {
  if (telling <= 1) return FRONTISPIECE_FIRST;
  const set = FRONTISPIECE_AGAIN[(telling - 2) % FRONTISPIECE_AGAIN.length];
  return set.map((p) => fillSlots(p, slots));
}

/**
 * What the Chronicler says as a telling closes. The first death gets the whole
 * arrangement; every death after gets one further piece of it.
 * Returns paragraphs, already filled.
 */
export function pageTurnPassage(telling: number, slots: Record<string, string | number>): string[] {
  if (telling <= 1) return RITE_OF_THE_PAGE.map((p) => fillSlots(p, slots));
  const lesson = TURNING_LESSONS[Math.min(telling - 2, TURNING_LESSONS.length - 1)];
  return [fillSlots(lesson, slots)];
}

/** The preface, with the Depths paragraph only once the book has been finished. */
export function prefaceFor(triumphed: boolean): string[] {
  return triumphed ? [...TELLINGS_PREFACE, ...TELLINGS_PREFACE_DEPTH] : TELLINGS_PREFACE;
}

/** The glossary, with the Depths entry only once the book has been finished. */
export function marginaliaFor(triumphed: boolean): MarginNote[] {
  return triumphed ? [...MARGINALIA, MARGINALIA_DEPTH] : MARGINALIA;
}
