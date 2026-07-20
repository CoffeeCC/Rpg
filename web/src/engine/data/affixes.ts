// Generative loot affix pool - Diablo 2 / PoE style.
// Every AffixTarget has both a full prefix line and a full suffix line,
// each in three tiers: t1 (ilvl 1+), t2 (ilvl 8+), t3 (ilvl 16+).
import type { AffixDef } from '../types';

export const AFFIXES: AffixDef[] = [
  // --- Attack (implicit weapon damage) ---
  { id: 'viciousAtk1', name: 'Vicious', type: 'prefix', tier: 1, minIlvl: 1, target: 'Attack', min: 1, max: 3 },
  { id: 'savageAtk2', name: 'Savage', type: 'prefix', tier: 2, minIlvl: 8, target: 'Attack', min: 3, max: 6 },
  { id: 'mercilessAtk3', name: 'Merciless', type: 'prefix', tier: 3, minIlvl: 16, target: 'Attack', min: 6, max: 12 },
  { id: 'ofSlayingAtk1', name: 'of Slaying', type: 'suffix', tier: 1, minIlvl: 1, target: 'Attack', min: 1, max: 3 },
  { id: 'ofCarnageAtk2', name: 'of Carnage', type: 'suffix', tier: 2, minIlvl: 8, target: 'Attack', min: 3, max: 6 },
  { id: 'ofButcheryAtk3', name: 'of Butchery', type: 'suffix', tier: 3, minIlvl: 16, target: 'Attack', min: 6, max: 12 },

  // --- Magic (implicit spell damage) ---
  { id: 'arcaneMag1', name: 'Arcane', type: 'prefix', tier: 1, minIlvl: 1, target: 'Magic', min: 1, max: 3 },
  { id: 'sorcerousMag2', name: 'Sorcerous', type: 'prefix', tier: 2, minIlvl: 8, target: 'Magic', min: 3, max: 6 },
  { id: 'eldritchMag3', name: 'Eldritch', type: 'prefix', tier: 3, minIlvl: 16, target: 'Magic', min: 6, max: 12 },
  { id: 'ofSpellcraftMag1', name: 'of Spellcraft', type: 'suffix', tier: 1, minIlvl: 1, target: 'Magic', min: 1, max: 3 },
  { id: 'ofSorceryMag2', name: 'of Sorcery', type: 'suffix', tier: 2, minIlvl: 8, target: 'Magic', min: 3, max: 6 },
  { id: 'ofWizardryMag3', name: 'of Wizardry', type: 'suffix', tier: 3, minIlvl: 16, target: 'Magic', min: 6, max: 12 },

  // --- Defense (implicit armor) ---
  { id: 'stalwartDef1', name: 'Stalwart', type: 'prefix', tier: 1, minIlvl: 1, target: 'Defense', min: 1, max: 3 },
  { id: 'fortifiedDef2', name: 'Fortified', type: 'prefix', tier: 2, minIlvl: 8, target: 'Defense', min: 3, max: 6 },
  { id: 'adamantDef3', name: 'Adamant', type: 'prefix', tier: 3, minIlvl: 16, target: 'Defense', min: 6, max: 12 },
  { id: 'ofShelterDef1', name: 'of Shelter', type: 'suffix', tier: 1, minIlvl: 1, target: 'Defense', min: 1, max: 3 },
  { id: 'ofRampartDef2', name: 'of the Rampart', type: 'suffix', tier: 2, minIlvl: 8, target: 'Defense', min: 3, max: 6 },
  { id: 'ofCitadelDef3', name: 'of the Citadel', type: 'suffix', tier: 3, minIlvl: 16, target: 'Defense', min: 6, max: 12 },

  // --- STR ---
  { id: 'brutishStr1', name: 'Brutish', type: 'prefix', tier: 1, minIlvl: 1, target: 'STR', min: 1, max: 3 },
  { id: 'mightyStr2', name: 'Mighty', type: 'prefix', tier: 2, minIlvl: 8, target: 'STR', min: 3, max: 6 },
  { id: 'titanicStr3', name: 'Titanic', type: 'prefix', tier: 3, minIlvl: 16, target: 'STR', min: 6, max: 12 },
  { id: 'ofBearStr1', name: 'of the Bear', type: 'suffix', tier: 1, minIlvl: 1, target: 'STR', min: 1, max: 3 },
  { id: 'ofOxStr2', name: 'of the Ox', type: 'suffix', tier: 2, minIlvl: 8, target: 'STR', min: 3, max: 6 },
  { id: 'ofColossusStr3', name: 'of the Colossus', type: 'suffix', tier: 3, minIlvl: 16, target: 'STR', min: 6, max: 12 },

  // --- DEF (character stat) ---
  { id: 'hardyDefStat1', name: 'Hardy', type: 'prefix', tier: 1, minIlvl: 1, target: 'DEF', min: 1, max: 3 },
  { id: 'ironcladDefStat2', name: 'Ironclad', type: 'prefix', tier: 2, minIlvl: 8, target: 'DEF', min: 3, max: 6 },
  { id: 'unbreakableDefStat3', name: 'Unbreakable', type: 'prefix', tier: 3, minIlvl: 16, target: 'DEF', min: 6, max: 12 },
  { id: 'ofTortoiseDefStat1', name: 'of the Tortoise', type: 'suffix', tier: 1, minIlvl: 1, target: 'DEF', min: 1, max: 3 },
  { id: 'ofBulwarkDefStat2', name: 'of the Bulwark', type: 'suffix', tier: 2, minIlvl: 8, target: 'DEF', min: 3, max: 6 },
  { id: 'ofMountainDefStat3', name: 'of the Mountain', type: 'suffix', tier: 3, minIlvl: 16, target: 'DEF', min: 6, max: 12 },

  // --- DEX ---
  { id: 'agileDex1', name: 'Agile', type: 'prefix', tier: 1, minIlvl: 1, target: 'DEX', min: 1, max: 3 },
  { id: 'fleetDex2', name: 'Fleet', type: 'prefix', tier: 2, minIlvl: 8, target: 'DEX', min: 3, max: 6 },
  { id: 'quicksilverDex3', name: 'Quicksilver', type: 'prefix', tier: 3, minIlvl: 16, target: 'DEX', min: 6, max: 12 },
  { id: 'ofFoxDex1', name: 'of the Fox', type: 'suffix', tier: 1, minIlvl: 1, target: 'DEX', min: 1, max: 3 },
  { id: 'ofFalconDex2', name: 'of the Falcon', type: 'suffix', tier: 2, minIlvl: 8, target: 'DEX', min: 3, max: 6 },
  { id: 'ofWindDex3', name: 'of the Wind', type: 'suffix', tier: 3, minIlvl: 16, target: 'DEX', min: 6, max: 12 },

  // --- MANA (mana stat) ---
  { id: 'attunedMana1', name: 'Attuned', type: 'prefix', tier: 1, minIlvl: 1, target: 'MANA', min: 1, max: 3 },
  { id: 'mysticMana2', name: 'Mystic', type: 'prefix', tier: 2, minIlvl: 8, target: 'MANA', min: 3, max: 6 },
  { id: 'celestialMana3', name: 'Celestial', type: 'prefix', tier: 3, minIlvl: 16, target: 'MANA', min: 6, max: 12 },
  { id: 'ofWellMana1', name: 'of the Well', type: 'suffix', tier: 1, minIlvl: 1, target: 'MANA', min: 1, max: 3 },
  { id: 'ofSpringMana2', name: 'of the Spring', type: 'suffix', tier: 2, minIlvl: 8, target: 'MANA', min: 3, max: 6 },
  { id: 'ofOceanMana3', name: 'of the Ocean', type: 'suffix', tier: 3, minIlvl: 16, target: 'MANA', min: 6, max: 12 },

  // --- MAGDEF ---
  { id: 'wardedMagdef1', name: 'Warded', type: 'prefix', tier: 1, minIlvl: 1, target: 'MAGDEF', min: 1, max: 3 },
  { id: 'runedMagdef2', name: 'Runed', type: 'prefix', tier: 2, minIlvl: 8, target: 'MAGDEF', min: 3, max: 6 },
  { id: 'hexproofMagdef3', name: 'Hexproof', type: 'prefix', tier: 3, minIlvl: 16, target: 'MAGDEF', min: 6, max: 12 },
  { id: 'ofWardingMagdef1', name: 'of Warding', type: 'suffix', tier: 1, minIlvl: 1, target: 'MAGDEF', min: 1, max: 3 },
  { id: 'ofAegisMagdef2', name: 'of the Aegis', type: 'suffix', tier: 2, minIlvl: 8, target: 'MAGDEF', min: 3, max: 6 },
  { id: 'ofNullityMagdef3', name: 'of Nullity', type: 'suffix', tier: 3, minIlvl: 16, target: 'MAGDEF', min: 6, max: 12 },

  // --- INT ---
  { id: 'cleverInt1', name: 'Clever', type: 'prefix', tier: 1, minIlvl: 1, target: 'INT', min: 1, max: 3 },
  { id: 'brilliantInt2', name: 'Brilliant', type: 'prefix', tier: 2, minIlvl: 8, target: 'INT', min: 3, max: 6 },
  { id: 'transcendentInt3', name: 'Transcendent', type: 'prefix', tier: 3, minIlvl: 16, target: 'INT', min: 6, max: 12 },
  { id: 'ofOwlInt1', name: 'of the Owl', type: 'suffix', tier: 1, minIlvl: 1, target: 'INT', min: 1, max: 3 },
  { id: 'ofSageInt2', name: 'of the Sage', type: 'suffix', tier: 2, minIlvl: 8, target: 'INT', min: 3, max: 6 },
  { id: 'ofArchmageInt3', name: 'of the Archmage', type: 'suffix', tier: 3, minIlvl: 16, target: 'INT', min: 6, max: 12 },

  // --- LUCK ---
  { id: 'luckyLuck1', name: 'Lucky', type: 'prefix', tier: 1, minIlvl: 1, target: 'LUCK', min: 1, max: 3 },
  { id: 'fortuitousLuck2', name: 'Fortuitous', type: 'prefix', tier: 2, minIlvl: 8, target: 'LUCK', min: 3, max: 6 },
  { id: 'fatedLuck3', name: 'Fated', type: 'prefix', tier: 3, minIlvl: 16, target: 'LUCK', min: 6, max: 12 },
  { id: 'ofRabbitLuck1', name: 'of the Rabbit', type: 'suffix', tier: 1, minIlvl: 1, target: 'LUCK', min: 1, max: 3 },
  { id: 'ofCloverLuck2', name: 'of the Clover', type: 'suffix', tier: 2, minIlvl: 8, target: 'LUCK', min: 3, max: 6 },
  { id: 'ofDestinyLuck3', name: 'of Destiny', type: 'suffix', tier: 3, minIlvl: 16, target: 'LUCK', min: 6, max: 12 },

  // --- HP (rolls ~3x a stat line) ---
  { id: 'haleHp1', name: 'Hale', type: 'prefix', tier: 1, minIlvl: 1, target: 'HP', min: 5, max: 12 },
  { id: 'vigorousHp2', name: 'Vigorous', type: 'prefix', tier: 2, minIlvl: 8, target: 'HP', min: 12, max: 25 },
  { id: 'colossalHp3', name: 'Colossal', type: 'prefix', tier: 3, minIlvl: 16, target: 'HP', min: 25, max: 50 },
  { id: 'ofWolfHp1', name: 'of the Wolf', type: 'suffix', tier: 1, minIlvl: 1, target: 'HP', min: 5, max: 12 },
  { id: 'ofTigerHp2', name: 'of the Tiger', type: 'suffix', tier: 2, minIlvl: 8, target: 'HP', min: 12, max: 25 },
  { id: 'ofMammothHp3', name: 'of the Mammoth', type: 'suffix', tier: 3, minIlvl: 16, target: 'HP', min: 25, max: 50 },

  // --- MP (rolls ~2x a stat line) ---
  { id: 'spiritedMp1', name: 'Spirited', type: 'prefix', tier: 1, minIlvl: 1, target: 'MP', min: 3, max: 8 },
  { id: 'etherealMp2', name: 'Ethereal', type: 'prefix', tier: 2, minIlvl: 8, target: 'MP', min: 8, max: 16 },
  { id: 'boundlessMp3', name: 'Boundless', type: 'prefix', tier: 3, minIlvl: 16, target: 'MP', min: 16, max: 32 },
  { id: 'ofSparkMp1', name: 'of the Spark', type: 'suffix', tier: 1, minIlvl: 1, target: 'MP', min: 3, max: 8 },
  { id: 'ofMoonMp2', name: 'of the Moon', type: 'suffix', tier: 2, minIlvl: 8, target: 'MP', min: 8, max: 16 },
  { id: 'ofStarsMp3', name: 'of the Stars', type: 'suffix', tier: 3, minIlvl: 16, target: 'MP', min: 16, max: 32 },
];

/** Two-part generated names for Rare items, D2-style ("Doom Bite"). */
export const RARE_NAME_PREFIXES: string[] = [
  'Doom', 'Grim', 'Storm', 'Blood', 'Sorrow', 'Ember',
  'Shadow', 'Bone', 'Raven', 'Viper', 'Dread', 'Ghoul',
  'Frost', 'Wraith', 'Ash', 'Night', 'Iron', 'Gale',
  'Rune', 'Skull',
];

export const RARE_NAME_SUFFIXES: string[] = [
  'Bite', 'Ward', 'Song', 'Brand', 'Coil', 'Veil',
  'Fang', 'Grasp', 'Shroud', 'Spire', 'Thorn', 'Howl',
  'Edge', 'Knell', 'Mark', 'Snare', 'Crest', 'Whisper',
  'Pyre', 'Maw',
];
