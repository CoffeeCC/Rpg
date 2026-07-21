// Enemy AI kits: telegraphed move-sets for family trash mobs, elite/miniboss
// encounters, and the five gate bosses. Authored as pure data — the engine
// (systems code, built in parallel) rolls weights, shows `name` as the
// intent telegraph, then executes on the enemy's turn.
//
// Status ids used below are the engine's real StatusName values (see
// src/engine/types.ts): 'Burned' | 'Poisoned' | 'Stunned' | 'Frozen'.
// MonsterFamily is re-exported here as FamilyName to match the contract
// this file is written against.
import type { MonsterFamily as FamilyName } from '../types';

/** One telegraphed move in an enemy's kit. The engine rolls weights each turn,
 * shows `name` as the intent telegraph, then executes on the enemy's turn. */
export interface EnemyMove {
  id: string;
  /** Telegraph text shown to the player, e.g. "Winding Up", "Baring Fangs". Short, 1-3 words. */
  name: string;
  kind: 'attack' | 'heavy' | 'multi' | 'guard' | 'buff' | 'debuff' | 'drain';
  /** Damage multiplier vs the enemy's basic attack. 1 = normal hit; heavy ~1.8-2.5; multi is per-hit (~0.5-0.7); 0 for non-damage moves. */
  power: number;
  /** For kind 'multi': number of hits (2-4). */
  hits?: number;
  /** Optional status the move applies — MUST be a status id that already exists in the engine. target 'self' = the enemy itself, 'hero' = the player character, 'party' = a player monster. */
  status?: { id: string; target: 'self' | 'hero' | 'party'; turns: number };
  /** Selection weight (relative). */
  weight: number;
  /** Turns before this move can repeat (0/undefined = no cooldown). */
  cooldown?: number;
  /** Only usable when enemy HP fraction is at or below this (e.g. 0.5 = enrage move). */
  belowHpPct?: number;
  /** Fires at most once per battle. */
  once?: boolean;
}

export interface EnemyKit {
  moves: EnemyMove[];
}

