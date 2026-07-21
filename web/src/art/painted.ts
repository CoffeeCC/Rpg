import type { GateId } from '../engine/types';

/**
 * Painted (AI-generated, human-curated) backdrop art served from /public/art.
 * When a painted backdrop exists it replaces the procedural SVG scene;
 * missing entries fall back to the SVG so the game never shows a hole.
 */
export const PAINTED_BACKDROPS: Partial<Record<GateId, string>> = {
  verdant: 'art/backdrop_verdant.jpg',
  hollow: 'art/backdrop_hollow.jpg',
  sunken: 'art/backdrop_sunken.jpg',
  storm: 'art/backdrop_storm.jpg',
  abyss: 'art/backdrop_abyss.jpg',
};

/** The town square at permanent dusk — the Last Lantern. */
export const PAINTED_TOWN = 'art/keyart_lantern.jpg';
