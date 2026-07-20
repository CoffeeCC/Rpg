import { describe, it, expect } from 'vitest';
import { LORE } from '../data/loreBanks';
import { NPCS } from '../data/npcs';
import type { FigureRole, LoreBanks } from '../types';

const ROLES: FigureRole[] = ['tamer', 'knight', 'scholar', 'monarch', 'heretic', 'wanderer'];
const EVENT_KINDS: (keyof LoreBanks['eventTemplates'])[] = [
  'born',
  'died',
  'forged',
  'lost',
  'beastRose',
  'beastSlew',
  'expedition',
  'calamity',
  'wonder',
];

/** Extract {slot} token names from a template string. */
function slots(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

function expectSlotsWithin(templates: string[], allowed: string[], label: string): void {
  for (const t of templates) {
    for (const s of slots(t)) {
      expect(allowed, `${label} template "${t}" uses slot {${s}}`).toContain(s);
    }
  }
}

describe('LORE banks', () => {
  it('meets minimum counts for name banks', () => {
    expect(LORE.realmPrefixes.length, 'realmPrefixes').toBeGreaterThanOrEqual(12);
    expect(LORE.realmSuffixes.length, 'realmSuffixes').toBeGreaterThanOrEqual(12);
    expect(LORE.personNames.length, 'personNames').toBeGreaterThanOrEqual(40);
    expect(LORE.beastNames.length, 'beastNames').toBeGreaterThanOrEqual(20);
    expect(LORE.beastEpithets.length, 'beastEpithets').toBeGreaterThanOrEqual(20);
    expect(LORE.eraNames.length, 'eraNames').toBeGreaterThanOrEqual(12);
    expect(LORE.artifactNames.length, 'artifactNames').toBeGreaterThanOrEqual(24);
    expect(LORE.artifactDescriptions.length, 'artifactDescriptions').toBeGreaterThanOrEqual(10);
    expect(LORE.beastLegends.length, 'beastLegends').toBeGreaterThanOrEqual(8);
  });

  it('has no duplicate entries within each name bank', () => {
    const banks: [string, string[]][] = [
      ['realmPrefixes', LORE.realmPrefixes],
      ['realmSuffixes', LORE.realmSuffixes],
      ['personNames', LORE.personNames],
      ['beastNames', LORE.beastNames],
      ['beastEpithets', LORE.beastEpithets],
      ['eraNames', LORE.eraNames],
      ['artifactNames', LORE.artifactNames],
    ];
    for (const [label, bank] of banks) {
      expect(new Set(bank).size, `${label} unique`).toBe(bank.length);
    }
  });

  it('provides at least 6 titles and 4 fates for every figure role', () => {
    for (const role of ROLES) {
      expect(LORE.personTitles[role].length, `personTitles.${role}`).toBeGreaterThanOrEqual(6);
      expect(LORE.figureFates[role].length, `figureFates.${role}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('provides at least 4 event templates for all 9 kinds', () => {
    for (const kind of EVENT_KINDS) {
      expect(LORE.eventTemplates[kind], `eventTemplates.${kind}`).toBeDefined();
      expect(LORE.eventTemplates[kind].length, `eventTemplates.${kind}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('all bank entries are non-empty strings', () => {
    const all: string[] = [
      ...LORE.realmPrefixes,
      ...LORE.realmSuffixes,
      ...LORE.personNames,
      ...ROLES.flatMap((r) => LORE.personTitles[r]),
      ...LORE.beastNames,
      ...LORE.beastEpithets,
      ...LORE.eraNames,
      ...LORE.artifactNames,
      ...LORE.artifactDescriptions,
      ...EVENT_KINDS.flatMap((k) => LORE.eventTemplates[k]),
      ...LORE.beastLegends,
      ...ROLES.flatMap((r) => LORE.figureFates[r]),
    ];
    for (const s of all) {
      expect(s.trim().length, `entry "${s}"`).toBeGreaterThan(0);
    }
  });

  it('artifactDescriptions use only {name} {figure} {era} {gate} slots', () => {
    expectSlotsWithin(
      LORE.artifactDescriptions,
      ['name', 'figure', 'era', 'gate'],
      'artifactDescriptions',
    );
  });

  it('eventTemplates use only {figure} {figure2} {beast} {gate} {artifact} {era} {year} slots', () => {
    const allowed = ['figure', 'figure2', 'beast', 'gate', 'artifact', 'era', 'year'];
    for (const kind of EVENT_KINDS) {
      expectSlotsWithin(LORE.eventTemplates[kind], allowed, `eventTemplates.${kind}`);
    }
  });

  it('beastLegends use only {beast} {epithet} {gate} {figure} slots', () => {
    expectSlotsWithin(LORE.beastLegends, ['beast', 'epithet', 'gate', 'figure'], 'beastLegends');
  });

  it('figureFates contain no slot tokens (plain one-line fates)', () => {
    for (const role of ROLES) {
      expectSlotsWithin(LORE.figureFates[role], [], `figureFates.${role}`);
    }
  });
});

describe('NPCS', () => {
  const RUMOR_SLOTS = ['beast', 'beastGate', 'artifact', 'artifactGate', 'figure', 'era', 'realm'];
  const REQUIRED_NAMES = [
    'Innkeeper Dovey',
    'Watch Captain Bram',
    'Old Maribel',
    'Stablemaster Ott',
    'Kess the Rival',
    'Brother Casque',
    'Elder Rowan',
  ];

  it('has at least 8 NPCs with unique ids', () => {
    expect(NPCS.length).toBeGreaterThanOrEqual(8);
    const ids = NPCS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the established quest givers by name', () => {
    const names = NPCS.map((n) => n.name);
    for (const required of REQUIRED_NAMES) {
      expect(names, `roster includes ${required}`).toContain(required);
    }
  });

  it('every NPC has a name, role, and emoji', () => {
    for (const n of NPCS) {
      expect(n.name.length, `npc ${n.id} name`).toBeGreaterThan(0);
      expect(n.role.length, `npc ${n.id} role`).toBeGreaterThan(0);
      expect(n.emoji.length, `npc ${n.id} emoji`).toBeGreaterThan(0);
    }
  });

  it('every NPC has 6 greeting pools (chapters 0-5), all non-empty with non-empty lines', () => {
    for (const n of NPCS) {
      expect(n.greetings.length, `npc ${n.id} greeting stages`).toBe(6);
      n.greetings.forEach((pool, stage) => {
        expect(pool.length, `npc ${n.id} stage ${stage} pool`).toBeGreaterThanOrEqual(1);
        for (const line of pool) {
          expect(line.trim().length, `npc ${n.id} stage ${stage} line`).toBeGreaterThan(0);
        }
      });
    }
  });

  it('greeting pools at key stages 0, 1, 3, 5 offer at least 2 lines', () => {
    for (const n of NPCS) {
      for (const stage of [0, 1, 3, 5]) {
        expect(
          n.greetings[stage].length,
          `npc ${n.id} stage ${stage} variety`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('every NPC has at least 4 non-empty rumors', () => {
    for (const n of NPCS) {
      expect(n.rumors.length, `npc ${n.id} rumor count`).toBeGreaterThanOrEqual(4);
      for (const r of n.rumors) {
        expect(r.trim().length, `npc ${n.id} rumor`).toBeGreaterThan(0);
      }
    }
  });

  it('rumors use only the allowed slot set', () => {
    for (const n of NPCS) {
      expectSlotsWithin(n.rumors, RUMOR_SLOTS, `npc ${n.id} rumors`);
    }
  });

  it('most of each NPC\'s rumors reference world lore via at least one slot', () => {
    for (const n of NPCS) {
      const slotted = n.rumors.filter((r) => slots(r).length > 0).length;
      expect(slotted, `npc ${n.id} slotted rumors`).toBeGreaterThanOrEqual(
        Math.ceil(n.rumors.length / 2),
      );
    }
  });
});
