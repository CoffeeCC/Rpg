import { describe, it, expect } from 'vitest';
import { newWildExpedition, newExpedition, descend, ascend, floorOf, floorHasMiniboss, TILE } from '../systems/floors';
import { GATES } from '../data/gates';
import { initialGameState } from '../game';

function baseState() {
  const state = initialGameState();
  return { world: state.world, chronicle: state.chronicle };
}

describe('Unmapped Wilds expedition', () => {
  it('generates floor 0 on entry and grows one floor per descent', () => {
    const { world, chronicle } = baseState();
    let exp = newWildExpedition('verdant', 42, world, chronicle, false);
    expect(exp.wild?.floors.length).toBe(1);
    expect(exp.floorIndex).toBe(0);

    exp = descend(exp, world, chronicle, false);
    expect(exp.floorIndex).toBe(1);
    expect(exp.wild?.floors.length).toBe(2);

    exp = descend(exp, world, chronicle, false);
    expect(exp.floorIndex).toBe(2);
    expect(exp.wild?.floors.length).toBe(3);
  });

  it('never caps depth the way story gates do', () => {
    const { world, chronicle } = baseState();
    let exp = newWildExpedition('verdant', 7, world, chronicle, false);
    for (let i = 0; i < 15; i++) exp = descend(exp, world, chronicle, false);
    expect(exp.floorIndex).toBe(15);
    expect(exp.wild?.floors.length).toBe(16);
  });

  it('ascending back to an already-generated floor reuses it instead of rerolling', () => {
    const { world, chronicle } = baseState();
    let exp = newWildExpedition('verdant', 99, world, chronicle, false);
    const floor0Before = floorOf(exp).grid;
    exp = descend(exp, world, chronicle, false);
    const floor1 = floorOf(exp).grid;

    exp = ascend(exp, world, chronicle, false);
    expect(exp.floorIndex).toBe(0);
    expect(floorOf(exp).grid).toEqual(floor0Before);

    exp = descend(exp, world, chronicle, false);
    expect(exp.floorIndex).toBe(1);
    expect(floorOf(exp).grid).toEqual(floor1); // same floor, not a fresh roll
  });

  it('escalates danger with depth from wherever the gate itself left off', () => {
    const { world, chronicle } = baseState();
    let exp = newWildExpedition('verdant', 5, world, chronicle, false);
    const shallow = floorOf(exp).spawn;
    for (let i = 0; i < 12; i++) exp = descend(exp, world, chronicle, false);
    const deep = floorOf(exp).spawn;
    expect(deep.levelBonus).toBeGreaterThan(shallow.levelBonus);
    expect(deep.tierMax).toBeGreaterThanOrEqual(shallow.tierMax);
  });

  it('every non-final wild floor still gates its stairs behind a miniboss, same as a hand floor', () => {
    const { world, chronicle } = baseState();
    let exp = newWildExpedition('verdant', 1, world, chronicle, false);
    for (let i = 0; i < 5; i++) {
      const floor = floorOf(exp);
      expect(floorHasMiniboss(floor)).toBe(true);
      expect(floor.grid.some((row) => row.includes(TILE.STAIRS))).toBe(true);
      exp = descend(exp, world, chronicle, false);
    }
  });

  it('a plain (non-wild) expedition is unaffected: floorOf still reads the hand-authored gate data', () => {
    const { world, chronicle } = baseState();
    const exp = newExpedition('verdant', world, chronicle, false);
    expect(exp.wild).toBeUndefined();
    expect(floorOf(exp).grid).toEqual(GATES.verdant.floors[0].grid);
  });
});
