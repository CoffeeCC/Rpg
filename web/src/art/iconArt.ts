/**
 * v8.1: painted icon + sprite manifests (AUTO-GENERATED from the Grok
 * total-art run). Consumers fall back to emoji when an entry is missing.
 */
export const ICON_ART: Record<string, string> = {
  barrel: '/art/icons/barrel.jpg',
  breeding: '/art/icons/breeding.jpg',
  character: '/art/icons/character.jpg',
  chest: '/art/icons/chest.jpg',
  chronicle: '/art/icons/chronicle.jpg',
  deck: '/art/icons/deck.jpg',
  door: '/art/icons/door.jpg',
  equipment: '/art/icons/equipment.jpg',
  event: '/art/icons/event.jpg',
  gates: '/art/icons/gates.jpg',
  gearshop: '/art/icons/gearshop.jpg',
  gold: '/art/icons/gold.jpg',
  herb: '/art/icons/herb.jpg',
  itemshop: '/art/icons/itemshop.jpg',
  quests: '/art/icons/quests.jpg',
  rest: '/art/icons/rest.jpg',
  save: '/art/icons/save.jpg',
  secret: '/art/icons/secret.jpg',
  shrine: '/art/icons/shrine.jpg',
  smith: '/art/icons/smith.jpg',
  stable: '/art/icons/stable.jpg',
  stairs: '/art/icons/stairs.jpg',
  tavern: '/art/icons/tavern.jpg',
  vigor: '/art/icons/vigor.jpg',
  ward: '/art/icons/ward.jpg',
};

export const SPRITE_ART: Record<string, string> = {
  merchant: '/art/sprites/merchant.jpg',
  player: '/art/sprites/player.jpg',
  tamer: '/art/sprites/tamer.jpg',
};

/** Per-gate ground/wall textures for continuous map terrain. */
export const TILE_TEXTURES: Record<string, { ground: string; wall: string }> = {
  verdant: { ground: '/art/tiles/verdant_ground.jpg', wall: '/art/tiles/verdant_wall.jpg' },
  hollow: { ground: '/art/tiles/hollow_ground.jpg', wall: '/art/tiles/hollow_wall.jpg' },
  sunken: { ground: '/art/tiles/sunken_ground.jpg', wall: '/art/tiles/sunken_wall.jpg' },
  storm: { ground: '/art/tiles/storm_ground.jpg', wall: '/art/tiles/storm_wall.jpg' },
  abyss: { ground: '/art/tiles/abyss_ground.jpg', wall: '/art/tiles/abyss_wall.jpg' },
};
