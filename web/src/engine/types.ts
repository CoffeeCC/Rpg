// ---------------------------------------------------------------------------
// Contracts for the whole game. Data files (agent-authored) and systems code
// (main session) both import from here. Changing a shape here is a breaking
// change for everyone - see PLAN.md for the design this encodes.
// ---------------------------------------------------------------------------

// --- Stats ---
export type Stat = 'STR' | 'DEF' | 'DEX' | 'MANA' | 'MAGDEF' | 'INT' | 'LUCK';
export type StatBlock = Record<Stat, number>;

export type RaceName = 'Human' | 'Elf' | 'Dwarf' | 'Orc';
export type ClassName = 'Warrior' | 'Mage' | 'Thief' | 'Bard' | 'Knight';

export type EquipmentSlot = 'weapon' | 'armor' | 'headpiece' | 'gloves' | 'boots' | 'ring' | 'amulet' | 'pendant' | 'charm' | 'trinket';

// --- Elements & status ---
export type Element = 'None' | 'Fire' | 'Ice' | 'Bolt' | 'Dark' | 'Holy';

export type StatusName = 'Burned' | 'Poisoned' | 'Stunned' | 'Frozen';
export interface StatusEffect {
  name: StatusName;
  turns: number;
}

/** A timed buff/debuff on a combatant (positive or negative amount). */
export interface ActiveMod {
  stat: Stat;
  amount: number;
  turns: number;
}

// --- Skills ---
export type SkillKind = 'damage' | 'heal' | 'buff' | 'debuff' | 'drain';
export type SkillTarget = 'enemy' | 'allEnemies' | 'ally' | 'allAllies' | 'self';

export interface SkillDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  element: Element;
  kind: SkillKind;
  target: SkillTarget;
  /** Damage/heal skills: potency. Buff/debuff skills may leave this 0. */
  power: number;
  mpCost: number;
  /** Which stat scales the effect: STR for physical arts, INT for magic. */
  scaling: 'STR' | 'INT';
  statusChance?: number; // 0..1
  status?: StatusName;
  statusTurns?: number;
  /** For kind buff/debuff: which stat is shifted, by how much, for how long. */
  modStat?: Stat;
  modAmount?: number;
  modTurns?: number;
}

/** Hero classes learn skills at levels: sorted ascending by level. */
export type ClassLearnset = { level: number; skillId: string }[];

// --- Monsters ---
export type MonsterFamily =
  | 'Slime'
  | 'Dragon'
  | 'Beast'
  | 'Bird'
  | 'Plant'
  | 'Bug'
  | 'Devil'
  | 'Undead'
  | 'Material';

export interface FamilyInfo {
  emoji: string;
  description: string;
  /** Hero stat trained when defeating this family (EV-style). */
  trainsStat: Stat;
  /** Element -> damage multiplier (0.5 resist, 1.5 weak). Missing = 1. */
  resists: Partial<Record<Element, number>>;
}

export interface SpeciesDef {
  id: string;
  name: string;
  emoji: string;
  family: MonsterFamily;
  /** 1 (early-game) .. 5 (endgame). Gates spawn by family + tier range. */
  tier: 1 | 2 | 3 | 4 | 5;
  baseStats: StatBlock; // at level 1
  growth: StatBlock; // per-level gains (fractional ok; floor() applied at derive)
  baseHp: number;
  hpGrowth: number;
  baseMp: number;
  mpGrowth: number;
  /** 1-3 skill ids, unlocked at levels 1 / 5 / 10 respectively. */
  innateSkills: string[];
  /** Base tame percent before HP/bait/rarity modifiers. Roughly 40 (tier 1) down to 8 (tier 5). */
  tameBase: number;
  description: string;
}

export type MonsterRarity = 'Common' | 'Alpha' | 'Rare';

// --- Breeding ---
/** Species-id pair (order-insensitive) that yields a specific offspring species. */
export interface BreedingPairOverride {
  a: string;
  b: string;
  result: string;
}

