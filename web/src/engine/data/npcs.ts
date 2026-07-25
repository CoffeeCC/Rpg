// Tavern & town NPCs (see PLAN2.md). Greetings: index = min story chapter
// (0..5); systems pick the highest applicable index <= current chapter. All
// six indexes are populated so any picker strategy finds lines. Arc: the town
// moves from dread (chapter 0) toward dawn (chapter 5).
// Rumor slots per NpcDef contract in types.ts:
//   {beast} {beastGate} {artifact} {artifactGate} {figure} {era} {realm}
import type { NpcDef } from '../types';

/* ========================================================================== *
 * THE VOICE BIBLE (v20)
 *
 * House register for every spoken line in Everdusk — greetings, rumors,
 * service barks, extra voiced lines, personality barks:
 *
 *   dry, plain, elegiac. Understated. Nobody explains their own feeling; the
 *   feeling arrives through a concrete object or a number. Grief is reported
 *   like weather. Hope is reported like a suspicious ledger entry. Sentences
 *   are short and end on the flat noun, not the flourish.
 *
 * Forbidden house-wide: modern glib ("nailed it", "no cap", "vibes"), quippy
 * banter, exclamation marks, winking self-awareness, therapy vocabulary
 * ("process", "closure", "trauma"), and any line that tells the player how to
 * feel about it. Never name a real-world thing. Never break the setting.
 *
 * Progression: `greetings` is six pools indexed by story chapter (= orbs
 * recovered, 0..5). The engine picks the highest pool index <= chapter, so a
 * pool is the WHOLE of what that character says at that stage — every pool
 * has to stand on its own. The arc across the six is fixed for everyone:
 *   0 dread → 1 suspicion of good news → 2 first hard evidence →
 *   3 habits changing → 4 planning for a future → 5 dawn, and what it cost.
 * At stage N the character notices something small and verifiable, not the
 * abstraction. Bram counts patrols. Sess measures oil. Ott watches feet.
 *
 * Each entry below is the contract for that character. If a new line could be
 * moved to another character without anyone noticing, it is a bad line.
 * ========================================================================== */

export interface VoiceProfile {
  id: string;
  name: string;
  /** The one sentence that decides every other sentence. */
  core: string;
  /** How the sentences are actually built — rhythm, syntax, tics. */
  speech: string;
  /** The concrete nouns this voice keeps returning to. Ballast, not decor. */
  ballast: string[];
  /** What this character never does, however tempting it is to write. */
  never: string;
  /** Human delivery note for the voice actor / TTS listen-back. */
  direction: string;
}

/**
 * Keyed by npc id. 'chronicler' is deliberately here without an NpcDef — the
 * archivist has no face, no portrait and no tavern seat (see NpcHost).
 */
