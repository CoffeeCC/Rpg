/** Extra spoken lines per voiced NPC, sent to TTS and played on interaction.
 * Keyed by npc id. Each line is short (spoken aloud). No slots/placeholders —
 * these are generated to audio verbatim, so keep them self-contained.
 *
 * v20: `grude` and `chronicler` gained pools. Grude's clips are PENDING — he is
 * the one NPC with no voice id in public/audio/npc_voices.json, so his lines
 * play as text until one is added (NpcHost simply finds no clip and stays
 * silent). See web/art-staging/VOICE_BATCH.md.
 *
 * The Chronicler's first three lines below are the exact text of the three
 * chronicler clips already on disk (chronicler_0..2) — they moved here from
 * serviceBarks so the archivist speaks aloud most visits instead of one in
 * three. Do NOT reword them: the audio key is the line text itself, and any
 * edit silently orphans a paid-for clip.
 *
 * Voice contract for every line here: see VOICE_BIBLE in npcs.ts. */
export const EXTRA_VOICED_LINES: Record<string, string[]> = {
  dovey: [
    "Sit down before you fall down. I've got a chair for that exact look.",
    'The stew is tired tonight. So am I. Eat it anyway.',
    "I've poured this same drink so many nights I could do it asleep. Some nights I nearly am.",
    'Roof held again. One more night off the count.',
    "Don't mind me. I'm just old enough now to move slow and call it wisdom.",
    "There's a seat by the fire. Take it before my knees beat you to it.",
    "I used to run this room. Now I mostly just let it run itself around me.",
    "Come in out of the dark, whatever's left of you.",
    "I'll bring the ale. Give me a minute. Everything takes a minute now.",
    "Some nights I just stand here and listen to the place breathe. Good enough company, most nights.",
  ],
  bram: [
    'State your business. Briefly. I have a ledger to close.',
    'Logged. Filed. Next.',
    'The watch does not run on enthusiasm. It runs on paperwork.',
    'Four grandfathers and a dog. Do not test the dog.',
    'Nothing to report. I am suspicious of that.',
    'Keep to the lit roads. I only write reports for the ones who don\'t.',
    'This conversation is now a matter of record.',
    'Quiet night. I have learned not to trust those either.',
    'Sign here if you intend to cause trouble. Saves me time later.',
  ],
  maribel: [
    'Come in, dear. Mind the dust, it means well.',
    "I had something for you. Or someone. It's on a shelf somewhere, I'm sure.",
    'Everything here waited for someone. Perhaps that someone is you.',
    "I forget names, dear, but I never forget what people leave behind.",
    'Sit a moment. My shelves are patient, and so, today, am I.',
    "That trinket wasn't there yesterday. Or maybe it always was.",
    "I keep the small things, dear, for the people who might still come back.",
    'Everyone in this town has left me something to hold.',
    "Don't mind me talking to the shelves. They listen better than most.",
  ],
  ott: [
    'Muck your boots before you touch my straw.',
    'Animals know things before we do. Trust the feet.',
    'A stable is an argument with the dark. I intend to keep winning it.',
    'Mind the latch. The clever ones learn it fast.',
    "That one's got good bones. Don't waste them.",
    "Feed, breed, or stand there. Pick one.",
    'The straw is fresh. Do not tell the mules.',
    "I've named more animals than people in my life. Animals earn it faster.",
    'Every stall full is the only kind of rich I care about.',
  ],
  kess: [
    "Well, well. Look who decided to show up and make my morning interesting.",
    "I was going to say something clever, but you're distracting me. Rude, honestly.",
    "Careful, tamer. Keep looking at me like that and I might actually go easy on you.",
    "I counted your wins. I'm not impressed. I am, a little. Don't tell anyone.",
    "You, me, a rematch. I'll even let you pick the time. I'm generous like that.",
    "Stop smirking. It's very unfair how well that works on me.",
    "I train harder than anyone in this town, and somehow you're still the one I think about.",
    "Careful — flirting with a rival is basically a battle strategy. I'd know, I invented it.",
    "You beat me last time. I'm choosing to remember it as a draw. A very handsome draw.",
    "Buy me a drink sometime. Purely to study my competition up close.",
  ],
  casque: [
    'Blessings, tamer. Small ones. Sleep is the larger gift.',
    'The body is a candle. Do not burn both ends just to prove a point.',
    'Rest here a while. Heaven is patient about most things.',
    'A quiet room is its own kind of miracle, some nights.',
    'Sleep is scripture I actually believe in.',
    'The chapel is warm and the questions can wait until morning.',
    'Lie down. The gates will still be there when you wake.',
    'I light this candle out of spite as much as faith. Works either way.',
    'Rest is the cheapest prayer I know how to sell.',
  ],
  rowan: [
    'Sit a while, child, and let me see what you have grown into.',
    'Every ring in the wood was earned. Yours are showing.',
    'Growth does not applaud itself. It simply continues.',
    'You were a sapling at that gate once. Look at you now.',
    'I measure orchards and tamers with the same patient eye.',
    'The Tree does not rush. Neither should you.',
    'Stand still, child. Let an old woman take pride quietly.',
    'Not every season shows on the outside. I still count them.',
    'Good rootstock, this one. I said so from the start.',
  ],
  fennick: [
    'Mind the shovel. Mind the business being good, too.',
    'I dig them proper and deep. Habits like that stick.',
    'Preservation is my trade. I am not picky about the medium.',
    "I keep a spot ready for everyone in this town. Most don't need it yet.",
    'Business is slow this season. Suits me fine.',
    'Dig deep or do not bother. Words to live by, oddly enough.',
    "I've buried stranger things than you'd believe. Ask me sometime.",
    'The yard is quiet in the right way tonight.',
    'Come back anytime. I will still be here. Occupational hazard.',
  ],
  sess: [
    'Forty-one lamps on my round, and the dark leans on every one.',
    "Walk in the middle of the street. I've earned the right to say that.",
    'The lamp gutters blue some nights. I tell you anyway.',
    'I light them at dusk and try not to look at what pushes back.',
    'Every gate you walk through, I have already lit the way to it.',
    'Stand in the light a second before you go. Costs nothing.',
    'The dark hates being looked at first. So I look first.',
    'Some nights I count who came back more than who went out.',
    'Forty-one lamps, and I have an opinion about every single one.',
  ],
  grude: [
    'Put it down where I can see it. I don\'t work on faith.',
    'Rushed steel is bad steel. I have buried the difference.',
    'Forge is hot, my hands are old, and the work still gets done. Somehow.',
    'I fitted plate to boys who never came back for the fitting. You\'ll forgive me taking my time with yours.',
    'Metal remembers heat the way we remember bad years. Deep down, and for good.',
    'You want it strong or you want it pretty? I can do one of those properly.',
    'Every dent on that was a decision somebody made in a hurry.',
    'I don\'t polish out the scars. Somebody earned those.',
    'Good tools outlive good men. That\'s the one unfairness I\'ve made peace with.',
    'Come back in an hour. Or don\'t, and it\'ll be done anyway.',
    'That anvil is the oldest thing in this town that still works for a living.',
    'Feel that. Trued. Nothing rattles when it\'s right.',
    'I talk to it while I work. Long trade, and the metal\'s the only one who stays.',
    'Take it. Bring it back broken and I won\'t say a word. That\'s what the trade is for.',
  ],
  chronicler: [
    // --- already voiced (chronicler_0..2). Text is the audio key. Do not edit.
    '[margin note] Subject entered. Noted without comment, for once.',
    'A story once written down has a way of not staying finished. You\'d know.',
    'Every deed gets a line, eventually. Some get more than one. Try to earn the second.',
    // --- new
    '[margin note] The subject looks at the page as though the page owed it something. Perhaps it does.',
    'I do not write what happened. I write what will be remembered, which is a narrower thing and a heavier one.',
    'Three centuries of entries and the hand has not tired. In your position, that is the first thing I would question.',
    '[margin note] Ink low. Requisition filed. The requisition has been filed for three hundred years.',
    'Every name in this archive was somebody\'s whole life, compressed to a line and a date. I try to choose the line well.',
    'You may read the record. You may not correct it. Those are the terms, and they are not mine.',
    '[margin note] The margins are filling. When the margins fill, a story has outgrown its allotment. It happens rarely.',
    'I have written far more endings than beginnings. That is a matter of arithmetic, not of pessimism.',
    'The archive keeps what the town forgets. Nobody has ever thanked anyone for that service.',
    '[margin note] Entry deferred. The subject is not finished being the subject.',
    'A record is a kindness to strangers who do not exist yet. Bear them in mind.',
    'I have no face, no name, and a great deal of patience. Two of the three are professional requirements.',
  ],
};
