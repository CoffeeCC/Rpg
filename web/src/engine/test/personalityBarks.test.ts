// v20 (PLAN9 workstream B): monster personality barks are DATA ONLY.
//
// Nothing in the combat engine reads PERSONALITY_BARKS yet — these tests lock
// the shape so the future UI hook can trust it: every personality, every event,
// a non-empty pool, one slot vocabulary, and a deterministic picker.
import { describe, expect, it } from 'vitest';
import {
  INSTINCT_LABEL,
  PERSONALITIES,
  PERSONALITY_BARKS,
  PERSONALITY_BARK_EVENTS,
  personalityBark,
  type PersonalityBarkEvent,
} from '../data/personalities';

const IDS = PERSONALITIES.map((p) => p.id);

describe('PERSONALITY_BARKS', () => {
  it('covers every personality, and no personality that does not exist', () => {
    expect(new Set(Object.keys(PERSONALITY_BARKS))).toEqual(new Set(IDS));
  });

  it('lists exactly the four bark events', () => {
    expect([...PERSONALITY_BARK_EVENTS]).toEqual(['instinct', 'winded', 'levelUp', 'tamed']);
  });

  it('every personality has a complete bark set: all four events, at least three lines each', () => {
    for (const id of IDS) {
      const set = PERSONALITY_BARKS[id];
      expect(set, `barks for ${id}`).toBeTruthy();
      expect(new Set(Object.keys(set)), `${id} events`).toEqual(new Set(PERSONALITY_BARK_EVENTS));
      for (const event of PERSONALITY_BARK_EVENTS) {
        expect(set[event].length, `${id}.${event} pool`).toBeGreaterThanOrEqual(3);
        for (const line of set[event]) {
          expect(line.trim().length, `${id}.${event} line`).toBeGreaterThan(10);
        }
      }
    }
  });

  it('uses only the {monster} slot', () => {
    for (const [id, set] of Object.entries(PERSONALITY_BARKS)) {
      for (const [event, lines] of Object.entries(set)) {
        for (const line of lines) {
          for (const slot of line.match(/\{[a-zA-Z]+\}/g) ?? []) {
            expect(slot, `${id}.${event} slot`).toBe('{monster}');
          }
        }
      }
    }
  });

  it('no duplicate bark text within a personality', () => {
    for (const [id, set] of Object.entries(PERSONALITY_BARKS)) {
      const all = PERSONALITY_BARK_EVENTS.flatMap((event) => set[event]);
      expect(new Set(all).size, `${id} duplicate barks`).toBe(all.length);
    }
  });

  it('no bark is shared between two personalities (each voice stays distinct)', () => {
    const owner = new Map<string, string>();
    const shared: string[] = [];
    for (const [id, set] of Object.entries(PERSONALITY_BARKS)) {
      for (const event of PERSONALITY_BARK_EVENTS) {
        for (const line of set[event]) {
          const first = owner.get(line);
          if (first && first !== id) shared.push(`${first} / ${id}: ${line}`);
          else owner.set(line, id);
        }
      }
    }
    expect(shared).toEqual([]);
  });

  it('reads well next to the instinct banner it accompanies', () => {
    // INSTINCT_LABEL is the existing data-only precedent; every personality's
    // instinct must have a label to pair its instinct bark with.
    for (const p of PERSONALITIES) {
      expect(INSTINCT_LABEL[p.instinct], `label for ${p.id}`).toBeTruthy();
      expect(PERSONALITY_BARKS[p.id].instinct.length).toBeGreaterThan(0);
    }
  });
});

describe('personalityBark', () => {
  it('returns a line from the right pool and is deterministic for a roll', () => {
    for (const id of IDS) {
      for (const event of PERSONALITY_BARK_EVENTS) {
        for (const roll of [0, 1, 2, 7, 41, 1234]) {
          const line = personalityBark(id, event, roll);
          expect(line, `${id}.${event} roll ${roll}`).toBeTruthy();
          expect(PERSONALITY_BARKS[id][event]).toContain(line);
          expect(personalityBark(id, event, roll), 'stable for the same roll').toBe(line);
        }
      }
    }
  });

  it('handles negative and fractional rolls without going out of bounds', () => {
    for (const roll of [-1, -9999, 3.9, -2.5]) {
      const line = personalityBark('stoic', 'winded', roll);
      expect(PERSONALITY_BARKS.stoic.winded, `roll ${roll}`).toContain(line);
    }
  });

  it('spans the whole pool as the roll advances', () => {
    const pool = PERSONALITY_BARKS.valiant.tamed;
    const seen = new Set<string | null>();
    for (let roll = 0; roll < pool.length * 3; roll++) seen.add(personalityBark('valiant', 'tamed', roll));
    expect(seen.size).toBe(pool.length);
  });

  it('returns null for an unknown or missing personality so a UI can render nothing', () => {
    expect(personalityBark('notAPersonality', 'tamed', 0)).toBeNull();
    expect(personalityBark(null, 'tamed', 0)).toBeNull();
    expect(personalityBark(undefined, 'instinct', 3)).toBeNull();
  });

  it('leaves the {monster} slot for the caller to substitute', () => {
    const line = personalityBark('doting', 'tamed', 0);
    expect(line).toContain('{monster}');
    expect(line?.replaceAll('{monster}', 'Pip')).not.toContain('{monster}');
  });

  it('covers every event for every personality with a real line', () => {
    const events: PersonalityBarkEvent[] = [...PERSONALITY_BARK_EVENTS];
    for (const p of PERSONALITIES) {
      for (const event of events) {
        expect(personalityBark(p.id, event, 0), `${p.id}.${event}`).toBeTruthy();
      }
    }
  });
});
