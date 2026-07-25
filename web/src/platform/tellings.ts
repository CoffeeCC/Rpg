/**
 * PLAN5 #49 — The Tellings. Death ends the run; the Chronicler simply turns
 * the page and begins the next telling of the same story. This meta-state
 * lives OUTSIDE GameState (it survives every death) in its own localStorage
 * key. All writes are component-side or idempotent-per-run so the pure
 * reducer stays pure under StrictMode double-invocation.
 */
import { TELLING_EPITAPHS, TRIUMPH_RECORDS, ordinal } from '../engine/data/tellingsLore';
import { BINDINGS, MAX_DEPTH, type BindingDef } from '../engine/data/bindings';
import { setOfItem } from '../engine/data/sets';
import type { ItemV2 } from '../engine/types';

export interface TellingsMeta {
  telling: number;
  verses: number;
  purchased: string[];
  /** Guard: which run's death has already been banked (StrictMode safety). */
  lastBankedRun: string | null;
  /** Struck-through drafts: every failed telling, kept in the book. */
  fallen: FallenTelling[];
  /**
   * The premise inscribed for the NEXT telling to begin. Read once, at
   * CREATE_CHARACTER, and copied onto GameState — a draft's premise never
   * changes under it mid-telling. null is "An Unbound Telling".
   */
  binding: string | null;
  /** How far down the next telling is read. 0 until the Sovereign has fallen. */
  depth: number;
  /** What the Chronicler has recorded across every telling. Only ever grows. */
  ledger: Ledger;
  /** Tellings that reached the end of the book, kept beside the ones that did not. */
  triumphs: TriumphRecord[];
  /** Grude's back wall. See the block comment above VAULT_SLOT_COSTS. */
  vaultSlots: number;
  vault: VaultEntry[];
  /** Guard: which run's triumph has already refilled the wall (StrictMode safety). */
  lastVaultRun: string | null;
}

/** One plate on the back wall, and the telling that left it there. */
export interface VaultEntry {
  item: ItemV2;
  /** Which telling handed it over. Shown on the wall; never read mechanically. */
  telling: number;
}

export interface FallenTelling {
  telling: number;
  name: string;
  place: string;
  level: number;
  /** Rendered once at bank time so the record never changes retroactively. */
  epitaph: string;
}

/** A telling that reached the Hollow Sovereign and did not stop there. */
export interface TriumphRecord {
  telling: number;
  name: string;
  level: number;
  depth: number;
  /** Rendered once at bank time, same as the epitaphs. */
  line: string;
}

/**
 * The Chronicler's standing record — everything shown to them at the desk,
 * across every draft. Set-union only, so writing it twice costs nothing and
 * a corrupt or absent entry degrades to "you have not shown me that yet".
 */
export interface Ledger {
  /** Distinct species ids ever faced. The long chase: 52 exist. */
  species: string[];
  /** Distinct gate ids whose Warden has ever fallen. */
  wardens: string[];
  /** The deepest Depth ever carried to the Sovereign. */
  deepest: number;
}

const EMPTY_LEDGER: Ledger = { species: [], wardens: [], deepest: 0 };