// ---------------------------------------------------------------------------
// Family kits — light, 3-4 moves: a heavily-weighted basic attack, one
// signature move, and usually a guard or debuff to round it out.
// ---------------------------------------------------------------------------
export const FAMILY_KITS: Record<FamilyName, EnemyKit> = {
  Slime: {
    moves: [
      { id: 'slime_splat', name: 'Splat', kind: 'attack', power: 1, weight: 60 },
      { id: 'slime_wobble', name: 'Wobbling Up', kind: 'buff', power: 0, weight: 20, cooldown: 3 },
      {
        id: 'slime_ooze',
        name: 'Acid Ooze',
        kind: 'debuff',
        power: 0,
        status: { id: 'Poisoned', target: 'hero', turns: 2 },
        weight: 15,
        cooldown: 3,
      },
      { id: 'slime_squish', name: 'Squishing Down', kind: 'guard', power: 0, weight: 15, cooldown: 2 },
    ],
  },
  Dragon: {
    moves: [
      { id: 'dragon_claws', name: 'Claws Out', kind: 'attack', power: 1, weight: 55 },
      {
        id: 'dragon_breath',
        name: 'Stoking the Flame',
        kind: 'heavy',
        power: 2.2,
        status: { id: 'Burned', target: 'hero', turns: 2 },
        weight: 20,
        cooldown: 3,
      },
      { id: 'dragon_wings', name: 'Wings Flared', kind: 'multi', power: 0.6, hits: 3, weight: 15, cooldown: 2 },
      { id: 'dragon_scales', name: 'Scales Harden', kind: 'guard', power: 0, weight: 15, cooldown: 2 },
    ],
  },
  Beast: {
    moves: [
      { id: 'beast_jaws', name: 'Snapping Jaws', kind: 'attack', power: 1, weight: 60 },
      { id: 'beast_pounce', name: 'Coiling to Pounce', kind: 'heavy', power: 2, weight: 20, cooldown: 2 },
      { id: 'beast_snarl', name: "Hackles Raised", kind: 'debuff', power: 0, weight: 10, cooldown: 3 },
      { id: 'beast_brace', name: 'Digging In', kind: 'guard', power: 0, weight: 10, cooldown: 3 },
    ],
  },
  Bird: {
    moves: [
      { id: 'bird_rake', name: 'Talon Rake', kind: 'attack', power: 1, weight: 55 },
      { id: 'bird_flurry', name: 'Flurry of Wings', kind: 'multi', power: 0.6, hits: 2, weight: 20, cooldown: 2 },
      {
        id: 'bird_dust',
        name: 'Kicking Up Dust',
        kind: 'debuff',
        power: 0,
        status: { id: 'Stunned', target: 'hero', turns: 1 },
        weight: 10,
        cooldown: 4,
      },
      { id: 'bird_wheel', name: 'Evasive Wheel', kind: 'guard', power: 0, weight: 15, cooldown: 2 },
    ],
  },
  Plant: {
    moves: [
      { id: 'plant_whip', name: 'Thorn Whip', kind: 'attack', power: 1, weight: 55 },
      {
        id: 'plant_spore',
        name: 'Spore Cloud',
        kind: 'debuff',
        power: 0,
        status: { id: 'Poisoned', target: 'hero', turns: 2 },
        weight: 15,
        cooldown: 3,
      },
      { id: 'plant_sap', name: 'Sap Drain', kind: 'drain', power: 1, weight: 15, cooldown: 3 },
      { id: 'plant_roots', name: 'Roots Coiling', kind: 'guard', power: 0, weight: 15, cooldown: 2 },
    ],
  },
  Bug: {
    moves: [
      { id: 'bug_mandible', name: 'Mandible Snap', kind: 'attack', power: 1, weight: 55 },
      { id: 'bug_swarm', name: 'Swarm Bite', kind: 'multi', power: 0.5, hits: 3, weight: 20, cooldown: 2 },
      {
        id: 'bug_sting',
        name: 'Numbing Sting',
        kind: 'debuff',
        power: 0,
        status: { id: 'Poisoned', target: 'hero', turns: 1 },
        weight: 15,
        cooldown: 3,
      },
      { id: 'bug_chitin', name: 'Chitin Plating', kind: 'guard', power: 0, weight: 10, cooldown: 3 },
    ],
  },
  Devil: {
    moves: [
      { id: 'devil_claw', name: 'Wicked Claw', kind: 'attack', power: 1, weight: 55 },
      { id: 'devil_bargain', name: 'Cursed Bargain', kind: 'heavy', power: 2.3, weight: 15, cooldown: 3 },
      { id: 'devil_doubt', name: 'Whispered Doubt', kind: 'debuff', power: 0, weight: 15, cooldown: 2 },
      { id: 'devil_nibble', name: 'Soul Nibble', kind: 'drain', power: 1, weight: 15, cooldown: 3 },
    ],
  },
  Undead: {
    moves: [
      { id: 'undead_grasp', name: 'Grasping Claw', kind: 'attack', power: 1, weight: 55 },
      { id: 'undead_rattle', name: 'Death Rattle', kind: 'heavy', power: 2.1, weight: 15, cooldown: 3 },
      {
        id: 'undead_chill',
        name: 'Chilling Touch',
        kind: 'debuff',
        power: 0,
        status: { id: 'Frozen', target: 'hero', turns: 1 },
        weight: 15,
        cooldown: 4,
      },
      { id: 'undead_wither', name: 'Withering Grip', kind: 'drain', power: 1, weight: 15, cooldown: 3 },
    ],
  },
  Material: {
    moves: [
      { id: 'material_fist', name: 'Stone Fist', kind: 'attack', power: 1, weight: 55 },
      { id: 'material_slam', name: 'Winding Up', kind: 'heavy', power: 2.2, weight: 20, cooldown: 3 },
      { id: 'material_harden', name: 'Harden', kind: 'guard', power: 0, weight: 20, cooldown: 2 },
      {
        id: 'material_weight',
        name: 'Grinding Weight',
        kind: 'debuff',
        power: 0,
        status: { id: 'Stunned', target: 'hero', turns: 1 },
        weight: 10,
        cooldown: 4,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Elite kit — shared by minibosses / famous-beast encounters. Meaner than a
// family kit: more hits, tighter cooldowns, a real debuff.
// ---------------------------------------------------------------------------
export const ELITE_KIT: EnemyKit = {
  moves: [
    { id: 'elite_momentum', name: 'Feral Momentum', kind: 'attack', power: 1, weight: 45 },
    { id: 'elite_crush', name: 'Crushing Blow', kind: 'heavy', power: 2.3, weight: 20, cooldown: 2 },
    { id: 'elite_flurry', name: 'Rending Flurry', kind: 'multi', power: 0.6, hits: 3, weight: 15, cooldown: 2 },
    { id: 'elite_roar', name: 'Bracing Roar', kind: 'guard', power: 0, weight: 10, cooldown: 3 },
    {
      id: 'elite_curse',
      name: 'Rending Curse',
      kind: 'debuff',
      power: 0,
      status: { id: 'Poisoned', target: 'hero', turns: 2 },
      weight: 10,
      cooldown: 3,
    },
  ],
};

// ---------------------------------------------------------------------------
// Boss kits — keyed by the exact bossName strings from gates.ts. Rich kits
// with an opening pattern, mid-fight tools, a guard, a debuff, and a
// below-50% enrage that changes the fight's texture.
// ---------------------------------------------------------------------------
export const BOSS_KITS: Record<string, EnemyKit> = {
  // Verdant Gate — The Rootwarden (Plant, tier 2, lvl 6)
  'The Rootwarden': {
    moves: [
      { id: 'rootwarden_lash', name: 'Vine Lash', kind: 'attack', power: 1, weight: 40 },
      { id: 'rootwarden_slam', name: 'Root Slam', kind: 'heavy', power: 2, weight: 20, cooldown: 2 },
      { id: 'rootwarden_bramble', name: 'Bramble Flurry', kind: 'multi', power: 0.6, hits: 3, weight: 15, cooldown: 3 },
      {
        id: 'rootwarden_spore',
        name: 'Spore Burst',
        kind: 'debuff',
        power: 0,
        status: { id: 'Poisoned', target: 'hero', turns: 2 },
        weight: 15,
        cooldown: 3,
      },
      { id: 'rootwarden_bark', name: 'Bark Skin', kind: 'guard', power: 0, weight: 10, cooldown: 3 },
      {
        id: 'rootwarden_enrage',
        name: 'The Roots Awaken',
        kind: 'heavy',
        power: 2.6,
        weight: 25,
        cooldown: 2,
        belowHpPct: 0.5,
      },
    ],
  },
  // Hollow Gate — The Cairn King (Material, tier 3, lvl 11)
  'The Cairn King': {
    moves: [
      { id: 'cairnking_fist', name: 'Stone Fist', kind: 'attack', power: 1, weight: 35 },
      { id: 'cairnking_crush', name: 'Cairn Crush', kind: 'heavy', power: 2.2, weight: 18, cooldown: 2 },
      { id: 'cairnking_bulwark', name: 'Ancient Bulwark', kind: 'guard', power: 0, weight: 15, cooldown: 3 },
      {
        id: 'cairnking_weight',
        name: 'Grave Weight',
        kind: 'debuff',
        power: 0,
        status: { id: 'Stunned', target: 'hero', turns: 1 },
        weight: 12,
        cooldown: 4,
      },
      { id: 'cairnking_rockfall', name: 'Rockfall', kind: 'multi', power: 0.6, hits: 3, weight: 15, cooldown: 3 },
      {
        id: 'cairnking_enrage',
        name: 'The Cairn Cracks Open',
        kind: 'heavy',
        power: 2.8,
        weight: 25,
        cooldown: 2,
        belowHpPct: 0.5,
      },
    ],
  },
  // Sunken Gate — The Drowned Curate (Undead, tier 4, lvl 16)
  'The Drowned Curate': {
    moves: [
      { id: 'curate_grasp', name: 'Waterlogged Grasp', kind: 'attack', power: 1, weight: 32 },
      { id: 'curate_rite', name: 'Drowning Rite', kind: 'heavy', power: 2.3, weight: 18, cooldown: 2 },
      {
        id: 'curate_curse',
        name: "Curate's Curse",
        kind: 'debuff',
        power: 0,
        status: { id: 'Poisoned', target: 'hero', turns: 2 },
        weight: 15,
        cooldown: 3,
      },
      { id: 'curate_rites', name: 'Last Rites', kind: 'drain', power: 1.2, weight: 15, cooldown: 3 },
      { id: 'curate_ward', name: 'Sunken Ward', kind: 'guard', power: 0, weight: 10, cooldown: 3 },
      { id: 'curate_chant', name: 'Tidal Chant', kind: 'multi', power: 0.6, hits: 3, weight: 12, cooldown: 3 },
      {
        id: 'curate_enrage',
        name: 'The Deep Answers',
        kind: 'heavy',
        power: 2.7,
        status: { id: 'Frozen', target: 'hero', turns: 1 },
        weight: 25,
        cooldown: 2,
        belowHpPct: 0.5,
      },
    ],
  },
  // Storm Gate — Galewing (Dragon, tier 4, lvl 21)
  Galewing: {
    moves: [
      { id: 'galewing_talons', name: 'Wind-Cut Talons', kind: 'attack', power: 1, weight: 32 },
      { id: 'galewing_dive', name: 'Diving Strike', kind: 'heavy', power: 2.3, weight: 18, cooldown: 2 },
      { id: 'galewing_gale', name: 'Gale Battery', kind: 'multi', power: 0.55, hits: 4, weight: 15, cooldown: 3 },
      {
        id: 'galewing_thunder',
        name: 'Thunderclap',
        kind: 'debuff',
        power: 0,
        status: { id: 'Stunned', target: 'hero', turns: 1 },
        weight: 12,
        cooldown: 4,
      },
      { id: 'galewing_wall', name: 'Storm Wall', kind: 'guard', power: 0, weight: 10, cooldown: 3 },
      { id: 'galewing_riding', name: 'Riding the Squall', kind: 'buff', power: 0, weight: 10, cooldown: 3 },
      {
        id: 'galewing_enrage',
        name: 'Eye of the Storm',
        kind: 'heavy',
        power: 2.9,
        weight: 25,
        cooldown: 2,
        belowHpPct: 0.5,
      },
    ],
  },
  // Abyssal Gate — The Hollow Sovereign (Devil, tier 5, lvl 30). Final boss;
  // deepest kit — two enrage thresholds for a true two-phase fight.
  'The Hollow Sovereign': {
    moves: [
      { id: 'sovereign_claw', name: 'Hollow Claw', kind: 'attack', power: 1, weight: 28 },
      { id: 'sovereign_decree', name: "Sovereign's Decree", kind: 'heavy', power: 2.4, weight: 16, cooldown: 2 },
      { id: 'sovereign_cuts', name: 'Thousand Cuts', kind: 'multi', power: 0.55, hits: 4, weight: 14, cooldown: 3 },
      {
        id: 'sovereign_consume',
        name: 'Consume the Light',
        kind: 'debuff',
        power: 0,
        status: { id: 'Poisoned', target: 'hero', turns: 2 },
        weight: 12,
        cooldown: 3,
      },
      { id: 'sovereign_feast', name: 'Feast of Despair', kind: 'drain', power: 1.3, weight: 12, cooldown: 3 },
      { id: 'sovereign_ward', name: 'Void Ward', kind: 'guard', power: 0, weight: 8, cooldown: 3 },
      {
        id: 'sovereign_enrage1',
        name: 'The Abyss Opens',
        kind: 'heavy',
        power: 2.8,
        status: { id: 'Stunned', target: 'hero', turns: 1 },
        weight: 25,
        cooldown: 2,
        belowHpPct: 0.5,
      },
      {
        id: 'sovereign_enrage2',
        name: 'Last Judgment',
        kind: 'heavy',
        power: 3.2,
        status: { id: 'Frozen', target: 'hero', turns: 1 },
        weight: 30,
        cooldown: 2,
        belowHpPct: 0.25,
        once: true,
      },
    ],
  },
};
