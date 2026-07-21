// Ambient one-line barks NPCs say while hosting their service screens (stable,
// smith, item shop, quest board, tavern, chronicle). Said one at a time while
// the player browses — not a conversation, not story-gated. See npcs.ts for
// full NpcDef entries and voice; these are separate from greetings/rumors.
/** One-line barks NPCs say while hosting their service screens.
 * Slots: {name} = hero name, {monster} = a random party monster's nickname.
 * Context keys are computed by the caller; 'default' is required for every NPC. */
export type BarkContext =
  | 'default'      // always available
  | 'bondHigh'     // a party monster has bond >= 25
  | 'bondLow'      // a party monster has bond <= 2
  | 'partyEmpty'   // no monsters tamed yet
  | 'goldRich'     // player gold >= 500
  | 'goldPoor'     // player gold < 30
  | 'retelling'    // this is telling >= 2 (the hero has died before)
  | 'postOrb';     // at least one orb recovered

export const SERVICE_BARKS: Record<string, Partial<Record<BarkContext, string[]>> & { default: string[] }> = {
  ott: {
    default: [
      'Mind the gate latch. {monster} figured out how to work it and I am not proud of that.',
      'Straw\'s fresh this morning. Don\'t tell the mules — they get territorial about fresh straw.',
      'You want to breed, feed, or just stand there looking at my animals? All three\'s fine, just say which.',
      '{monster}\'s been pacing the stall since dawn. Restless blood. I like restless blood.',
      'A stable\'s just an argument with the dark, tamer. Every animal in here is on my side of it.',
      'Careful with the salve on that one. It bites the hand that heals it. Character flaw. Endearing, mostly.',
      'I name them all eventually. Takes a while. Names are a promise and I don\'t hand those out cheap.',
      'You breed two of mine, you\'re not just making a monster. You\'re making a bet. I like your odds today.',
    ],
    bondHigh: [
      '{monster} came looking for you before you even walked in. That\'s not training. That\'s something else.',
      'I don\'t interrupt a bond like that one. Not my business to. You two go on ahead.',
      'Watched {monster} refuse a treat from my own hand this week. Wanted yours instead. Rare thing, that.',
    ],
    bondLow: [
      '{monster} still flinches when the gate opens. Give it time. Trust is slow work, same as breeding.',
      'That one hasn\'t decided about you yet. Don\'t push. Animals smell pushing.',
      'I\'ve got a soft spot for the wary ones. {monster} qualifies. Be patient with it.',
    ],
    partyEmpty: [
      'Empty stalls waiting on you, tamer. A stable with nothing in it is just an expensive shed.',
      'Come back when you\'ve got something worth boarding. I\'ll keep the hay fresh either way.',
    ],
    goldRich: [
      'Flush, are you. I could use that toward the new roof beam. Purely a suggestion.',
      'Spend it on a good breeding pair, not trinkets. Trinkets don\'t foal.',
    ],
    postOrb: [
      'Every animal in this stable\'s held its head higher since the first orb came home. They know before we do.',
      'Breeding season\'s been interesting since the light came back. I blame you, gladly.',
    ],
    retelling: [
      'The old mare pinned her ears at you before you said a word. She remembers something I don\'t. Animals are like that.',
      'Funny — {monster}\'s bloodline acted like this once before, a life or two back. Or maybe I\'m just old.',
      'Something in the herd knew your step before you reached the gate. I\'ve stopped asking how.',
    ],
  },
  grude: {
    default: [
      'Hold still, that one\'s deciding whether to let me touch it. Steel does that.',
      'You want it reforged or just admired? I don\'t do admiring on the clock.',
      'This edge has seen better days. Haven\'t we all.',
      'I talk to the metal more than the customers. The metal listens better.',
      'Every reforge is a negotiation. Sometimes the item wins. I respect that.',
      'Don\'t rush me. Rushed steel is bad steel, and bad steel gets people killed.',
      'Gear remembers its wearer, tamer. Treat it accordingly.',
      'Set it on the anvil, not the bench. The bench doesn\'t care. The anvil does.',
    ],
    goldRich: [
      'You\'ve got coin to spare, I\'ve got steel that deserves better than sitting in a rack.',
      'Don\'t flash gold at me like that. Flash it at the ore instead — better return.',
    ],
    goldPoor: [
      'Light on coin? The anvil doesn\'t discount, but I\'ve been known to. Once. Don\'t spread it around.',
      'Come back when you\'ve got more. I\'m not running a charity, whatever the ledger implies.',
    ],
    postOrb: [
      'Forge took to a heat I haven\'t coaxed out of it in years. Didn\'t ask why. Good luck doesn\'t like being interrogated.',
      'Steel that used to fight me under the hammer just holds now. Like it\'s got somewhere to be.',
    ],
    retelling: [
      'Funny thing — this hammer swung easier the moment you walked in. Like it remembered your grip. Steel doesn\'t forget, whatever I tell people.',
      'I\'ve reforged this exact nick before. I\'d swear to it. The metal never argues twice about the same flaw unless it knows the hand.',
    ],
  },
  maribel: {
    default: [
      'Now where did I put that... oh. It was always right there. Everything is, eventually.',
      'Someone left this behind, dear. I forget who. I remember that they were kind, though. I always remember that part.',
      'Take your time browsing. My shelves aren\'t going anywhere, unlike everyone who filled them.',
      'This one I\'ve had so long I\'ve started to think of it as mine. It isn\'t. Don\'t tell it that.',
      'A keeper of the lost has a great many things and very few certainties, dear.',
      'I could swear that trinket wasn\'t here yesterday. Or maybe it always was. My shelves are patient with me.',
      'Everyone in Everdusk has left me something to hold for someone who didn\'t come back. Perhaps this is yours.',
      'Mind the dust, dear. It settles kindly here. I\'ve made my peace with it.',
    ],
    partyEmpty: [
      'No companions yet, dear? The shelves will still be here when you\'ve found one worth sharing them with.',
      'Come back with a friend at your side. Everything looks better shared. Even old boots.',
    ],
    goldPoor: [
      'Light purse, dear? I\'ve been known to trade a kindness for a kindness. No coin required, some days.',
      'Don\'t fret the gold. Half of what\'s here I\'d give away if the shelves weren\'t so possessive.',
    ],
    postOrb: [
      'Fewer keepsakes come to me now, dear. A keeper with less to keep — imagine that. I don\'t miss the work at all.',
      'I lit a candle for the ones who tried before you. It\'s still holding. That\'s new, dear.',
    ],
    retelling: [
      'You have a face I\'ve kept something for before, dear. I just can\'t recall whose. Perhaps it was always going to be yours.',
      'This shelf rearranges itself when you\'re near, dear. It did the same thing once before. I didn\'t mention it then either.',
      'I keep finding things I don\'t remember shelving. They all seem to be for you. Strange bookkeeping, this life.',
    ],
  },
  bram: {
    default: [
      'Sign here. And here. The board doesn\'t process unsigned business.',
      'The ledger says four grandfathers and a dog. The ledger is generous with "and".',
      'State your business plainly. The board has no patience for flourish.',
      'Every quest filed proper, every quest closed proper. That\'s the whole job, tamer.',
      'Don\'t loiter by the board. Read it, take it, or move along — it\'s not decorative.',
      'I log everything. Even the boring parts. Especially the boring parts.',
      'The watch runs on paperwork as much as steel. More, some weeks.',
      'New posting went up this morning. Try not to make me file it as "incident, unresolved".',
    ],
    goldRich: [
      'Flush, are we. The board doesn\'t take bribes. I do occasionally accept a good word to my captain.',
      'Spend that on gear, not drinks. I\'ll know if it was drinks.',
    ],
    postOrb: [
      'Fewer postings this week. I invented a new column in the ledger for it: "quiet". Feels strange writing that word.',
      'The roads counted fewer attacks this month. I enjoy that arithmetic more than I let on.',
    ],
    retelling: [
      'The paperwork on you doesn\'t add up, tamer. Dates that shouldn\'t repeat, repeating. I\'ve stopped flagging it — the ledger seems to expect you.',
      'I\'ve filed a closure on this exact quest before. Same hand, same name. I checked twice. The ink agrees with itself both times.',
      'There\'s a warrant in the archive that keeps un-expiring whenever you\'re in town. I\'m choosing not to investigate that today.',
    ],
  },
  dovey: {
    default: [
      'Sit anywhere that holds you. I\'ll bring what\'s hot.',
      'Ale\'s honest tonight. Can\'t say that for the stew, but eat it anyway.',
      'You look like you could use a seat and a minute. Both are free. The food isn\'t.',
      'Kitchen never stops, tamer. Neither do the questions from the regulars about you.',
      'Careful with that chair, it\'s older than the inn\'s good reputation.',
      'Drink up. The roads aren\'t getting any friendlier out there.',
      'I water nothing here but the flowers, and the flowers died in the Dimming. So. Drink deep.',
      'Somebody always needs feeding worse than they need advice. I stick to feeding.',
    ],
    goldPoor: [
      'Light on coin, are you. Sit anyway. I\'ll square it against the next round of orb-toasting.',
      'Tab\'s open, tamer. Has been for stranger reasons than an empty purse.',
    ],
    postOrb: [
      'That\'s orb-light in your pocket or I\'m a duchess. First round\'s on the house, same as always.',
      'They named a pie after you. I charge double for it now. Fair\'s fair.',
    ],
    retelling: [
      'I already poured you the drink you liked last time. Don\'t ask me how I knew — some habits outlive the memory of forming them.',
      'You\'ve got the same order every life, apparently. I stopped questioning it around the second time.',
      'Funny, I set your usual seat aside before you walked in. Force of habit, or something stranger. Sit.',
    ],
  },
  chronicler: {
    default: [
      '[margin note] Subject entered. Noted without comment, for once.',
      'The page waits for you the way it always has. Ink doesn\'t get impatient. I do, a little.',
      'Every deed gets a line, eventually. Some get more than one. Try to earn the second.',
      '[margin note] Habits repeat. So does the handwriting, oddly.',
      'A story once written down has a way of not staying finished. You\'d know.',
      'I record. I do not editorialize. This entry is an exception.',
      '[margin note] The ink took faster than usual today. Make of that what you like.',
      'Every chronicle needs a subject who keeps giving it reasons to continue.',
    ],
    postOrb: [
      '[margin note] Orb recovered. The page brightened at the edges. First time in three centuries the ink\'s done that on its own.',
      'The record grows kinder with each orb. I did not write that sentence. It wrote itself.',
    ],
    retelling: [
      '[margin note] This is not the first page with this name at the top. I remember every one of them. That is, after all, the job.',
      'The archive has your hand in it more than once, under more than one date. I remember exactly which.',
      '[margin note] Telling the third, by my count. The ink agrees. The ink is rarely wrong.',
    ],
  },
  sess: {
    default: [
      'North road\'s dark past the third lamp tonight. Not out — dark. There\'s a difference and I don\'t like it.',
      'Every gate you walk through, I\'ve already walked it lighting the way. Least I can do is keep the last lamp honest.',
      'You want to know which road, or which road came back short last time? I keep both lists. Ask the right one.',
      'The lamp gutters blue when it doesn\'t like your odds. It\'s guttering blue right now. I\'m telling you anyway, not stopping you.',
      'Forty-one lamps and I\'ve got an opinion about every one of them. Tonight\'s opinion: take the oil, take the long way.',
      'I don\'t light the road so you feel brave, tamer. I light it so you can see what\'s actually there. Braver, that way.',
      'Some nights I count who went out more than who came back. Keeps me honest about the job.',
      'Stand in the light a second before you go. Habit of mine. Costs nothing, and the dark hates being looked at first.',
    ],
    bondHigh: [
      '{monster} walks the light like it was born to it. Doesn\'t flinch at the shadow line anymore. Neither should you, near it.',
      'I\'ve watched a lot of pairs pass this lamp. You and {monster} walk like you already know the road bends. Good sign.',
    ],
    partyEmpty: [
      'Walking out past the gate with nothing at your side? The dark likes company even less than I do. Find some first.',
      'Come back with something that\'ll watch your back past the lamp line. I\'ll keep this one burning either way.',
    ],
    goldPoor: [
      'Light purse doesn\'t buy you a longer wick, tamer. Watch the oil, watch the road, and mind you\'ve got both.',
    ],
    postOrb: [
      'Lamp thirty-three relit itself the week the first orb came home. I\'ve stopped being spooked by it. Mostly.',
      'The roads past the gates don\'t lean on the light the way they used to. I\'m almost out of a job. Almost.',
      'Fewer roads gutter blue since you started bringing orbs home. I\'m keeping the list anyway. Old habit.',
    ],
    retelling: [
      'This lamp flickered the exact same way the last time you walked out that gate. Same stutter, same recover. I remember flames, tamer. It\'s the job.',
      'I\'ve lit your way out before. Different night, same you, I\'d swear to it. The wick knows a returning customer.',
      'Funny — I already knew which road you\'d take before you asked. Some nights the lamp tells me things before you do.',
    ],
  },
  casque: {
    default: [
      'A body\'s a candle, tamer. Burn it at both ends and heaven docks you the difference. Rest is the cheapest prayer I sell.',
      'The chapel bed or a stub of blessing — take your pick, both put you flat on your back, which is the point.',
      'Sleep is scripture I actually believe. Everything after chapter three is just opinions on posture.',
      'You\'ve got the look of someone who\'s been heroic on no sleep. I disapprove. Formally. In writing, if you\'d like.',
      'Rest here, and rest properly. Heaven does not grade on effort. It grades on whether you showed up rested.',
      'I keep this cot blessed and this room quiet. The quiet\'s the harder miracle, some nights.',
      'Lie down, tamer. The gates will still be open in the morning. They are famously patient about that.',
      'Every hour of sleep is a small mercy you grant yourself. I merely witness it and take a modest fee.',
    ],
    bondLow: [
      'Rest isn\'t just for you, you know. {monster} sleeps easier when you do. Trust travels through a shared roof.',
    ],
    goldPoor: [
      'Light on coin? The chapel blessing costs a prayer, not a purse. I\'ll even supply the prayer if you\'re out of those too.',
      'Don\'t skip the rest to save the coin, tamer. Heaven\'s cheaper than a hospital bed, and I\'d know — I\'ve dug graves before this job.',
    ],
    postOrb: [
      'The font stopped freezing overnight, and for once so did my patients\' nerves. Rest comes easier when the dark does too.',
      'I have begun drafting a sermon with a happy ending. Sleep on that thought, tamer. It\'s a good one.',
    ],
    retelling: [
      'I have blessed this exact tired look on you before, tamer. Different candle, same wax. The body forgets less than we\'d like.',
      'Something in you sleeps like it\'s done this before, in a bed like this one, in a life I only half-remember blessing.',
      'The prayer came out of me before I\'d finished thinking it. That\'s never happened with a stranger. You are, technically, a stranger.',
    ],
  },
  rowan: {
    default: [
      'Sit a while, child, and let\'s see what you\'ve grown into. Orchard stock or briar, it all wants counting.',
      'Every season you come back taller in ways that don\'t show on the outside. I keep track of those too.',
      'Growth is unsentimental work, child. The Tree doesn\'t applaud its own rings. It just adds them.',
      'You\'ve put on more than muscle since the gate first took you. Let\'s look at the whole ledger of it.',
      'I\'ve appraised orchards for sixty years and tamers for rather fewer. You\'re coming along like good rootstock.',
      'Stand still and let an old woman measure you, child. It\'s the closest thing to pride I allow myself these days.',
      'Each level is a ring in the wood, plain as that. No ceremony needed. I\'ll give you one anyway.',
      'You were a sapling when you walked through our gate. Look what\'s come of the watering.',
    ],
    bondHigh: [
      'Whatever grew between you and {monster}, child, it grew straight. I\'ve seen crooked bonds. Yours isn\'t one.',
    ],
    partyEmpty: [
      'No companion at your side yet, child? Even the Tree grew slow before the first root found company underground.',
    ],
    postOrb: [
      'The Tree put out a new leaf the week the first orb came home. One leaf. We are calling it a trend, and so are you, it seems.',
      'You\'ve grown alongside the dusk itself, child. Rare thing, to watch two things heal on the same season.',
    ],
    retelling: [
      'I have measured this exact growth in you before, child, though the almanac insists this is your first season. The rings disagree with the almanac.',
      'The Tree remembers every hand that ever tended it, and yours it remembers too well for a first meeting. Mind what that means.',
      'You grow like something re-planted, not first-planted. I\'ve watched enough orchards to know the difference, child.',
    ],
  },
  kess: {
    default: [
      'Let\'s see the deck. I\'m not judging. I am absolutely judging.',
      'You kept THAT card? Bold. Wrong, but bold. I respect wrong and bold.',
      'I\'ve counted your reforges. That\'s not a compliment, that\'s a warning that I\'m paying attention.',
      'My deck would beat this deck. I have not built my deck. That is not the point.',
      'Fine, that\'s a decent pull. I said decent. Do not let it go to your head. Too late, obviously.',
      'I would never copy your build. I have already copied your build. We do not speak of this.',
      'Show me the reforge history. I want to see exactly how many mistakes you\'re one draw away from.',
      'A rival keeps tabs, tamer. Consider your deck officially tabbed.',
    ],
    goldRich: [
      'That\'s a lot of coin sitting around not becoming a better deck. I\'d be ashamed. I AM ashamed, on your behalf.',
    ],
    goldPoor: [
      'Broke, are you. Good. Keeps things fair between us. Don\'t expect me to lend you anything, though. I would, but I won\'t. Loudly.',
    ],
    postOrb: [
      'Your deck\'s gotten scary good since the orbs started coming home. I noticed. I hate that I noticed.',
      'I toasted you again this week. Quietly. While glaring at your deck list, which I definitely did not memorize.',
    ],
    retelling: [
      'I swear I\'ve beaten this exact deck before. Somewhere. Some life. I don\'t remember losing to you, and I would remember losing to you.',
      'This card layout feels like déjà vu wearing a different coat. I\'ve counted your reforges before. I\'m almost sure of it.',
      'You built it the same way last time too, whenever "last time" was. I have a nightmare shaped exactly like this deck. Explain that.',
    ],
  },
  fennick: {
    default: [
      'What\'s buried keeps, tamer. Same goes for a save. Dig it up whenever you\'re ready.',
      'I keep a spot ready for everyone in this town. Most of them, thankfully, don\'t need it yet.',
      'A save\'s just a neat grave you can climb back out of. Best kind of hole I dig.',
      'Preservation\'s my whole trade. Bodies, memories, save files — I\'m not picky about the medium.',
      'Load it up whenever. I\'ve got nowhere to be. The graves keep themselves, mostly.',
      'Dig deep or don\'t bother, I always say. About graves. About saves. Same principle.',
      'I\'ll keep this moment for you same as I keep everything else here — quiet, dry, and waiting.',
      'Business is slow this season, which suits me fine. Come bury a save and let\'s keep it that way.',
    ],
    goldPoor: [
      'Light on coin doesn\'t matter to me, tamer. I don\'t charge to keep something safe. Never have.',
    ],
    postOrb: [
      'Dug a well this week instead of a hole. Water coming up instead of folk going down. Your saves are in similarly good company.',
      'The yard\'s quiet in the right way now. Good time to bury a save and know it\'ll still be there tomorrow.',
    ],
    retelling: [
      'I\'ve dug your grave twice already, tamer. Both times it stayed empty. I\'m starting to take it personally.',
      'There\'s a plot reserved with your name half-carved on it, from a telling I only half-remember. Still empty. Still reserved. Funny how that works.',
      'Load up, tamer. I\'ve kept this exact spot before, for someone with your exact face. I don\'t ask questions. Bad for business.',
    ],
  },
};