function coerceLedger(raw: unknown): Ledger {
  const l = (raw ?? {}) as Partial<Ledger>;
  return {
    species: Array.isArray(l.species) ? l.species.filter((s): s is string => typeof s === 'string') : [],
    wardens: Array.isArray(l.wardens) ? l.wardens.filter((s): s is string => typeof s === 'string') : [],
    deepest: typeof l.deepest === 'number' && l.deepest >= 0 ? Math.floor(l.deepest) : 0,
  };
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

// ---------------------------------------------------------------------------
// Grude's back wall — the vault.
//
// "Every piece of steel in this shop remembers a hand that isn't coming back
// for it. I keep them anyway. Somebody should."
//
// The whole balance of this feature is its limits, so they are all here, in one
// place, with the reasoning attached:
//
// THREE SLOTS. A hero wears nine pieces. Three is a third of a loadout — enough
// to begin a telling with an identity, never enough to begin it equipped. It is
// also deliberately one short of a four-piece set threshold, which is what
// stops the wall from solving the sets (see ONE PER SET below).
//
// ESCALATING VERSE COST (8 / 14 / 22). Verses already have a competing sink in
// the Bindings (10-24 each), and the wall must not be the obviously correct
// purchase. The first slot is the cheapest thing at the desk, because a feature
// nobody can afford to try is a feature nobody has; the third is the most
// expensive single purchase in the game bar none, because three slots is the
// point at which the wall starts to feel like an inventory instead of a
// keepsake.
//
// LEGENDARY ONLY. The wall is for things worth keeping, and Grude does not
// store ordinary steel. Mechanically it keeps the wall from becoming a general
// stash of good Rares, keeps the UI to three rows, and keeps the decision
// sharp. World artifacts qualify — which makes a recovered artifact the one
// object in Everdusk that can outlive the history that generated it.
//
// ONE PIECE PER SET. This is the rule that resolves the whole sets-vs-vault
// tension, and it is the reason the feature is worth building. Banking a set
// carries the set; banking one PIECE of a set carries a head start. With this
// rule you can seed a telling with the piece you could never find, and you must
// still earn every other piece in the telling you are actually playing.
// Fictionally it is Grude's own filing system: she keeps one plate for each
// hand that did not come back, and she does not arrange them into a memorial.
//
// A DEPOSIT COSTS YOU THE PIECE, NOW. Handing something to Grude removes it
// from this telling. That is the price, and it is paid in the run you are
// standing in: wear it today, or keep it forever, never both. It also means
// there is no reason to sprint home the moment a Legendary drops — banking it
// early only disarms you sooner.
//
// A WITHDRAWAL EMPTIES THE SLOT. The wall holds; it does not reproduce. Taking
// the Plate down and dying with it means it is gone. This is what keeps the
// loop a roguelike instead of a wardrobe.
//
// YOU MUST BE ABLE TO LIFT IT (level >= ilvl). The single largest balance risk
// here was a banked ilvl-20 Legendary trivialising a level-1 opening. Gating
// the withdrawal on level rather than scaling the item down keeps the item
// honest, injects its power in the mid-game where the run can absorb it, and
// turns the wall into a goal you play toward instead of a head start you are
// handed. It is also the most Grude answer available: come back when you can
// carry it.
// ---------------------------------------------------------------------------

/** Verse cost of each successive slot. Length is the hard cap on the wall. */
export const VAULT_SLOT_COSTS: number[] = [8, 14, 22];
export const MAX_VAULT_SLOTS = VAULT_SLOT_COSTS.length;

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
        // Books written before the Next Draft existed simply have no premise.
        binding: typeof parsed.binding === 'string' ? parsed.binding : null,
        depth: typeof parsed.depth === 'number' ? clampDepth(parsed.depth) : 0,
        ledger: coerceLedger(parsed.ledger),
        triumphs: Array.isArray(parsed.triumphs) ? parsed.triumphs : [],
        // Books written before the wall existed simply have nothing on it.
        vaultSlots: coerceSlots(parsed.vaultSlots),
        vault: coerceVault(parsed.vault),
        lastVaultRun: typeof parsed.lastVaultRun === 'string' ? parsed.lastVaultRun : null,
      };
    }
  } catch {
    // localStorage unavailable or corrupt — fall through to a fresh book.
  }
  return freshBook();
}

function freshBook(): TellingsMeta {
  return {
    telling: 1,
    verses: 0,
    purchased: [],
    lastBankedRun: null,
    fallen: [],
    binding: null,
    depth: 0,
    ledger: { ...EMPTY_LEDGER, species: [], wardens: [] },
    triumphs: [],
    vaultSlots: 0,
    vault: [],
    lastVaultRun: null,
  };
}

function coerceSlots(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(MAX_VAULT_SLOTS, Math.floor(raw)));
}

/**
 * Read the wall back off disk without trusting a byte of it. An entry that has
 * lost its item, or whose item has lost the fields the game reads, is dropped
 * rather than revived half-formed — a plate nobody can identify comes off the
 * wall. The slot it occupied simply becomes free again.
 */
function coerceVault(raw: unknown): VaultEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: VaultEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Partial<VaultEntry>;
    const item = e.item as Partial<ItemV2> | undefined;
    if (!item || typeof item !== 'object') continue;
    if (typeof item.uid !== 'string' || typeof item.name !== 'string') continue;
    if (typeof item.slot !== 'string' || typeof item.baseType !== 'string') continue;
    if (!Array.isArray(item.affixes)) continue;
    out.push({
      item: item as ItemV2,
      telling: typeof e.telling === 'number' && Number.isFinite(e.telling) ? Math.max(1, Math.floor(e.telling)) : 1,
    });
  }
  return out.slice(0, MAX_VAULT_SLOTS);
}

function clampDepth(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_DEPTH, Math.floor(n)));
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

/**
 * Bank a telling that reached the end of the book. Idempotent per runId, on
 * the same guard as bankFall — a run ends once, one way or the other.
 *
 * This also turns the page. The Fallen screen does that itself for a death;
 * the Victory screen never did, so a triumph used to leave the telling number
 * frozen and the whole run unbanked. Doing it here fixes that without needing
 * to touch a screen this system does not own.
 */