// --- Items ---
export type ItemRarity = 'Normal' | 'Magic' | 'Rare' | 'Legendary';
export type ItemTypeName = 'Sword' | 'Staff' | 'Armor' | 'Headpiece' | 'Glove' | 'Boot' | 'Ring' | 'Amulet' | 'Pendant' | 'Charm' | 'Trinket';

/** What an affix can modify: a core stat, resource maxima, or implicit combat values. */
export type AffixTarget = Stat | 'HP' | 'MP' | 'Attack' | 'Magic' | 'Defense';

export interface AffixDef {
  id: string;
  /** Display particle, e.g. "Vicious" (prefix) or "of the Bear" (suffix). */
  name: string;
  type: 'prefix' | 'suffix';
  tier: 1 | 2 | 3; // higher tier = stronger, gated by minIlvl
  minIlvl: number;
  target: AffixTarget;
  min: number;
  max: number;
}

export interface RolledAffix {
  affixId: string;
  name: string;
  type: 'prefix' | 'suffix';
  target: AffixTarget;
  amount: number;
}

export interface UniqueAffix {
  name: string;
  type: 'prefix' | 'suffix';
  target: AffixTarget;
  amount: number;
}

export interface UniqueDef {
  id: string;
  name: string;
  baseType: ItemTypeName;
  minIlvl: number;
  implicitAttack: number;
  implicitMagic: number;
  implicitDefense: number;
  affixes: UniqueAffix[];
  flavor: string;
}

export interface ItemV2 {
  uid: string;
  baseType: ItemTypeName;
  slot: EquipmentSlot;
  material: string;
  ilvl: number;
  rarity: ItemRarity;
  /** Full display name, e.g. "Vicious Iron Sword of the Bear" or "Doom Bite". */
  name: string;
  implicitAttack: number;
  implicitMagic: number;
  implicitDefense: number;
  affixes: RolledAffix[];
  value: number;
  uniqueId?: string;
}

// --- World ---
export type GateId = 'verdant' | 'hollow' | 'sunken' | 'storm' | 'abyss';

export interface SpawnTable {
  families: MonsterFamily[];
  tierMin: number;
  tierMax: number;
  /** Added to player level when rolling enemy levels on this floor. */
  levelBonus: number;
}

/**
 * grid rows are equal-length strings. Legend:
 * '#' wall, '.' floor, 'S' entrance, '>' stairs down, 'B' boss,
 * 'C' chest, 'H' shrine, 'E' fixed event tile.
 * Exactly one 'S' per floor. Non-final floors have '>'; the gate's final
 * floor has 'B' instead.
 */
export interface FloorDef {
  grid: string[];
  spawn: SpawnTable;
}

export interface GateDef {
  id: GateId;
  name: string;
  emoji: string;
  description: string;
  /** Orbs needed before this gate can be entered (0 for the first four, 4 for abyss). */
  requiredOrbs: number;
  floors: FloorDef[];
  bossFamily: MonsterFamily;
  bossTier: number;
  bossName: string;
  bossLevel: number;
}

// --- Random events ---
export type EventOutcome =
  | { kind: 'gold'; amount: number }
  | { kind: 'goldLoss'; amount: number }
  | { kind: 'item'; ilvlBonus: number }
  | { kind: 'heal' }
  | { kind: 'damagePct'; pct: number }
  | { kind: 'fight'; rarity: MonsterRarity }
  | { kind: 'statBoost'; stat: Stat; amount: number }
  | { kind: 'consumable'; name: string; count: number }
  | { kind: 'nothing' };

export interface EventOption {
  label: string;
  resultText: string;
  outcomes: EventOutcome[];
}

export interface EventDef {
  id: string;
  name: string;
  emoji: string;
  text: string;
  options: EventOption[]; // 2-3 options
}

