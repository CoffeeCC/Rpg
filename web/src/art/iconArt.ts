/**
 * v8.1: painted icon + sprite manifests. Populated by the Grok total-art run;
 * every consumer falls back to its emoji until the icon exists, so the game
 * ships identically whether or not an asset has landed.
 */
export const ICON_ART: Record<string, string> = {};

export const SPRITE_ART: Record<string, string> = {};

/** Per-gate ground/wall textures for continuous map terrain. */
export const TILE_TEXTURES: Record<string, { ground: string; wall: string }> = {};