export function bankTriumph(
  runId: string,
  verses: number,
  record: { name: string; level: number; depth: number },
): TellingsMeta {
  const meta = loadTellings();
  if (meta.lastBankedRun === runId) return meta;
  meta.verses += verses;
  meta.lastBankedRun = runId;
  const template = TRIUMPH_RECORDS[(meta.triumphs.length + meta.telling) % TRIUMPH_RECORDS.length];
  meta.triumphs.push({
    telling: meta.telling,
    name: record.name,
    level: record.level,
    depth: record.depth,
    line: template
      .replaceAll('{telling}', ordinal(meta.telling))
      .replaceAll('{name}', record.name)
      .replaceAll('{level}', String(record.level)),
  });
  meta.ledger.deepest = Math.max(meta.ledger.deepest, clampDepth(record.depth));
  meta.telling += 1;
  save(meta);
  return meta;
}

/**
 * Fold what a telling has shown the Chronicler into the standing record.
 * Pure set-union, so this is safe to call from a component effect on every
 * visit to the desk as well as at run end — writing it twice changes nothing.
 * Returns the updated meta, or the unchanged meta if there was nothing new.
 */
export function recordLedger(entries: { species?: string[]; wardens?: string[] }): TellingsMeta {
  const meta = loadTellings();
  let changed = false;
  for (const id of entries.species ?? []) {
    if (id && !meta.ledger.species.includes(id)) {
      meta.ledger.species.push(id);
      changed = true;
    }
  }
  for (const id of entries.wardens ?? []) {
    if (id && !meta.ledger.wardens.includes(id)) {
      meta.ledger.wardens.push(id);
      changed = true;
    }
  }
  if (!changed) return meta;
  save(meta);
  return meta;
}

/** Has this book ever reached the end? Gates the Depths. */
export function hasTriumphed(meta: TellingsMeta): boolean {
  return meta.triumphs.length > 0;
}

/**
 * The deepest Depth the desk will currently offer: one below the surface to
 * begin with, and one further for every Depth actually carried to the end.
 * You cannot skip a reading.
 */
export function offeredDepth(meta: TellingsMeta): number {
  if (!hasTriumphed(meta)) return 0;
  return clampDepth(meta.ledger.deepest + 1);
}

/**
 * Whether the standing record satisfies a Binding's requirement. This is the
 * FIRST of two gates: the Chronicler will not write a premise they have no
 * evidence for. The second gate is having paid for it — see `bindingWritten`.
 */
export function bindingUnlocked(binding: BindingDef, meta: TellingsMeta): boolean {
  const r = binding.requires;
  if (r.species !== undefined && meta.ledger.species.length < r.species) return false;
  if (r.wardens !== undefined && meta.ledger.wardens.length < r.wardens) return false;
  if (r.telling !== undefined && meta.telling < r.telling) return false;
  return true;
}

/** Whether a Binding has been paid for and is therefore selectable. */
export function bindingWritten(binding: BindingDef, meta: TellingsMeta): boolean {
  return meta.purchased.includes(binding.id);
}

/** Every Binding the desk will currently let you select. */
export function availableBindings(meta: TellingsMeta): BindingDef[] {
  return BINDINGS.filter((b) => bindingWritten(b, meta));
}

/** Pay the verses to write a premise into the book, once and for all. */
export function inscribeBinding(bindingId: string): TellingsMeta | null {
  const meta = loadTellings();
  const binding = BINDINGS.find((b) => b.id === bindingId);
  if (!binding) return null;
  if (bindingWritten(binding, meta)) return null;
  if (!bindingUnlocked(binding, meta)) return null;
  if (meta.verses < binding.cost) return null;
  meta.verses -= binding.cost;
  meta.purchased.push(binding.id);
  // Writing a premise also selects it — nobody pays for a premise to not use it.
  meta.binding = binding.id;
  save(meta);
  return meta;
}

/** Choose (or strike out, with null) the premise of the next telling. */
export function setBinding(bindingId: string | null): TellingsMeta {
  const meta = loadTellings();
  if (bindingId === null) {
    meta.binding = null;
  } else {
    const binding = BINDINGS.find((b) => b.id === bindingId);
    if (!binding || !bindingWritten(binding, meta)) return meta;
    meta.binding = bindingId;
  }
  save(meta);
  return meta;
}

