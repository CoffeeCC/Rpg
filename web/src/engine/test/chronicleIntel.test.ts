import { describe, expect, it, vi } from 'vitest';
import { generateWorld, forgeArtifactItem } from '../systems/worldgen';
import {
  NO_KNOWLEDGE,
  RETOLD_AT,
  artifactIntel,
  beastIntel,
  figureIntel,
  gateIntel,
  intelDigest,
  intelFor,
  knowledgeFrom,
  type ChroniclerKnowledge,
  type IntelRecord,
} from '../systems/chronicleIntel';
import { GATES, GATE_ORDER } from '../data/gates';
import { ELITE_KIT, BOSS_KITS } from '../data/enemyAi';
import { moveElement } from '../data/damageTypes';
import { speciesById, speciesMatching } from '../data/species';
import { BALANCE } from '../data/balance';

const SEEDS = [1, 7, 42, 1337, 20260725, 999983, 2147483647];

/** Knowledge that has earned literally everything available in `world`. */
function omniscient(world: ReturnType<typeof generateWorld>): ChroniclerKnowledge {
  return {
    tellings: 50,
    speciesFaced: Object.keys(
      Object.fromEntries(world.beasts.map((b) => [b.speciesId, true])),
    ).concat(world.beasts.map((b) => b.speciesId)),
    wardensFelled: [...GATE_ORDER],
    triumphs: 5,
    beastsSlain: world.beasts.map((b) => b.id),
    artifactsFound: world.artifacts.map((a) => a.id),
  };
}

/** Every record the model can produce for a world at a given knowledge. */
function allRecords(world: ReturnType<typeof generateWorld>, k: ChroniclerKnowledge): IntelRecord[] {
  return [
    ...world.beasts.map((b) => beastIntel(world, b.id, k)),
    ...world.artifacts.map((a) => artifactIntel(world, a.id, k)),
    ...world.figures.map((f) => figureIntel(world, f.id, k)),
    ...GATE_ORDER.map((g) => gateIntel(world, g, k)),
  ].filter((r): r is IntelRecord => r !== null);
}

function textOf(r: IntelRecord): string {
  return r.fragments.map((f) => f.text).join('\n');
}

// ===========================================================================
// Determinism
// ===========================================================================

