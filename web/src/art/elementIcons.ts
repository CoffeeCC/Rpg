import type { Element } from '../engine/types';

/** Small glyph for each damage element, used wherever a weakness/resist needs
 * a compact visual (enemy weakness badge, monster sheet) rather than the
 * full word. Matches the palette used by impactFx for the same elements. */
export const ELEMENT_ICON: Record<Exclude<Element, 'None'>, string> = {
  Fire: '🔥',
  Ice: '❄️',
  Bolt: '⚡',
  Dark: '🌑',
  Holy: '✨',
};