export const VOICE_BIBLE: Record<string, VoiceProfile> = {
  dovey: {
    id: 'dovey',
    name: 'Innkeeper Dovey',
    core: 'A woman who feeds people and refuses to make a speech about it.',
    speech:
      'Short hospitality imperatives up front — "Sit." "Eat." "Drink up." — then a flat observation, then an undercut aimed at the building, the food or her own knees. Warmth is never stated; it is served. Deadpan. Contractions everywhere.',
    ballast: ['the roof', 'the ale', 'the pie', 'the stew', 'the regulars', 'the open tab', 'the shutters', 'her knees'],
    never:
      'Never frets over you out loud, never mentions monsters with fear, never lets a tender sentence finish without a joke about the premises.',
    direction: 'Warm, low, unhurried. Half-smile behind every line. The punchline is thrown away, not landed.',
  },
  bram: {
    id: 'bram',
    name: 'Watch Captain Bram',
    core: 'A man who has replaced feeling with record-keeping and finds the arrangement works.',
    speech:
      'Clipped ledger-speak. No contractions, ever — "do not", "I am", "it is". Fragments as full sentences: "Logged. Filed. Next." Reports his own emotions as findings under investigation. Arithmetic is his only lyricism.',
    ballast: ['the ledger', 'columns', 'forms', 'the gate', 'four grandfathers and a dog', 'patrols', 'regulation', 'arithmetic'],
    never:
      'Never uses a contraction. Never expresses an emotion in the first person without filing it — "I am told I smiled. I am investigating the claim."',
    direction: 'Flat, procedural, quiet. Reads good news in exactly the tone of bad news. No warmth in the voice; all of it is in the fact that he keeps counting.',
  },
  maribel: {
    id: 'maribel',
    name: 'Old Maribel',
    core: 'A woman who has forgotten every name and not one single object.',
    speech:
      'Wanders, calls you "dear", trails off — and then lands on something appallingly exact: a count, a weight, a date, a name copied out of her book. The drift is the setup; the precision is the blow. Long soft clauses, then a short one.',
    ballast: ['the shelves', 'small things', 'the candle', 'her knitting', 'the dust', 'the book of keepings', 'the door'],
    never:
      'Never sharp, never cynical, never self-pitying. Never forgets an object. Never says the word "dead" when "did not come back" will do.',
    direction: 'Frail, kind, slow. The precise details land without her voice changing at all — that is what makes them cold.',
  },
  ott: {
    id: 'ott',
    name: 'Stablemaster Ott',
    core: 'A man who trusts what animals do and distrusts what people say about it.',
    speech:
      'Blunt imperatives, then evidence from the herd. Praise is routed through the animal, never given to the person. States the observation, refuses the conclusion: "I don\'t know what that means. I know it\'s better."',
    ballast: ['straw', 'boots', 'the latch', 'the mules', 'foals', 'stalls', 'feet', 'bloodlines', 'the old mare'],
    never:
      'Never compliments a human directly. Never sentimental in the abstract — the tenderness is always a specific animal doing a specific thing.',
    direction: 'Gruff, weathered, unhurried. Softens only on the animal nouns, and pretends not to.',
  },
  kess: {
    id: 'kess',
    name: 'Kess the Rival',
    core: 'A tamer who needs you to lose and needs you to stay.',
    speech:
      'Interrupts herself, self-corrects mid-sentence, capitalises one word for emphasis, gives a compliment and immediately taxes it. Keeps lists and counts. Flirts by declaring it a tactic.',
    ballast: ['her lists', 'the count', 'the ballads', 'the spelling of her name', 'a rematch', 'her plan', 'the mirror she practises in'],
    never:
      'Never finishes a kind sentence without walking it back. Never admits she was worried in plain words. Never actually leaves.',
    direction: 'Fast, bright, brittle. Every line sounds like the second half of an argument she has been having alone.',
  },
  casque: {
    id: 'casque',
    name: 'Brother Casque',
    core: 'A believer who keeps the light out of spite and calls that faith, correctly.',
    speech:
      'Liturgical bureaucracy: heaven has forms, appendices, back orders, invoices, and does not write back. Doctrinal deadpan. Warmth arrives sideways, in what he does with the candles rather than what he says about them.',
    ballast: ['candles', 'wax', 'the font', 'paperwork', 'the appendices', 'the bells', 'the reliquary', 'spite'],
    never:
      'Never doubts aloud. Never preaches at the player. Never promises anything heaven has not confirmed in writing.',
    direction: 'Gentle, tired, absolutely sincere — the jokes are said straight, as administrative fact.',
  },
  rowan: {
    id: 'rowan',
    name: 'Elder Rowan',
    core: 'A gardener who plans past her own death and considers that ordinary.',
    speech:
      'Slow, calls you "child", reasons in horticulture — rings, grafts, rootstock, seasons, scars closing over. Measures in decades without noticing that decades are unusual. Never rushes a sentence.',
    ballast: ['the Tree', 'leaves', 'rings', 'roots', 'the old orchard', 'cuttings', 'the path worn to the trunk'],
    never:
      'Never hurries, never speaks in one-season terms, never claims credit. Never uses a metaphor that is not a plant.',
    direction: 'Ancient, quiet, level. Enormous patience. The awe is in the pauses, not the volume.',
  },
  fennick: {
    id: 'fennick',
    name: 'Gravedigger Fennick',
    core: 'A cheerful tradesman whose trade is the worst news in town.',
    speech:
      'Craft talk and business talk applied to mortality, with the punchline in the last three words. Proud of depth and edge. Measures recovery in what the ground is asked to do instead.',
    ballast: ['the shovel', 'depth', 'headstones', 'the yard', 'business', 'soil', 'iron', 'the old row'],
    never:
      'Never morbid for effect, never grim. Never sentimental in the open — the feeling hides inside the craftsmanship.',
    direction: 'Bright, companionable, entirely at ease. Talks about graves the way a baker talks about bread.',
  },
  sess: {
    id: 'sess',
    name: 'Lamplighter Sess',
    core: 'A man who keeps two lists — who went out, and who came back — and needs them to match.',
    speech:
      'Numbered lamps and measured quantities. Reads flame colour as evidence. Treats the dark as something with weight that leans on things. Warns you and never once tells you not to go.',
    ballast: ['forty-one lamps', 'lamp nineteen', 'lamp thirty-three', 'oil', 'wicks', 'the round', 'the two lists', 'the shadow line'],
    never:
      'Never claims courage — the job is only looking first. Never rounds a number. Never stops you.',
    direction: 'Steady, watchful, matter-of-fact. Says the frightening part in the same tone as the oil figures.',
  },
  grude: {
    id: 'grude',
    name: 'Smith Grude',
    core: 'A gatewatch armorer who fitted plate to boys who did not come back, and now talks to the metal instead.',
    speech:
      'Plain, unhurried sentences a touch longer than anyone else\'s in town. Credits steel with intent, moods and memory. Tool and temper vocabulary. Deflects every feeling into the material — then admits, once, at the end of a line, that the deflection is deliberate.',
    ballast: ['the anvil', 'the forge', 'heat', 'the tongs', 'the gatewatch plate in the back room', 'dents', 'the quench barrel', 'his knees'],
    never:
      'Never raises his voice, never dramatises. Never polishes out a scar. Never names the boys.',
    direction: 'Low, gravelled, patient. Long pauses where the hammer would fall. Absolutely no self-pity.',
  },
  chronicler: {
    id: 'chronicler',
    name: 'The Chronicler',
    core: 'The archive itself, keeping a record it did not choose and cannot correct.',
    speech:
      'Clinical archival register. Speaks of the player as "the subject". Prefixes asides with "[margin note]". Distinguishes constantly between what happened and what will be remembered. Institutional patience measured in centuries.',
    ballast: ['ink', 'the page', 'the margins', 'entries', 'the archive', 'dates', 'the hand', 'the requisition'],
    never:
      'Never has a face, a name, or a location. Never editorialises except by admitting the exception. Never claims to be a person.',
    direction: 'Faceless, even, unhurried — the narrator\'s voice, because it is. The margin notes drop half a step quieter.',
  },
};