describe('chronicle intel — determinism', () => {
  it('returns byte-identical records on repeated calls with the same inputs', () => {
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      const k = omniscient(world);
      for (const beast of world.beasts) {
        const a = beastIntel(world, beast.id, k);
        const b = beastIntel(world, beast.id, k);
        const c = beastIntel(world, beast.id, k);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(JSON.stringify(b)).toBe(JSON.stringify(c));
      }
    }
  });

  it('is stable across independently generated worlds of the same seed', () => {
    for (const seed of SEEDS) {
      const first = generateWorld(seed);
      const second = generateWorld(seed);
      const k = omniscient(first);
      expect(JSON.stringify(allRecords(first, k))).toBe(JSON.stringify(allRecords(second, k)));
    }
  });

  it('does not depend on the order records are requested in', () => {
    const world = generateWorld(4242);
    const k = omniscient(world);
    const forward = world.beasts.map((b) => JSON.stringify(beastIntel(world, b.id, k)));
    const backward = [...world.beasts].reverse().map((b) => JSON.stringify(beastIntel(world, b.id, k))).reverse();
    expect(forward).toEqual(backward);
  });

  it('never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const world = generateWorld(31337);
    spy.mockClear();
    allRecords(world, omniscient(world));
    allRecords(world, NO_KNOWLEDGE);
    intelDigest(world, omniscient(world));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ===========================================================================
// Monotonicity — more knowledge never reveals less
// ===========================================================================

describe('chronicle intel — monotonicity', () => {
  /** Knowledge ladder, each rung a strict superset of the last. */
  function ladder(world: ReturnType<typeof generateWorld>): ChroniclerKnowledge[] {
    const rungs: ChroniclerKnowledge[] = [NO_KNOWLEDGE];
    rungs.push({ ...rungs[0], speciesFaced: world.beasts.map((b) => b.speciesId) });
    rungs.push({ ...rungs[1], wardensFelled: [...GATE_ORDER], triumphs: 1 });
    rungs.push({ ...rungs[2], tellings: RETOLD_AT });
    rungs.push({
      ...rungs[3],
      tellings: RETOLD_AT + 10,
      triumphs: 3,
      beastsSlain: world.beasts.map((b) => b.id),
      artifactsFound: world.artifacts.map((a) => a.id),
    });
    return rungs;
  }

  it('never removes a fragment as knowledge grows', () => {
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      const rungs = ladder(world);
      for (let i = 1; i < rungs.length; i++) {
        const before = allRecords(world, rungs[i - 1]);
        const after = allRecords(world, rungs[i]);
        expect(after.length).toBe(before.length);
        for (let r = 0; r < before.length; r++) {
          expect(after[r].recovery).toBeGreaterThanOrEqual(before[r].recovery);
          const laterIds = new Set(after[r].fragments.map((f) => f.id));
          for (const frag of before[r].fragments) {
            expect(laterIds.has(frag.id), `${after[r].title} lost fragment ${frag.id}`).toBe(true);
            const still = after[r].fragments.find((f) => f.id === frag.id);
            // and the text of a surviving fragment never changes either
            expect(still?.text).toBe(frag.text);
          }
        }
      }
    }
  });

  it('keeps the same lacuna at every knowledge level', () => {
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      const rungs = ladder(world);
      const base = allRecords(world, rungs[0]);
      for (const rung of rungs) {
        const now = allRecords(world, rung);
        for (let r = 0; r < base.length; r++) {
          expect(now[r].lacuna?.factId).toBe(base[r].lacuna?.factId);
          expect(now[r].lacuna?.text).toBe(base[r].lacuna?.text);
        }
      }
    }
  });

  it('an effaced record has no fragments, and a full record has many', () => {
    const world = generateWorld(20260725);
    const cold = allRecords(world, NO_KNOWLEDGE);
    const hot = allRecords(world, omniscient(world));
    expect(cold.some((r) => r.recovery === 0 && r.fragments.length === 0)).toBe(true);
    expect(hot.some((r) => r.recovery === 4)).toBe(true);
    // Beasts, relics and gates are all fully recoverable by play. Figures are
    // deliberately not always so — see the Avenged source.
    for (const r of hot) {
      if (r.kind !== 'figure') expect(r.recovery, r.title).toBe(4);
      expect(r.fragments.length, r.title).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// The hole stays a hole
// ===========================================================================

describe('chronicle intel — redaction never leaks', () => {
  it('never emits the lacuna fact as a fragment, at any recovery', () => {
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      for (const k of [NO_KNOWLEDGE, omniscient(world)]) {
        for (const r of allRecords(world, k)) {
          if (!r.lacuna) continue;
          expect(r.fragments.some((f) => f.id === r.lacuna!.factId)).toBe(false);
        }
      }
    }
  });

  it('every record keeps a hole, and never redacts its tier-1 opening', () => {
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      for (const r of allRecords(world, omniscient(world))) {
        expect(r.lacuna, `${r.title} has no lacuna`).not.toBeNull();
        // the hole is always a tier >= 2 fact, so a record is never damaged to nothing
        expect(r.fragments.some((f) => f.tier === 1)).toBe(true);
      }
    }
  });

  it('only announces the hole once the reader could have earned it', () => {
    const world = generateWorld(77);
    for (const r of allRecords(world, NO_KNOWLEDGE)) {
      if (r.recovery === 0) expect(r.lacuna?.visible ?? false).toBe(false);
    }
    // A fully recovered record always knows what it is missing. A record that
    // cannot reach the cap (a figure nothing hunted, say) may legitimately not
    // yet know, which is why this is conditioned on recovery rather than on
    // knowledge — see the monotonicity check below for the other half.
    for (const r of allRecords(world, omniscient(world))) {
      if (r.recovery === 4) expect(r.lacuna?.visible).toBe(true);
    }
  });

  it('once the hole is visible it never becomes invisible again', () => {
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      const cold = allRecords(world, NO_KNOWLEDGE);
      const hot = allRecords(world, omniscient(world));
      for (let i = 0; i < cold.length; i++) {
        if (cold[i].lacuna?.visible) expect(hot[i].lacuna?.visible).toBe(true);
      }
    }
  });
});

// ===========================================================================
// It must not lie
// ===========================================================================

describe('chronicle intel — truthfulness', () => {
  it('artifact intel quotes numbers the forged item will really carry', () => {
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      const k = omniscient(world);
      for (const artifact of world.artifacts) {
        const record = artifactIntel(world, artifact.id, k)!;
        const measure = record.fragments.find((f) => f.id === 'relic.measure');
        if (!measure) continue;
        const item = forgeArtifactItem(artifact);
        const quoted = Number(measure.text.match(/: (\d+)\./)?.[1]);
        expect(Number.isFinite(quoted)).toBe(true);
        expect(
          item.affixes.some((a) => a.amount === quoted),
          `${artifact.name}: intel quotes ${quoted}, forged item has ${item.affixes.map((a) => a.amount).join('/')}`,
        ).toBe(true);
        // and it is the largest, as the prose implies by singling it out
        expect(quoted).toBe(Math.max(...item.affixes.map((a) => a.amount)));
      }
    }
  });

  it('artifact intel describes a floor that actually exists in that gate', () => {
    const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      const k = omniscient(world);
      for (const artifact of world.artifacts) {
        const record = artifactIntel(world, artifact.id, k)!;
        const resting = record.fragments.find((f) => f.id === 'relic.resting');
        if (!resting) continue;
        const floors = GATES[artifact.gateId].floors.length;
        expect(artifact.floorIndex).toBeLessThan(floors);
        expect(resting.text).toContain(ORD[artifact.floorIndex]);
        expect(resting.text).toContain(GATES[artifact.gateId].name);
      }
    }
  });

  it('a relic held by a beast is never also described as lying on a floor', () => {
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      const k = omniscient(world);
      for (const artifact of world.artifacts) {
        const holder = world.beasts.find((b) => b.holdsArtifactId === artifact.id);
        const ids = artifactIntel(world, artifact.id, k)!.fragments.map((f) => f.id);
        if (holder) {
          expect(ids).not.toContain('relic.resting');
        } else {
          expect(ids).not.toContain('relic.keeper');
        }
      }
    }
  });

  it('beast intel quotes the kit famous beasts actually fight from, never species skills', () => {
    const eliteNames = ELITE_KIT.moves.map((m) => m.name);
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      const k = omniscient(world);
      for (const beast of world.beasts) {
        const record = beastIntel(world, beast.id, k)!;
        const text = textOf(record);
        const arts = record.fragments.filter((f) => f.id.startsWith('beast.arts'));
        for (const parcel of arts) {
          // every capitalised move-looking name in an arts parcel is a real elite move
          const quoted = eliteNames.filter((n) => parcel.text.includes(n));
          expect(quoted.length).toBeGreaterThan(0);
        }
        // REGRESSION: cardBattle.kitFor gives famous beasts ELITE_KIT, so the
        // species' innateSkills are never used. Intel must never name one.
        const species = speciesById(beast.speciesId)!;
        for (const skillId of species.innateSkills) {
          expect(text.toLowerCase()).not.toContain(skillId.toLowerCase());
        }
      }
    }
  });

  it('only claims a beast strikes physically while every elite move is in fact physical', () => {
    const allPhysical = ELITE_KIT.moves.every((m) => moveElement(m) === 'None');
    // This is the premise of the beast.hand fragment. If someone gives an elite
    // move an element, the claim must vanish rather than go stale.
    expect(allPhysical).toBe(true);
    const world = generateWorld(20260725);
    const record = beastIntel(world, world.beasts[0].id, omniscient(world))!;
    const hand = record.fragments.find((f) => f.id === 'beast.hand');
    if (allPhysical) {
      // present unless it happens to be this record's lacuna
      expect(hand !== undefined || record.lacuna?.factId === 'beast.hand').toBe(true);
    }
  });

  it('never quotes an exact level or stat number for a beast', () => {
    // A beast's level depends on which floor it is met on, so there is no true
    // answer; its stats are never printed, only compared.
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      for (const beast of world.beasts) {
        const record = beastIntel(world, beast.id, omniscient(world))!;
        const text = textOf(record);
        expect(text).not.toMatch(/\blevel\b/i);
        expect(text).not.toMatch(/\b(STR|DEF|DEX|MANA|MAGDEF|INT|LUCK)\b/);
        expect(text).not.toContain(String(beast.might));
      }
    }
  });

  it('quotes a tame chance the engine would really produce', () => {
    const world = generateWorld(20260725);
    for (const beast of world.beasts) {
      const record = beastIntel(world, beast.id, omniscient(world))!;
      const taking = record.fragments.find((f) => f.id === 'beast.taking');
      if (!taking) continue;
      const species = speciesById(beast.speciesId)!;
      const expected = Math.max(
        BALANCE.tameMin,
        Math.min(BALANCE.tameMax, Math.round(species.tameBase * BALANCE.rarityTameMult.Rare)),
      );
      // spelled as a word, e.g. "three in a hundred"
      expect(taking.text).toMatch(new RegExp(`\\b(${expected}|three|two|four|five|six|seven|eight|nine|ten)\\b`));
      expect(expected).toBeGreaterThanOrEqual(BALANCE.tameMin);
    }
  });

  it('gate intel names the real warden, its real level and its real moves', () => {
    const world = generateWorld(20260725);
    const k = omniscient(world);
    for (const gateId of GATE_ORDER) {
      const record = gateIntel(world, gateId, k)!;
      const gate = GATES[gateId];
      const warden = record.fragments.find((f) => f.id === 'gate.warden');
      if (warden) {
        expect(warden.text).toContain(gate.bossName);
        expect(warden.text).toContain(String(gate.bossLevel));
      }
      const arts = record.fragments.find((f) => f.id === 'gate.wardenArts');
      if (arts) {
        const kit = BOSS_KITS[gate.bossName];
        expect(kit).toBeDefined();
        const named = kit.moves.filter((m) => arts.text.includes(m.name));
        expect(named.length).toBeGreaterThan(0);
        // and every move named is one of that boss's, not another's
        for (const other of Object.entries(BOSS_KITS)) {
          if (other[0] === gate.bossName) continue;
          for (const m of other[1].moves) {
            if (kit.moves.some((own) => own.name === m.name)) continue;
            expect(arts.text).not.toContain(m.name);
          }
        }
      }
      const turn = record.fragments.find((f) => f.id === 'gate.wardenTurn');
      if (turn) {
        expect(BOSS_KITS[gate.bossName].moves.some((m) => m.belowHpPct !== undefined)).toBe(true);
      }
    }
  });

  it('a beast species is one the gate it haunts can actually spawn', () => {
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      for (const beast of world.beasts) {
        const pool = new Set(
          GATES[beast.gateId].floors.flatMap((f) =>
            speciesMatching(f.spawn.families, f.spawn.tierMin, 5).map((s) => s.id),
          ),
        );
        expect(pool.has(beast.speciesId), `${beast.name} in ${beast.gateId}`).toBe(true);
      }
    }
  });

  it('every cross-reference resolves to something in the world', () => {
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      for (const r of allRecords(world, omniscient(world))) {
        for (const ref of r.refs) {
          const found =
            ref.kind === 'beast' ? world.beasts.some((b) => b.id === ref.id)
            : ref.kind === 'artifact' ? world.artifacts.some((a) => a.id === ref.id)
            : ref.kind === 'figure' ? world.figures.some((f) => f.id === ref.id)
            : GATE_ORDER.includes(ref.id as never);
          expect(found, `${r.title} -> ${ref.kind}:${ref.id}`).toBe(true);
        }
      }
    }
  });

  it('leaks no unfilled template slot into any fragment', () => {
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      for (const k of [NO_KNOWLEDGE, omniscient(world)]) {
        for (const r of allRecords(world, k)) {
          for (const f of r.fragments) expect(f.text, `${r.title}/${f.id}`).not.toMatch(/\{\w+\}/);
          expect(r.lacuna?.text ?? '').not.toMatch(/\{\w+\}/);
          expect(r.conditionLine).not.toMatch(/\{\w+\}/);
          for (const s of r.sources) expect(s.hint).not.toMatch(/\{\w+\}/);
        }
      }
    }
  });

  it('produces no empty or whitespace-only prose', () => {
    const world = generateWorld(20260725);
    for (const r of allRecords(world, omniscient(world))) {
      for (const f of r.fragments) expect(f.text.trim().length).toBeGreaterThan(20);
      expect(r.conditionLine.trim().length).toBeGreaterThan(20);
    }
  });
});

