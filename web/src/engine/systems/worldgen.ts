import type {
  FamousBeast,
  FigureRole,
  GateId,
  GeneratedWorld,
  HistoryEvent,
  ItemV2,
  LostArtifact,
  UniqueAffix,
  WorldEra,
  WorldFigure,
} from '../types';
import { LORE } from '../data/loreBanks';
import { GATES, GATE_ORDER } from '../data/gates';
import { speciesMatching } from '../data/species';
import { ITEM_TYPES } from '../data/items';
import { freshUid } from '../entities/MonsterInstance';
import { SeededRng } from '../random';

const ROLES: FigureRole[] = ['tamer', 'knight', 'scholar', 'monarch', 'heretic', 'wanderer'];
const ARTIFACT_BASES = ['Sword', 'Staff', 'Armor', 'Headpiece', 'Ring'] as const;

// Extra, locally-authored fallback lines that widen the shuffle-bag pools
// beyond what LORE ships, so per-era sampling-without-replacement (see
// TemplateBag below) rarely has to reshuffle mid-era even on unlucky seeds.
// figureFates in LORE carry no slots by design, so these match that style.
const EXTRA_FATES: Record<FigureRole, string[]> = {
  tamer: [
    'Left no grave, only an empty leash coiled by the door.',
    'Traded a name for a beast\'s trust, and never once asked for it back.',
  ],
  knight: [
    'Broke the last blade on the last watch, and called that enough.',
    'Was knighted twice: once by a crown, once by a corpse.',
  ],
  scholar: [
    'Left the final page blank, on purpose, for someone braver.',
    'Traded eyesight for one true sentence, and thought it a fair price.',
  ],
  monarch: [
    'Signed the last decree with a hand too tired to seal it.',
    'Ruled a year no one else remembers ruling.',
  ],
  heretic: [
    'Was proven right after the ash had already settled.',
    'Kept one small lie, out of mercy, and confessed everything else.',
  ],
  wanderer: [
    'Left footprints that led nowhere anyone else could follow.',
    'Called every road home, right up until the last one.',
  ],
};

// calamity/wonder in LORE lean on {figure}/{gate} inconsistently (some
// entries carry no unique slot at all), which is how two unrelated years end
// up with byte-identical texture text. These extras always carry a slot.
const EXTRA_CALAMITY = [
  'In {year}, {figure} counted the stars and came up one short, and told no one which.',
  'In {year}, the wells nearest the {gate} ran bitter for a season, and the realm learned to boil first and ask later.',
];
const EXTRA_WONDER = [
  'In {year}, {figure} swore the {gate} sang for a single night, on key, and never again.',
  'In {year}, a second moon hung low over the {gate} until dawn, gone by breakfast, and recorded nowhere else.',
];

function fill(template: string, slots: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(slots[key] ?? `{${key}}`));
}

function gateName(gateId: GateId): string {
  return GATES[gateId].name;
}

/**
 * Sample-without-replacement "shuffle bag" scoped by an arbitrary string key
 * (e.g. "<era>:born" or "<era>:fate:knight"). A template only repeats within
 * a key once every entry in that key's bag has been drawn; the bag then
 * reshuffles (seeded, so still deterministic) and the cycle starts again.
 * This is what keeps the same figure-description/event-template text from
 * showing up more than once inside a single era.
 */
class TemplateBag {
  private bags = new Map<string, number[]>();
  private rng: SeededRng;

  constructor(rng: SeededRng) {
    this.rng = rng;
  }

