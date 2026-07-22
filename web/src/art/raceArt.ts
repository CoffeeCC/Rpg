import type { RaceName } from '../engine/types';

// v13.3: Grok-painted race archetype portraits (transparent PNG, black keyed
// out) shown in the character-forge Blood rail. Missing entries fall back to
// the letter monogram, so the forge never breaks.
export const RACE_ART: Partial<Record<RaceName, string>> = {
  Human: 'art/races/human.png',
  Elf: 'art/races/elf.png',
  Dwarf: 'art/races/dwarf.png',
  Orc: 'art/races/orc.png',
};
