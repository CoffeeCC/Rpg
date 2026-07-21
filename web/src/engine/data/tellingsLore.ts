// Lore for the Tellings meta-loop: the Chronicler's ongoing, repeatedly
// rewritten account of the hero's story. Every death is a failed draft —
// struck through in the book, never discarded. See src/platform/tellings.ts
// for the mechanics and src/engine/data/story.ts for the voice this extends.
//
// Slots are plain {name} substrings, replaced by the consuming component.
// Only use the slots documented on each export below.

/** Struck-through epitaphs for failed tellings shown in the Chronicle.
 * Slots: {telling} (ordinal string like "third"), {name} (hero name), {place} (location name or "the road"), {level} (number). */
export const TELLING_EPITAPHS: string[] = [
  'The {telling} telling ends here, at {place}. The ink was not wasted; nothing written is.',
  'Here the {telling} draft of {name} stops, level {level}, at {place}. The Chronicler dates the page and moves on.',
  '{name} reached level {level} and no further, in the {telling} telling. The margin note reads: try the left road next time.',
  'The {telling} attempt closes at {place}. The Chronicler underlines nothing. Underlining implies surprise.',
  'Struck through, not erased: the {telling} telling of {name}, ending at {place} with the ledger of level {level} still owed.',
  'The {telling} page stops mid-sentence at {place}. The Chronicler has learned not to finish sentences early.',
  '{name} did not survive the {telling} telling. The desk keeps the draft anyway, filed under Attempts, Instructive.',
  'At {place}, the {telling} telling ran out of road. Level {level} is noted in the margin, along with the weather, which was unremarkable.',
  'The {telling} telling of {name} is crossed out, not torn out. The Chronicler has opinions about which is more honest.',
  'Here lies the {telling} draft, level {level}, {place}. The Chronicler writes "continued" and means it literally.',
  'The {telling} telling failed at {place}. Somewhere in the stacks, this is filed next to eleven others that also failed at {place}. The desk is patient about patterns.',
  'Level {level}, the {telling} time, {place}, and then the page simply stops needing more ink. The Chronicler dips the quill anyway, out of habit.',
  'The {telling} telling of {name} is struck through in the usual place, on the usual line, for the usual reason. The reasons vary. The line does not.',
  'That was the {telling} telling. {name} got as far as {place} and no further. The book does not sigh. The Chronicler sometimes does, on its behalf.',
];

/** Chronicler's desk intro lines (Tavern). One is shown above the boons. No slots. */
export const CHRONICLER_DESK_LINES: string[] = [
  "The Chronicler does not look up from the page. \"Sit. I have kept your verses. Spend them or don't — the book will still be here either way.\"",
  '"Every telling that fails still teaches the next one something," the Chronicler says, not quite to you. "That is the only mercy this trade allows."',
  'The desk is stacked with drafts, each one crossed through in the same patient hand. "I do not throw pages away," the Chronicler says. "It would be rude to the ink."',
  '"You have died before," the Chronicler notes, without looking up. "The town half-remembers it. I remember it exactly. That is the arrangement."',
  'A fresh page waits, your name already inked at the top. "I write it before you ask," the Chronicler says, "because you always ask, eventually."',
  '"Verses," the Chronicler says, turning one over like a coin. "Small currency, for a small mercy. But mercy adds up, the same as anything else."',
  'The quill has not been re-cut in years. It does not need to be. "The page wants finishing," the Chronicler says. "It has wanted that for a while now."',
  '"I keep every draft in the same book," the Chronicler says, "so that when it finally ends well, the ending will know what it cost."',
  'The Chronicler taps the ledger twice, an old habit with no explained purpose. "Spend what the failures earned you. It is the only inheritance a failed telling leaves."',
  '"Some tellings end at the second gate. Some end at the fifth. I have stopped being surprised by either," the Chronicler says, sliding the ledger toward you.',
];

/** Lines for the Fallen screen, shown as the page turns. Slots: {telling} (ordinal of the telling that just ended), {name}. */
export const PAGE_TURN_LINES: string[] = [
  'The {telling} telling of {name} closes. Somewhere in the parish house, a page turns on its own.',
  'The Chronicler crosses out one line and begins the next without ceremony. This is the {telling} time. It will not be the last.',
  '{name} is struck through, not erased. The book does not stay finished — it never has, and the Chronicler has stopped expecting it to.',
  'The ink dries on the {telling} draft. Somewhere, a fresh page is already waiting, and it already has {name}\'s name at the top.',
  'This telling is done. The next one begins the way they all begin: with a name, a lantern, and a page that refuses to be the last one.',
  'The {telling} attempt joins the others in the stack. The Chronicler does not sort them by how far they got. Every draft gets the same shelf.',
  'Turn the page. {name} will be back at the beginning by the time you finish reading this sentence — that is simply how the telling works.',
  'The story was not staying finished even before {name} arrived. It will not start now. The {telling} telling ends; the next one is already inked.',
];

/** Header lines for the "Present Telling" era in the Chronicle timeline. Slots: {telling} (ordinal, e.g. "fourth"), {name}. */
export const PRESENT_TELLING_LINES: string[] = [
  'The {telling} telling of {name}, still being written. The Chronicler has not yet decided how it ends.',
  'Present telling, the {telling}: {name}, ongoing. Every entry before this one was also, once, the present telling.',
  'This is the {telling} draft of {name}\'s story. The page is warm; the ink has not set.',
  'Here the {telling} telling continues. The Chronicler keeps a hand near the page, ready either way.',
  'The {telling} telling, {name}, unfinished as of this reading. Check back. The book always has more to say.',
];

/** Convert 1-based telling number to a lowercase ordinal word ("first" ... "twentieth"), falling back to "41st" style beyond that. */
export function ordinal(n: number): string {
  const words = [
    'zeroth',
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
    'ninth',
    'tenth',
    'eleventh',
    'twelfth',
    'thirteenth',
    'fourteenth',
    'fifteenth',
    'sixteenth',
    'seventeenth',
    'eighteenth',
    'nineteenth',
    'twentieth',
  ];
  if (n >= 0 && n < words.length) return words[n];
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
