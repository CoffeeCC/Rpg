import type { ItemV2 } from '../engine/types';

/**
 * Painted gear icons. Ordinary items resolve by type+rarity (a Legendary sword
 * looks grander than a Normal one); uniques get their own bespoke art.
 * AUTO-POPULATED from the Grok gear run + unique run; missing entries just
 * render the text line with no icon, so the game never breaks.
 */
export const GEAR_ART: Record<string, string> = {
 "amulet:legendary": "art/gear/amulet_legendary.png",
 "amulet:magic": "art/gear/amulet_magic.png",
 "amulet:normal": "art/gear/amulet_normal.png",
 "amulet:rare": "art/gear/amulet_rare.png",
 "armor:legendary": "art/gear/armor_legendary.png",
 "armor:magic": "art/gear/armor_magic.png",
 "armor:normal": "art/gear/armor_normal.png",
 "armor:rare": "art/gear/armor_rare.png",
 "boot:legendary": "art/gear/boot_legendary.png",
 "boot:magic": "art/gear/boot_magic.png",
 "boot:normal": "art/gear/boot_normal.png",
 "boot:rare": "art/gear/boot_rare.png",
 "charm:legendary": "art/gear/charm_legendary.png",
 "charm:magic": "art/gear/charm_magic.png",
 "charm:normal": "art/gear/charm_normal.png",
 "charm:rare": "art/gear/charm_rare.png",
 "glove:legendary": "art/gear/glove_legendary.png",
 "glove:magic": "art/gear/glove_magic.png",
 "glove:normal": "art/gear/glove_normal.png",
 "glove:rare": "art/gear/glove_rare.png",
 "headpiece:legendary": "art/gear/headpiece_legendary.png",
 "headpiece:magic": "art/gear/headpiece_magic.png",
 "headpiece:normal": "art/gear/headpiece_normal.png",
 "headpiece:rare": "art/gear/headpiece_rare.png",
 "pendant:legendary": "art/gear/pendant_legendary.png",
 "pendant:magic": "art/gear/pendant_magic.png",
 "pendant:normal": "art/gear/pendant_normal.png",
 "pendant:rare": "art/gear/pendant_rare.png",
 "ring:legendary": "art/gear/ring_legendary.png",
 "ring:magic": "art/gear/ring_magic.png",
 "ring:normal": "art/gear/ring_normal.png",
 "ring:rare": "art/gear/ring_rare.png",
 "staff:legendary": "art/gear/staff_legendary.png",
 "staff:magic": "art/gear/staff_magic.png",
 "staff:normal": "art/gear/staff_normal.png",
 "staff:rare": "art/gear/staff_rare.png",
 "sword:legendary": "art/gear/sword_legendary.png",
 "sword:magic": "art/gear/sword_magic.png",
 "sword:normal": "art/gear/sword_normal.png",
 "sword:rare": "art/gear/sword_rare.png"
};

export const UNIQUE_ART: Record<string, string> = {
 "cinderwake": "art/uniques/cinderwake.png",
 "duskboundVow": "art/uniques/duskboundVow.png",
 "duskfallStriders": "art/uniques/duskfallStriders.png",
 "duskfang": "art/uniques/duskfang.png",
 "duskwardensPlate": "art/uniques/duskwardensPlate.png",
 "hollowBellCharm": "art/uniques/hollowBellCharm.png",
 "lastLanternChime": "art/uniques/lastLanternChime.png",
 "widowsKnot": "art/uniques/widowsKnot.png"
};

/** Resolve the best icon for an item, or null to fall back to text only. */
export function gearImage(item: ItemV2): string | null {
  if (item.uniqueId && UNIQUE_ART[item.uniqueId]) return UNIQUE_ART[item.uniqueId];
  return GEAR_ART[`${item.baseType.toLowerCase()}:${item.rarity.toLowerCase()}`] ?? null;
}
