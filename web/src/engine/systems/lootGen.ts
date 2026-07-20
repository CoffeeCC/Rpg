import type { AffixDef, ItemRarity, ItemTypeName, ItemV2, RolledAffix } from '../types';
import { AFFIXES, RARE_NAME_PREFIXES, RARE_NAME_SUFFIXES } from '../data/affixes';
import { UNIQUES } from '../data/uniques';
import { ITEM_TYPES, MATERIALS } from '../data/items';
import { freshUid } from '../entities/MonsterInstance';
import { randInt } from '../random';

const RARITY_VALUE_MULT: Record<ItemRarity, number> = { Normal: 1, Magic: 1.6, Rare: 2.8, Legendary: 5 };

function rollBetween(min: number, max: number): number {
  return min + randInt(max - min + 1);
}

/**
 * Rarity roll. `bias` bumps quality: 0 normal drops, 1 alpha monsters,
 * 2 rare monsters/bosses, 3 boss chests. Luck shaves the roll slightly.
 */
export function rollRarity(luck = 0, bias = 0): ItemRarity {
  const roll = randInt(100) - Math.floor(luck / 4) - bias * 10;
  if (roll < 2) return 'Legendary';
  if (roll < 13) return 'Rare';
  if (roll < 43) return 'Magic';
  return 'Normal';
}

function materialForIlvl(baseType: ItemTypeName, ilvl: number): string {
  const list = ITEM_TYPES[baseType].materials;
  const idx = Math.min(list.length - 1, Math.floor(ilvl / 3) + randInt(2));
  return list[idx];
}

function rollAffixes(ilvl: number, count: number): RolledAffix[] {
  const eligible = AFFIXES.filter((a) => a.minIlvl <= ilvl);
  const rolled: RolledAffix[] = [];
  const usedIds = new Set<string>();
  let prefixes = 0;
  let suffixes = 0;
  let guard = 0;
  while (rolled.length < count && guard++ < 60) {
    const pick: AffixDef = eligible[randInt(eligible.length)];
    if (usedIds.has(pick.id)) continue;
    if (pick.type === 'prefix' && prefixes >= 2) continue;
    if (pick.type === 'suffix' && suffixes >= 2) continue;
    usedIds.add(pick.id);
    if (pick.type === 'prefix') prefixes++;
    else suffixes++;
    rolled.push({
      affixId: pick.id,
      name: pick.name,
      type: pick.type,
      target: pick.target,
      amount: rollBetween(pick.min, pick.max),
    });
  }
  return rolled;
}

function buildName(baseName: string, rarity: ItemRarity, affixes: RolledAffix[]): string {
  if (rarity === 'Normal') return baseName;
  if (rarity === 'Magic') {
    const prefix = affixes.find((a) => a.type === 'prefix');
    const suffix = affixes.find((a) => a.type === 'suffix');
    return `${prefix ? prefix.name + ' ' : ''}${baseName}${suffix ? ' ' + suffix.name : ''}`.trim();
  }
  // Rare: generated two-part name, D2-style.
  return `${RARE_NAME_PREFIXES[randInt(RARE_NAME_PREFIXES.length)]} ${RARE_NAME_SUFFIXES[randInt(RARE_NAME_SUFFIXES.length)]}`;
}

function computeValue(baseType: ItemTypeName, material: string, ilvl: number, rarity: ItemRarity, affixCount: number): number {
  const base = ITEM_TYPES[baseType].baseValue * (MATERIALS[material]?.valueMult ?? 1);
  return Math.max(1, Math.round(base * (1 + 0.4 * affixCount) * RARITY_VALUE_MULT[rarity] * (1 + ilvl * 0.06)));
}