  draw<T>(key: string, list: readonly T[]): T {
    let bag = this.bags.get(key);
    if (!bag || bag.length === 0) {
      bag = Array.from({ length: list.length }, (_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = this.rng.int(i + 1);
        const tmp = bag[i];
        bag[i] = bag[j];
        bag[j] = tmp;
      }
      this.bags.set(key, bag);
    }
    return list[bag.pop() as number];
  }
}

/**
 * DF-style history simulation, miniature scale: one seeded pass builds eras,
 * figures, famous beasts, lost artifacts, and a timeline weaving them together.
 * Deterministic per seed; the Chronicle screen is its legends mode.
 */
export function generateWorld(seed: number): GeneratedWorld {
  const rng = new SeededRng(seed);
  const bag = new TemplateBag(rng);

  // --- Realm name ---
  const name = `${rng.pick(LORE.realmPrefixes)}${rng.pick(LORE.realmSuffixes)}`;

  // --- Eras (spanning ~900 years, ending "now") ---
  const eraCount = rng.range(3, 5);
  const eras: WorldEra[] = [];
  const usedEraNames = new Set<number>();
  let year = 0;
  for (let i = 0; i < eraCount; i++) {
    const span = rng.range(140, 320);
    eras.push({ name: rng.pickUnique(LORE.eraNames, usedEraNames), startYear: year, endYear: year + span });
    year += span;
  }
  const endYear = year;
  const eraAt = (y: number): WorldEra => eras.find((e) => y >= e.startYear && y <= e.endYear) ?? eras[eras.length - 1];

  const events: HistoryEvent[] = [];

  function figureName(f: WorldFigure): string {
    return `${f.name} ${f.title}`;
  }

  // Every template fill gets a COMPLETE slot bag — templates may use any
  // documented slot, and an unfilled {slot} leaking into history is a
  // contract violation (tested). Specific fills override the defaults.
  const slotBag = (year: number, overrides: Record<string, string | number> = {}): Record<string, string | number> => ({
    year,
    era: eraAt(year).name,
    gate: gateName(rng.pick(GATE_ORDER)),
    figure: 'a name the records lost',
    figure2: 'another the records lost',
    beast: 'something old',
    artifact: 'a lost thing',
    ...overrides,
  });

  // --- Figures ---
  const figures: WorldFigure[] = [];
  const usedNames = new Set<number>();
  const figureCount = rng.range(14, 20);
  for (let i = 0; i < figureCount; i++) {
    const role = rng.pick(ROLES);
    const bornYear = rng.range(20, endYear - 60);
    const lifespan = rng.range(28, 90);
    const diedYear = rng.chance(0.82) ? Math.min(endYear - rng.range(1, 30), bornYear + lifespan) : null;
    const fatePool = [...LORE.figureFates[role], ...EXTRA_FATES[role]];
    const figure: WorldFigure = {
      id: `fig-${i}`,
      name: rng.pickUnique(LORE.personNames, usedNames),
      title: rng.pick(LORE.personTitles[role]),
      role,
      bornYear,
      diedYear,
      fate: fill(bag.draw(`${eraAt(bornYear).name}:fate:${role}`, fatePool), { gate: gateName(rng.pick(GATE_ORDER)) }),
    };
    figures.push(figure);
    const fullName = `${figure.name} ${figure.title}`;
    events.push({
      year: bornYear,
      text: fill(bag.draw(`${eraAt(bornYear).name}:born`, LORE.eventTemplates.born), slotBag(bornYear, { figure: fullName })),
    });
    if (diedYear !== null && rng.chance(0.6)) {
      const others = figures.filter((f) => f.id !== figure.id);
      const figure2 = others.length > 0 ? figureName(rng.pick(others)) : 'another the records lost';
      events.push({
        year: diedYear,
        text: fill(bag.draw(`${eraAt(diedYear).name}:died`, LORE.eventTemplates.died), slotBag(diedYear, { figure: fullName, figure2 })),
      });
    }
  }

  // --- Famous beasts (haunting the four outer gates, sometimes the abyss) ---
  const beasts: FamousBeast[] = [];
  const usedBeastNames = new Set<number>();
  const usedEpithets = new Set<number>();
  const beastCount = rng.range(4, 6);
  const hauntable: GateId[] = ['verdant', 'hollow', 'sunken', 'storm', 'abyss'];
  for (let i = 0; i < beastCount; i++) {
    const gateId = hauntable[i % hauntable.length];
    const gate = GATES[gateId];
    const topFloor = gate.floors[gate.floors.length - 1];
    const pool = speciesMatching(topFloor.spawn.families, Math.max(2, topFloor.spawn.tierMin), 5);
    if (pool.length === 0) continue;
    const species = rng.pick(pool);
    const beast: FamousBeast = {
      id: `beast-${i}`,
      name: rng.pickUnique(LORE.beastNames, usedBeastNames),
      epithet: rng.pickUnique(LORE.beastEpithets, usedEpithets),
      speciesId: species.id,
      gateId,
      might: rng.range(3, 7),
      legend: '',
    };
    const roseYear = rng.range(Math.floor(endYear * 0.3), endYear - 10);
    events.push({
      year: roseYear,
      text: fill(
        bag.draw(`${eraAt(roseYear).name}:beastRose`, LORE.eventTemplates.beastRose),
        slotBag(roseYear, { beast: `${beast.name} ${beast.epithet}`, gate: gateName(gateId) }),
      ),
    });
    // Sometimes it killed someone notable.
    const victim = figures.find((f) => f.diedYear !== null && f.diedYear > roseYear);
    if (victim && rng.chance(0.65)) {
      const others = figures.filter((f) => f.id !== victim.id);
      const figure2 = others.length > 0 ? figureName(rng.pick(others)) : 'another the records lost';
      events.push({
        year: victim.diedYear!,
        text: fill(
          bag.draw(`${eraAt(victim.diedYear!).name}:beastSlew`, LORE.eventTemplates.beastSlew),
          slotBag(victim.diedYear!, { beast: beast.name, figure: figureName(victim), figure2 }),
        ),
      });
      beast.legend = fill(rng.pick(LORE.beastLegends), {
        beast: beast.name,
        epithet: beast.epithet,
        gate: gateName(gateId),
        figure: figureName(victim),
      });
    } else {
      beast.legend = fill(rng.pick(LORE.beastLegends), {
        beast: beast.name,
        epithet: beast.epithet,
        gate: gateName(gateId),
        figure: figureName(rng.pick(figures)),
      });
    }
    beasts.push(beast);
  }

  // --- Lost artifacts ---
  const artifacts: LostArtifact[] = [];
  const usedArtifactNames = new Set<number>();
  const forgedYears = new Map<string, number>();
  const artifactCount = rng.range(5, 8);
  for (let i = 0; i < artifactCount; i++) {
    const baseType = rng.pick(ARTIFACT_BASES);
    const smith = rng.pick(figures);
    const lostGate = rng.pick(GATE_ORDER);
    const floorIndex = rng.int(GATES[lostGate].floors.length);
    const forgedYear = Math.max(smith.bornYear + 16, rng.range(40, endYear - 40));
    const potency = rng.range(6, 14);
    const affixes: UniqueAffix[] = [
      { name: 'Remembered', type: 'prefix', target: baseType === 'Staff' ? 'INT' : baseType === 'Ring' ? 'LUCK' : 'STR', amount: potency },
      { name: 'of the Old Light', type: 'suffix', target: 'HP', amount: potency * 3 },
    ];
    if (rng.chance(0.6)) {
      affixes.push({ name: 'Unforgotten', type: 'suffix', target: rng.chance(0.5) ? 'DEX' : 'MAGDEF', amount: Math.floor(potency * 0.7) });
    }
    const artifactName = rng.pickUnique(LORE.artifactNames, usedArtifactNames);
    const artifact: LostArtifact = {
      id: `artifact-${i}`,
      name: artifactName,
      baseType,
      description: fill(bag.draw(`${eraAt(forgedYear).name}:artifactDesc`, LORE.artifactDescriptions), {
        name: artifactName,
        figure: figureName(smith),
        era: eraAt(forgedYear).name,
        gate: gateName(lostGate),
      }).trim(),
      affixes,
      implicitAttack: baseType === 'Sword' ? potency + 4 : 0,
      implicitMagic: baseType === 'Staff' ? potency + 4 : 0,
      implicitDefense: baseType === 'Armor' || baseType === 'Headpiece' ? potency + 2 : 0,
      gateId: lostGate,
      floorIndex,
    };
    events.push({
      year: forgedYear,
      text: fill(bag.draw(`${eraAt(forgedYear).name}:forged`, LORE.eventTemplates.forged), slotBag(forgedYear, { figure: figureName(smith), artifact: artifact.name })),
    });
    forgedYears.set(artifact.id, forgedYear);
    artifacts.push(artifact);
  }
  // A couple of artifacts are held by beasts instead of chests — decide this
  // BEFORE narrating where the rest were lost, so an artifact never ends up
  // both "held by a beast" and "vanished into a gate floor" at once. Each
  // artifact gets exactly one placement in the world's data and its history.
  for (const beast of beasts) {
    if (artifacts.length === 0) break;
    if (rng.chance(0.35)) {
      const held = rng.pick(artifacts.filter((a) => !beasts.some((b) => b.holdsArtifactId === a.id)));
      if (held) beast.holdsArtifactId = held.id;
    }
  }
  for (const artifact of artifacts) {
    if (beasts.some((b) => b.holdsArtifactId === artifact.id)) continue; // its fate is told through the beast's own rise/legend
    const forgedYear = forgedYears.get(artifact.id) ?? 0;
    const lostYear = Math.min(endYear - rng.range(2, 20), forgedYear + rng.range(5, 120));
    events.push({
      year: lostYear,
      text: fill(bag.draw(`${eraAt(lostYear).name}:lost`, LORE.eventTemplates.lost), slotBag(lostYear, { artifact: artifact.name, gate: gateName(artifact.gateId) })),
    });
  }

  // --- Expeditions, calamities, wonders (texture) ---
  const textureCount = rng.range(10, 16);
  for (let i = 0; i < textureCount; i++) {
    const y = rng.range(10, endYear - 5);
    const kind = rng.pick(['expedition', 'calamity', 'wonder'] as const);
    const pool =
      kind === 'calamity'
        ? [...LORE.eventTemplates.calamity, ...EXTRA_CALAMITY]
        : kind === 'wonder'
          ? [...LORE.eventTemplates.wonder, ...EXTRA_WONDER]
          : LORE.eventTemplates.expedition;
    const overrides: Record<string, string | number> = { figure: figureName(rng.pick(figures)) };
    if (artifacts.length > 0) overrides.artifact = rng.pick(artifacts).name;
    events.push({ year: y, text: fill(bag.draw(`${eraAt(y).name}:${kind}`, pool), slotBag(y, overrides)) });
  }

  events.sort((a, b) => a.year - b.year);

  return { seed, name, eras, figures, beasts, artifacts, events };
}

/** Materialize a lost artifact as a real inventory item. */
export function forgeArtifactItem(artifact: LostArtifact): ItemV2 {
  const typeInfo = ITEM_TYPES[artifact.baseType];
  const material = typeInfo.materials[typeInfo.materials.length - 2] ?? typeInfo.materials[0];
  return {
    uid: freshUid('artifact'),
    baseType: artifact.baseType,
    slot: typeInfo.slot,
    material,
    ilvl: 14,
    rarity: 'Legendary',
    name: artifact.name,
    implicitAttack: artifact.implicitAttack,
    implicitMagic: artifact.implicitMagic,
    implicitDefense: artifact.implicitDefense,
    affixes: artifact.affixes.map((a) => ({ affixId: `artifact:${artifact.id}`, name: a.name, type: a.type, target: a.target, amount: a.amount })),
    value: 400,
    uniqueId: `artifact:${artifact.id}`,
  };
}
