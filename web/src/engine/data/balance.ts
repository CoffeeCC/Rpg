// ---------------------------------------------------------------------------
// Every tunable knob in one place. The balance agent owns THIS FILE ONLY —
// systems code imports from here and must not hardcode gameplay numbers.
// Ranges in comments are the sanctioned tuning bounds; staying inside them
// keeps the tests and the design intent honest.
// ---------------------------------------------------------------------------

export const BALANCE = {
  // --- Battle economy ---
  baseEnergy: 3, // 2-4
  manaPerEnergy: 12, // MANA stat per bonus energy, 8-20
  handSize: 5, // 4-6
  maxHand: 10,

  // --- Exploration ---
  encounterChance: 20, // % per step, 12-30
  eventChance: 5, // % per step, 3-10
  artifactChestChance: 35, // % per chest on the right floor, 20-60
  lanternRadius: 4, // BFS tiles from the hero the Lantern lights, 3-6

  // --- Wild spawns ---
  rareSpawnPct: 5, // 1-6
  alphaSpawnPct: 17, // 6-18 (rolled after rare)
  packOf2Pct: 42, // % chance of a second enemy, 20-60
  packOf3Pct: 13, // % chance of a third, 5-20
  wildLevelJitter: 5, // randInt(this) added to level, 2-5

  // --- Monster rarity multipliers ---
  rarityStatMult: { Common: 1, Alpha: 1.6, Rare: 2.4 }, // Alpha 1.2-1.6, Rare 1.6-2.4
  rarityExpMult: { Common: 1, Alpha: 1.5, Rare: 2.5 },
  rarityTameMult: { Common: 1, Alpha: 0.6, Rare: 0.35 },

  // --- Enemy intents ---
  intentSkillPowerMult: 2.2, // 1.2-2.2
  intentSkillStatMult: 1.2, // 0.5-1.2
  intentBasicMult: 1.6, // 0.9-1.6
  intentDoubleMult: 0.75, // per-hit mult on double swings
  intentDefMitigation: 0.3, // hero defense factor subtracted, 0.3-0.8
  doubleSwingPct: 30, // 10-30
  defendIntentPct: 8, // 8-20
  debuffIntentPct: 6, // rolled after defend, 6-18
  skillIntentPct: 70, // 40-70
  monsterHitSplit: 30, // % of attacks aimed at party monsters, 20-40
  monsterDefFactor: 0.2, // party-monster defense factor vs intents

  // --- Hero card scaling ---
  scalingDivisor: 2, // stat/this added to card amounts, 2-3
  critBase: 5, // %
  critLuckDiv: 3,
  upgradeMult: 1.5, // smith upgrade effect multiplier, 1.3-1.8

  // --- Taming ---
  tameMissingHpBonus: 30, // 30-60
  tameMin: 2,
  tameMax: 90,

  // --- Statuses (fraction of max HP per tick) ---
  burnPct: 0.06,
  poisonPct: 0.08,
  frozenTakenMult: 1.25,

  // --- Spoils & defeat ---
  dropChanceCommon: 10, // % (PLAN3: gear is scarce)
  dropChanceAlpha: 35, // %
  defeatGoldLossPct: 35, // 30-60
  maxDropsPerBattle: 1, // PLAN3: best-rarity single drop
  gearStockSize: 4, // shop slots, 3-6
  enemyExpBase: 8,
  enemyExpPerLevel: 4,

  // --- Hero leveling (PLAN3: slow, purposeful) ---
  heroExpBase: 30, // expToNext = floor(base * level^exponent)
  heroExpExponent: 1.6,
  attributePointsPerLevel: 3,

  // --- Smith ---
  upgradeCosts: { starter: 75, common: 75, uncommon: 125, rare: 200 } as Record<string, number>,
} as const;