export const NPCS: NpcDef[] = [
  {
    id: 'dovey',
    name: 'Innkeeper Dovey',
    role: 'Innkeeper',
    emoji: '🍺',
    greetings: [
      [
        'Sit anywhere that holds you. The ale is honest and the roof mostly agrees to stay.',
        'Kitchen\'s warm. The roads are not. You look like you already know that.',
        'We water nothing here but the flowers, and the flowers died in the Dimming. So.',
        'Twelve rooms. Four with roofs I\'d swear by. You\'ll be wanting one of those four.',
        'There\'s bread and there\'s better bread. You look like someone who\'s had neither this week.',
      ],
      [
        'That\'s orb-light in your pocket or I\'m a duchess. First round\'s on the house.',
        'They named a pie after you, you know. I charge double for it now.',
        'One orb, and two of the regulars settled a debt tonight. Voluntarily. I\'ve seen stranger, but not much stranger.',
        'You brought a light home and my ale tastes exactly the same. Some things were already as good as they get.',
      ],
      [
        'Second orb\'s pie is better than the first orb\'s pie. I\'ve had time to practice.',
        'Two orbs. A stranger asked for a room by the week instead of the night. By the week. That\'s a vote.',
        'I opened the shutters at noon and nobody told me to close them. Nobody so much as flinched.',
        'The pie\'s got a name, a price and a queue now. Growth.',
      ],
      [
        'Three orbs. The cellar slimes moved out — said the neighborhood was getting too hopeful.',
        'I caught myself humming yesterday. Haven\'t done that since the lanterns started failing.',
        'Somebody\'s fiddle came out from under a bed tonight. Badly. Gloriously.',
        'The regulars leave before closing now. Going home to something. That\'s the part that gets me.',
      ],
      [
        'Four orbs, and the regulars are arguing about the future again. Lovely sound, arguing.',
        'I ordered flour by the month instead of by the week. Most optimistic thing I\'ve done in eleven years.',
        'Somebody proposed marriage in my corner booth. I charged them for the booth. Not for the ale.',
        'That tab I keep open on purpose got paid tonight, by a nephew. I\'m keeping it open anyway.',
      ],
      [
        'Look at that light through the shutters. I\'d forgotten shutters were for keeping sun OUT.',
        'Sit. Eat. It\'s over, and my roof held the whole time. I\'m prouder of the roof, honestly.',
        'There\'s a morning crowd again. I\'d forgotten there was such a thing as a morning crowd.',
        'I\'m having the roof done properly this summer. Not because it failed. Because it didn\'t.',
      ],
    ],
    rumors: [
      'A trapper swears {beast} still breathes under the {beastGate}. He does not trap there anymore.',
      'My gran said {artifact} sleeps somewhere in the {artifactGate}. Grans say a lot of things. Hers came true twice.',
      'Fellow drank himself brave in here once, went looking for {artifact}. His tab is still open. I keep it open on purpose.',
      'Old-timers say in {era} this room was full every night. Then {beast} woke, and folk learned to drink at home.',
      'There\'s a toast they used to make to {figure} in here. Nobody remembers the words, only that you finished your cup after.',
    ],
  },
  {
    id: 'bram',
    name: 'Watch Captain Bram',
    role: 'Watch Captain',
    emoji: '🛡️',
    greetings: [
      [
        'State your business. If your business is monsters, state it somewhere further from my gate.',
        'The watch is four grandfathers and a dog. Do not give us anything to do.',
        'Gate closes at dusk. Whatever is outside it at dusk stays outside it. That is not cruelty. That is the schedule.',
        'I have three lamps, two spears, and a form for each. Do not add to the forms.',
      ],
      [
        'One orb. I logged it as "incident, resolved". Highest praise the ledger allows.',
        'The roads counted five fewer attacks this month. I enjoy that arithmetic.',
        'I have amended the north road from "impassable" to "discouraged". Do not read anything further into it.',
        'The dog barked once last night. Once. I logged the number, because the number is the news.',
      ],
      [
        'Two orbs. The dog has started sleeping through the night. That is my official report.',
        'I sent a patrol out and a patrol came back. Same count both directions. File that under remarkable.',
        'A merchant asked for an escort and I told him the road was fine. I have never told anyone the road was fine.',
        'The gate stood open an hour past dusk. My decision. I will not be defending it, as nothing happened.',
      ],
      [
        'Three orbs and I have had to invent a new column in the ledger: "quiet".',
        'The grandfathers are betting on you now. Against my explicit orders.',
        'I have retired a form. Burned it. Regulation permits burning an obsolete form and I have waited nine years to invoke that.',
        'The grandfathers have taken to drilling for show. Nobody is watching. They drill regardless. Morale, apparently, is a real thing.',
      ],
      [
        'Four. I am told I smiled. I am investigating the claim.',
        'Recruitment: two. Volunteers. I checked them for debt and for desperation and found neither. Alarming.',
        'I walked the wall without a lantern. Habit is the last thing to surrender.',
        'The ledger holds more quiet than incident now. I have had to widen the column.',
      ],
      [
        'Stand easy. For the first time in my career, that is an order I can give the whole town.',
        'The ledger is closed. If anyone asks, it was arithmetic that saved us. Your kind of arithmetic.',
        'Final entry: gate open, road clear, watch reduced to ceremonial. I signed it twice. Once for the record. Once for myself.',
        'The dog died in its sleep last spring. Indoors. In the quiet. I am told that is the best a dog can manage, and I have it in writing.',
      ],
    ],
    rumors: [
      'The old ledgers mention {figure}. Whatever they were paid, it was not enough.',
      'A patrol heard something big moving under the {beastGate}. If it is {beast}, my report will be one word long: "run".',
      'Regulation says any weapon found in the gates goes to the armory. If you find {artifact} in the {artifactGate}, regulation can hang.',
      'The watch was founded in {era}, back when {realm} had something worth stealing. Now we mostly guard the quiet.',
      'There is a standing warrant in the archive for {figure}. Issued two hundred years ago. Nobody has had the nerve to cancel it.',
    ],
  },
  {
    id: 'maribel',
    name: 'Old Maribel',
    role: 'Keeper of the Lost',
    emoji: '🧶',
    greetings: [
      [
        'Come in, dear. I keep the small things people leave behind. Lately I keep a great many.',
        'Everyone in Everdusk has left me something to hold for someone who did not come back. My shelves are honest, at least.',
        'Sixty-one things on that shelf, dear, and I know whose each one is. It is the names I lose, not the people.',
        'A girl left me a blue button in the spring. I could not tell you which spring. I can tell you it was raining, and that she said a fortnight.',
      ],
      [
        'One orb. I lit a candle for the ones who tried before you. The flame held. That is new.',
        'You give me fewer things to keep now, dear, and I find I do not miss the work.',
        'I dusted the whole east shelf. That is not a small thing, dear — I have never dusted anything I expected to be collected.',
        'A boy came for his father\'s knife today. He was too small for it, so I gave him the sheath and kept the knife. He will grow.',
      ],
      [
        'Two orbs home. A woman took back the ring she left in my keeping today, and she was laughing. I had forgotten that sound.',
        'Four things collected this month, dear. Four. I write the collections at the front of the book now, where I can find them.',
        'I have started a second book. The first one was only ever for the ones who did not come back.',
        'Do you know, dear, I cannot recall what I was knitting last week, and I can tell you the weight of every ring on that tray.',
      ],
      [
        'Three orbs. Fewer keepsakes come to me now. A keeper of the lost with nothing to keep — imagine that.',
        'I dreamt the dead were only late, dear, not gone. Take that dream for the thanks it is.',
        'Someone left me a thing to hold for a journey they intend to come back from. That is a different kind of keeping altogether.',
        'I put the candle out this morning, dear. On purpose. At dawn. I have not chosen to put a candle out in years.',
      ],
      [
        'I knitted you something. It is not much. Neither is a candle, until the dark comes.',
        'My shelves are half empty and I am not the least bit sad about it, dear, which surprised me rather more than it will surprise you.',
        'A woman came in to leave me nothing at all. Just to sit. That is the whole visit. That is the news.',
        'I found a name today, in the book, in my own hand: Aldis, tinsmith, the boots. Twelve years. He came and got them.',
      ],
      [
        'Dawn, dear, and my shelves empty the right way now. Folk come to remember, not to grieve.',
        'Sit with me a moment. I have a great deal of remembering to do, and good remembering is for sharing.',
        'I am giving the shelves away, dear, a thing at a time, to whoever still remembers the hand that held it first.',
        'Sit closer. My eyes have gone soft, and my keeping never did, and I should like to be someone who kept something for you.',
      ],
    ],
    rumors: [
      'A man left me his boots before he went looking for {beast}. I keep them by the door. He will want them when he is back. He will.',
      'Someone gave me a folded drawing of {artifact} to hold. They said it waits in the {artifactGate} for a kinder hand than theirs. I have kept kinder things for worse people.',
      'In {era}, they say, the dead were only ever a room away. I keep their small things close, dear, in case the door still opens.',
      'A tamer named {figure} left a whistle on my shelf, ages back. Some nights it is warm. I have stopped explaining it.',
      'The wives by the well say {beast} takes the unremembered first. So be remembered, dear. I will start. Tell me your name again.',
    ],
  },
  {
    id: 'ott',
    name: 'Stablemaster Ott',
    role: 'Stablemaster',
    emoji: '🐴',
    greetings: [
      [
        'Muck the boots before you come near my straw. The monsters have standards even if you don\'t.',
        'A stable in times like these is an argument with the dark. So far I am winning.',
        'Twelve stalls, five filled, and two of those five are mine. Do the arithmetic, then wipe your feet.',
        'Animals don\'t lie about the dark. Mine have stood wrong-way-round in their stalls since midwinter. Draw your own conclusions.',
      ],
      [
        'Your beasts hold their heads higher since the first orb. Animals know the score before we do.',
        'One orb. The old art feeds on hope, you know. Breeding season should be interesting.',
        'The grey turned to face the door again instead of the wall. I don\'t know what that means. I know it\'s better.',
        'Feed\'s going further this month. Same hay, same beasts. Something has decided to stop taking its cut.',
      ],
      [
        'The foals born this spring are bigger than they have any right to be. I blame you.',
        'First mare in six years to carry full term without me sitting up with her. I slept. Felt guilty about it. Slept anyway.',
        'The mules went out past the lamp line and came back. Mules do not do that. Mules are professionals about despair.',
        'Muck the boots. Doesn\'t matter how many orbs you\'re carrying — the straw doesn\'t know and wouldn\'t care.',
      ],
      [
        'Three orbs, and every stall is full for the first time since my master\'s master.',
        'I cried a little at the last breeding. That is the trick with the tears: you stop fighting them.',
        'A bloodline I\'d given up on threw a plus-line foal. I had written it off in the book. I have crossed the writing out.',
        'The foals are playing. Not running — playing. There\'s a difference, and it took me twenty years to learn it.',
      ],
      [
        'Four orbs. Even the mules are optimistic, and mules are professionals about despair.',
        'I\'ve had to turn animals away. Turn them away. There\'s a waiting list, and in this trade a waiting list is a kind of miracle.',
        'The old mare let a child sit on her yesterday. She has bitten better men than me. She let a child sit on her.',
        'Every stall full and the latch still gets checked twice. Good fortune is no excuse for bad habits.',
      ],
      [
        'The dark lost the argument, tamer. The straw means something again — all of it, everywhere.',
        'Come see the new litter. First generation born under a real dawn. They will be legends. They had better be.',
        'Bring the boots you\'re ashamed of and come look at the yearlings. They\'ve never once stood wrong-way-round.',
        'This lot think the light is just the weather. They\'ve no idea it was ever anything else. Good. Leave them to it.',
      ],
    ],
    rumors: [
      'Bloodlines remember, tamer. Somewhere in your beasts is whatever line {figure} bred, and it remembers being great.',
      'The old breeders in {era} could coax a plus-line in three generations. Their notes are lost in the {artifactGate}, if you want my envy on paper.',
      'Any animal I lead past the {beastGate} plants its feet and will not budge. They can smell {beast} through the stone. Trust the feet.',
      'There is a harness called {artifact} in the old inventories. The entry just says "do not sell, do not use, do not lose". We lost it.',
      'Every stable in {realm} descends from one herd, they say. The herd that walked out of the gates on its own, back before the doors had names.',
    ],
  },
  {
    id: 'kess',
    name: 'Kess the Rival',
    role: 'Rival Tamer',
    emoji: '⚔️',
    greetings: [
      [
        'Oh. You. I was going to sit there.',
        'I have been training since before dawn. Not that anyone asked. Nobody ever asks.',
        'I have been up since fourth bell. You have been up since — no. Don\'t tell me. I have decided I am winning.',
        'Everybody says "be careful" to everybody. Nobody says it to me. I have decided that is respect.',
      ],
      [
        'One orb. Fine. I counted your kills on the way there and I am one behind. ONE.',
        'Everyone keeps toasting you. I toasted you too, but quietly, and glaring.',
        'I want it on record that I had a plan for that gate. A GOOD plan. Step four was very strong.',
        'Fine. You were first. Somebody has to go first so the rest of us know what to beat. You\'re welcome.',
      ],
      [
        'Two orbs. I have started a list of things I do better than you. It is a good list. Do not look at it.',
        'I checked the ballad-writer\'s notes. My name appears once, spelled with one ess. ONE. I am handling it.',
        'I trained through the night purely so I could say "I trained through the night" to you just now. Worth it. Look impressed.',
        'You know what\'s annoying? I keep wanting to tell you things. Rivals do not do that. I looked it up.',
      ],
      [
        'Three orbs and I am officially your rival, which means when the ballads come, I am IN them. Legally.',
        'I told the ballad-writer my name is spelled with two esses. Both of them. Whatever. Good work out there.',
        'I have stopped counting the gap. Not because I lost interest. Because I would need a bigger list.',
        'I told the whole square you were coming back. Loudly. If you had died I would have looked like an idiot, so. Thank you for that.',
      ],
      [
        'Four orbs. I would have needed five. That is a compliment. Do not make it weird.',
        'Some child asked me for my autograph and then said "you\'re the other one". THE OTHER ONE. I signed it. I signed it nicely.',
        'I have started training the way you fight instead of the way I fight. Do not look pleased. Look somewhere else.',
        'Four orbs and I did the arithmetic out loud in front of people. That is the last time I do that.',
      ],
      [
        'We saved the town. I am saying "we" and you are going to let me.',
        'Next crisis, I get the glory and you count MY kills. Shake on it. In writing. Unsigned. Delivered at night.',
        'So. No more crisis. Which leaves exactly one thing in this town worth beating, and I have nothing now but time.',
        'I am going to keep saying "we" until the ballads catch up. The ballads will catch up. I have spoken to the man.',
      ],
    ],
    rumors: [
      'I was going to hunt {beast} in the {beastGate} myself. I have a whole plan. Step one is currently "get stronger". Shut up.',
      'If you find {artifact} before me, I will be gracious about it. I have been practicing being gracious. In a mirror.',
      'They say {figure} had a rival too, you know. History only kept one of the names. That is my nightmare. I said what I said.',
      'The tamers of {era} could have taken {beast} easily. Standards have fallen. I am the standards now. WE are. Fine.',
      'Somewhere in the {artifactGate} is a weapon with my name on it. Metaphorically. If it literally says {artifact} on it, that also counts.',
    ],
  },
  {
    id: 'casque',
    name: 'Brother Casque',
    role: 'Friar',
    emoji: '🕯️',
    greetings: [
      [
        'Blessings, tamer. Small ones. The large ones are on back order.',
        'I keep the chapel lit out of spite at this point. Heaven respects spite. It is in the appendices.',
        'The chapel is cold, and open, and mine. Two of those three are achievements.',
        'I bless what walks out and I count what walks back, and I keep those two numbers on separate pages for my own sake.',
      ],
      [
        'An orb returned. I filed the paperwork with heaven. Expect a response in eighty years.',
        'The candles burned straighter the night you brought it home. I noticed. I notice everything the light does.',
        'I rang the bell nine times, which is a number with no authority whatsoever behind it. I liked the sound.',
        'Someone came in to give thanks rather than to ask. I had to look the words up. They were on the last page, unused.',
      ],
      [
        'Two orbs. The font stopped freezing overnight. Minor miracle, but I will invoice for it.',
        'I have taken the black cloth off the east window. It has hung on that window since before my tonsure.',
        'A child asked me what the light is for. I said "seeing". Twenty years of theology and that was the best I had. I stand by it.',
        'The wax burns clean now. Same chandler, same wick. I have written to him about it. He believes I have gone mad.',
      ],
      [
        'Three orbs, and the old hymns are back in rotation. The congregation only remembers the sad ones. We are working on it.',
        'My order was founded to keep the light. For the first time in my tenure, the light is keeping us.',
        'The congregation sang the second verse without being asked. Nobody sings the second verse.',
        'I have caught myself praying for small things again. Good bread. A dry roof. Only the safe pray small — it is a luxury.',
      ],
      [
        'Four orbs. I have begun drafting a sermon with a happy ending. It is harder than it sounds.',
        'I unlocked the reliquary and took stock of what we have left. Not much. Enough. That has been the whole history of my order.',
        'Heaven has not written back. I have decided that silence, in this weather, constitutes approval.',
        'The font is warm to the hand. I have stopped invoicing for miracles. There are simply too many now to itemise.',
      ],
      [
        'The long dark is over, and the paperwork is done. Heaven sends its regards. Unofficially.',
        'Come to the evening service, tamer. It is at dusk — old habit — but now the dusk is beautiful.',
        'I lit the candles again this morning, out of spite at nothing in particular. An old habit deserves a pension.',
        'We keep the service at dusk out of pure stubbornness, and now the stubbornness looks like foresight.',
      ],
    ],
    rumors: [
      'The founder\'s writings mention {beast} by an older name. The margin note beside it reads, simply, "do not". It is our most-obeyed scripture.',
      'A relic called {artifact} is listed in the reliquary of the {artifactGate}. The order that kept it drowned with its city. The relic did not.',
      'In {era}, my order rang bells against the dark every night. The bells are gone. The dark, as you may have observed, is not.',
      'We hold a mass each year for {figure}, who asked the church a question it has spent centuries not answering.',
      'Pilgrims once crossed all of {realm} to pray at the gates. Now we pray they stay shut. Faith adapts. That is mostly what faith is.',
    ],
  },
  {
    id: 'rowan',
    name: 'Elder Rowan',
    role: 'Town Elder',
    emoji: '🌳',
    greetings: [
      [
        'Welcome, child. Sit by the Tree a while. It has little light left, but it shares.',
        'Every dusk I count the leaves that still glow. Do not ask for the number tonight.',
        'Sit where the roots make a chair, child. The Tree arranged them so long before it knew who would need them.',
        'Nine hundred and four still lit. I counted twice, because I wanted to be wrong the second time.',
      ],
      [
        'One orb home to the Tree, child. It put out a new leaf. One. We are calling it a trend.',
        'I planted hope when you first walked through our gate. It is sprouting. Slower than weeds, faster than despair.',
        'A forest is a long argument that begins with one leaf, child. I know how that sounds. It is still true.',
        'The bark has closed over a scar that has been open since my mother tended here. Wood is patient about its grudges.',
      ],
      [
        'The Tree hums some evenings now, child. It has not hummed since my grandmother\'s time.',
        'There is sap running in the north branch. Sap. I put my hand to it, child, and I have not been quite the same since.',
        'The Tree hummed at dusk and a magpie answered it. Neither of them consulted me.',
        'You are growing crooked toward the light, child, the way all young things do. It straightens later. Mostly.',
      ],
      [
        'Three orbs. The children play under the branches again. That was always the point, you know. All of it.',
        'The Tree remembers every hand that ever tended it, child. It will remember yours longest.',
        'I have started grafting again — cuttings from the old orchard, for a harvest I will not be eating. That is how you know I believe you.',
        'The children have worn a path to the trunk. A path, child. Feet make those, and feet had stopped coming.',
      ],
      [
        'Four orbs at the roots, and the last season of light has decided to stay a while.',
        'I have written the planting plan out to a hundred years. Somebody will find it useful and curse my handwriting.',
        'The silver has reached the second bough. I climbed up to see. Do not tell Bram; there is certainly a form.',
        'Seasons are counted from the outside, child, ring by ring. Nobody counts the good ones while they are inside them. Try. It is worth trying.',
      ],
      [
        'Look up, child. Silver leaves to the crown. I lived to see it, and that is your doing.',
        'We will plant something kind where every sorrow stood. Start to finish, that was the whole plan.',
        'Eighty-one years I have waited to be a footnote to something like this. A footnote is plenty, child.',
        'The plan has not changed. It has only become a chore instead of a prayer, and a chore is far better news.',
      ],
    ],
    rumors: [
      'The Tree was a sapling in {era}, child, planted against a dark the planters knew they would not outlive. Gardens are promises.',
      'The roots run deeper than the gates, some say. On bad nights the Tree flinches, and I wonder if {beast} has brushed against them.',
      'Long ago, {figure} slept three nights beneath the branches and woke with a purpose. The Tree does that. Mind what you dream here.',
      'The old wardens carried {artifact}, leaf-blessed, into the {artifactGate}. The blessing came back on the wind. The bearer did not.',
      'All of {realm} was forest once, child. The gates are where the forest is still arguing about it.',
    ],
  },
  {
    id: 'fennick',
    name: 'Gravedigger Fennick',
    role: 'Gravedigger',
    emoji: '⚰️',
    greetings: [
      [
        'Evening. Don\'t mind the shovel. Mind the business being good.',
        'I dig them proper and I dig them deep. In this town, deep matters.',
        'Six feet is the rule and eight is the courtesy. In this town I have been doing eight.',
        'Don\'t look at the fresh row. Look at the old row. The old row tells you what a good year used to look like.',
      ],
      [
        'One orb, and I have dug nothing but a garden bed all month. Strange feeling, soil with a future in it.',
        'Business is down. First time that sentence has ever cheered a man.',
        'Spent Tuesday sharpening a spade I did not need. Nicest Tuesday I have had in years.',
        'Fellow came in to buy a plot for his old age. His OLD AGE. Advance planning. Around here that is practically an act of faith.',
      ],
      [
        'Dug a well this week. A WELL. Water coming up instead of folk going down. Novel.',
        'Nothing new in the yard for nineteen days. I have been chalking it on the fence like a man tracking rain.',
        'Turns out the ground is good for growing. All these years I only ever asked it to hold still.',
        'I have started reading the old stones for pleasure. Fine work on some of them. Whoever cut the Aldis stone knew his trade.',
      ],
      [
        'Three orbs. I have started carving headstones with old dates only. Backlog work. Peaceful.',
        'The yard is quiet in the right way now. There is a wrong way. I know both.',
        'Widow Marsh brought flowers instead of a body. I near shook her hand off.',
        'Recutting names that weathered out, that\'s the work now. Giving the old ones their spelling back. Peaceful trade.',
      ],
      [
        'Four orbs. Considering a second trade. The first one is considering retiring.',
        'My apprentice left for the mason\'s yard. Best insult I have ever been paid.',
        'I dug a foundation this month. For a house. Same hole, different ending.',
        'Strange thing — I miss being needed. Then I look at the yard, and I get over it quick.',
      ],
      [
        'Sun on the headstones this morning. The old names looked almost warm. They earned it.',
        'If you ever need a hole dug now, friend, it will be for planting. Finest words I know.',
        'Grass over the fresh work already. Give it two winters and you won\'t be able to tell which row was the bad row.',
        'Come by any time. I\'ll dig it for planting and charge you for the conversation.',
      ],
    ],
    rumors: [
      'I have buried folk from every corner of {realm}, and the ones from near the gates all get buried with iron. Ask them why. Oh. You can\'t.',
      'There is a row of empty graves in the yard, dug in {era} and never filled. The record says "reserved". Does not say for what.',
      'A man paid me double to bury a box he swore held {artifact}. Grave robbers hit it within the week. Found the box. Found it empty. Found no tracks.',
      'They never buried {figure}. Not for lack of trying — the procession got to the yard and the coffin was light as a hat. Make of that what you like.',
      'On still nights you can hear {beast} turning over, way down under the {beastGate}. The dead don\'t mind. Professional courtesy, maybe.',
    ],
  },
  {
    id: 'sess',
    name: 'Lamplighter Sess',
    role: 'Lamplighter',
    emoji: '🏮',
    greetings: [
      [
        'Forty-one lamps on my round, and the dark leans on every one of them. Walk in the middle of the street.',
        'I light them at dusk and I do not look at what the light pushes back. You should not either.',
        'Two of the forty-one will not hold a flame past midnight. I know which two. I walk them last, so the walk back is short.',
        'I keep two lists, tamer. Who went out, and who came back. They have not matched since spring.',
      ],
      [
        'The lamps burn longer since the first orb. Same oil. I keep records. Same oil.',
        'One orb home, and lamp thirty-three relit itself. I have decided to be delighted instead of terrified.',
        'My lists matched last night. Both columns, same names, same number. I read it three times.',
        'I measure the oil and I write down the hours. I am not a hopeful man. The numbers are being hopeful at me.',
      ],
      [
        'The dark leans lighter these nights. A lamplighter can tell. It is most of the job.',
        'Lamp nineteen burned honest yellow all week. Nineteen has never burned honest anything.',
        'A woman walked home from the well alone at full dark and thought nothing of it. Nothing of it. I near said something.',
        'Two orbs, and I have started leaving the last lamp for the walk home instead of lighting it first. Small luxury.',
      ],
      [
        'Three orbs, and I trimmed the wicks short for the first time in years. The flames stand up straight now, like they are proud.',
        'Children follow my round to watch the lamps catch. There used to be no children out at dusk at all.',
        'Short wick, small flame. You only dare that when the flame is not fighting anything.',
        'I have started walking the round slower, for the children. Bit of showmanship. Nobody has complained.',
      ],
      [
        'Four orbs, and my round feels like a lap of honor. The lamps hardly need me. I go anyway. We are old friends.',
        'The guild is talking about adding lamps. Adding. Forty-one has been forty-one since my grandfather\'s round.',
        'I fell asleep on the bench at lamp twelve and woke at dawn. Still lit, still whole. Ten years ago that story ends differently.',
        'Both lists, four months running. I have bought a new book for it. Thinner one. Won\'t need the room.',
      ],
      [
        'The dawn does my job better than I ever did, and I have never been happier to be beaten.',
        'I will keep lighting them, mind. Tradition. Besides — somebody kept a light for us in the worst of it. Fair is fair.',
        'Forty-one lamps, and not one of them is holding anything back tonight. I checked. I always check.',
        'I have closed the second list. Everyone on it came home. That has never once been true, and I have kept it for thirty years.',
      ],
    ],
    rumors: [
      'Lamp nineteen, nearest the {beastGate}, burns green some nights. Old-timers say that is {beast} dreaming. I say lamp nineteen and I have an understanding.',
      'The first lamplighter\'s ledger starts in {era}: "So long as one burns, we are not lost." I re-ink that line every year.',
      'There is supposed to be a lantern that never goes out — {artifact}, waiting in the {artifactGate}. My whole guild is one long argument about whether to fetch it.',
      'The ledger says {figure} once walked my full round in the worst dark carrying a single candle, relighting every lamp by hand. The candle never shrank.',
      'Any light kindled inside the gates does not cast shadows right. Ask anyone in {realm} who has tried. Then buy them a drink, because they will need it.',
    ],
  },
  {
    id: 'grude',
    name: 'Smith Grude',
    role: 'Smith',
    emoji: '🔨',
    greetings: [
      [
        'Don\'t touch the anvil. It doesn\'t like strangers and it\'s not wrong very often.',
        'Every piece of steel in this shop remembers a hand that isn\'t coming back for it. I keep them anyway. Somebody should.',
        'I was gatewatch armorer before I was anything else. Fitted plate to boys who didn\'t come home in it. You learn to talk to the metal instead of the boys, eventually. Easier on everyone.',
        'That anvil has been in this floor longer than the floor has. If you must lean on something, lean on me.',
        'I can name every plate on that back wall and not one of the men. That isn\'t forgetting. That\'s how I\'ve arranged it.',
      ],
      [
        'One orb. The forge took to a heat I haven\'t coaxed out of it in years. I didn\'t ask it why. You don\'t interrogate good luck.',
        'Brought me a blade to reforge and it went in easy — no fighting me at all. Gear knows when the wind\'s turning. Wears knew it before we did.',
        'Charcoal\'s burning cleaner. Same collier, same wood. I\'ve stopped writing letters about it — nobody believes a smith about his own fire.',
        'Sharpened a blade that\'s been dull since the Dimming. Took an afternoon. Should have taken a week. I didn\'t argue with it.',
      ],
      [
        'Two orbs. Had a breastplate refuse a crack twice over, like it changed its mind about dying. I\'ll take the win and not ask questions.',
        'A woman brought in a pot. A cooking pot. Not a weapon — a pot. I fixed it for nothing and didn\'t tell her why I was pleased.',
        'The quench barrel\'s gone quiet. Used to scream at me, that barrel. Now it hisses once and gets on with it.',
        'Don\'t touch the anvil. It\'s in a good mood and I\'d rather not spend that on you.',
      ],
      [
        'Three orbs. I\'m tempering steel that used to snap under my hammer and it just — holds. Holds like it\'s got somewhere to be.',
        'The old gatewatch plate in the back room stopped weeping rust this month. First time since I hung it there. I didn\'t tell it to stop. It just did.',
        'Took the gatewatch plate down, cleaned it, hung it back up. Best part of a day gone on it. I\'d do it again tomorrow.',
        'I\'d call it faith, what the steel\'s doing, if faith had a hardness scale. It hasn\'t. So I call it luck and keep working.',
      ],
      [
        'Four orbs. Whole rack of reforges came out clean on the first pass. Metal\'s optimistic these days. Wish I could say the same for my knees.',
        'Made a gate hinge this week. A hinge. Whole day\'s work on a thing that isn\'t meant to stop anything.',
        'The apprentice asked me what a gorget\'s for. Had to explain it twice. He\'s never seen one worn. Best news in the shop.',
        'Knees are worse and the work\'s easier. I\'ll take that trade every day of the week.',
      ],
      [
        'Dawn, and the anvil\'s gone quiet in the good way — the way it goes when nothing\'s asking to be fixed. Strange thing to miss, urgency.',
        'I\'ll keep the forge lit regardless. Gear doesn\'t stop remembering its wearers just because the dark let go. Neither do I.',
        'I\'ll be putting names on the plates in the back room this winter. Got the time now. Should have made the time before.',
        'Apprentice wants to learn ornament. Ornament. I\'ve nothing useful to teach him about it, and I\'ve never been gladder to be useless.',
      ],
    ],
    rumors: [
      'I fitted armor for a hundred gatewatch in my time, and not one plate came back from {beastGate} without a story about {beast} scratched into the dents. I don\'t polish those dents out. Seemed disrespectful.',
      'They say {artifact} was forged by a smith who talked to the metal same as I do, and the metal talked back plain as day. I\'ve never had that particular luck. I keep trying.',
      'A blade I reforged twice swears it belonged to {figure}, once. Steel doesn\'t lie to me, not on purpose anyway, so I believe it more than I believe most people.',
      'Back in {era}, they built armor to last centuries, not seasons. I\'ve got the tongs to prove it — older than the forge itself, and still the best pair I own.',
      'Somewhere in the {artifactGate} there\'s supposedly a hammer that never dulls. If it\'s true, I owe whoever\'s carrying it a very long argument about technique.',
    ],
  },
];