function buildLegendary(ilvl: number): ItemV2 | null {
  const eligible = UNIQUES.filter((u) => u.minIlvl <= ilvl + 2);
  if (eligible.length === 0) return null;
  const def = eligible[randInt(eligible.length)];
  const typeInfo = ITEM_TYPES[def.baseType];
  const material = typeInfo.materials[Math.min(typeInfo.materials.length - 1, Math.floor(def.minIlvl / 3) + 1)];
  return {
    uid: freshUid('item'),
    baseType: def.baseType,
    slot: typeInfo.slot,
    material,
    ilvl: Math.max(ilvl, def.minIlvl),
    rarity: 'Legendary',
    name: def.name,
    implicitAttack: def.implicitAttack,
    implicitMagic: def.implicitMagic,
    implicitDefense: def.implicitDefense,
    affixes: def.affixes.map((a) => ({ affixId: `unique:${def.id}`, name: a.name, type: a.type, target: a.target, amount: a.amount })),
    value: computeValue(def.baseType, material, def.minIlvl, 'Legendary', def.affixes.length),
    uniqueId: def.id,
  };
}

/** Generate one item. ilvl drives material, implicits, and affix tiers. */
export function generateItem(ilvl: number, luck = 0, bias = 0): ItemV2 {
  const level = Math.max(1, ilvl);
  const rarity = rollRarity(luck, bias);

  if (rarity === 'Legendary') {
    const unique = buildLegendary(level);
    if (unique) return unique;
    // No unique available this low - fall through as Rare.
  }
  const effectiveRarity: ItemRarity = rarity === 'Legendary' ? 'Rare' : rarity;

  const typeNames = Object.keys(ITEM_TYPES) as ItemTypeName[];
  const baseType = typeNames[randInt(typeNames.length)];
  const typeInfo = ITEM_TYPES[baseType];
  const material = materialForIlvl(baseType, level);

  const affixCount = effectiveRarity === 'Normal' ? 0 : effectiveRarity === 'Magic' ? 1 + randInt(2) : 3 + randInt(2);
  const affixes = rollAffixes(level, affixCount);

  const implicit = typeInfo.primaryStat === null ? 0 : Math.max(1, 2 + Math.floor(level / 2) + randInt(3));
  const baseName = `${material} ${baseType}`;

  return {
    uid: freshUid('item'),
    baseType,
    slot: typeInfo.slot,
    material,
    ilvl: level,
    rarity: effectiveRarity,
    name: buildName(baseName, effectiveRarity, affixes),
    implicitAttack: typeInfo.primaryStat === 'Attack' ? implicit : 0,
    implicitMagic: typeInfo.primaryStat === 'Magic' ? implicit : 0,
    implicitDefense: typeInfo.primaryStat === 'Defense' ? implicit : 0,
    affixes,
    value: computeValue(baseType, material, level, effectiveRarity, affixes.length),
  };
}

/** Deterministic starter gear: a plain Normal item of the given base type. */
export function makeStartingItem(baseType: ItemTypeName): ItemV2 {
  const typeInfo = ITEM_TYPES[baseType];
  const material = typeInfo.materials[1] ?? typeInfo.materials[0];
  return {
    uid: freshUid('item'),
    baseType,
    slot: typeInfo.slot,
    material,
    ilvl: 1,
    rarity: 'Normal',
    name: `${material} ${baseType}`,
    implicitAttack: typeInfo.primaryStat === 'Attack' ? 3 : 0,
    implicitMagic: typeInfo.primaryStat === 'Magic' ? 3 : 0,
    implicitDefense: typeInfo.primaryStat === 'Defense' ? 2 : 0,
    affixes: [],
    value: 5,
  };
}

export function describeItem(item: ItemV2): string {
  const parts: string[] = [`${item.name} (${item.rarity} ${item.baseType}, ilvl ${item.ilvl}, ${item.value}g)`];
  if (item.implicitAttack) parts.push(`Attack +${item.implicitAttack}`);
  if (item.implicitMagic) parts.push(`Magic +${item.implicitMagic}`);
  if (item.implicitDefense) parts.push(`Defense +${item.implicitDefense}`);
  for (const affix of item.affixes) parts.push(`${affix.target} +${affix.amount}`);
  return parts.join(', ');
}
