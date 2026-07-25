// =========================================================================
// THE DRILL RECORD — has this player been taught combat, ever?
//
// Separate from tellings.ts on purpose. That file is the Chronicler's book:
// verses, bindings, the vault, the fallen. This is a single sheet pinned to
// the watch house wall, and it answers exactly one question — "does this
// human already know how a card fight works?" It survives death, restart and
// a fresh telling, because the PLAYER learned combat, not the character.
//
// A returning player on their fifth telling must never be walked through
// vigor again, and a confused player must always be able to walk through it
// again on purpose. Those two requirements are the whole of this module.
//
// Component-side only. The reducer is pure and never reads or writes here.
// =========================================================================

const KEY = 'everdusk.drill.v1';

export interface DrillRecord {
  /** The drill has been completed at least once, by this human, ever. */
  passed: boolean;
  /** The drill was started and walked out of. Used to soften the nudge. */
  attempted: boolean;
  /** How many times it has been run. Shown nowhere; kept for tuning. */
  runs: number;
}

const FRESH: DrillRecord = { passed: false, attempted: false, runs: 0 };

export function loadDrillRecord(): DrillRecord {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...FRESH };
    const parsed = JSON.parse(raw) as Partial<DrillRecord>;
    return {
      passed: parsed.passed === true,
      attempted: parsed.attempted === true,
      runs: typeof parsed.runs === 'number' && parsed.runs >= 0 ? parsed.runs : 0,
    };
  } catch {
    // No localStorage, or a corrupt sheet. Treat as a recruit who has not
    // drilled: offering the lesson to someone who knows it is a far smaller
    // harm than withholding it from someone who does not.
    return { ...FRESH };
  }
}

function save(rec: DrillRecord): DrillRecord {
  try {
    localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {
    // Private-mode browsers. The drill still runs; it just re-offers itself.
  }
  return rec;
}

export function noteDrillStarted(): DrillRecord {
  const rec = loadDrillRecord();
  return save({ ...rec, attempted: true, runs: rec.runs + 1 });
}

export function noteDrillPassed(): DrillRecord {
  return save({ ...loadDrillRecord(), passed: true, attempted: true });
}

/**
 * Is this a first-timer?
 *
 * Deliberately NOT "telling === 1". A player can die on floor one of their
 * first telling three times over and still not know what block is, and a
 * player who passed the drill in telling one does not need it in telling
 * five. What matters is whether the lesson has ever landed, so that is what
 * is stored and that is what is asked.
 */
export function hasDrilled(): boolean {
  return loadDrillRecord().passed;
}
