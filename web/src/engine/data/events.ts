// World content: random floor events. Each has 2-3 options with typed
// outcomes; multiple outcomes on one option all apply (great for gambles).
// Consumable names must exist in items.ts: Herb, Potion, Elixir, Water,
// Ether, Jerky, Sirloin, PrimeSteak.
import type { EventDef } from '../types';

export const EVENTS: EventDef[] = [
  {
    id: 'mossyIdol',
    name: 'The Mossy Idol',
    emoji: '🗿',
    text: 'A squat stone idol grins from under a century of moss. A fat gem sits in its eye socket. Its other socket is empty, and something about that feels like a before-and-after picture.',
    options: [
      {
        label: 'Pry out the gem',
        resultText: 'The gem comes free with a wet pop. So does the idol\'s opinion of you — and its friends.',
        outcomes: [{ kind: 'gold', amount: 120 }, { kind: 'fight', rarity: 'Alpha' }],
      },
      {
        label: 'Leave an offering',
        resultText: 'You tuck a few coins into the empty socket. The moss seems to sit a little greener. You feel inexplicably lucky.',
        outcomes: [{ kind: 'goldLoss', amount: 25 }, { kind: 'statBoost', stat: 'LUCK', amount: 2 }],
      },
      {
        label: 'Keep walking',
        resultText: 'You maintain eye contact the whole way past. The idol respects that.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'bubblingSpring',
    name: 'Bubbling Spring',
    emoji: '⛲',
    text: 'A little spring burbles up between the stones, impossibly clear. It smells like rain and mornings you were actually excited to get up for.',
    options: [
      {
        label: 'Drink deeply',
        resultText: 'Cold, sweet, and somehow encouraging. Your wounds knit closed.',
        outcomes: [{ kind: 'heal' }],
      },
      {
        label: 'Bottle some',
        resultText: 'You fill two flasks. The spring gurgles in a way that might be approval or digestion.',
        outcomes: [{ kind: 'consumable', name: 'Water', count: 2 }],
      },
      {
        label: 'Toss in a coin',
        resultText: 'The coin winks out of sight. Somewhere below, something small and fortunate takes note of you.',
        outcomes: [{ kind: 'goldLoss', amount: 10 }, { kind: 'statBoost', stat: 'LUCK', amount: 1 }],
      },
    ],
  },
  {
    id: 'wanderingPeddler',
    name: 'The Peddler of Somewhere Else',
    emoji: '🎪',
    text: 'A cart with too many wheels is parked where no cart should be. The peddler tips a hat that casts the wrong shadow. "Traveler! Everything must go. Everything always must."',
    options: [
      {
        label: 'Buy the mystery bundle (90g)',
        resultText: '"No refunds," the peddler says, before you have even paid. Inside the sackcloth: something genuinely decent. Huh.',
        outcomes: [{ kind: 'goldLoss', amount: 90 }, { kind: 'item', ilvlBonus: 2 }],
      },
      {
        label: 'Buy trail rations (30g)',
        resultText: 'The jerky is excellent. You decide not to ask what it was. The peddler decides not to tell you. Everyone wins.',
        outcomes: [{ kind: 'goldLoss', amount: 30 }, { kind: 'consumable', name: 'Jerky', count: 3 }],
      },
      {
        label: 'Politely decline',
        resultText: '"Next time," the peddler says, with total certainty. When you glance back, the cart is gone. The wheel ruts are not.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'collapsedTamer',
    name: 'The Collapsed Tamer',
    emoji: '😵',
    text: 'A monster tamer sits slumped against the wall, hat over his eyes, boots half-eaten. "The big one got my pack," he croaks. "Left me the hat, though. Small mercies."',
    options: [
      {
        label: 'Help him up and share supplies',
        resultText: 'He limps off toward daylight, pressing his last cut of good steak into your hands. "Bait\'s no use to a man with no monsters. Make it count."',
        outcomes: [{ kind: 'goldLoss', amount: 20 }, { kind: 'consumable', name: 'Sirloin', count: 1 }],
      },
      {
        label: 'Go through his pockets',
        resultText: 'You find his coin purse. He watches you take it with the weary calm of a man updating his opinion of humanity in real time.',
        outcomes: [{ kind: 'gold', amount: 80 }],
      },
      {
        label: 'Wish him luck and move on',
        resultText: '"Aye," he sighs, tipping the hat back over his eyes. "That\'s the usual amount of help."',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'singingBones',
    name: 'The Singing Bones',
    emoji: '💀',
    text: 'A neat pile of bones hums a lullaby in three-part harmony. There is no wind down here. There has never been wind down here.',
    options: [
      {
        label: 'Sit and listen',
        resultText: 'The song settles into your chest like a second heartbeat. You feel armored against whatever wrote it.',
        outcomes: [{ kind: 'statBoost', stat: 'MAGDEF', amount: 2 }],
      },
      {
        label: 'Hum along',
        resultText: 'The bones stop. In the silence, a voice that is not yours finishes your verse. You are colder now, and wiser, and you will not sleep well.',
        outcomes: [{ kind: 'damagePct', pct: 10 }, { kind: 'statBoost', stat: 'INT', amount: 2 }],
      },
      {
        label: 'Scatter the pile',
        resultText: 'The song stops mid-note. Something in the dark clears its throat and takes the melody personally.',
        outcomes: [{ kind: 'fight', rarity: 'Common' }],
      },
    ],
  },
  {
    id: 'gamblersGhost',
    name: 'The Gambler\'s Ghost',
    emoji: '🎲',
    text: 'A translucent man in a very good coat shuffles cards that do not exist. "One hand," he offers. "I\'ve been up here forty years and I am owed a game."',
    options: [
      {
        label: 'Ante up (40g)',
        resultText: 'He wins, of course. He always wins. But he teaches you his tells, which is worth more than the pot.',
        outcomes: [{ kind: 'goldLoss', amount: 40 }, { kind: 'statBoost', stat: 'LUCK', amount: 2 }],
      },
      {
        label: 'Cheat',
        resultText: 'You palm the ghost card. His smile freezes. "House rules," he says, and the house wakes up.',
        outcomes: [{ kind: 'gold', amount: 150 }, { kind: 'fight', rarity: 'Alpha' }],
      },
      {
        label: 'Fold before you start',
        resultText: '"Smart," he says, fading. "That\'s how I\'d have played it, the first time."',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'humingHive',
    name: 'The Overgrown Hive',
    emoji: '🐝',
    text: 'A hive the size of a wine barrel drips gold. The hum coming off it is less "busy afternoon" and more "standing army."',
    options: [
      {
        label: 'Grab a handful',
        resultText: 'The honey is glorious. The response is proportionate.',
        outcomes: [{ kind: 'consumable', name: 'Potion', count: 2 }, { kind: 'damagePct', pct: 12 }],
      },
      {
        label: 'Harvest the wax-herbs below',
        resultText: 'Herbs grown under a hive soak up something restorative. You clip them quietly, like a polite burglar.',
        outcomes: [{ kind: 'consumable', name: 'Herb', count: 2 }],
      },
      {
        label: 'Back away in a straight line',
        resultText: 'The hum tracks you to the edge of earshot, then loses interest. Best possible outcome, honestly.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'crackedWardstone',
    name: 'The Cracked Wardstone',
    emoji: '🪨',
    text: 'One of the old wardstones stands here, split down the middle, leaking a soft silver light. It is the same light the Great Tree makes, and it is going somewhere.',
    options: [
      {
        label: 'Pack the crack with gold leaf',
        resultText: 'An old remedy from an old book. The stone drinks the gold and the light steadies — and some of it settles on you like dust.',
        outcomes: [{ kind: 'goldLoss', amount: 75 }, { kind: 'statBoost', stat: 'DEF', amount: 2 }],
      },
      {
        label: 'Cup your hands and drink the light',
        resultText: 'It tastes like the moment before a storm. Knowledge pours in; something else pours out. You decide not to check what.',
        outcomes: [{ kind: 'statBoost', stat: 'INT', amount: 2 }, { kind: 'damagePct', pct: 15 }],
      },
      {
        label: 'Leave it be',
        resultText: 'Not everything broken is yours to fix. You mark it on your map for someone holier.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'abandonedCamp',
    name: 'The Abandoned Camp',
    emoji: '⛺',
    text: 'A cold firepit, three bedrolls, and a stew pot with the spoon still in it. Whoever left, left mid-bite.',
    options: [
      {
        label: 'Search the tents',
        resultText: 'You find a locked strongbox under a bedroll. You also find out why the campers left mid-bite.',
        outcomes: [{ kind: 'item', ilvlBonus: 1 }, { kind: 'fight', rarity: 'Common' }],
      },
      {
        label: 'Take the rations',
        resultText: 'Dried meat, still good. You leave a few coins in the stew pot, which is either decency or superstition.',
        outcomes: [{ kind: 'consumable', name: 'Jerky', count: 2 }, { kind: 'goldLoss', amount: 5 }],
      },
      {
        label: 'Leave everything untouched',
        resultText: 'You stack their firewood and move on. If they come back, they will know someone hoped they would.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'mirrorPool',
    name: 'The Mirror Pool',
    emoji: '🪞',
    text: 'A pool of still water reflects the ceiling, your face, and — a half-second late — your expression.',
    options: [
      {
        label: 'Study your reflection',
        resultText: 'It studies you back, and mouths one word you do not teach it. You come away knowing something new and slightly unwelcome.',
        outcomes: [{ kind: 'statBoost', stat: 'INT', amount: 1 }],
      },
      {
        label: 'Touch the surface',
        resultText: 'Your reflection grabs your wrist. It has been down here so long, and you have so much it wants.',
        outcomes: [{ kind: 'fight', rarity: 'Rare' }],
      },
      {
        label: 'Drink from the edge',
        resultText: 'You drink from the shallows, where the reflections are too blurry to object. It is astonishingly restorative.',
        outcomes: [{ kind: 'heal' }],
      },
    ],
  },
  {
    id: 'tollTroll',
    name: 'The Toll Collector',
    emoji: '🌉',
    text: 'A boulder unfolds into a troll wearing a hand-lettered sign: TOLE. He points at the sign, then at you, then at the sign again, with great professionalism.',
    options: [
      {
        label: 'Pay the tole (30g)',
        resultText: 'He bites each coin, nods, and refolds into a boulder. Somewhere in there, you sense, is a very satisfied troll.',
        outcomes: [{ kind: 'goldLoss', amount: 30 }],
      },
      {
        label: 'Dispute the spelling',
        resultText: 'Trolls, it turns out, are sensitive about their lettering.',
        outcomes: [{ kind: 'fight', rarity: 'Common' }],
      },
      {
        label: 'Compliment the sign',
        resultText: 'The troll goes granite-pink, waves you through, and presses a shiny rock into your hand. It is, on inspection, money.',
        outcomes: [{ kind: 'gold', amount: 15 }],
      },
    ],
  },
  {
    id: 'fallenStar',
    name: 'The Fallen Star',
    emoji: '🌠',
    text: 'Something small and impossibly bright has buried itself in the floor. The crater is still warm. The light pulses like a heartbeat that is trying to remember its rhythm.',
    options: [
      {
        label: 'Grasp it bare-handed',
        resultText: 'It burns cold all the way to the bone — and then it stops fighting and becomes something you can carry, and swing.',
        outcomes: [{ kind: 'item', ilvlBonus: 3 }, { kind: 'damagePct', pct: 20 }],
      },
      {
        label: 'Study it from a respectful distance',
        resultText: 'You sketch its pulse in your journal. By the last page the rhythm makes sense, which is worrying, but useful.',
        outcomes: [{ kind: 'statBoost', stat: 'INT', amount: 1 }],
      },
      {
        label: 'Bury it properly',
        resultText: 'You cover the light with earth and say a few words. Stars should not have to be seen like this.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'weepingLady',
    name: 'The Lady in the Hall',
    emoji: '👻',
    text: 'A woman in grave-clothes stands weeping at a junction. Her feet do not quite reach the floor. "I hid it," she says, "and then I died, and now it is all I think about."',
    options: [
      {
        label: 'Comfort her',
        resultText: 'You listen until the weeping runs out. She rests a cold hand on your brow in thanks, and something in you deepens like a well.',
        outcomes: [{ kind: 'statBoost', stat: 'MANA', amount: 2 }],
      },
      {
        label: 'Ask where she hid it',
        resultText: 'She tells you, gratefully, in exact detail. She neglects to mention what she hid it under. It notices you lifting its rock.',
        outcomes: [{ kind: 'gold', amount: 100 }, { kind: 'fight', rarity: 'Alpha' }],
      },
      {
        label: 'Walk through her',
        resultText: 'Rude, and profoundly cold. Her sigh follows you down the corridor like weather.',
        outcomes: [{ kind: 'damagePct', pct: 5 }],
      },
    ],
  },
  {
    id: 'rustedVault',
    name: 'The Rusted Vault',
    emoji: '🚪',
    text: 'A vault door stands in the wall, rusted shut, older than the corridor around it. Someone has scratched DO NOT into the rust. The rest has flaked away.',
    options: [
      {
        label: 'Force the hinges',
        resultText: 'The door gives way all at once, along with a portion of the ceiling. Under the rubble: a strongbox that survived better than your shoulders did.',
        outcomes: [{ kind: 'item', ilvlBonus: 2 }, { kind: 'damagePct', pct: 15 }],
      },
      {
        label: 'Check under the door',
        resultText: 'Whoever sealed the vault dropped a purse on the way out. In a hurry, by the spread of the coins.',
        outcomes: [{ kind: 'gold', amount: 60 }],
      },
      {
        label: 'Honor the warning',
        resultText: 'DO NOT. You do not. Some doors are load-bearing in ways that have nothing to do with architecture.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'faerieRing',
    name: 'The Faerie Ring',
    emoji: '🍄',
    text: 'A perfect circle of mushrooms glows faintly in the gloom. The air inside it smells like music, which should not be a smell.',
    options: [
      {
        label: 'Eat one',
        resultText: 'It tastes like every color at once. Your wounds close; your dignity does not.',
        outcomes: [{ kind: 'heal' }, { kind: 'damagePct', pct: 5 }],
      },
      {
        label: 'Pick a few for the road',
        resultText: 'You harvest from the outside edge only, as is polite. The ring allows it, this once.',
        outcomes: [{ kind: 'consumable', name: 'Herb', count: 3 }],
      },
      {
        label: 'Dance in the circle',
        resultText: 'You dance. Something invisible dances with you, and it is a far better lead. You come out lighter on your feet than you went in.',
        outcomes: [{ kind: 'statBoost', stat: 'DEX', amount: 2 }],
      },
    ],
  },
  {
    id: 'oldBell',
    name: 'The Old Bell',
    emoji: '🔔',
    text: 'A great bronze bell hangs from the ceiling, green with age, rope intact. Bells want to be rung. That is the entire problem with bells.',
    options: [
      {
        label: 'Ring it',
        resultText: 'The note rolls through the floor like a tide. Everything on this level now knows your exact location — including, tumbling from the bell\'s mouth, a nest of old offerings.',
        outcomes: [{ kind: 'gold', amount: 90 }, { kind: 'fight', rarity: 'Alpha' }],
      },
      {
        label: 'Scrape off the verdigris',
        resultText: 'Old bronze scale sells respectably to the right alchemist. The bell tolerates this indignity in silence.',
        outcomes: [{ kind: 'gold', amount: 25 }],
      },
      {
        label: 'Tie off the rope and slip past',
        resultText: 'You muffle the clapper with your spare sock. History will not record this act of heroism, but it should.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'gutteringBonfire',
    name: 'The Guttering Bonfire',
    emoji: '🔥',
    text: 'A small fire burns in a ring of blackened stones, coals arranged around a sword driven point-down into the ash. No one is here. No one has been here for a very long time, and the fire has not noticed.',
    options: [
      {
        label: 'Rest by the flame',
        resultText: 'The warmth finds old aches you had stopped counting. For a while, the dark keeps a polite distance.',
        outcomes: [{ kind: 'heal' }],
      },
      {
        label: 'Feed it something that matters',
        resultText: 'You feed the fire your coin, because the fire does not want wood. It flares white, and something of its stubbornness passes into you.',
        outcomes: [{ kind: 'goldLoss', amount: 60 }, { kind: 'statBoost', stat: 'DEF', amount: 2 }],
      },
      {
        label: 'Pocket a cooled coal',
        resultText: 'The coal is cold in your hand and warm in your pack. You suspect it is the other way around and decline to verify.',
        outcomes: [{ kind: 'consumable', name: 'Ether', count: 1 }],
      },
    ],
  },
  {
    id: 'patientChest',
    name: 'The Patient Chest',
    emoji: '📦',
    text: 'A handsome chest sits alone in the corridor, lid ajar just enough to gleam. It is, very slightly, breathing.',
    options: [
      {
        label: 'Open it anyway',
        resultText: 'It was not a chest. It was never a chest. But it did eat someone who had excellent taste in equipment.',
        outcomes: [{ kind: 'fight', rarity: 'Alpha' }, { kind: 'item', ilvlBonus: 2 }],
      },
      {
        label: 'Knock first',
        resultText: 'The breathing stops, embarrassed. After a long silence, the lid opens a grudging inch and a coin purse is pushed out, the way one tips a performer.',
        outcomes: [{ kind: 'gold', amount: 45 }],
      },
      {
        label: 'Walk wide around it',
        resultText: 'As you pass, the chest sighs — a long, wooden sound. Rough economy for mimics lately.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'lostPilgrim',
    name: 'The Lost Pilgrim',
    emoji: '🕯️',
    text: 'A blind pilgrim taps his way down the corridor, candle stub in hand. "The shrine of the Silver Leaf," he says, hopeful. "Am I close?" The shrine burned down before your grandmother was born.',
    options: [
      {
        label: 'Tell him the truth',
        resultText: 'He is quiet for a long time. "Then I have been walking home," he says at last, "the long way." He presses his ring into your hand and asks you to leave it somewhere the light was.',
        outcomes: [{ kind: 'item', ilvlBonus: 1 }],
      },
      {
        label: 'Tell him it is just ahead',
        resultText: 'He smiles and taps onward, into the dark, toward a shrine that will always be just ahead. You tell yourself it was mercy. Some of you believes it.',
        outcomes: [{ kind: 'statBoost', stat: 'LUCK', amount: 1 }, { kind: 'damagePct', pct: 5 }],
      },
      {
        label: 'Walk him back toward daylight',
        resultText: 'It costs you an hour and most of your rations, and he sings the whole way — old hymns, terribly. You arrive lighter and better.',
        outcomes: [{ kind: 'goldLoss', amount: 20 }, { kind: 'heal' }],
      },
    ],
  },
  {
    id: 'namelessGrave',
    name: 'The Nameless Grave',
    emoji: '🪦',
    text: 'A single headstone stands where no graveyard should be. The moss covers most of the name, but the letters you can see are a name you almost recognize, and the almost is the worst part.',
    options: [
      {
        label: 'Clear the moss and read it',
        resultText: 'You read the name aloud. It is not yours. It is close enough that you stand there a while, learning something about the shape of your own luck.',
        outcomes: [{ kind: 'statBoost', stat: 'MAGDEF', amount: 2 }],
      },
      {
        label: 'Dig',
        resultText: 'Whoever they were, they were buried with honors — and with a guardian who takes its work seriously.',
        outcomes: [{ kind: 'item', ilvlBonus: 2 }, { kind: 'fight', rarity: 'Alpha' }],
      },
      {
        label: 'Leave a coin on the stone',
        resultText: 'An old custom, for the ferryman. The coin sits bright on the granite. You feel watched all the way to the corner, but kindly.',
        outcomes: [{ kind: 'goldLoss', amount: 10 }, { kind: 'statBoost', stat: 'LUCK', amount: 1 }],
      },
    ],
  },
  {
    id: 'wagerOfFingers',
    name: 'The Wager of Fingers',
    emoji: '🔪',
    text: 'A hollow-eyed soldier sits at a barrel, stabbing a knife between his spread fingers in flawless rhythm. He has nine fingers. "Care to play?" he asks. "I am owed a tenth."',
    options: [
      {
        label: 'Play for coin',
        resultText: 'You keep all your fingers, barely. He pays up with genuine delight — it has been years since anyone won anything down here.',
        outcomes: [{ kind: 'gold', amount: 110 }, { kind: 'damagePct', pct: 10 }],
      },
      {
        label: 'Watch and learn',
        resultText: 'You study the rhythm until your hands understand it without you. The soldier nods approval. "Quick hands dig shallow graves," he says, which he seems to think is encouraging.',
        outcomes: [{ kind: 'statBoost', stat: 'DEX', amount: 2 }],
      },
      {
        label: 'Decline, keeping hands pocketed',
        resultText: '"Wise," he says, and returns to his rhythm. Thunk. Thunk. Thunk. It follows you down the hall like a slow clock.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'lowDoorWarden',
    name: 'The Warden of the Low Door',
    emoji: '🚪',
    text: 'A door four feet tall, and before it a figure in a moth-eaten hood. "A toll of wit or a toll of coin," it rasps. "What walks on no legs in the morning, no legs at noon, and no legs in the evening?"',
    options: [
      {
        label: 'Answer: a slime',
        resultText: '"...Correct," the warden says, clearly furious that it is. The door opens. Beyond it, someone left their luggage in a hurry.',
        outcomes: [{ kind: 'statBoost', stat: 'INT', amount: 1 }, { kind: 'gold', amount: 50 }],
      },
      {
        label: 'Pay the toll of coin',
        resultText: 'The warden counts your coins twice, sighs, and opens the door. "Nobody plays anymore," it mutters. "It used to be about the riddles."',
        outcomes: [{ kind: 'goldLoss', amount: 35 }],
      },
      {
        label: 'Answer wrong on purpose',
        resultText: 'The warden brightens horribly. "WRONG," it declares, with the joy of a creature whose entire job just became relevant.',
        outcomes: [{ kind: 'fight', rarity: 'Common' }],
      },
    ],
  },
  {
    id: 'ashfall',
    name: 'The Ashfall',
    emoji: '🌫️',
    text: 'Grey ash begins to sift from cracks in the ceiling, soft as snow and twice as quiet. It is warm. Somewhere above you, something is still burning, and has been for a long time.',
    options: [
      {
        label: 'Press on through it',
        resultText: 'You wrap your face and walk. The ash gets into everything — boots, pack, lungs, dreams. But you make good time, and find what someone else dropped fleeing.',
        outcomes: [{ kind: 'damagePct', pct: 10 }, { kind: 'gold', amount: 55 }],
      },
      {
        label: 'Shelter until it passes',
        resultText: 'You wait it out beneath an old arch, watching the world go grey and soft. It is, against all sense, peaceful. You rest better than you have in days.',
        outcomes: [{ kind: 'heal' }],
      },
      {
        label: 'Catch a flake on your tongue',
        resultText: 'It tastes of old prayers and older fires. Knowledge of a sort settles in you, along with a cough you will have for a week.',
        outcomes: [{ kind: 'statBoost', stat: 'MAGDEF', amount: 1 }, { kind: 'damagePct', pct: 5 }],
      },
    ],
  },
  {
    id: 'woundedAlpha',
    name: 'The Snared Alpha',
    emoji: '🩸',
    text: 'A great beast lies tangled in a poacher\'s snare, wire deep in its foreleg, breath coming in furnace heaves. It watches you with one gold eye. The poacher, judging by what remains of him, is past caring.',
    options: [
      {
        label: 'Cut it free',
        resultText: 'It could take your arm off. It considers this — visibly, at length — then limps into the dark. That night, something big walks a wide circle around your camp, keeping other things out.',
        outcomes: [{ kind: 'statBoost', stat: 'LUCK', amount: 2 }],
      },
      {
        label: 'Grant it mercy',
        resultText: 'You make it quick, which is the only kindness left in the room. The poacher\'s pack holds his earnings. You take them without pride.',
        outcomes: [{ kind: 'gold', amount: 85 }, { kind: 'consumable', name: 'Sirloin', count: 1 }],
      },
      {
        label: 'Approach carelessly',
        resultText: 'Wounded is not the same as finished. It is very keen that you learn this.',
        outcomes: [{ kind: 'fight', rarity: 'Alpha' }],
      },
    ],
  },
  {
    id: 'threeDeserters',
    name: 'The Deserters',
    emoji: '🍞',
    text: 'Three gaunt soldiers block the path, weapons drawn, hands shaking. "Food or coin," says the one with the steadiest voice. "Please." The please costs him something.',
    options: [
      {
        label: 'Feed them',
        resultText: 'They eat like men who had stopped planning past tomorrow. The steady one gives you his mother\'s charm — "It never worked for me, but I never deserved it to."',
        outcomes: [{ kind: 'goldLoss', amount: 40 }, { kind: 'statBoost', stat: 'LUCK', amount: 2 }],
      },
      {
        label: 'Refuse',
        resultText: 'They are starving, trembling, and three to one. It is not a fight either side wanted, which does not stop it from being one.',
        outcomes: [{ kind: 'fight', rarity: 'Common' }, { kind: 'gold', amount: 30 }],
      },
      {
        label: 'Hire them as escorts',
        resultText: 'For a day they walk your flanks, showing you the tricks that kept them alive this long. Then they slip away in the night — with wages, without your boots. Fair, all told.',
        outcomes: [{ kind: 'goldLoss', amount: 60 }, { kind: 'statBoost', stat: 'DEF', amount: 2 }],
      },
    ],
  },
  {
    id: 'waxEffigy',
    name: 'The Effigy',
    emoji: '🕯️',
    text: 'On a stone shelf stands a small wax figure, crudely made, wearing a scrap of cloth torn from a garment you own. It has your face. It was made recently. The wax is still soft.',
    options: [
      {
        label: 'Melt it',
        resultText: 'The flame takes it, and for one blinding moment you feel your own outline like a burn. When it passes, something that had a grip on you does not.',
        outcomes: [{ kind: 'damagePct', pct: 10 }, { kind: 'statBoost', stat: 'MAGDEF', amount: 2 }],
      },
      {
        label: 'Take its coin eyes',
        resultText: 'The eyes are old silver, worth plenty. Somewhere in the dark, the sculptor notices the change of expression.',
        outcomes: [{ kind: 'gold', amount: 95 }, { kind: 'fight', rarity: 'Rare' }],
      },
      {
        label: 'Reshape it into someone else',
        resultText: 'You give it a stranger\'s nose and a better jawline. Let the curse chase that. The craft of it teaches your fingers something odd and useful.',
        outcomes: [{ kind: 'statBoost', stat: 'INT', amount: 1 }],
      },
    ],
  },
  {
    id: 'lanternBearer',
    name: 'The Lantern-Bearer',
    emoji: '🏮',
    text: 'A body hangs from an old gibbet at the crossroads, years past naming. In its hand, held out at arm\'s length, a lantern still burns clean and steady. It is the only light for a hundred yards, and it is pointed down the left-hand path.',
    options: [
      {
        label: 'Cut the body down',
        resultText: 'You bury what there is to bury and plant the lantern at the grave\'s head. It keeps burning. You suspect it always will now, and the thought sits warm in you.',
        outcomes: [{ kind: 'statBoost', stat: 'LUCK', amount: 2 }],
      },
      {
        label: 'Take the lantern',
        resultText: 'The fingers release it without protest — gratefully, almost. A duty passed on. Its oil never seems to burn lower, and its light finds coins other lights miss.',
        outcomes: [{ kind: 'gold', amount: 65 }, { kind: 'consumable', name: 'Ether', count: 1 }],
      },
      {
        label: 'Snuff the light',
        resultText: 'Some lights are load-bearing. The dark arrives all at once, and it arrives hungry.',
        outcomes: [{ kind: 'fight', rarity: 'Rare' }],
      },
    ],
  },
  {
    id: 'thirstyAltar',
    name: 'The Thirsty Altar',
    emoji: '🗡️',
    text: 'A low altar of dark stone, its channels stained the color of old rust. The inscription is simple and needs no translation: an open hand, a blade, a scale in balance. It has always been an honest arrangement.',
    options: [
      {
        label: 'Offer blood',
        resultText: 'The stone drinks. The weakness hits you first, then the strength — arriving like a debt paid in a currency you didn\'t know you were owed.',
        outcomes: [{ kind: 'damagePct', pct: 15 }, { kind: 'statBoost', stat: 'STR', amount: 2 }],
      },
      {
        label: 'Offer gold',
        resultText: 'The coins sink into the stone like water into sand. A lesser payment for a lesser gift, fairly measured.',
        outcomes: [{ kind: 'goldLoss', amount: 50 }, { kind: 'statBoost', stat: 'MANA', amount: 1 }],
      },
      {
        label: 'Offer nothing, take nothing',
        resultText: 'You nod to the altar as you pass, one professional to another. It respects the refusal. Probably.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'quietChapel',
    name: 'The Quiet Chapel',
    emoji: '⛪',
    text: 'A chapel no bigger than a toolshed, its god long out of fashion. The pews are dust; the little altar is swept clean. Someone still tends this place. Nothing here wants anything from you, which down here is its own kind of miracle.',
    options: [
      {
        label: 'Kneel a while',
        resultText: 'You are not sure who you are kneeling to. It does not seem to mind. You rise with your wounds quieter and your thoughts in a straighter line.',
        outcomes: [{ kind: 'heal' }],
      },
      {
        label: 'Leave something in the alms box',
        resultText: 'The box accepts your coins with a soft wooden thump, like an old dog acknowledging a pat. On your way out you feel — reinforced. Somebody\'s faith is still working, even secondhand.',
        outcomes: [{ kind: 'goldLoss', amount: 30 }, { kind: 'statBoost', stat: 'MAGDEF', amount: 2 }],
      },
      {
        label: 'Search behind the altar',
        resultText: 'Under a loose flagstone: sacramental wine and a priest\'s traveling kit, packed for a journey never taken. You drink to his health, whoever he was.',
        outcomes: [{ kind: 'consumable', name: 'Elixir', count: 1 }],
      },
    ],
  },
  {
    id: 'drownedCoffer',
    name: 'The Drowned Coffer',
    emoji: '🌊',
    text: 'A flooded stairwell descends into black water, and at the edge of your light, a strongbox rests on a drowned step. The water is perfectly still, in the way of water that is paying attention.',
    options: [
      {
        label: 'Wade down and take it',
        resultText: 'The coffer comes up heavy with coin. Something in the deeper black takes the toll on your way out — a long cold graze you do not stop to examine.',
        outcomes: [{ kind: 'gold', amount: 120 }, { kind: 'damagePct', pct: 15 }],
      },
      {
        label: 'Fish for it with rope and hook',
        resultText: 'Twenty patient minutes of scraping and swearing. The coffer yields a modest haul, and the water keeps whatever else it was saving you for.',
        outcomes: [{ kind: 'gold', amount: 45 }],
      },
      {
        label: 'Let the water keep it',
        resultText: 'Still water with treasure in it is called bait everywhere in the world. You leave, and the surface relaxes a fraction — disappointed.',
        outcomes: [{ kind: 'nothing' }],
      },
    ],
  },
  {
    id: 'courtOfCrows',
    name: 'The Court of Crows',
    emoji: '🐦‍⬛',
    text: 'Forty crows stand arrayed on a dead tree in perfect ranks, silent, every eye on you. This is a court, you realize. It is in session. You appear to be the docket.',
    options: [
      {
        label: 'Offer something shiny',
        resultText: 'A button, polished on your sleeve. The eldest crow accepts it with grave ceremony. Verdict: favorable. The crows remember faces, and now forty of them owe you.',
        outcomes: [{ kind: 'goldLoss', amount: 15 }, { kind: 'statBoost', stat: 'LUCK', amount: 2 }],
      },
      {
        label: 'Plead your case aloud',
        resultText: 'You argue for your character at length, to a jury of crows, alone, in a dungeon. The exercise sharpens you regardless. The crows seem entertained, which may be the point of courts.',
        outcomes: [{ kind: 'statBoost', stat: 'INT', amount: 1 }],
      },
      {
        label: 'Throw a stone',
        resultText: 'Contempt of court. The sentence is delivered immediately, from forty directions, followed by something larger the crows were keeping as bailiff.',
        outcomes: [{ kind: 'damagePct', pct: 5 }, { kind: 'fight', rarity: 'Common' }],
      },
    ],
  },
  {
    id: 'brokenWard',
    name: 'The Broken Ward',
    emoji: '🧂',
    text: 'A circle of salt on the flagstones, old and scuffed, with one clean gap where something dragged itself across. Inside the circle: a bedroll, a cold lamp, and no one. The gap points inward.',
    options: [
      {
        label: 'Repair the circle from outside',
        resultText: 'You pour the last of your salt and close the ring. From nowhere in particular comes a sound like a door finally latching. Whatever got in is now, at least, staying in.',
        outcomes: [{ kind: 'goldLoss', amount: 20 }, { kind: 'statBoost', stat: 'MAGDEF', amount: 2 }],
      },
      {
        label: 'Search the bedroll',
        resultText: 'The sleeper\'s pack is still full — rations, coin, a journal that stops mid-sentence. You take the supplies and do not read the last page. You are learning.',
        outcomes: [{ kind: 'gold', amount: 40 }, { kind: 'consumable', name: 'Jerky', count: 2 }],
      },
      {
        label: 'Step into the circle',
        resultText: 'It was not keeping something out.',
        outcomes: [{ kind: 'fight', rarity: 'Rare' }],
      },
    ],
  },
  {
    id: 'kneelingKnight',
    name: 'The Kneeling Knight',
    emoji: '⚔️',
    text: 'A knight kneels in the rubble where he made his last stand, rusted into his armor, alive in the way a banked coal is alive. "Well fought," he says, to no battle you can see. Then, noticing you: "Ah. Traveler. I have a favor to ask, and you will not like it."',
    options: [
      {
        label: 'Grant him the mercy stroke',
        resultText: 'He talks you through the gap in his own gorget, patient as a fencing lesson. "There. Clean." His sword is yours after — he insists, and then he is not there to insist, and the rubble is just rubble.',
        outcomes: [{ kind: 'item', ilvlBonus: 2 }],
      },
      {
        label: 'Refuse, and tend him instead',
        resultText: 'You cannot fix what is wrong with him, but you can share a meal and listen. He teaches you his stance — the one that held this corridor alone. "Someone should keep it," he says. "It is a good stance."',
        outcomes: [{ kind: 'goldLoss', amount: 25 }, { kind: 'statBoost', stat: 'DEF', amount: 2 }],
      },
      {
        label: 'Take the sword and go',
        resultText: 'His grip has rusted open; the blade lifts free without protest. He says nothing at all, which you will hear for a long time.',
        outcomes: [{ kind: 'item', ilvlBonus: 2 }, { kind: 'damagePct', pct: 10 }],
      },
    ],
  },
];