// --- Quests ---
export type QuestObjective =
  | { kind: 'kill'; count: number }
  | { kind: 'killFamily'; family: MonsterFamily; count: number }
  | { kind: 'tame'; count: number }
  | { kind: 'breed'; count: number }
  | { kind: 'reachFloor'; gate: GateId; floor: number }
  | { kind: 'defeatBoss'; gate: GateId };

export interface QuestReward {
  gold: number;
  exp: number;
  item?: { ilvlBonus: number };
  consumables?: { name: string; count: number }[];
}

export interface QuestDef {
  id: string;
  name: string;
  giver: string;
  text: string;
  objective: QuestObjective;
  reward: QuestReward;
}

// --- Story ---
export interface StoryChapter {
  id: number; // 0 = intro, 1-4 = after each orb, 5 = epilogue
  title: string;
  paragraphs: string[];
}

// =========================================================================
// v4: Card combat (see PLAN2.md)
// =========================================================================

export type CardType = 'strike' | 'spell' | 'guard' | 'tactic' | 'summon';
export type CardRarity = 'starter' | 'common' | 'uncommon' | 'rare';
export type CardTarget = 'enemy' | 'allEnemies' | 'randomEnemy' | 'self' | 'none';

/**
 * Scaling sources: STR/INT/DEF read the HERO's stats (+ equipment implicits
 * for damage/block); MSTR/MINT read the SOURCE MONSTER's stats (species cards
 * only — makes leveling/breeding monsters strengthen their cards).
 */
export type CardScaling = 'STR' | 'INT' | 'DEF' | 'MSTR' | 'MINT';

export type CardEffect =
  | { kind: 'damage'; amount: number; scaling?: CardScaling; times?: number; element?: Element }
  | { kind: 'block'; amount: number; scaling?: CardScaling }
  | { kind: 'status'; status: StatusName; turns: number; chance?: number } // to card's target
  | { kind: 'selfStatus'; status: StatusName; turns: number }
  | { kind: 'mod'; stat: Stat; amount: number; turns: number; onSelf: boolean }
  | { kind: 'draw'; count: number }
  | { kind: 'energy'; amount: number }
  | { kind: 'heal'; amount: number; scaling?: CardScaling }
  | { kind: 'drain'; amount: number; scaling?: CardScaling } // damage + heal hero half
  | { kind: 'tame' }; // attempt tame on target (reachOut card)

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  rarity: CardRarity;
  cost: number; // energy, 0-3 (X-costs not supported)
  target: CardTarget;
  /** Souls-flavored rules text; {n} placeholders are NOT used — UI renders computed numbers from effects. */
  text: string;
  flavor?: string;
  emoji: string; // fallback art glyph; card frames come from art layer
  effects: CardEffect[];
  /** Exhaust: removed from play for the rest of the battle after use. */
  exhaust?: boolean;
}

/** A concrete copy of a card in a deck/hand. */
export interface CardInstance {
  uid: string;
  cardId: string;
  /** Set for species cards: the party monster powering this card. */
  sourceMonsterUid?: string;
  /** Smith-upgraded copy: numeric effects ×upgradeMult, statuses last +1 turn. */
  upgraded?: boolean;
}

export type IntentKind = 'attack' | 'defend' | 'buff' | 'debuff' | 'heal' | 'howl';

export interface Intent {
  kind: IntentKind;
  /** Displayed number (damage per hit / heal amount). */
  amount?: number;
  times?: number;
  skillId?: string; // resolved skill behind the intent, if any
  /** v11 kit moves: telegraph name shown to the player ("The Bell Tolls"). */
  label?: string;
  /** v11: the EnemyMove behind this intent, for cooldown/once bookkeeping. */
  moveId?: string;
  /** v11: attack that heals the enemy for half the damage dealt. */
  drain?: boolean;
  /** v11: status the move applies on execution (id must exist in the engine). */
  moveStatus?: { id: string; target: 'self' | 'hero' | 'party'; turns: number };
}

