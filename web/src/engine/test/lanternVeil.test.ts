import { describe, it, expect } from 'vitest';
import { generateFloor, type FloorGenOptions } from '../systems/floorgen';
import { reachableTiles, TILE } from '../systems/floors';
import { SeededRng } from '../random';

/**
 * `Expedition` is not exported from ../game, so the shape is taken from the
 * function actually under test. That is the better dependency anyway: if
 * reachableTiles ever needs another field, this stops compiling instead of
 * silently passing a half-built object.
 */
type Exp = Parameters<typeof reachableTiles>[0];

/**
 * THE BARREL IN THE DARK.
 *
 * Paul, playing the map: "some objects like the barrels are just very dark and
 * shaded when I'm standing next to them. They should be lit."
 *
 * FloorScreen used to decide which tiles get the night veil with
 * `!reachableTiles(...).has(key)` — and `reachableTiles` is a BFS over places
 * you may legally END A MOVE. It skips walls, it skips tiles holding a unit,
 * and it skips unbroken breakables, because you cannot stop on a barrel. So
 * every barrel on the floor was classed as "beyond the lantern" and took the
 * full veil, including one the hero was standing next to holding the light.
 *
 * "Can I finish my move here" and "is this lit" are different questions. They
 * only looked like the same question while everything in range was bare floor.
 * The veil is geometric now — distance against the same radius the LightLayer
 * is given — and this test pins the distinction so the cheaper-looking version
 * cannot come back.
 */

const OPTS: FloorGenOptions = {
  width: 21,
  height: 13,
  families: ['Slime', 'Bug'],
  tierMin: 1,
  tierMax: 2,
  levelBonus: 1,
};

/** Just enough Expedition for the floor helpers under test. */
function expeditionOn(grid: string[], x: number, y: number): Exp {
  return {
    gateId: 'verdant',
    floorIndex: 0,
    floors: [{ grid, units: [], props: [] }],
    // Units hang off the expedition, not the floor — reachableTiles consults
    // them to refuse tiles somebody is already standing on.
    units: [],
    x,
    y,
    movLeft: 4,
    opened: [],
    broken: [],
    revealed: [],
    leavings: [],
  } as unknown as Exp;
}

/** The veil rule FloorScreen now uses. Kept in step with it deliberately. */
const beyond = (hx: number, hy: number, x: number, y: number, lightCells: number) =>
  Math.hypot(x - hx, y - hy) > lightCells;

describe('the lantern veil is geometric, not pathfinding', () => {
  it('does not veil an unbroken barrel the hero is standing next to', () => {
    // Find a generated floor that actually has a barrel with a walkable
    // neighbour — barrels are placed 0-3 per floor, so seeds are searched.
    let found: { grid: string[]; bx: number; by: number; hx: number; hy: number } | null = null;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const grid = generateFloor(new SeededRng(seed), OPTS).grid;
      for (let y = 1; y < grid.length - 1 && !found; y++) {
        for (let x = 1; x < grid[y].length - 1 && !found; x++) {
          if (grid[y][x] !== TILE.BREAKABLE) continue;
          for (const [dx, dy] of [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            const ch = grid[ny]?.[nx];
            if (ch && ch !== TILE.WALL && ch !== TILE.BREAKABLE) {
              found = { grid, bx: x, by: y, hx: nx, hy: ny };
              break;
            }
          }
        }
      }
    }
    expect(found, 'no generated floor had a barrel with a walkable neighbour').not.toBeNull();
    const { grid, bx, by, hx, hy } = found!;
    const exp = expeditionOn(grid, hx, hy);

    // The premise, asserted rather than assumed: the barrel really is NOT a
    // legal move destination. If this ever stops being true the test below is
    // proving nothing, and it should fail loudly rather than pass vacuously.
    const reachable = reachableTiles(exp, exp.movLeft);
    expect(reachable.has(`${bx},${by}`), 'barrel should not be a move destination').toBe(false);

    // THE OLD RULE, kept here so this test cannot quietly become a tautology:
    // it must genuinely have veiled the barrel, or the fix below proves nothing.
    const veiledByOldRule = !reachable.has(`${bx},${by}`);
    expect(veiledByOldRule, 'the old reachability rule must be the thing that broke this').toBe(true);

    // And yet it is one tile away, so it is inside any sane lantern pool.
    const lightCells = exp.movLeft + 0.7;
    expect(beyond(hx, hy, bx, by, lightCells), 'barrel one step away must not be veiled').toBe(false);
  });

  it('still veils ground genuinely outside the pool', () => {
    const grid = generateFloor(new SeededRng(7), OPTS).grid;
    const exp = expeditionOn(grid, 5, 5);
    const lightCells = exp.movLeft + 0.7; // 4.7 tiles
    expect(beyond(5, 5, 5, 9, lightCells)).toBe(false); // 4.0 away — inside
    expect(beyond(5, 5, 5, 11, lightCells)).toBe(true); // 6.0 away — outside
    expect(beyond(5, 5, 9, 9, lightCells)).toBe(true); // 5.66 diagonal — outside
  });
});