/** Set how far down the next telling is read. Clamped to what has been earned. */
export function setDepth(depth: number): TellingsMeta {
  const meta = loadTellings();
  const wanted = clampDepth(depth);
  if (wanted > offeredDepth(meta)) return meta;
  meta.depth = wanted;
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

// ---------------------------------------------------------------------------
// The back wall
// ---------------------------------------------------------------------------

/** Verses for the next slot, or null when the wall is as wide as it gets. */
export function nextVaultSlotCost(meta: TellingsMeta): number | null {
  if (meta.vaultSlots >= MAX_VAULT_SLOTS) return null;
  return VAULT_SLOT_COSTS[meta.vaultSlots];
}

/** Pay Grude for another place on the wall. Returns null if it could not happen. */
export function buyVaultSlot(): TellingsMeta | null {
  const meta = loadTellings();
  const cost = nextVaultSlotCost(meta);
  if (cost === null || meta.verses < cost) return null;
  meta.verses -= cost;
  meta.vaultSlots += 1;
  save(meta);
  return meta;
}

/**
 * Why this item cannot go on the wall, phrased as Grude would phrase it, or
 * null if it can. Every caller shows this string rather than greying a button
 * out and leaving the player to guess — a refusal that does not say why is a
 * bug report waiting to happen.
 */
export function vaultRejection(meta: TellingsMeta, item: ItemV2): string | null {
  if (meta.vaultSlots <= 0) return 'There is no place on the wall for it yet. Ask the Chronicler to make one.';
  if (item.rarity !== 'Legendary') return 'That is ordinary steel. It will not be missed, and I do not keep what will not be missed.';
  if (meta.vault.some((e) => e.item.uid === item.uid)) return 'That one is already up there.';
  if (meta.vault.length >= meta.vaultSlots) return 'The wall is full. Something has to come down before anything goes up.';
  const set = setOfItem(item);
  if (set) {
    const clash = meta.vault.find((e) => setOfItem(e.item)?.id === set.id);
    if (clash) {
      return `I keep one plate for each hand, not a matching suit. ${clash.item.name} is already up there, and it is from the same kit.`;
    }
  }
  return null;
}

/** Whether the hero is strong enough to take a given plate down. */
export function canLift(item: ItemV2, level: number): boolean {
  return level >= item.ilvl;
}

/**
 * Hand a piece to Grude. Idempotent by uid: depositing something already on the
 * wall changes nothing and reports success, so a doubled call cannot duplicate
 * a plate.
 */
export function depositToVault(item: ItemV2): TellingsMeta | null {
  const meta = loadTellings();
  if (meta.vault.some((e) => e.item.uid === item.uid)) return meta;
  if (vaultRejection(meta, item) !== null) return null;
  meta.vault.push({ item, telling: meta.telling });
  save(meta);
  return meta;
}

/**
 * Take a piece back down. Returns the item alongside the updated book so the
 * caller can hand it to the hero; null if that uid is not on the wall.
 *
 * NOT idempotent, and cannot be — the wall gives a thing up exactly once. This
 * is why every call site is an event handler rather than the reducer: React
 * double-invokes reducers under StrictMode, and a doubled withdrawal would take
 * the plate off the wall on the first pass and lose it on the second.
 */
export function withdrawFromVault(uid: string): { meta: TellingsMeta; item: ItemV2 } | null {
  const meta = loadTellings();
  const idx = meta.vault.findIndex((e) => e.item.uid === uid);
  if (idx === -1) return null;
  const [entry] = meta.vault.splice(idx, 1);
  save(meta);
  return { meta, item: entry.item };
}

/**
 * A telling that reached the end of the book leaves what it was carrying.
 *
 * This is the second, automatic deposit channel, and the incentive it creates
 * is the opposite of the manual one: a manual deposit costs you the piece for
 * the rest of the run, so it is a sacrifice, while this costs nothing at all
 * because the run is over. Winning refills the wall. Dying does not — the dark
 * keeps what it is owed, and that asymmetry is most of what makes a triumph
 * worth chasing twice.
 *
 * Idempotent per runId on the same guard `bankTriumph` uses: a run ends once.
 * Best pieces first, and the one-per-set rule still applies, so a victorious
 * hero in a full four-piece set leaves exactly one plate of it behind.
 */
export function vaultKeepOnTriumph(runId: string, carried: ItemV2[]): TellingsMeta {
  const meta = loadTellings();
  if (meta.lastVaultRun === runId) return meta;
  meta.lastVaultRun = runId;
  const candidates = carried
    .filter((i) => i.rarity === 'Legendary')
    .sort((a, b) => b.ilvl - a.ilvl || b.value - a.value);
  for (const item of candidates) {
    if (meta.vault.length >= meta.vaultSlots) break;
    if (vaultRejection(meta, item) !== null) continue;
    meta.vault.push({ item, telling: meta.telling });
  }
  save(meta);
  return meta;
}
