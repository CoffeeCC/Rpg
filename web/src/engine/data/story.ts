// World content: the main story of Everdusk, in six chapters.
// Chapters: 0 = intro (on character creation), 1-4 = after claiming each orb
// (in order of completion count, not specific gates), 5 = epilogue after the
// final boss.
import type { StoryChapter } from '../types';

export const STORY: StoryChapter[] = [
  {
    id: 0,
    title: 'The Failing Light',
    paragraphs: [
      'The town of Everdusk sits in the roots of the Great Tree, and the Great Tree sits in the dark, and for a thousand years that arrangement has suited everyone fine. The Tree gives light — a patient, silver light that soaks into wardstones and window glass and the bones of the people born under it — and the light keeps the gates sealed. Four gates, ringed around the valley like teeth around a tongue. Nobody remembers who built them. Everybody remembers why: so that what lives behind them stays behind them.',
      'The light is failing. It started small, the way endings do. Lamps that needed trimming twice a night. Wardstones going grey at the edges like old men. Then, last spring, the Verdant Gate opened with a sound like a held breath finally let out, and the other three followed within the season. The elders called it a bad year. The elders are no longer calling it that.',
      'The old books are clear on the remedy, in the way old books are clear about anything: the seals can be remade with the four Wardens\' Orbs, and each orb rests with the strongest thing behind each gate. The books do not say how the orbs got there. The books change the subject, actually, with an urgency that would be funny if the lamps were not going out.',
      'Everdusk has responded to the crisis with everything it has: a watch of four grandfathers and a dog, a bake sale, and a notice board. The notice board is where you come in.',
      'You are nobody special. You have a pack, a bedroll, and a way with monsters that the stablemaster calls promising and your mother calls concerning. The creatures that come through the gates can be fought — but they can also be fed, befriended, tamed, and bred into something stronger, and you have always been better at the second list.',
      'That has never stopped anyone before. It will not stop you now. The Tree is dimming, the gates are open, and somewhere behind them four orbs are waiting to be carried home. Go and be somebody special. It is easier than it sounds, and harder than anyone will ever admit.',
    ],
  },
  {
    id: 1,
    title: 'One Orb Claimed',
    paragraphs: [
      'The first orb is heavier than it looks and warmer than it should be. All the way home it hums against your back like a cat deciding whether to trust you. When you set it in the hollow of the Great Tree, the light does not blaze — it steadies, the way a hand steadies, and every lamp in Everdusk stands up a little straighter.',
      'The town throws a festival with roughly nine days of enthusiasm and one evening of budget. Somebody names a pie after you. The elders smile in public and count on their fingers in private: one orb home, three still out in the dark, and the dark, lately, has begun to feel less like an absence and more like an attention.',
      'That night, for the first time in a thousand years of records, the Great Tree drops a single silver leaf. Nobody knows what it means. Everyone agrees not to say so out loud.',
    ],
  },
  {
    id: 2,
    title: 'Two Orbs Claimed',
    paragraphs: [
      'Two orbs now rest in the roots, and where their light overlaps it makes a color nobody has a name for — something between dawn and the memory of dawn. Half the seals hold. In the square, people have started saying your name in the tone usually reserved for good weather.',
      'But the scholars have finally translated the margins of the old books, and the margins are worried. The four gates, they write, were never the whole of it. They were the visible work. Every lock is built around a keyhole, and the books will not say — refuse to say — what the keyhole was built around.',
      'Out beyond the walls, the remaining gates have changed their sound. They no longer rattle like doors being tested. They creak like doors being leaned on, patiently, by something with all the time in the world and only one thing left to want.',
    ],
  },
  {
    id: 3,
    title: 'Three Orbs Claimed',
    paragraphs: [
      'Three orbs. The nights are bright enough to read by now, and the children of Everdusk have gone back to sleeping with their windows open, which is either faith or forgetfulness and works out the same. Monsters still slip through the last open gate, but they come fewer, and warier, like scouts sent by someone who has stopped expecting good news.',
      'It is the Great Tree that has changed. Its light used to fall evenly, the way rain falls. Now it leans. All of it, every silver thread, bends very slightly toward the center of the valley — toward the old bedrock under the town — the way grass leans toward the sun, or the way hair leans toward a storm.',
      'The elders take turns pretending to be calm about this. One orb remains. The last gate stands at the edge of the valley, shaking in its frame like a struck bell, and beneath your feet, on quiet nights, the bedrock has begun — very softly — to knock back.',
    ],
  },
  {
    id: 4,
    title: 'The Abyss Opens',
    paragraphs: [
      'The fourth orb comes home, and for one entire golden hour, it works. The seals close. The light roars up the trunk of the Great Tree like a tide coming in. The town is still cheering when the ground under the square exhales.',
      'It opens beneath the oldest part of town, between the roots themselves: a fifth gate, black as a held breath, that no mason will admit to and no book will name. The scholars tear the library apart and find only one line, in the oldest hand, pressed so hard into the vellum it tore: FOUR LOCKS FOR THE DOOR. NOTHING FOR WHAT DIGS.',
      'It was never sealed, this one. It was only waiting for the light to gather in one place — the way a snare waits for weight. Everything behind the four gates, you now understand, was not invading. It was fleeing. Monsters do not batter down doors to get into a burning house.',
      'The elders do not hold a meeting. There is nothing left to decide and everyone knows who is going down. The Great Tree bends its whole light over the black mouth of the Abyssal Gate like a parent over a well, and the Hollow Sovereign, far below, in the dark that the dark is afraid of, finally stops knocking.',
    ],
  },
  {
    id: 5,
    title: 'Dawn',
    paragraphs: [
      'The Hollow Sovereign is gone. Not slain, exactly — things like that are not slain, the scholars insist, only argued with decisively — but gone, unmade, dispersed like a rumor confronted with the facts. The fifth gate closed behind it so completely that by morning there was simply ground there, ordinary ground, growing ordinary grass with what can only be described as relief.',
      'The Great Tree blazes now like a green sun. The light has come back stronger than the oldest records describe it, as if it had been holding something in reserve all along and is embarrassed to have been caught at it. Wardstones shine. The four gates stand open and harmless, and the world behind them is just a world now — floors and treasure and weather — and monsters come through not as invaders but as immigrants, and are tamed, and are bred, and sleep in Old Maribel\'s stable, which has never once been quiet since.',
      'Everdusk has adjusted to peace with its customary grace: the bake sale is now annual, the watch has doubled to eight grandfathers and two dogs, and the notice board still fills every week, because a town that has learned to ask for help does not unlearn it.',
      'And you? Everdusk will argue for years about what to carve on your statue. The stablemaster wants you mid-battle. Your mother wants you wearing a coat. The current favorite, proposed by the innkeeper and seconded loudly by the dog, is simpler: you, kneeling, holding out one hand to something wild — the way you always did, the way somebody always must — waiting, patient as tree light, for it to decide to come home.',
    ],
  },
];
