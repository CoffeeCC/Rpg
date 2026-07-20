// ---------------------------------------------------------------------------
// Aspects: unique modifiers rolled onto uncommon wild monsters (Alpha/Rare).
// Replace the bare "[Alpha]"/"[Rare]" tag with a named aspect woven into the
// monster's display name (e.g. "Ironhide Gel Knight"), with a hover/select
// blurb explaining what the aspect means in-world and mechanically.
// Engine wiring (rolling an aspect onto a spawned MonsterInstance, applying
// its mods, rendering the blurb on hover) is NOT part of this file's job.
// ---------------------------------------------------------------------------

import type { MonsterRarity } from '../types';

export interface AspectDef {
  id: string; // kebab-case
  name: string; // shown in the monster's name, e.g. "Ironhide" -> "Ironhide Gel Knight"
  blurb: string; // 1 sentence, thematic, shown on hover/select
  rarity: MonsterRarity; // which rarity tier this aspect can roll on ('Alpha' or 'Rare' only)
  mods: { hpMult?: number; strMult?: number; defMult?: number; tameMult?: number };
}

export const ASPECTS: AspectDef[] = [
  // --- Alpha aspects (24) ---
  {
    id: 'ironhide',
    name: 'Ironhide',
    blurb: 'Its hide turns all but the truest blows, hardier and harder to wound, but slower to strike back.',
    rarity: 'Alpha',
    mods: { defMult: 1.15, strMult: 0.95 },
  },
  {
    id: 'duskborn',
    name: 'Duskborn',
    blurb: 'Born in the long shadow between day and night, it carries a deeper well of vitality than its kin.',
    rarity: 'Alpha',
    mods: { hpMult: 1.1 },
  },
  {
    id: 'gravemarked',
    name: 'Gravemarked',
    blurb: 'Old grave-earth clings to its flesh, thickening its guard and steadying its endurance.',
    rarity: 'Alpha',
    mods: { defMult: 1.1, hpMult: 1.05 },
  },
  {
    id: 'stormfed',
    name: 'Stormfed',
    blurb: 'Raised on lightning and gale-wind, it hits with startling force but leaves its flank open.',
    rarity: 'Alpha',
    mods: { strMult: 1.15, defMult: 0.95 },
  },
  {
    id: 'hollow-eyed',
    name: 'Hollow-eyed',
    blurb: 'Its stare has gone empty and unafraid, making it strangely easy to win over, though it hits softer for it.',
    rarity: 'Alpha',
    mods: { tameMult: 1.2, strMult: 0.95 },
  },
  {
    id: 'ashbound',
    name: 'Ashbound',
    blurb: 'Wreathed in fine cinder-dust, its strikes carry a searing extra bite.',
    rarity: 'Alpha',
    mods: { strMult: 1.1 },
  },
  {
    id: 'bloodfang',
    name: 'Bloodfang',
    blurb: 'Its fangs have tasted victory before, driving it to hit with reckless, armor-thin ferocity.',
    rarity: 'Alpha',
    mods: { strMult: 1.2, defMult: 0.92 },
  },
  {
    id: 'thornhide',
    name: 'Thornhide',
    blurb: 'A lattice of hardened barbs has grown through its skin, making it brutal to wear down.',
    rarity: 'Alpha',
    mods: { defMult: 1.2 },
  },
  {
    id: 'ember-veined',
    name: 'Ember-veined',
    blurb: 'Faint coals glow beneath its skin, quickening its blows with banked heat.',
    rarity: 'Alpha',
    mods: { strMult: 1.12 },
  },
  {
    id: 'frostbitten',
    name: 'Frostbitten',
    blurb: 'Cold has crept into its joints, stiffening its guard but leaving it wary and hard to approach.',
    rarity: 'Alpha',
    mods: { defMult: 1.1, tameMult: 0.85 },
  },
  {
    id: 'ragefed',
    name: 'Ragefed',
    blurb: 'A simmering fury sharpens every blow, though it burns through its own stamina to do it.',
    rarity: 'Alpha',
    mods: { strMult: 1.15, hpMult: 0.95 },
  },
  {
    id: 'ironjaw',
    name: 'Ironjaw',
    blurb: 'A vice-like bite and a braced stance make it dangerous both to strike and to fight.',
    rarity: 'Alpha',
    mods: { strMult: 1.1, defMult: 1.05 },
  },
  {
    id: 'bonecrusted',
    name: 'Bonecrusted',
    blurb: 'A crust of fused bone plates has grown over its weak points, blunting incoming harm.',
    rarity: 'Alpha',
    mods: { defMult: 1.15 },
  },
  {
    id: 'wraithtouched',
    name: 'Wraithtouched',
    blurb: 'Something restless and half-seen has brushed against it, leaving it oddly willing to be led.',
    rarity: 'Alpha',
    mods: { tameMult: 1.15 },
  },
  {
    id: 'stonehide',
    name: 'Stonehide',
    blurb: 'Its skin has taken on the density of quarried stone, at the cost of quick offense.',
    rarity: 'Alpha',
    mods: { defMult: 1.2, strMult: 0.92 },
  },
  {
    id: 'nightfed',
    name: 'Nightfed',
    blurb: 'It has fed only in darkness, growing sturdier of body but a touch slower to guard itself.',
    rarity: 'Alpha',
    mods: { hpMult: 1.15, defMult: 0.95 },
  },
  {
    id: 'marrowdeep',
    name: 'Marrowdeep',
    blurb: 'Its bones run unusually dense and deep, granting it a stubborn hold on life.',
    rarity: 'Alpha',
    mods: { hpMult: 1.2 },
  },
  {
    id: 'cindertouched',
    name: 'Cindertouched',
    blurb: 'A dusting of hot ash clings to its strikes, making it hit harder but shy from capture.',
    rarity: 'Alpha',
    mods: { strMult: 1.1, tameMult: 0.9 },
  },
  {
    id: 'rootbound',
    name: 'Rootbound',
    blurb: 'Fibrous roots have laced through its frame, thickening both its hide and its constitution.',
    rarity: 'Alpha',
    mods: { defMult: 1.1, hpMult: 1.05 },
  },
  {
    id: 'grimhorned',
    name: 'Grimhorned',
    blurb: 'A jagged, oversized horn has grown in, turning every charge into a heavier blow.',
    rarity: 'Alpha',
    mods: { strMult: 1.15 },
  },
  {
    id: 'voidkissed',
    name: 'Voidkissed',
    blurb: 'A sliver of the abyss has settled in it, dulling its guard while making it easier to sway.',
    rarity: 'Alpha',
    mods: { tameMult: 1.1, defMult: 0.95 },
  },
  {
    id: 'sablescaled',
    name: 'Sablescaled',
    blurb: 'Its scales have darkened to jet, denser and slightly quicker to answer in kind.',
    rarity: 'Alpha',
    mods: { defMult: 1.12, strMult: 1.03 },
  },
  {
    id: 'duskfanged',
    name: 'Duskfanged',
    blurb: 'Its fangs have lengthened in the half-light, biting harder but making it skittish to tame.',
    rarity: 'Alpha',
    mods: { strMult: 1.18, tameMult: 0.85 },
  },
  {
    id: 'stormcalled',
    name: 'Stormcalled',
    blurb: 'Static clings to its frame, sharpening both its attack and its footing.',
    rarity: 'Alpha',
    mods: { strMult: 1.1, defMult: 1.05 },
  },

  // --- Rare aspects (12) ---
  {
    id: 'duskwoven',
    name: 'Duskwoven',
    blurb: 'Twilight itself seems woven into its being, granting a deep, unnatural reserve of vitality.',
    rarity: 'Rare',
    mods: { hpMult: 1.2 },
  },
  {
    id: 'stormforged',
    name: 'Stormforged',
    blurb: 'Tempered in a raging storm, its blows land with terrible force at the cost of its guard.',
    rarity: 'Rare',
    mods: { strMult: 1.2, defMult: 0.95 },
  },
  {
    id: 'gravebound',
    name: 'Gravebound',
    blurb: 'Bound to old, cold earth, it shrugs off punishment but resists being coaxed away from it.',
    rarity: 'Rare',
    mods: { defMult: 1.2, tameMult: 0.85 },
  },
  {
    id: 'voidmarked',
    name: 'Voidmarked',
    blurb: 'Marked by something vast and empty, it has grown strangely, powerfully drawn to company.',
    rarity: 'Rare',
    mods: { tameMult: 1.25 },
  },
  {
    id: 'ashenveiled',
    name: 'Ashenveiled',
    blurb: 'A veil of drifting ash clings to it, sharpening its strikes and toughening its body beneath.',
    rarity: 'Rare',
    mods: { strMult: 1.15, hpMult: 1.05 },
  },
  {
    id: 'ironsouled',
    name: 'Ironsouled',
    blurb: 'An unbending will has hardened it through and through, both in body and in bearing.',
    rarity: 'Rare',
    mods: { defMult: 1.2, strMult: 1.05 },
  },
  {
    id: 'nightspawned',
    name: 'Nightspawned',
    blurb: 'Spawned in the deepest dark, it is unusually hardy, though it startles from a would-be tamer.',
    rarity: 'Rare',
    mods: { hpMult: 1.15, tameMult: 0.9 },
  },
  {
    id: 'doomfed',
    name: 'Doomfed',
    blurb: 'It has fed on ill omens, hitting with devastating power while leaving its own defenses thin.',
    rarity: 'Rare',
    mods: { strMult: 1.25, defMult: 0.9 },
  },
  {
    id: 'wyrmkissed',
    name: 'Wyrmkissed',
    blurb: 'Touched by something draconic and ancient, it is stronger and hardier in equal, dangerous measure.',
    rarity: 'Rare',
    mods: { hpMult: 1.1, strMult: 1.1 },
  },
  {
    id: 'hollowking',
    name: 'Hollowking',
    blurb: 'It carries itself like royalty of an empty throne, ferociously powerful and fiercely unwilling to yield.',
    rarity: 'Rare',
    mods: { strMult: 1.2, tameMult: 0.75 },
  },
  {
    id: 'stormwrought',
    name: 'Stormwrought',
    blurb: 'Hammered into being by an endless tempest, it is both heavily armored and hard-hitting.',
    rarity: 'Rare',
    mods: { defMult: 1.15, strMult: 1.08 },
  },
  {
    id: 'emberbound',
    name: 'Emberbound',
    blurb: 'A core of banked fire drives it to strike with real menace, though it tires faster for it.',
    rarity: 'Rare',
    mods: { strMult: 1.15, hpMult: 0.95 },
  },
];

export function aspectsFor(rarity: MonsterRarity): AspectDef[] {
  return ASPECTS.filter((a) => a.rarity === rarity);
}

/** Deterministic pick: roll is an integer >= 0, reduced via modulo. Null for rarities with no aspects (e.g. 'Common'). */
export function pickAspect(rarity: MonsterRarity, roll: number): AspectDef | null {
  const pool = aspectsFor(rarity);
  if (pool.length === 0) return null;
  const idx = ((roll % pool.length) + pool.length) % pool.length;
  return pool[idx];
}
