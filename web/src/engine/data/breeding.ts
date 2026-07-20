// Monsters content: hand-authored 9x9 family breeding matrix + pair overrides.
// Authored by the monsters content agent. Export names/shapes are contract.
// FAMILY_MATRIX is total (every pair resolves) and symmetric.
import type { BreedingPairOverride, MonsterFamily } from '../types';

// Design intent:
// - Same-family pairs breed true.
// - Slime is a universal base: Slime x anything -> the other family.
// - Dragons are dominant bloodlines except against Devil (corruption wins)
//   and Undead (a dead dragon is still dead).
// - Beasts blend outward: with Bird -> Bird, with Plant -> Plant, with
//   Devil -> Devil; otherwise the beast blood holds.
// - Dark begets dark: Devil takes Bird/Bug/Undead/Material crosses; Undead
//   takes Bird/Bug crosses.
// - Plants overgrow whatever they are crossed with except Bug (pollinators
//   win) and the dominant families above.
// - Material x Bug -> Material (amber does what amber does).
export const FAMILY_MATRIX: Record<MonsterFamily, Record<MonsterFamily, MonsterFamily>> = {
  Slime: {
    Slime: 'Slime',
    Dragon: 'Dragon',
    Beast: 'Beast',
    Bird: 'Bird',
    Plant: 'Plant',
    Bug: 'Bug',
    Devil: 'Devil',
    Undead: 'Undead',
    Material: 'Material',
  },
  Dragon: {
    Slime: 'Dragon',
    Dragon: 'Dragon',
    Beast: 'Dragon',
    Bird: 'Dragon',
    Plant: 'Dragon',
    Bug: 'Dragon',
    Devil: 'Devil',
    Undead: 'Undead',
    Material: 'Dragon',
  },
  Beast: {
    Slime: 'Beast',
    Dragon: 'Dragon',
    Beast: 'Beast',
    Bird: 'Bird',
    Plant: 'Plant',
    Bug: 'Beast',
    Devil: 'Devil',
    Undead: 'Beast',
    Material: 'Beast',
  },
  Bird: {
    Slime: 'Bird',
    Dragon: 'Dragon',
    Beast: 'Bird',
    Bird: 'Bird',
    Plant: 'Plant',
    Bug: 'Bird',
    Devil: 'Devil',
    Undead: 'Undead',
    Material: 'Bird',
  },
  Plant: {
    Slime: 'Plant',
    Dragon: 'Dragon',
    Beast: 'Plant',
    Bird: 'Plant',
    Plant: 'Plant',
    Bug: 'Bug',
    Devil: 'Plant',
    Undead: 'Plant',
    Material: 'Plant',
  },
  Bug: {
    Slime: 'Bug',
    Dragon: 'Dragon',
    Beast: 'Beast',
    Bird: 'Bird',
    Plant: 'Bug',
    Bug: 'Bug',
    Devil: 'Devil',
    Undead: 'Undead',
    Material: 'Material',
  },
  Devil: {
    Slime: 'Devil',
    Dragon: 'Devil',
    Beast: 'Devil',
    Bird: 'Devil',
    Plant: 'Plant',
    Bug: 'Devil',
    Devil: 'Devil',
    Undead: 'Devil',
    Material: 'Devil',
  },
  Undead: {
    Slime: 'Undead',
    Dragon: 'Undead',
    Beast: 'Beast',
    Bird: 'Undead',
    Plant: 'Plant',
    Bug: 'Undead',
    Devil: 'Devil',
    Undead: 'Undead',
    Material: 'Undead',
  },
  Material: {
    Slime: 'Material',
    Dragon: 'Dragon',
    Beast: 'Beast',
    Bird: 'Bird',
    Plant: 'Plant',
    Bug: 'Material',
    Devil: 'Devil',
    Undead: 'Undead',
    Material: 'Material',
  },
};

// Discovery candy: specific parent pairs that yield special offspring.
// Order-insensitive (systems code checks both orders).
export const PAIR_OVERRIDES: BreedingPairOverride[] = [
  // Two humble tier-1 slimes forge a knight.
  { a: 'goober', b: 'bubblim', result: 'gelKnight' },
  // Slime royalty, earned the shiny way.
  { a: 'shimmerOoze', b: 'gelKnight', result: 'sovereignSlime' },
  // A whelp raised among raptors learns the thunder roads.
  { a: 'drakeling', b: 'skyTalon', result: 'stormDrake' },
  // Dragonfire plus rebirth-fire: the inferno line.
  { a: 'emberwhelp', b: 'phoenixling', result: 'infernoDragon' },
  // Storm and glacier cancel into pure flame. Alchemy is weird.
  { a: 'stormDrake', b: 'frostWyrm', result: 'infernoDragon' },
  // A panther steeped in dusk becomes the thing under the bed.
  { a: 'shadowPanther', b: 'duskFiend', result: 'nightTerror' },
  // A lost voice bound to a fiend climbs the infernal ladder.
  { a: 'wailingWisp', b: 'duskFiend', result: 'archfiend' },
  // Old wood and deep spores dream up the world-blossom.
  { a: 'elderTreant', b: 'gloomShroom', result: 'yggdraBlossom' },
  // The swarm elects an empress.
  { a: 'razorMantis', b: 'dartWasp', result: 'hiveEmpress' },
  // Stone wings and empty steel fuse into a walking fortress.
  { a: 'livingArmor', b: 'gargoyle', result: 'adamantColossus' },
  // Enough bones in one place always find a king.
  { a: 'boneshambler', b: 'shamblebones', result: 'cryptTyrant' },
  // Apex fur meets living stone; the result shakes the ground.
  { a: 'grizzlord', b: 'onyxGolem', result: 'behemoth' },
];
