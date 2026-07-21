// Tavern & town NPCs (see PLAN2.md). Greetings: index = min story chapter
// (0..5); systems pick the highest applicable index <= current chapter. All
// six indexes are populated so any picker strategy finds lines. Arc: the town
// moves from dread (chapter 0) toward dawn (chapter 5).
// Rumor slots per NpcDef contract in types.ts:
//   {beast} {beastGate} {artifact} {artifactGate} {figure} {era} {realm}
import type { NpcDef } from '../types';

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
      ],
      [
        'That\'s orb-light in your pocket or I\'m a duchess. First round\'s on the house.',
        'They named a pie after you, you know. I charge double for it now.',
      ],
      ['Second orb\'s pie is better than the first orb\'s pie. I\'ve had time to practice.'],
      [
        'Three orbs. The cellar slimes moved out — said the neighborhood was getting too hopeful.',
        'I caught myself humming yesterday. Haven\'t done that since the lanterns started failing.',
      ],
      ['Four orbs, and the regulars are arguing about the future again. Lovely sound, arguing.'],
      [
        'Look at that light through the shutters. I\'d forgotten shutters were for keeping sun OUT.',
        'Sit. Eat. It\'s over, and my roof held the whole time. I\'m prouder of the roof, honestly.',
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
      ],
      [
        'One orb. I logged it as "incident, resolved". Highest praise the ledger allows.',
        'The roads counted five fewer attacks this month. I enjoy that arithmetic.',
      ],
      ['Two orbs. The dog has started sleeping through the night. That is my official report.'],
      [
        'Three orbs and I have had to invent a new column in the ledger: "quiet".',
        'The grandfathers are betting on you now. Against my explicit orders.',
      ],
      ['Four. I am told I smiled. I am investigating the claim.'],
      [
        'Stand easy. For the first time in my career, that is an order I can give the whole town.',
        'The ledger is closed. If anyone asks, it was arithmetic that saved us. Your kind of arithmetic.',
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
      ],
      [
        'One orb. I lit a candle for the ones who tried before you. The flame held. That is new.',
        'You give me fewer things to keep now, dear, and I find I do not miss the work.',
      ],
      ['Two orbs home. A woman took back the ring she left in my keeping today, and she was laughing. I had forgotten that sound.'],
      [
        'Three orbs. Fewer keepsakes come to me now. A keeper of the lost with nothing to keep — imagine that.',
        'I dreamt the dead were only late, dear, not gone. Take that dream for the thanks it is.',
      ],
      ['I knitted you something. It is not much. Neither is a candle, until the dark comes.'],
      [
        'Dawn, dear, and my shelves empty the right way now. Folk come to remember, not to grieve.',
        'Sit with me a moment. I have a great deal of remembering to do, and good remembering is for sharing.',
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
      ],
      [
        'Your beasts hold their heads higher since the first orb. Animals know the score before we do.',
        'One orb. The old art feeds on hope, you know. Breeding season should be interesting.',
      ],
      ['The foals born this spring are bigger than they have any right to be. I blame you.'],
      [
        'Three orbs, and every stall is full for the first time since my master\'s master.',
        'I cried a little at the last breeding. That is the trick with the tears: you stop fighting them.',
      ],
      ['Four orbs. Even the mules are optimistic, and mules are professionals about despair.'],
      [
        'The dark lost the argument, tamer. The straw means something again — all of it, everywhere.',
        'Come see the new litter. First generation born under a real dawn. They will be legends. They had better be.',
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
      ],
      [
        'One orb. Fine. I counted your kills on the way there and I am one behind. ONE.',
        'Everyone keeps toasting you. I toasted you too, but quietly, and glaring.',
      ],
      ['Two orbs. I have started a list of things I do better than you. It is a good list. Do not look at it.'],
      [
        'Three orbs and I am officially your rival, which means when the ballads come, I am IN them. Legally.',
        'I told the ballad-writer my name is spelled with two esses. Both of them. Whatever. Good work out there.',
      ],
      ['Four orbs. I would have needed five. That is a compliment. Do not make it weird.'],
      [
        'We saved the town. I am saying "we" and you are going to let me.',
        'Next crisis, I get the glory and you count MY kills. Shake on it. In writing. Unsigned. Delivered at night.',
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
      ],
      [
        'An orb returned. I filed the paperwork with heaven. Expect a response in eighty years.',
        'The candles burned straighter the night you brought it home. I noticed. I notice everything the light does.',
      ],
      ['Two orbs. The font stopped freezing overnight. Minor miracle, but I will invoice for it.'],
      [
        'Three orbs, and the old hymns are back in rotation. The congregation only remembers the sad ones. We are working on it.',
        'My order was founded to keep the light. For the first time in my tenure, the light is keeping us.',
      ],
      ['Four orbs. I have begun drafting a sermon with a happy ending. It is harder than it sounds.'],
      [
        'The long dark is over, and the paperwork is done. Heaven sends its regards. Unofficially.',
        'Come to the evening service, tamer. It is at dusk — old habit — but now the dusk is beautiful.',
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
      ],
      [
        'One orb home to the Tree, child. It put out a new leaf. One. We are calling it a trend.',
        'I planted hope when you first walked through our gate. It is sprouting. Slower than weeds, faster than despair.',
      ],
      ['The Tree hums some evenings now, child. It has not hummed since my grandmother\'s time.'],
      [
        'Three orbs. The children play under the branches again. That was always the point, you know. All of it.',
        'The Tree remembers every hand that ever tended it, child. It will remember yours longest.',
      ],
      ['Four orbs at the roots, and the last season of light has decided to stay a while.'],
      [
        'Look up, child. Silver leaves to the crown. I lived to see it, and that is your doing.',
        'We will plant something kind where every sorrow stood. Start to finish, that was the whole plan.',
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
      ],
      [
        'One orb, and I have dug nothing but a garden bed all month. Strange feeling, soil with a future in it.',
        'Business is down. First time that sentence has ever cheered a man.',
      ],
      ['Dug a well this week. A WELL. Water coming up instead of folk going down. Novel.'],
      [
        'Three orbs. I have started carving headstones with old dates only. Backlog work. Peaceful.',
        'The yard is quiet in the right way now. There is a wrong way. I know both.',
      ],
      ['Four orbs. Considering a second trade. The first one is considering retiring.'],
      [
        'Sun on the headstones this morning. The old names looked almost warm. They earned it.',
        'If you ever need a hole dug now, friend, it will be for planting. Finest words I know.',
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
      ],
      [
        'The lamps burn longer since the first orb. Same oil. I keep records. Same oil.',
        'One orb home, and lamp thirty-three relit itself. I have decided to be delighted instead of terrified.',
      ],
      ['The dark leans lighter these nights. A lamplighter can tell. It is most of the job.'],
      [
        'Three orbs, and I trimmed the wicks short for the first time in years. The flames stand up straight now, like they are proud.',
        'Children follow my round to watch the lamps catch. There used to be no children out at dusk at all.',
      ],
      ['Four orbs, and my round feels like a lap of honor. The lamps hardly need me. I go anyway. We are old friends.'],
      [
        'The dawn does my job better than I ever did, and I have never been happier to be beaten.',
        'I will keep lighting them, mind. Tradition. Besides — somebody kept a light for us in the worst of it. Fair is fair.',
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
      ],
      [
        'One orb. The forge took to a heat I haven\'t coaxed out of it in years. I didn\'t ask it why. You don\'t interrogate good luck.',
        'Brought me a blade to reforge and it went in easy — no fighting me at all. Gear knows when the wind\'s turning. Wears knew it before we did.',
      ],
      ['Two orbs. Had a breastplate refuse a crack twice over, like it changed its mind about dying. I\'ll take the win and not ask questions.'],
      [
        'Three orbs. I\'m tempering steel that used to snap under my hammer and it just — holds. Holds like it\'s got somewhere to be.',
        'The old gatewatch plate in the back room stopped weeping rust this month. First time since I hung it there. I didn\'t tell it to stop. It just did.',
      ],
      ['Four orbs. Whole rack of reforges came out clean on the first pass. Metal\'s optimistic these days. Wish I could say the same for my knees.'],
      [
        'Dawn, and the anvil\'s gone quiet in the good way — the way it goes when nothing\'s asking to be fixed. Strange thing to miss, urgency.',
        'I\'ll keep the forge lit regardless. Gear doesn\'t stop remembering its wearers just because the dark let go. Neither do I.',
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