/** Transient visual/audio feedback events emitted by the battle resolver. */
export type FxEvent =
  | { fx: 'slash' | 'pierce' | 'fire' | 'frost' | 'bolt' | 'dark' | 'holy' | 'hit'; targetUid: string; amount?: number; crit?: boolean }
  | { fx: 'block'; targetUid: string; amount: number }
  | { fx: 'heal'; targetUid: string; amount: number }
  | { fx: 'status'; targetUid: string; label: string }
  | { fx: 'ko'; targetUid: string }
  | { fx: 'tameTry'; targetUid: string; success: boolean }
  | { fx: 'shake' };

// =========================================================================
// v4: Generated world & history (DF-style; see PLAN2.md)
// =========================================================================

export interface WorldEra {
  name: string;
  startYear: number;
  endYear: number;
}

export type FigureRole = 'tamer' | 'knight' | 'scholar' | 'monarch' | 'heretic' | 'wanderer';

export interface WorldFigure {
  id: string;
  name: string;
  title: string; // "the Unbowed"
  role: FigureRole;
  bornYear: number;
  diedYear: number | null; // null = fate unknown
  fate: string; // one souls-flavored line
  /** Causal threads: history as a web, not a list. */
  mentorId?: string; // taught by this figure
  rivalId?: string; // opposed this figure (symmetric)
  slainByBeastId?: string; // a famous beast ended them
}

export interface FamousBeast {
  id: string;
  name: string; // proper name, e.g. "Vhorrun"
  epithet: string; // "the Hunger Below"
  speciesId: string;
  gateId: GateId;
  /** Extra levels over a normal spawn; also stat mult applied. */
  might: number;
  legend: string; // one-paragraph legend
  holdsArtifactId?: string;
}

export interface LostArtifact {
  id: string;
  name: string;
  baseType: ItemTypeName;
  description: string; // souls item-description prose
  affixes: UniqueAffix[];
  implicitAttack: number;
  implicitMagic: number;
  implicitDefense: number;
  /** Where it waits: a chest floor, unless a beast holds it. */
  gateId: GateId;
  floorIndex: number;
}

export interface HistoryEvent {
  year: number;
  text: string;
}

export interface GeneratedWorld {
  seed: number;
  name: string; // realm name
  eras: WorldEra[];
  figures: WorldFigure[];
  beasts: FamousBeast[];
  artifacts: LostArtifact[];
  events: HistoryEvent[];
}

/** Player-made history, appended to the Chronicle. */
export interface ChronicleState {
  beastsSlain: string[]; // FamousBeast ids
  artifactsFound: string[]; // LostArtifact ids
  deeds: HistoryEvent[]; // year = years since worldgen end
}

// =========================================================================
// v4: NPCs & lore banks (agent-authored data contracts)
// =========================================================================

export interface NpcDef {
  id: string;
  name: string;
  role: string; // "Innkeeper", "Watch Captain"...
  emoji: string;
  /** Greeting pools by story stage: index = min chapter (0..5), pick highest applicable. */
  greetings: string[][];
  /** Rumor templates; slots: {beast} {beastGate} {artifact} {artifactGate} {figure} {era} {realm}. */
  rumors: string[];
}

export interface LoreBanks {
  realmPrefixes: string[];
  realmSuffixes: string[];
  personNames: string[];
  personTitles: Record<FigureRole, string[]>;
  beastNames: string[];
  beastEpithets: string[];
  eraNames: string[];
  artifactNames: string[]; // full names, e.g. "Thornweep"
  /** Souls-style artifact description templates; slots: {name} {figure} {era} {gate}. */
  artifactDescriptions: string[];
  /** History event templates by kind; slots: {figure} {figure2} {beast} {gate} {artifact} {era} {year}. */
  eventTemplates: {
    born: string[];
    died: string[];
    forged: string[];
    lost: string[];
    beastRose: string[];
    beastSlew: string[];
    expedition: string[];
    calamity: string[];
    wonder: string[];
  };
  beastLegends: string[]; // slots: {beast} {epithet} {gate} {figure}
  figureFates: Record<FigureRole, string[]>;
}