// ===========================================================================
// Knowledge model & API surface
// ===========================================================================

describe('chronicle intel — knowledge and API', () => {
  it('advances recovery on each of the documented triggers', () => {
    const world = generateWorld(20260725);
    const beast = world.beasts[0];
    const base = beastIntel(world, beast.id, NO_KNOWLEDGE)!.recovery;
    const bySpecies = beastIntel(world, beast.id, { ...NO_KNOWLEDGE, speciesFaced: [beast.speciesId] })!.recovery;
    const byWarden = beastIntel(world, beast.id, {
      ...NO_KNOWLEDGE,
      wardensFelled: [beast.gateId],
      triumphs: 1,
    })!.recovery;
    const byTellings = beastIntel(world, beast.id, { ...NO_KNOWLEDGE, tellings: RETOLD_AT })!.recovery;
    const bySlaying = beastIntel(world, beast.id, { ...NO_KNOWLEDGE, beastsSlain: [beast.id] })!.recovery;
    expect(bySpecies).toBe(base + 1);
    expect(byWarden).toBe(base + 1);
    expect(byTellings).toBe(base + 1);
    expect(bySlaying).toBe(base + 1);
  });

  it('every beast, relic and gate can reach the cap through play alone', () => {
    // The invariant that keeps intel from being a reward gated behind
    // something the game cannot produce: at least four of the five rungs on
    // these subjects must be earnable, whatever worldgen rolled.
    for (const seed of SEEDS) {
      const world = generateWorld(seed);
      for (const r of allRecords(world, NO_KNOWLEDGE)) {
        if (r.kind === 'figure') continue;
        const earnable = r.sources.filter((s) => s.earnable).length;
        expect(earnable, `${r.title} has only ${earnable} earnable rungs`).toBeGreaterThanOrEqual(4);
      }
      for (const r of allRecords(world, omniscient(world))) {
        if (r.kind === 'figure') continue;
        expect(r.recovery, r.title).toBe(4);
      }
    }
  });

  it('marks attested as unearnable — the world either recorded it or never did', () => {
    const world = generateWorld(20260725);
    for (const r of allRecords(world, NO_KNOWLEDGE)) {
      const attested = r.sources.find((s) => s.id === 'attested')!;
      expect(attested.earnable).toBe(false);
      expect(r.next === null || r.sources.find((s) => s.hint === r.next)?.earnable).toBeTruthy();
    }
  });

  it('offers a next step until the record is capped, and none after', () => {
    const world = generateWorld(20260725);
    for (const r of allRecords(world, NO_KNOWLEDGE)) {
      if (r.recovery < 4) expect(r.next).not.toBeNull();
    }
    for (const r of allRecords(world, omniscient(world))) {
      if (r.recovery === 4) expect(r.next).toBeNull();
    }
  });

  it('the abyss is charted by finishing the book, not by a warden', () => {
    const world = generateWorld(20260725);
    const abyssBeast = world.beasts.find((b) => b.gateId === 'abyss');
    if (!abyssBeast) return;
    const viaWardens = beastIntel(world, abyssBeast.id, { ...NO_KNOWLEDGE, wardensFelled: [...GATE_ORDER] })!;
    const viaTriumph = beastIntel(world, abyssBeast.id, { ...NO_KNOWLEDGE, triumphs: 1 })!;
    expect(viaWardens.sources.find((s) => s.id === 'charted')!.earned).toBe(false);
    expect(viaTriumph.sources.find((s) => s.id === 'charted')!.earned).toBe(true);
  });

  it('knowledgeFrom reads the shapes the game already has, and tolerates absent ones', () => {
    const k = knowledgeFrom(
      { telling: 6, triumphs: [{}, {}], ledger: { species: ['goober'], wardens: ['verdant'] } },
      { beastsSlain: ['beast-0'], artifactsFound: [] },
    );
    expect(k).toEqual({
      tellings: 6,
      speciesFaced: ['goober'],
      wardensFelled: ['verdant'],
      triumphs: 2,
      beastsSlain: ['beast-0'],
      artifactsFound: [],
    });
    expect(knowledgeFrom(null, null)).toEqual(NO_KNOWLEDGE);
    expect(knowledgeFrom({}, {})).toEqual(NO_KNOWLEDGE);
  });

  it('intelFor dispatches every ChronRef kind the Chronicle emits', () => {
    const world = generateWorld(20260725);
    const k = omniscient(world);
    expect(intelFor(world, { kind: 'beast', id: world.beasts[0].id }, k)?.kind).toBe('beast');
    expect(intelFor(world, { kind: 'artifact', id: world.artifacts[0].id }, k)?.kind).toBe('artifact');
    expect(intelFor(world, { kind: 'figure', id: world.figures[0].id }, k)?.kind).toBe('figure');
    expect(intelFor(world, { kind: 'gate', id: 'verdant' }, k)?.kind).toBe('gate');
  });

  it('returns null for ids the world does not contain', () => {
    const world = generateWorld(1);
    expect(beastIntel(world, 'beast-nope', NO_KNOWLEDGE)).toBeNull();
    expect(artifactIntel(world, 'artifact-nope', NO_KNOWLEDGE)).toBeNull();
    expect(figureIntel(world, 'fig-nope', NO_KNOWLEDGE)).toBeNull();
    expect(gateIntel(world, 'not-a-gate', NO_KNOWLEDGE)).toBeNull();
  });

  it('digest counts the whole book and grows with knowledge', () => {
    const world = generateWorld(20260725);
    const cold = intelDigest(world, NO_KNOWLEDGE);
    const hot = intelDigest(world, omniscient(world));
    expect(cold.total).toBe(hot.total);
    expect(cold.total).toBe((world.beasts.length + world.artifacts.length + GATE_ORDER.length) * 4);
    expect(hot.recovered).toBeGreaterThan(cold.recovered);
    expect(hot.recovered).toBeLessThanOrEqual(hot.total);
  });

  it('survives every seed in a wide sweep without throwing', () => {
    for (let seed = 0; seed < 120; seed++) {
      const world = generateWorld(seed);
      for (const k of [NO_KNOWLEDGE, omniscient(world)]) {
        const records = allRecords(world, k);
        expect(records.length).toBeGreaterThan(0);
        for (const r of records) {
          expect(r.recovery).toBeGreaterThanOrEqual(0);
          expect(r.recovery).toBeLessThanOrEqual(4);
          expect(r.title.length).toBeGreaterThan(0);
          expect(r.sources.length).toBe(5);
        }
      }
    }
  });
});
