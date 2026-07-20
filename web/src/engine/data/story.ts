// World content: the main story of Everdusk, in six chapters.
// Chapters: 0 = intro (on character creation), 1-4 = after claiming each orb
// (in order of completion count, not specific gates), 5 = epilogue after the
// final boss.
import type { StoryChapter } from '../types';

export const STORY: StoryChapter[] = [
  {
    id: 0,
    title: 'The Last Lantern',
    paragraphs: [
      "Everdusk keeps the one hour that never finishes. Not evening, not night — the long copper seam between them, the kind of light that in most places lasts twenty minutes and gets ignored. Here it has lasted as long as anyone can count, and the town has built its whole life around a sunset that refuses to fall.",
      'In the square, in an iron cage taller than a man, the Last Lantern burns. It is not much to look at: one flame, low and patient, behind glass gone smoky with three centuries of smoke. But it is the reason the dusk stays dusk. Somewhere past living memory, somebody promised to keep it lit, and somebody has kept that promise every single night since, one careful hour at a time.',
      "Lately the promise is getting harder to keep. The flame has started guttering — not going out, nothing so honest as that, just leaning thin and blue at the edges, the way a held breath thins before it gives out. Twice this season the keeper has had to relight it from a spark instead of a coal. The town watch has started walking the wall roads at what would be, anywhere else, a perfectly reasonable bedtime.",
      "The old ledgers are specific about the fix and vague about everything else, the way old ledgers tend to be: four Wardens stand watch beyond the four gates, and each Warden holds an Orb, and each Orb, brought home and set in the Lantern's cage, will feed the flame and buy the dusk more time. The ledgers do not say why the Wardens have the orbs, or what they're actually guarding. Every page that gets close to that question ends in a water stain that is almost certainly not an accident.",
      'Everdusk has met the crisis with everything it has, which is a night watch of four grandfathers and a dog, a bake sale, and a notice board. The notice board is where you come in.',
      "You're nobody in particular — a pack, a bedroll, and a way with monsters the stablemaster calls promising and your mother calls a phase. Down at the parish house, the town Chronicler already has a fresh page waiting with your name inked at the top, which should worry you more than it does; in Everdusk, they say, a story once written down has a way of not staying finished. That's a problem for later. Tonight there's a lantern going dim and four gates standing open, and somebody has to go be the promise for a while. Might as well be you.",
    ],
  },
  {
    id: 1,
    title: 'One Orb Kept',
    paragraphs: [
      "The first Orb is heavier than it looks and warmer than it has any right to be. It hums the whole walk home, low and even, like something that has finally stopped holding its breath. When you set it into the Lantern's cage, the flame doesn't leap — it settles, the way a hand settles once it stops shaking, and every lamp on the market road burns a shade steadier for it.",
      "The town throws you a festival with nine days of enthusiasm and one evening of actual budget. Somebody names a bun after you. The elders smile where people can see them and count on their fingers where people can't: one orb kept, three still out past the walls, and the dusk, if you stand very still in it, has started to feel less like weather and more like something paying attention.",
      "That night the Lantern does something it has never done in three hundred years of the keeper's log: the flame throws a shadow with no one standing near it to cast one. The keeper writes it down without comment. The Chronicler writes it down twice.",
    ],
  },
  {
    id: 2,
    title: 'Two Orbs Kept',
    paragraphs: [
      "Two orbs now sit in the cage, and where their light crosses it makes a color the dye-makers can't name and won't stop trying to. Half the wall roads feel safe again after dark-that-isn't-dark. In the square, people say your name the way they talk about good weather — grateful, and a little superstitious about jinxing it.",
      "The scholars have finally worked through the water-stained pages, and what's underneath the stains is worse than the stains. The four gates, they write, were never the whole arrangement. They were the visible half of it. A promise this old was never kept for a view — it was kept over something, and the books won't say, or can't, what that something was.",
      "Out past the last two open gates, the watch reports a change in the knocking. It used to sound like something testing a door. Now it sounds like something leaning on one, patiently, the way you lean on a door when you already know it will open eventually and you're simply waiting to be polite about it.",
    ],
  },
  {
    id: 3,
    title: 'Three Orbs Kept',
    paragraphs: [
      "Three orbs. The dusk is bright enough now to read by without a second lamp, and the children of Everdusk have gone back to playing past the curfew bell, which is either trust or short memory and comes out the same either way. Fewer things slip through the last open gate these nights, and the ones that do come through look less like invaders and more like scouts who've stopped expecting to be believed.",
      "It's the Lantern that has changed. Its light used to fall straight down, the ordinary way light falls. Now it leans — the flame, the glow through the smoked glass, all of it tilting very slightly toward the old well-stone at the center of the square, the way a compass needle leans toward a thing it isn't allowed to name.",
      'The elders take turns pretending this is fine. One orb remains. The last gate stands out past the fields, rattling in its frame like a struck bell that won\'t finish ringing, and some nights, if you put your ear to the well-stone, the ground underneath the whole town has started — very softly — knocking back.',
    ],
  },
  {
    id: 4,
    title: 'The Abyss Opens',
    paragraphs: [
      "The fourth orb comes home, and for one entire golden hour, it works. The Lantern's flame stands up straight and gold, the way it must have looked the very first night it was ever lit. The whole town is out in the square, watching, cheering, already composing the story they'll tell about this — and that's when the ground under the well-stone breathes out.",
      'It opens between the cobbles, right where the light had been leaning all along: a fifth gate, black as a lantern with the glass painted over, that no mason will claim building and no ledger will name. The scholars strip the archive to the walls and find one line, in the oldest hand, pressed so hard into the page it nearly cut through: FOUR ORBS FOR THE PROMISE. NOTHING WAS EVER PROMISED ABOUT THE FIFTH.',
      "It was never sealed, this one — only waiting for enough light to gather in one place, the way a moth-trap waits for a lamp. Everything that ever came through the first four gates, you understand now, was never invading. It was running. Nothing batters down four separate doors to get into a house that's on fire.",
      "The elders don't hold a vote. There's nothing left to decide, and everyone already knows whose name is inked at the top of the Chronicler's page. The Lantern bends its whole gathered light over the black seam in the cobbles like someone leaning a candle over a well to see the bottom, and far down in the dark that the dark is afraid of, the knocking, for the first time in living memory, stops.",
    ],
  },
  {
    id: 5,
    title: 'Dawn',
    paragraphs: [
      'The knocking is gone. Not silenced, exactly — the scholars are careful about that word now — but gone, the way an argument ends when both sides finally say the same thing at the same time. The fifth gate closed behind it so completely that by morning there was only cobblestone there, ordinary and a little too clean, like a room after a very long, very quiet argument.',
      "The Last Lantern doesn't blaze like some conquering thing. It just holds — steady, gold, unhurried, the way it must have held on the very first night, before it was old, before it needed keeping. The keeper finally lets someone else trim the wick for a change. Down in the vaults, the oldest surviving page in the archive turns out to say something almost embarrassingly simple: the Lantern was never a ward or a weapon. It was a promise, lit once by somebody whose name didn't survive, and kept — hour by hour, wick by wick, keeper after keeper — ever since. Nobody special enchanted it. Somebody ordinary just refused to let it go out, and then so did the next person, and the next, for three hundred years, until refusing became the whole tradition.",
      "Nobody in the archive can say who lit it first, or why they chose this particular stretch of dusk to stand watch over, or — and this is the part the elders like least — whether the fifth gate is truly finished or only quiet for now, the way the first four were quiet for a thousand years before they weren't. The ledger just ends there. The Chronicler, for once, doesn't try to fill in the rest.",
      "The four gates stand open now, harmless as doorways, and what comes through them arrives less like a threat and more like weather — tamed, bred, and stabled in Old Maribel's barn, which hasn't had a quiet night since. Everdusk has adjusted to peace with its usual grace: the bake sale is annual now, the watch is up to eight grandfathers and two dogs, and the notice board still fills every week, because a town that's learned to ask for help doesn't unlearn it just because the emergency's over.",
      "And you? Everdusk will argue for years about what to put on your statue. The stablemaster wants you mid-fight. Your mother wants you in a coat. The favorite so far, proposed by the innkeeper and seconded loudly by the dog, is simpler: you, one hand out toward something wild, patient as lantern-light, waiting — the way you always did, the way apparently somebody always must — for it to decide to come home. The Chronicler has already started writing it down. Everyone in town knows better, by now, than to assume that means it's over.",
    ],
  },
];
