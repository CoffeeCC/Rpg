import { randInt } from '../random';

// Personal names bestowed on tamed monsters and hatchlings — every companion
// is an individual now that death is forever (PLAN3.md).

const ONSETS = ['Br', 'Gr', 'Th', 'K', 'M', 'V', 'Sk', 'D', 'R', 'H', 'Yl', 'Osk', 'F', 'N', 'W', 'Ash', 'Um', 'B', 'T', 'Gl'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'au', 'ei', 'y', 'ou'];
const MIDDLES = ['dr', 'g', 'll', 'm', 'nn', 'r', 'sh', 'th', 'v', 'lk', 'mb', 'rr', 'st'];
const ENDINGS = ['a', 'ash', 'en', 'ik', 'is', 'o', 'og', 'orn', 'u', 'um', 'yx', 'ette', 'il', 'ar'];

/** e.g. "Brenna", "Skauvorn", "Thymbik", "Ashellu". */
export function bestowName(): string {
  const syllables = 2 + (randInt(100) < 35 ? 1 : 0);
  let name = ONSETS[randInt(ONSETS.length)] + VOWELS[randInt(VOWELS.length)];
  for (let i = 1; i < syllables; i++) {
    name += MIDDLES[randInt(MIDDLES.length)] + VOWELS[randInt(VOWELS.length)];
  }
  name += ENDINGS[randInt(ENDINGS.length)];
  // Collapse awkward doubled vowels at the seam and cap length.
  name = name.replace(/([aeiouy])\1+/g, '$1');
  if (name.length > 11) name = name.slice(0, 11);
  return name[0].toUpperCase() + name.slice(1);
}
