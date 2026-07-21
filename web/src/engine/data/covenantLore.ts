// The Covenant of Names — the in-universe answer to "why do we tame
// monsters?" A taming is a promise with a name on it, and the dusk counts
// kept promises the way it has always counted them: quietly, and without
// explaining why. See src/engine/data/story.ts for the Lantern and the
// arrangement it keeps, and src/engine/data/npcs.ts for Ott's voice, which
// OTT_COVENANT_LINES extends.
//
// Slots are plain {name}-style substrings, replaced by the consuming
// component. Only use the slots documented on each export below.

/** The Covenant of Names — shown once, when the player tames their first monster. 3-4 short paragraphs. */
export const COVENANT_INTRO: string[] = [
  "Everdusk has a word for what you just did, though nobody teaches it outright — you're meant to arrive at it the way most of the town did, sideways, after the fact. Taming is not capture and it is not quite friendship either. It is closer to the oldest transaction in the ledgers: you gave a wild thing a name and a place to be, and something, somewhere, wrote that down.",
  "The scholars who study the Lantern will tell you, if you buy them a second drink, that the flame does not care about swords or step counts. It cares about promises kept. Somebody promised to keep it lit, once, and has kept that promise every hour since. A tamer's promise is smaller and stranger — a name given, a bond honored, a place at the table for something that used to be nobody's — but the dusk does not appear to grade on size. It only appears to be counting.",
  "This is why the stable exists, and why it never once got called a menagerie in three hundred years of records. A menagerie is things kept for looking at. What Ott runs, whether or not Ott would put it this way over breakfast, is closer to a ledger: promises made, promises fed, promises that occasionally get out and knock over a fence.",
  "None of the old accounts explain the mechanism. Every page that gets close ends the way those pages tend to end in this town — a trailing sentence, an inkblot exactly where the interesting part would go, a margin note in a hand nobody has identified. Make of that what you will. The dusk has held this long on less certainty than you're about to have.",
];

/** One-liners shown when a taming succeeds. Slots: {monster} (species name), {name} (hero name). 8-10 lines. */
export const TAME_LINES: string[] = [
  '{monster} takes the name you give it like it was owed one. Somewhere, the ledger gets a little longer.',
  'It stops testing the air for a way out and starts testing you instead, {name}. That is as close to trust as the first hour ever gets.',
  'You name it, and for a moment {monster} stands very still, the way a held breath does right before it lets go.',
  'One more promise on the books. {monster} does not know that yet. Give it time.',
  '{monster} settles at your side like it has been waiting there and just never had the address.',
  'The dusk does not applaud. It never does. It just, very quietly, seems to be paying attention.',
  'You have a name for it now, {name}, and it has a place. That is the whole trick, apparently.',
  '{monster} was running from something. Now it is running with you instead. Small distinction. Everything, really.',
  'Something under the town, if it is keeping score, has one fewer thing loose in the dark tonight.',
  'The naming takes. {monster} is yours the way a promise is anyone\'s — right up until it isn\'t, and not a moment before.',
];

/** Ott's stable-philosophy lines — why the stable is really a ledger of promises. No slots. 6-8 lines. */
export const OTT_COVENANT_LINES: string[] = [
  "Folk call it a stable because they need a word and that one's short. I call it what it is on the bad nights: a room full of promises that eat and need mucking out.",
  "You don't tame an animal by beating something out of it. You give it a name it didn't have and a stall it can trust, and the rest is just feeding a promise on schedule.",
  "My master's master kept a ledger of every beast that ever slept under this roof. I asked him once what it was really for. He said, 'Keeping count.' I didn't ask count of what. Some questions you let lie, same as some dogs.",
  "A wild thing doesn't need saving from you, tamer. It needs a place to stop running. Turns out that's the whole job, dressed up in tack and feed bills.",
  "I've buried animals and I've released a few, and I'll tell you the honest truth: both feel like something closing. Different books, same kind of page.",
  "Breed two of mine together and watch close — there's a moment, right before the egg goes still, where it's like something is being asked a question and answering yes.",
  "The dark under this town doesn't take names, far as I can tell. It just takes what isn't held onto. So I hold on. That's the whole trade, when you strip the straw off it.",
  "Don't ask me why the dusk holds because a beast gets a name. Ask the Lantern. I just muck stalls and mind the arithmetic doesn't run backward on my watch.",
];

/** Shown on the breeding screen when an egg is made. Slots: {parentA} {parentB} (nicknames). 4-6 lines. */
export const BREEDING_COVENANT_LINES: string[] = [
  '{parentA} and {parentB} keep no ledgers, but something does. The egg between them is one promise standing on the shoulders of two.',
  'Whatever the arrangement counts, it seems to count this too: two kept things, making a third.',
  'The shell is warm before it has any right to be. {parentA} and {parentB} do not seem surprised. Only you are.',
  'Not every promise is made with words. {parentA} and {parentB} made this one the old way, and the dusk, if it is listening, does not appear to mind the method.',
  'A new name will need finding soon. The old ones, {parentA}\'s and {parentB}\'s, are already spoken for — that is rather the point.',
  'The egg sits still and certain in the straw. Whatever wrote down {parentA}\'s naming and {parentB}\'s has apparently already made room for one more line.',
];

/** The Chronicler explains the arrangement, reluctantly, in ledger-margin style. 4-6 lines. No slots. */
export const CHRONICLER_COVENANT_LINES: string[] = [
  '"A taming," the Chronicler says, not looking up, "is a promise I did not have to write down myself. I remain grateful for the ones that write themselves."',
  'The margin note, in the Chronicler\'s smallest hand: every named beast is one fewer thing owed to the dark. The ink stops there. It always stops there.',
  '"I do not know why the Lantern counts a stable the same as it counts a keeper," the Chronicler admits, "only that my predecessors stopped asking, and I have found no reason to be braver than they were."',
  'A page in the older stacks lists tamings the way the Lantern log lists nights kept: a tally, unbroken, and then, three centuries back, a single line that says only "it began before the counting did."',
  '"Name it, bond it, lose it — the book records all three the same way," the Chronicler says. "As promises. Kept, kept, and ended. I have stopped pretending ended is the same as failed."',
  'The Chronicler closes the ledger on the subject the way it closes every subject that gets too close to the well-stone: gently, and without finishing the sentence.',
];
