// World content: the five gates of Everdusk and their hand-crafted floors.
// Tile legend (map contract v2, see PLAN4.md): '#' wall, '.' floor,
// 'S' entrance/ascent, '>' stairs down (miniboss-locked), 'B' gate boss
// (final floors only), 'M' miniboss (guards the stairs on every non-final
// floor), 'e' enemy unit spawn, 't' tamer spawn, 'm' merchant spot,
// 'b' breakable, 'C' chest, 'H' shrine, 'E' event tile, 's' secret.
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
        // The Mossy Threshold — a knotted clearing-loop; the miniboss holds
        // the far grove where the stair sinks into root and shadow.
        grid: [
          '###################',
          '#..t.##.....##.bC.#',
          '#.S..##.beb.##....#',
          '#...........###.###',
          '###.#####.#####.###',
          '###.####.b.####.###',
          '#........e........#',
          '##.#####.b.####.###',
          '#....###.####...e.#',
          '#.Ce.bs....##.M.>.#',
          '#....##.H..##.b...#',
          '#######....##.....#',
          '###################',
        ],
        spawn: { families: ['Slime', 'Bug'], tierMin: 1, tierMax: 1, levelBonus: 0 },
      },
      {
        // The Bramble Warren — forked burrows fan from a winding spine;
        // a looted vault waits behind the thorns at the dead end.
        grid: [
          '#####################',
          '#....####b...##.bC.##',
          '#.S..####.e..##be.E##',
          '#.......#.b..##....##',
          '###..te.##.#####.####',
          '###.#....e.#####.####',
          '#...................#',
          '##.#######.#####.####',
          '#....###.....#.e...##',
          '#sbC.###b.C..#bM.>.##',
          '#....###.....#.b.m.##',
          '##############.....##',
          '#####################',
        ],
        spawn: { families: ['Slime', 'Bug', 'Plant'], tierMin: 1, tierMax: 2, levelBonus: 1 },
      },
      {
        // The Tangle — a tight knot of switchbacks; the miniboss squats in
        // the shrine alcove that guards the last turn to the stair.
        grid: [
          '#################',
          '#...#####.bCb####',
          '#.S.#####....####',
          '##.####.e.#######',
          '#....##.e.#######',
          '#b.b......#######',
          '##.#####.##.H..##',
          '##.##.eb.##.M..##',
          '##.##.......e>.##',
          '#.b.#######....##',
          '#sC.#############',
          '#################',
          '#################',
        ],
        spawn: { families: ['Bug', 'Plant', 'Bird'], tierMin: 1, tierMax: 2, levelBonus: 1 },
      },
      {
        // The Rootwarden's Bower — twin galleries fork from the entrance
        // and close symmetrically on the root-throne. FINAL FLOOR.
        grid: [
          '#####################',
          '########.e.e.########',
          '########..S..########',
          '#######.b.C.b.#######',
          '####.............####',
          '####es#########se####',
          '####.b#########b.####',
          '####.###########.####',
          '##.bb.#..E.E..#.bb.##',
          '##.C....e.B.e...C..##',
          '#######.H.....#######',
          '#####################',
          '#####################',
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
        // The Broken Stair — a carved hall bleeds into a blobby cave pocket
        // before the miniboss's rubble-choked approach to the stair.
        grid: [
          '###################',
          '#....#####.bC...###',
          '#.S........e....###',
          '#....#####......###',
          '##.#########.######',
          '##.b..######.######',
          '##..e.b.#.b....####',
          '##...b...te......##',
          '##.b.####.....eM.##',
          '##sC########....>##',
          '##############...##',
          '###################',
          '###################',
        ],
        spawn: { families: ['Beast', 'Material'], tierMin: 1, tierMax: 2, levelBonus: 2 },
      },
      {
        // The Echoing Halls — parallel carved corridors linked by three
        // crossings; the miniboss waits where the halls finally meet.
        grid: [
          '#####################',
          '#..E###.bb.##.Cbb.###',
          '#.S.e...e.......e.E.#',
          '####.#####.#####.####',
          '####.#####.#####.####',
          '####.#####.#####.####',
          '####.#####.#####.####',
          '####.#####.#####.####',
          '####.#####.##.He...##',
          '#.C.....e.....bMb>..#',
          '#.b.###.bm.##......##',
          '##s.#################',
          '#####################',
        ],
        spawn: { families: ['Beast', 'Material'], tierMin: 1, tierMax: 2, levelBonus: 3 },
      },
      {
        // The Pillared Deep — a colonnade of stone teeth over a long
        // gallery, alcoves branching to either side of the march.
        grid: [
          '#######################',
          '#.t.##.bb.s####.b..####',
          '#.S.##..Cb.####..b.####',
          '#...##....#####....####',
          '##.#####.########.#####',
          '#......e.....e.....e..#',
          '#..E#..#..#..#..#..#..#',
          '#.....................#',
          '########.######.e....##',
          '######.b..#####.Mb>..##',
          '######..eb#####..mC..##',
          '######....#####......##',
          '#######################',
        ],
        spawn: { families: ['Beast', 'Dragon', 'Material'], tierMin: 2, tierMax: 3, levelBonus: 4 },
      },
      {
        // The Cairn Court — a true carved spiral winds inward, ring past
        // ring, to the king's throne at the dead center. FINAL FLOOR.
        grid: [
          '###################',
          '#..e.##############',
          '#.SH...........b.##',
          '#....###########.##',
          '####.b.......b.#.##',
          '####.#########.#.##',
          '####.#......C#b#e##',
          '####.#.#..C#.#.#.##',
          '####e#.#.B...#e#.##',
          '####.#.#e.e###.#.##',
          '####.#.b.......#.##',
          '####C###sb.#####.##',
          '####.bE........E.##',
          '###################',
          '###################',
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
        // The Flooded Nave — a pillared aisle runs the width of the temple,
        // side-chapels branching to shrine and secret alike.
        grid: [
          '###################',
          '##.t.#######.e..###',
          '##bCb#######.bb.###',
          '##...#######....###',
          '###.#########.#####',
          '#.......e.........#',
          '#.S#..#..#..#..#>E#',
          '#.......e......M..#',
          '###.#########.#####',
          '##...#######....###',
          '##.eb.b#####.C..###',
          '##...#s#####....###',
          '###################',
        ],
        spawn: { families: ['Undead', 'Slime'], tierMin: 2, tierMax: 3, levelBonus: 4 },
      },
      {
        // The Reliquary — a spine of pews between mirrored side-chapels,
        // looted of everything but the quiet and one desperate cache.
        grid: [
          '#####################',
          '#########.S.#########',
          '##.Ce........be.bC###',
          '##......##.#......###',
          '##########.##########',
          '##..e.E........b.b###',
          '##......##.#......###',
          '##########.##########',
          '##.btb..........e..##',
          '##......##.#.b.M.>E##',
          '###b######.#.....m.##',
          '##s.######.##########',
          '#####################',
        ],
        spawn: { families: ['Undead', 'Slime', 'Devil'], tierMin: 2, tierMax: 3, levelBonus: 5 },
      },
      {
        // The Processional — twin aisles march the length of the temple
        // behind a broken colonnade, toward the deep stair.
        grid: [
          '#######################',
          '#...bs####bCb.#########',
          '#.S.######....#########',
          '##.########.###########',
          '#.....e...........e...#',
          '#..b#...#...#H..#...#.#',
          '#.#b..#.E.#...#...#...#',
          '#.............e.......#',
          '##################.be.#',
          '##################Mm>.#',
          '##################bC..#',
          '#######################',
          '#######################',
        ],
        spawn: { families: ['Undead', 'Devil'], tierMin: 3, tierMax: 4, levelBonus: 7 },
      },
      {
        // The Drowned Sanctum — organ-pipe corridors descend rank on rank
        // toward the altar where the curate still waits. FINAL FLOOR.
        grid: [
          '#################',
          '##S.e.....e.b..##',
          '##b#.#.#.#.#.#.##',
          '##.#.#.#.#.#.#.b#',
          '##.#.#.#.#.#.#.s#',
          '##C.E.e...b.C.b##',
          '##.#.#.#.#.#.#.##',
          '##.#.#.#.#.#.#.##',
          '##.#.#.#.#.#.#.##',
          '##b.b.......e.E##',
          '##.#.#.#.#.#.#.##',
          '#####..e.e..#####',
          '#####.C.B.H.#####',
          '#####.......#####',
          '#################',
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
        // The Scree Slopes — a broad traverse under falling rock, alcoves
        // pocking the ridge above and below the long sightline.
        grid: [
          '#######################',
          '##########bCb.#########',
          '##.bb.####....###.b.b##',
          '##.St.####....###....##',
          '##....######.####....##',
          '###.########.#####.####',
          '#....#..e..#E....#..e.#',
          '#.............e.......#',
          '###.###############.###',
          '##.e..###########.MC..#',
          '##.b..###########..>m.#',
          '##s...###########.....#',
          '#######################',
        ],
        spawn: { families: ['Bird', 'Beast'], tierMin: 3, tierMax: 4, levelBonus: 6 },
      },
      {
        // The Switchbacks — a cliff path of hairpin turns, wind-carved
        // pockets tucked into the folds between them.
        grid: [
          '###################',
          '###################',
          '#S...............##',
          '################.##',
          '##..b...e.E....C.##',
          '##.################',
          '##.C........b.e..##',
          '########beb#####.##',
          '##..........b....##',
          '##.#sbb############',
          '##......e........##',
          '################.##',
          '##.e..H.......Mm>##',
          '###################',
          '###################',
        ],
        spawn: { families: ['Bird', 'Dragon', 'Beast'], tierMin: 3, tierMax: 4, levelBonus: 8 },
      },
      {
        // The Roost Fields — five nesting terraces linked by wind-carved
        // shafts, a long top and bottom corridor stitching them together.
        grid: [
          '#####################',
          '#....e....E.........#',
          '#.t.#...#b..#...#...#',
          '#CS.#.e.#.b.#...#.C.#',
          '##.###.###.###b###.##',
          '##.###.###e###s###.##',
          '##.###.###E###.###.##',
          '##.###.###.###.###.##',
          '#.bb#...#...#.e.#M.b#',
          '#...#Cb.#...#...#.>.#',
          '##.###.###.###.###.##',
          '#...................#',
          '#####################',
        ],
        spawn: { families: ['Bird', 'Dragon'], tierMin: 3, tierMax: 5, levelBonus: 9 },
      },
      {
        // The Eye of the Storm — ring within ring around a walled sanctum;
        // Galewing waits dead center. FINAL FLOOR.
        grid: [
          '###################',
          '#................##',
          '#.S......e......E##',
          '#..######.######.##',
          '#..#b....e....b#.##',
          '#..#..#######..#.##',
          '#.E#..#b.C.b#..#.b#',
          '#..#e.#..B....e#.s#',
          '#..#..#H.e.e#..#.##',
          '#..#..#######..#.##',
          '#..#b.........b#.##',
          '#..#############.##',
          '#.C.............C##',
          '#................##',
          '###################',
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
        // The Descent — a mirrored fortress, still perfectly symmetric;
        // the light of your lamp goes strange in the twin galleries.
        grid: [
          '###################',
          '#########S#########',
          '##tC..........bbbs#',
          '##....###.###....##',
          '#########.#########',
          '##.eb....e....eb.##',
          '##....###.###....##',
          '#########.#########',
          '##.Cb....E....Mb.##',
          '##.e..###.###.>..##',
          '#########.#########',
          '#########.#########',
          '###################',
        ],
        spawn: { families: ['Devil', 'Undead'], tierMin: 4, tierMax: 4, levelBonus: 10 },
      },
      {
        // The Silent Choir — rows of pews face two different directions
        // at once; the symmetry is starting to lie to you.
        grid: [
          '#####################',
          '#...###########.C.b##',
          '#.S.###########.b..##',
          '#...................#',
          '#t.#..#..#E.#.e#..#.#',
          '#...................#',
          '#.....e..b..eb......#',
          '#...................#',
          '#...#eb#..#..#.E#...#',
          '#..b................#',
          '###b############.MC##',
          '##s.############.>m##',
          '#####################',
        ],
        spawn: { families: ['Devil', 'Undead', 'Material'], tierMin: 4, tierMax: 5, levelBonus: 11 },
      },
      {
        // The Inverted Keep — a fortress built downward into nothing;
        // the levels no longer line up, offset room from room.
        grid: [
          '#################',
          '##....###########',
          '##.SCE###########',
          '##....###########',
          '####....eb.######',
          '#######..e.######',
          '#######.bHb######',
          '##.b.....########',
          '##be.b###########',
          '##s...###########',
          '####.####...Cb###',
          '####......Me>m###',
          '#########.....###',
          '#################',
          '#################',
        ],
        spawn: { families: ['Undead', 'Dragon', 'Material'], tierMin: 4, tierMax: 5, levelBonus: 13 },
      },
      {
        // The Last Door — a single corridor snakes wrong turn after wrong
        // turn, false spurs peeling off into dead ends.
        grid: [
          '###################',
          '#S......e........##',
          '##########bs####E##',
          '####.Cb.....e.b..##',
          '####.##############',
          '####t.e..........##',
          '########b###b###.##',
          '####..b.......e..##',
          '####.##############',
          '####......b....C..#',
          '##############M.>.#',
          '###################',
          '###################',
        ],
        spawn: { families: ['Devil', 'Dragon'], tierMin: 4, tierMax: 5, levelBonus: 14 },
      },
      {
        // The Hollow Throne — the grand final approach: a symmetric nave
        // and mirrored chapels give way to one lone, off-rhythm hall as
        // the order breaks down on the walk to the Sovereign. FINAL FLOOR.
        grid: [
          '#########################',
          '##########.eSe.##########',
          '##########.....##########',
          '###.Ceb####.#.####.Cebs##',
          '###H..b####.#.####.b.b###',
          '###....####.#.####.....##',
          '#####.#####.#.######.####',
          '#...E...............E...#',
          '#...#...#.b.#...#b.#....#',
          '#.......................#',
          '##.#######.#.#.##########',
          '#.C.b#####.#.#.##########',
          '#...s.###.e...e.#########',
          '#.bb.####...B...#########',
          '#########.......#########',
          '#########################',
          '#########################',
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
