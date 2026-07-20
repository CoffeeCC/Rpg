// Hand-authored Legendary (orange) items. Fixed rolls, tuned to beat a good
// Rare of the same ilvl. Implicits scale with minIlvl and match the base:
// Swords roll implicitAttack, Staffs implicitMagic, armor pieces
// implicitDefense, Rings have no implicits.
import type { UniqueDef } from '../types';

export const UNIQUES: UniqueDef[] = [
  // --- Swords ---
  {
    id: 'gooberfang',
    name: 'Gooberfang',
    baseType: 'Sword',
    minIlvl: 3,
    implicitAttack: 5,
    implicitMagic: 0,
    implicitDefense: 0,
    affixes: [
      { name: 'Slippery', type: 'prefix', target: 'DEX', amount: 4 },
      { name: 'Vicious', type: 'prefix', target: 'Attack', amount: 4 },
      { name: 'of Fortune', type: 'suffix', target: 'LUCK', amount: 5 },
    ],
    flavor: 'Forged from the tooth of a slime that, impossibly, had teeth.',
  },
  {
    id: 'whisperwindEdge',
    name: 'Whisperwind Edge',
    baseType: 'Sword',
    minIlvl: 12,
    implicitAttack: 10,
    implicitMagic: 0,
    implicitDefense: 0,
    affixes: [
      { name: 'Keening', type: 'prefix', target: 'Attack', amount: 8 },
      { name: 'of the Zephyr', type: 'suffix', target: 'DEX', amount: 9 },
      { name: 'of Second Wind', type: 'suffix', target: 'HP', amount: 20 },
    ],
    flavor: 'It cuts so quietly the wound takes a moment to notice.',
  },
  {
    id: 'mourneblade',
    name: 'Mourneblade',
    baseType: 'Sword',
    minIlvl: 20,
    implicitAttack: 15,
    implicitMagic: 0,
    implicitDefense: 0,
    affixes: [
      { name: 'Grieving', type: 'prefix', target: 'Attack', amount: 14 },
      { name: 'Widowmaking', type: 'prefix', target: 'STR', amount: 12 },
      { name: 'of the Last Vigil', type: 'suffix', target: 'HP', amount: 45 },
    ],
    flavor: 'It hums a funeral dirge, but never says for whom.',
  },

  // --- Staffs ---
  {
    id: 'twigg',
    name: 'Twigg',
    baseType: 'Staff',
    minIlvl: 4,
    implicitAttack: 0,
    implicitMagic: 5,
    implicitDefense: 0,
    affixes: [
      { name: 'Sprouting', type: 'prefix', target: 'Magic', amount: 4 },
      { name: 'of Sap', type: 'suffix', target: 'MP', amount: 12 },
      { name: 'of Green Thoughts', type: 'suffix', target: 'INT', amount: 3 },
    ],
    flavor: 'Still growing. Please stop asking it to be a tree.',
  },
  {
    id: 'umbralLantern',
    name: 'The Umbral Lantern',
    baseType: 'Staff',
    minIlvl: 16,
    implicitAttack: 0,
    implicitMagic: 13,
    implicitDefense: 0,
    affixes: [
      { name: 'Lightless', type: 'prefix', target: 'Magic', amount: 11 },
      { name: 'Dusk-touched', type: 'prefix', target: 'INT', amount: 10 },
      { name: 'of the Deep Wick', type: 'suffix', target: 'MANA', amount: 8 },
      { name: 'of Midnight Oil', type: 'suffix', target: 'MP', amount: 30 },
    ],
    flavor: 'A lantern that casts darkness. Moths hate it.',
  },

  // --- Armor ---
  {
    id: 'snailplate',
    name: 'Snailplate',
    baseType: 'Armor',
    minIlvl: 5,
    implicitAttack: 0,
    implicitMagic: 0,
    implicitDefense: 6,
    affixes: [
      { name: 'Spiraled', type: 'prefix', target: 'Defense', amount: 5 },
      { name: 'of the Homebody', type: 'suffix', target: 'HP', amount: 18 },
      { name: 'of Slime Trails', type: 'suffix', target: 'MAGDEF', amount: 4 },
    ],
    flavor: 'Wherever you go, you are already home. Slowly.',
  },
  {
    id: 'heartOfTheMountain',
    name: 'Heart of the Mountain',
    baseType: 'Armor',
    minIlvl: 18,
    implicitAttack: 0,
    implicitMagic: 0,
    implicitDefense: 14,
    affixes: [
      { name: 'Bedrock', type: 'prefix', target: 'Defense', amount: 13 },
      { name: 'Unquaking', type: 'prefix', target: 'DEF', amount: 11 },
      { name: 'of the Deep Root', type: 'suffix', target: 'HP', amount: 55 },
    ],
    flavor: 'The mountain did not miss it. The mountain has plenty.',
  },

  // --- Headpieces ---
  {
    id: 'rootwardensCrown',
    name: "The Rootwarden's Crown",
    baseType: 'Headpiece',
    minIlvl: 8,
    implicitAttack: 0,
    implicitMagic: 0,
    implicitDefense: 6,
    affixes: [
      { name: 'Verdant', type: 'prefix', target: 'INT', amount: 7 },
      { name: 'of Old Growth', type: 'suffix', target: 'MANA', amount: 6 },
      { name: 'of the Grove', type: 'suffix', target: 'MP', amount: 20 },
    ],
    flavor: 'Wear it long enough and the birds start bringing you news.',
  },
  {
    id: 'thinkingCap',
    name: 'The Thinking Cap',
    baseType: 'Headpiece',
    minIlvl: 14,
    implicitAttack: 0,
    implicitMagic: 0,
    implicitDefense: 9,
    affixes: [
      { name: 'Pondering', type: 'prefix', target: 'INT', amount: 10 },
      { name: 'of Bright Ideas', type: 'suffix', target: 'Magic', amount: 8 },
      { name: 'of Hindsight', type: 'suffix', target: 'MAGDEF', amount: 7 },
    ],
    flavor: 'All of its ideas are good. Two of them are legal.',
  },

  // --- Gloves & Boots ---
  {
    id: 'fistsOfTheCrab',
    name: 'Fists of the Crab',
    baseType: 'Glove',
    minIlvl: 7,
    implicitAttack: 0,
    implicitMagic: 0,
    implicitDefense: 4,
    affixes: [
      { name: 'Pinching', type: 'prefix', target: 'STR', amount: 6 },
      { name: 'Shell-backed', type: 'prefix', target: 'Defense', amount: 5 },
      { name: 'of Sideways Thinking', type: 'suffix', target: 'DEX', amount: 4 },
    ],
    flavor: 'Grip strength: yes. Applause: deafening.',
  },
  {
    id: 'sevenleagueStompers',
    name: 'Sevenleague Stompers',
    baseType: 'Boot',
    minIlvl: 14,
    implicitAttack: 0,
    implicitMagic: 0,
    implicitDefense: 8,
    affixes: [
      { name: 'Striding', type: 'prefix', target: 'DEX', amount: 10 },
      { name: 'of the Long Road', type: 'suffix', target: 'HP', amount: 28 },
      { name: 'of Thunderfalls', type: 'suffix', target: 'Attack', amount: 7 },
    ],
    flavor: 'Each step arrives slightly before you do.',
  },

  // --- Rings ---
  {
    id: 'pennywhistleLoop',
    name: 'Pennywhistle Loop',
    baseType: 'Ring',
    minIlvl: 3,
    implicitAttack: 0,
    implicitMagic: 0,
    implicitDefense: 0,
    affixes: [
      { name: 'Jaunty', type: 'prefix', target: 'LUCK', amount: 5 },
      { name: 'of Found Coins', type: 'suffix', target: 'DEX', amount: 4 },
    ],
    flavor: 'Whistles a jig when treasure is near. Also when it is not.',
  },
  {
    id: 'gravekeepersBand',
    name: "Gravekeeper's Band",
    baseType: 'Ring',
    minIlvl: 11,
    implicitAttack: 0,
    implicitMagic: 0,
    implicitDefense: 0,
    affixes: [
      { name: 'Solemn', type: 'prefix', target: 'MAGDEF', amount: 8 },
      { name: 'of the Quiet Yard', type: 'suffix', target: 'HP', amount: 24 },
      { name: 'of Last Rites', type: 'suffix', target: 'LUCK', amount: 5 },
    ],
    flavor: 'The dead respect a professional.',
  },
];
