// World content: the five gates of Everdusk and their hand-crafted floors.
// Tile legend: '#' wall, '.' floor, 'S' entrance, '>' stairs down, 'B' boss,
// 'C' chest, 'H' shrine, 'E' event. See PLAN.md.
// Spawn tables reference families + tier ranges only — never species ids.
import type { GateDef, GateId } from '../types';

export const GATES: Record<GateId, GateDef> = {
  verdant: {
    id: 'verdant',
    name: 'Verdant Gate',
    emoji: '🌳',
    description:
      'A sun-dappled woodland where the undergrowth hums, the flowers watch, and every clearing belongs to something.',
    requiredOrbs: 0,
    floors: [
      {
        // The Mossy Threshold — a gentle loop with a shrine glade.
        grid: [
          '###########',
          '#S....#..C#',
          '#.###.#.#.#',
          '#.#...#.#.#',
          '#.#.###.#.#',
          '#...H....>#',
          '###########',
        ],
        spawn: { families: ['Slime', 'Bug'], tierMin: 1, tierMax: 1, levelBonus: 0 },
      },
      {
        // The Bramble Warren — forked burrows, a chest behind the thorns.
        grid: [
          '#############',
          '#S..#....#C.#',
          '##.##.##.#.##',
          '#..#..#..#..#',
          '#.##.###.##.#',
          '#.#...E#....#',
          '#.#.####.####',
          '#...#....H.>#',
          '#############',
        ],
        spawn: { families: ['Slime', 'Bug', 'Plant'], tierMin: 1, tierMax: 2, levelBonus: 1 },
      },
      {
        // The Tangle — a tight knot of switchbacks and dead-end caches.
        grid: [
          '#########',
          '#S..#..C#',
          '##.##.#.#',
          '#..#..#.#',
          '#.##.##.#',
          '#....#..#',
          '#.####.##',
          '#C.>#..H#',
          '#########',
        ],
        spawn: { families: ['Bug', 'Plant', 'Bird'], tierMin: 1, tierMax: 2, levelBonus: 1 },
      },
      {
        // The Rootwarden's Bower — twin galleries around the old root-throne.
        grid: [
          '#############',
          '#S....#.....#',
          '#.###.#.###.#',
          '#.#C#.#.#E#.#',
          '#.#.#...#.#.#',
          '#.#.###.#.#.#',
          '#.#.......#.#',
          '#.####B####C#',
          '#############',
        ],
        spawn: { families: ['Plant', 'Bird', 'Slime'], tierMin: 1, tierMax: 2, levelBonus: 2 },
      },
    ],
    bossFamily: 'Plant',
    bossTier: 2,
    bossName: 'The Rootwarden',
    bossLevel: 6,
  },
  hollow: {
    id: 'hollow',
    name: 'Hollow Gate',
    emoji: '🕳️',
    description:
      'Deep caverns under the hills, where stone remembers being alive and the dark is only mostly empty.',
    requiredOrbs: 0,
    floors: [
      {
        // The Broken Stair — rubble-choked galleries near the surface.
        grid: [
          '###########',
          '#S...##..C#',
          '##.#.....##',
          '#..##.##..#',
          '#.##..#.#.#',
          '#.C#.##.#.#',
          '#.......#>#',
          '###########',
        ],
        spawn: { families: ['Beast', 'Material'], tierMin: 1, tierMax: 2, levelBonus: 2 },
      },
      {
        // The Echoing Halls — parallel corridors that never quite meet.
        grid: [
          '#############',
          '#....#..#..S#',
          '#.##.#.#..#.#',
          '#C#..#.#.##.#',
          '#.#.##.#.#..#',
          '#.#....#.#.##',
          '#.####.#.#.E#',
          '#.H.>#....#.#',
          '#############',
        ],
        spawn: { families: ['Beast', 'Material'], tierMin: 1, tierMax: 2, levelBonus: 3 },
      },
      {
        // The Pillared Deep — a colonnade of stone teeth over a long gallery.
        grid: [
          '###############',
          '#S....#...#..C#',
          '###.#.#.#.#.#.#',
          '#...#.#.#...#.#',
          '#.###.#.#####.#',
          '#.#...#.....#.#',
          '#.#.#######.#.#',
          '#....E....H.#>#',
          '###############',
        ],
        spawn: { families: ['Beast', 'Dragon', 'Material'], tierMin: 2, tierMax: 3, levelBonus: 4 },
      },
      {
        // The Cairn Court — the king's spiral, treasure at the far turn.
        grid: [
          '#############',
          '#S.....#..C.#',
          '#.#####.##.##',
          '#.#...#..#..#',
          '#.#.#.##.##.#',
          '#.#.#.......#',
          '#.#.######.##',
          '#...#B......#',
          '#############',
        ],
        spawn: { families: ['Material', 'Dragon', 'Beast'], tierMin: 2, tierMax: 3, levelBonus: 5 },
      },
    ],
    bossFamily: 'Material',
    bossTier: 3,
    bossName: 'The Cairn King',
    bossLevel: 11,
  },
  sunken: {
    id: 'sunken',
    name: 'Sunken Gate',
    emoji: '🏛️',
    description:
      'A drowned temple-city below the waterline. The congregation never left; they simply stopped breathing.',
    requiredOrbs: 0,
    floors: [
      {
        // The Flooded Nave — pews and pillars under a foot of black water.
        grid: [
          '###########',
          '#...#..S..#',
          '#.#.#.###.#',
          '#.#.#...#.#',
          '#.#.###.#.#',
          '#.#C#...#E#',
          '#.###.###.#',
          '#.....#..>#',
          '###########',
        ],
        spawn: { families: ['Undead', 'Slime'], tierMin: 2, tierMax: 3, levelBonus: 4 },
      },
      {
        // The Reliquary — side-chapels looted of everything but the quiet.
        grid: [
          '#############',
          '#C.#.....#.S#',
          '#..#.###.#..#',
          '##.#.#H#.##.#',
          '#..#.#.#....#',
          '#.##.#.####.#',
          '#.#..#....#.#',
          '#...##.#E..>#',
          '#############',
        ],
        spawn: { families: ['Undead', 'Slime', 'Devil'], tierMin: 2, tierMax: 3, levelBonus: 5 },
      },
      {
        // The Processional — a long twin-aisled march toward the deep stair.
        grid: [
          '###############',
          '#S..#.....#..C#',
          '#.#.#.###.#.#.#',
          '#.#.#.#.#.#.#.#',
          '#.#...#.#...#.#',
          '#.#####.#####.#',
          '#.......#E....#',
          '###.#C..#.##.>#',
          '###############',
        ],
        spawn: { families: ['Undead', 'Devil'], tierMin: 3, tierMax: 4, levelBonus: 7 },
      },
      {
        // The Drowned Sanctum — organ-pipe corridors descending to the altar.
        grid: [
          '#############',
          '#...#..S#...#',
          '#.#.#.#.#.#.#',
          '#C#.#.#.#.#C#',
          '#.#.#.#.#.#.#',
          '#.#.#.#.#.#.#',
          '#.#.#.#.#.#.#',
          '#.#.....#.#.#',
          '#.#######.#.#',
          '#....HB.....#',
          '#############',
        ],
        spawn: { families: ['Undead', 'Devil', 'Slime'], tierMin: 3, tierMax: 4, levelBonus: 8 },
      },
    ],
    bossFamily: 'Undead',
    bossTier: 4,
    bossName: 'The Drowned Curate',
    bossLevel: 16,
  },
  storm: {
    id: 'storm',
    name: 'Storm Gate',
    emoji: '⛰️',
    description:
      'Wind-scoured peaks above the cloudline, ruled by wings, scales, and weather with opinions.',
    requiredOrbs: 0,
    floors: [
      {
        // The Scree Slopes — a broad traverse under falling rock.
        grid: [
          '###############',
          '#S...#...#...C#',
          '#.##.#.#.#.####',
          '#..#...#.#.#E.#',
          '##.#####.#.#.##',
          '#............>#',
          '###############',
        ],
        spawn: { families: ['Bird', 'Beast'], tierMin: 3, tierMax: 4, levelBonus: 6 },
      },
      {
        // The Switchbacks — a cliff path that doubles back on itself.
        grid: [
          '###########',
          '#....#...S#',
          '#.##.#.##.#',
          '#C#..#.#..#',
          '#.#.##.#.##',
          '#.#.#..#.E#',
          '#.#.#.##.##',
          '#........>#',
          '###########',
        ],
        spawn: { families: ['Bird', 'Dragon', 'Beast'], tierMin: 3, tierMax: 4, levelBonus: 8 },
      },
      {
        // The Roost Fields — nesting terraces pocked with wind-carved holes.
        grid: [
          '#############',
          '#C..#....#.S#',
          '##.##.##.#.##',
          '#..#..#..#..#',
          '#.##.##.##.##',
          '#.#..#..#..H#',
          '#.##.##.##.##',
          '#>...#....E.#',
          '#############',
        ],
        spawn: { families: ['Bird', 'Dragon'], tierMin: 3, tierMax: 5, levelBonus: 9 },
      },
      {
        // The Eye of the Storm — ring within ring, Galewing at the center.
        grid: [
          '###############',
          '#S...........E#',
          '#.###########.#',
          '#.#....H....#.#',
          '#.#.#######.#.#',
          '#.#.#..C..#.#.#',
          '#.#.#.###.#.#.#',
          '#.#.#.#B#.#.#.#',
          '#.#.#.#.#.#.#.#',
          '#C............#',
          '###############',
        ],
        spawn: { families: ['Dragon', 'Bird'], tierMin: 4, tierMax: 5, levelBonus: 11 },
      },
    ],
    bossFamily: 'Dragon',
    bossTier: 4,
    bossName: 'Galewing',
    bossLevel: 21,
  },
  abyss: {
    id: 'abyss',
    name: 'Abyssal Gate',
    emoji: '🌑',
    description:
      'The wound in the world, hidden beneath the other four. It was never sealed. It was only waiting. Bring everything you have.',
    requiredOrbs: 4,
    floors: [
      {
        // The Descent — the light of your lamp goes strange here.
        grid: [
          '#############',
          '#....#.....S#',
          '#.##.#.###.##',
          '#.#..#...#..#',
          '#.#.####.##.#',
          '#.#....#.#..#',
          '#.####.#.#.##',
          '#C...E.....>#',
          '#############',
        ],
        spawn: { families: ['Devil', 'Undead'], tierMin: 4, tierMax: 4, levelBonus: 10 },
      },
      {
        // The Silent Choir — rows of empty pews facing the wrong way.
        grid: [
          '#############',
          '#....S....#C#',
          '#.##.##.#.#.#',
          '#.#...#.#...#',
          '#.#.#.#.###.#',
          '#...#.#.#...#',
          '#.###.#.#.#.#',
          '#..E#...#.#>#',
          '#############',
        ],
        spawn: { families: ['Devil', 'Undead', 'Material'], tierMin: 4, tierMax: 5, levelBonus: 11 },
      },
      {
        // The Inverted Keep — a fortress built downward into nothing.
        grid: [
          '###########',
          '#....#...C#',
          '#.##.#.####',
          '#.#..#...H#',
          '#.#.####.##',
          '#.#S...#.##',
          '#.#####..##',
          '#.#...#..E#',
          '#.#.#.##.##',
          '#>..#....##',
          '###########',
        ],
        spawn: { families: ['Undead', 'Dragon', 'Material'], tierMin: 4, tierMax: 5, levelBonus: 13 },
      },
      {
        // The Last Door — one long wrong turn after another.
        grid: [
          '#############',
          '#..C....#..H#',
          '#.#.#.#.##.##',
          '#.#.#.#....E#',
          '#.#.#.#####.#',
          '#.#.#.....#.#',
          '#.#.#####.#.#',
          '#S#.....>#..#',
          '#############',
        ],
        spawn: { families: ['Devil', 'Dragon'], tierMin: 4, tierMax: 5, levelBonus: 14 },
      },
      {
        // The Hollow Throne — a cathedral of absence. The Sovereign waits.
        grid: [
          '###############',
          '#S.....#.....C#',
          '#.#####.#####.#',
          '#.#.........#.#',
          '#.#.#.#.#.#.#.#',
          '#.#.#.#.#.#.#.#',
          '#.#.#.#.#.#.#.#',
          '#.#.#C#.#C#.#.#',
          '#.#.##...##.#.#',
          '#H....#B#....E#',
          '###############',
        ],
        spawn: { families: ['Devil', 'Undead', 'Dragon'], tierMin: 5, tierMax: 5, levelBonus: 16 },
      },
    ],
    bossFamily: 'Devil',
    bossTier: 5,
    bossName: 'The Hollow Sovereign',
    bossLevel: 30,
  },
};

export const GATE_ORDER: GateId[] = ['verdant', 'hollow', 'sunken', 'storm', 'abyss'];
