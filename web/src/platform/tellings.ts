/**
 * PLAN5 #49 — The Tellings. Death ends the run; the Chronicler simply turns
 * the page and begins the next telling of the same story. This meta-state
 * lives OUTSIDE GameState (it survives every death) in its own localStorage
 * key. All writes are component-side or idempotent-per-run so the pure
 * reducer stays pure under StrictMode double-invocation.
 */
import { TELLING_EPITAPHS, ordinal } from '../engine/data/tellingsLore';

export interface TellingsMeta {
  telling: number;
  verses: number;
  purchased: string[];
  /** Guard: which run's death has already been banked (StrictMode safety). */
  lastBankedRun: string | null;
  /** Struck-through drafts: every failed telling, kept in the book. */
  fallen: FallenTelling[];
}

export interface FallenTelling {
  telling: number;
  name: string;
  place: string;
  level: number;
  /** Rendered once at bank time so the record never changes retroactively. */
  epitaph: string;
}

export interface ChroniclerBoon {
  id: string;
  name: string;
  cost: number;
  text: string;
}

export const CHRONICLER_BOONS: ChroniclerBoon[] = [
  { id: 'provisioned', name: 'Well-Provisioned', cost: 6, text: 'Every telling begins with 40 more gold. Someone left it for you. They always do.' },
  { id: 'cellar', name: 'The Stocked Cellar', cost: 5, text: 'Two Herbs and a Jerky wait in your pack at every beginning.' },
  { id: 'scars', name: 'Old Scars', cost: 10, text: 'Your body remembers wounds it has not yet taken. +2 STR, +2 DEF at every beginning.' },
  { id: 'oil', name: "The Keeper's Oil", cost: 8, text: 'Your joints move like they were tended. +4 DEX at every beginning.' },
  { id: 'lantern-luck', name: "A Lantern's Favor", cost: 12, text: 'The flame likes you. +4 LUCK at every beginning.' },
];

const KEY = 'everdusk.tellings.v1';

export function loadTellings(): TellingsMeta {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TellingsMeta>;
      return {
        telling: parsed.telling ?? 1,
        verses: parsed.verses ?? 0,
        purchased: Array.isArray(parsed.purchased) ? parsed.purchased : [],
        lastBankedRun: parsed.lastBankedRun ?? null,
        fallen: Array.isArray(parsed.fallen) ? parsed.fallen : [],
      };
    }
  } catch {
    // localStorage unavailable or corrupt — fall through to a fresh book.
  }
  return { telling: 1, verses: 0, purchased: [], lastBankedRun: null, fallen: [] };
}

/** The struck-through drafts, oldest first. */
export function loadFallenTellings(): FallenTelling[] {
  return loadTellings().fallen;
}

function save(meta: TellingsMeta) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    // Nothing to do — the story just won't remember this time.
  }
}

/** Bank verses for a fallen run. Idempotent per runId (StrictMode-safe).
 * When `record` is given, the failed telling is written into the book as a
 * struck-through draft the Chronicle displays forever after. */
export function bankFall(runId: string, verses: number, record?: { name: string; place: string; level: number }): TellingsMeta {
  const meta = loadTellings();
  if (meta.lastBankedRun === runId) return meta;
  meta.verses += verses;
  meta.lastBankedRun = runId;
  if (record) {
    const template = TELLING_EPITAPHS[(meta.telling - 1) % TELLING_EPITAPHS.length];
    meta.fallen.push({
      telling: meta.telling,
      ...record,
      epitaph: template
        .replaceAll('{telling}', ordinal(meta.telling))
        .replaceAll('{name}', record.name)
        .replaceAll('{place}', record.place)
        .replaceAll('{level}', String(record.level)),
    });
  }
  save(meta);
  return meta;
}

/** Turn the page: the next telling begins. Called from the Fallen screen. */
export function nextTelling(): TellingsMeta {
  const meta = loadTellings();
  meta.telling += 1;
  save(meta);
  return meta;
}

/** Spend verses on a permanent boon. Returns updated meta (or null if it failed). */
export function purchaseBoon(boonId: string): TellingsMeta | null {
  const meta = loadTellings();
  const boon = CHRONICLER_BOONS.find((b) => b.id === boonId);
  if (!boon || meta.purchased.includes(boonId) || meta.verses < boon.cost) return null;
  meta.verses -= boon.cost;
  meta.purchased.push(boonId);
  save(meta);
  return meta;
}
