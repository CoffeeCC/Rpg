/**
 * v8.1: painted icon + sprite manifests (AUTO-GENERATED from the Grok
 * total-art run). Consumers fall back to emoji when an entry is missing.
 */
export const ICON_ART: Record<string, string> = {
  barrel: 'art/icons/barrel.png',
  breeding: 'art/icons/breeding.png',
  character: 'art/icons/character.png',
  chest: 'art/icons/chest.png',
  chronicle: 'art/icons/chronicle.png',
  deck: 'art/icons/deck.png',
  door: 'art/icons/door.png',
  equipment: 'art/icons/equipment.png',
  event: 'art/icons/event.png',
  gates: 'art/icons/gates.png',
  gearshop: 'art/icons/gearshop.png',
  gold: 'art/icons/gold.png',
  herb: 'art/icons/herb.png',
  itemshop: 'art/icons/itemshop.png',
  quests: 'art/icons/quests.png',
  rest: 'art/icons/rest.png',
  save: 'art/icons/save.png',
  secret: 'art/icons/secret.png',
  shrine: 'art/icons/shrine.png',
  smith: 'art/icons/smith.png',
  stable: 'art/icons/stable.png',
  stairs: 'art/icons/stairs.png',
  tavern: 'art/icons/tavern.png',
  vigor: 'art/icons/vigor.png',
  ward: 'art/icons/ward.png',
  waterpool: 'art/icons/waterpool.png',
  debris: 'art/icons/debris.png',
  archway: 'art/icons/archway.png',
};

export const SPRITE_ART: Record<string, string> = {
  merchant: 'art/sprites/merchant.png',
  player: 'art/sprites/player.png',
  tamer: 'art/sprites/tamer.png',
};

/** Per-gate ground/wall textures for continuous map terrain. */
export const TILE_TEXTURES: Record<string, { ground: string; wall: string }> = {
  verdant: { ground: 'art/tiles/verdant_ground.jpg', wall: 'art/tiles/verdant_wall.jpg' },
  hollow: { ground: 'art/tiles/hollow_ground.jpg', wall: 'art/tiles/hollow_wall.jpg' },
  sunken: { ground: 'art/tiles/sunken_ground.jpg', wall: 'art/tiles/sunken_wall.jpg' },
  storm: { ground: 'art/tiles/storm_ground.jpg', wall: 'art/tiles/storm_wall.jpg' },
  abyss: { ground: 'art/tiles/abyss_ground.jpg', wall: 'art/tiles/abyss_wall.jpg' },
};
