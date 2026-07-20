// Battle art: large procedural SVG monster sprites, Dark Souls tone.
// Per-family layered silhouettes + per-species accent palettes. Never crashes
// for any speciesId string: unknown ids hash into a family + fallback palette.
import type { ReactElement } from 'react';
import { speciesById } from '../engine/data/species';
import type { MonsterFamily, MonsterRarity } from '../engine/types';

const GOLD = '#c9a227';
const EMBER = '#b3541e';

export interface MonsterArtProps {
  speciesId: string;
  size: number;
  rarity?: MonsterRarity;
  boss?: boolean;
}

/** body = near-black base fill; a/b/c = species accents (main, bright, deep). */
interface Pal {
  body: string;
  a: string;
  b: string;
  c: string;
}

const FAMILY_ORDER: MonsterFamily[] = [
  'Slime',
  'Dragon',
  'Beast',
  'Bird',
  'Plant',
  'Bug',
  'Devil',
  'Undead',
  'Material',
];

/** Slightly varied near-black body fills, one per family. */
const FAMILY_BODY: Record<MonsterFamily, string> = {
  Slime: '#151320',
  Dragon: '#181119',
  Beast: '#141216',
  Bird: '#131219',
  Plant: '#111510',
  Bug: '#141610',
  Devil: '#180f15',
  Undead: '#121318',
  Material: '#121215',
};

/** Explicit accent palette for every species id, keyed off its vibe. */
const SPECIES_ACCENTS: Record<string, [string, string, string]> = {
  // Slime
  goober: ['#6d8f5a', '#9db97a', '#3c5233'],
  bubblim: ['#7396a8', '#a9c4cf', '#43606e'],
  gelKnight: ['#7c8894', '#a9b2bc', '#5f7d54'],
  shimmerOoze: ['#9a86b8', '#6fa8a0', '#c9a227'],
  sovereignSlime: ['#c9a227', '#7a5f9e', '#4c3a66'],
  // Dragon
  drakeling: ['#8a5a3c', '#c97b4a', '#5a3a28'],
  emberwhelp: ['#b3541e', '#e08a4a', '#6e3418'],
  stormDrake: ['#5a7d9e', '#8fb3cf', '#d7c95f'],
  frostWyrm: ['#a8c8d8', '#d8ecf4', '#7396a8'],
  infernoDragon: ['#e06a2a', '#f4a83c', '#b3541e'],
  // Beast
  fangPup: ['#8a8a94', '#c4c4cc', '#5a5a64'],
  bristleBoar: ['#8a6a4a', '#c9a97a', '#5c452f'],
  shadowPanther: ['#4a4456', '#6e6484', '#2a2632'],
  grizzlord: ['#6e523a', '#8f6d4d', '#3e2e20'],
  behemoth: ['#7a6a5a', '#a89478', '#4a4038'],
  // Bird
  peckerel: ['#c9a94a', '#e0c878', '#8a6d2a'],
  mossOwl: ['#6d7d5a', '#94a87a', '#43503a'],
  skyTalon: ['#7d94a8', '#b0c4d4', '#4a5c6e'],
  stormRoc: ['#5f7391', '#d7c95f', '#39465c'],
  phoenixling: ['#e08a3c', '#f4c45f', '#b3541e'],
  // Plant
  sproutling: ['#6d9e5a', '#a0c878', '#3e5c32'],
  thornVine: ['#5c7d46', '#8aa85f', '#7a4a3a'],
  gloomShroom: ['#7a6a94', '#a894c4', '#4c4260'],
  elderTreant: ['#6e5a42', '#8a9e6a', '#43382a'],
  yggdraBlossom: ['#d8a8c4', '#f0d8e4', '#8a6d9e'],
  // Bug
  skitterling: ['#5f6e46', '#8a9e5f', '#3a4430'],
  dartWasp: ['#c9a227', '#e0c85f', '#3a3a2a'],
  lanternMoth: ['#a89ec4', '#d8d0e8', '#c9a227'],
  razorMantis: ['#5f8a5a', '#94c48a', '#374f34'],
  hiveEmpress: ['#c98a27', '#e0b45f', '#6e4c16'],
  // Devil
  impling: ['#8a4a5c', '#b06a7a', '#542e38'],
  grinGoblin: ['#7a5c3a', '#c94a3a', '#a8845c'],
  duskFiend: ['#6e4a8a', '#9a6db8', '#3e2a50'],
  nightTerror: ['#4a3a6e', '#7a5f9e', '#2a2040'],
  archfiend: ['#8a2f2f', '#c9543c', '#4c1a1a'],
  // Undead
  shamblebones: ['#b0a894', '#d4ccb8', '#6e685a'],
  boneshambler: ['#c4bca8', '#8a8474', '#5a544a'],
  wailingWisp: ['#8fb3b8', '#c4e0e4', '#5a7d82'],
  cryptTyrant: ['#7a8a6e', '#a8a894', '#4a5442'],
  lichAscendant: ['#9ec4a8', '#d0e8d8', '#5f8a6e'],
  // Material
  pebblit: ['#7d7a74', '#a8a49c', '#504e48'],
  gargoyle: ['#6e6e78', '#94949e', '#46464e'],
  livingArmor: ['#8a94a4', '#b8c0cc', '#545c68'],
  onyxGolem: ['#c9a227', '#6e6a78', '#4a4650'],
  adamantColossus: ['#b3541e', '#8a94a4', '#5f6672'],
};

/** Muted fallback accent sets for unknown ids (picked by hash). */
const FALLBACK_ACCENTS: [string, string, string][] = [
  ['#7a6a94', '#a894c4', '#4c4260'],
  ['#8a5a3c', '#c97b4a', '#5a3a28'],
  ['#5f7391', '#8fb3cf', '#39465c'],
  ['#6d8f5a', '#9db97a', '#3c5233'],
  ['#8a4a5c', '#b06a7a', '#542e38'],
  ['#b0a894', '#d4ccb8', '#6e685a'],
  ['#7d7a74', '#a8a49c', '#504e48'],
  ['#c9a94a', '#e0c878', '#8a6d2a'],
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small glowing eye pair (radial-glow halo behind a bright core). */
function eyePair(x1: number, x2: number, y: number, r: number, color: string, gid: string): ReactElement {
  return (
    <g>
      <circle cx={x1} cy={y} r={r * 3} fill={`url(#${gid}-eg)`} />
      <circle cx={x2} cy={y} r={r * 3} fill={`url(#${gid}-eg)`} />
      <circle cx={x1} cy={y} r={r} fill={color} />
      <circle cx={x2} cy={y} r={r} fill={color} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Family silhouette renderers. Canvas is 200x200; ground line sits near y=170.
// Each is a layered organic form: body mass, limbs, head, family signature.
// ---------------------------------------------------------------------------

function slimeArt(p: Pal, eye: string, gid: string): ReactElement {
  return (
    <g>
      <path d="M46 150 q-8 16 -3 22 q7 5 10 -6 q2 -9 -7 -16Z" fill={p.body} />
      <path d="M152 146 q10 14 5 22 q-7 6 -11 -5 q-3 -10 6 -17Z" fill={p.body} />
      <path
        d="M100 70 C 132 70 158 96 162 128 C 165 150 152 166 128 170 C 112 173 88 173 72 170 C 48 166 35 150 38 128 C 42 96 68 70 100 70 Z"
        fill={p.body}
      />
      <path
        d="M100 84 C 124 84 144 104 148 128 C 150 144 140 156 122 160 C 108 163 92 163 78 160 C 60 156 50 144 52 128 C 56 104 76 84 100 84 Z"
        fill={p.a}
        opacity="0.16"
      />
      <path d="M74 92 q10 -12 26 -12" stroke={p.b} strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.55" />
      <path d="M64 106 q4 -8 10 -12" stroke={p.b} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.35" />
      <path d="M70 118 q30 -14 60 0 q-6 -10 -30 -10 t-30 10Z" fill={p.c} opacity="0.45" />
      <path d="M86 142 q14 8 28 0" stroke={p.c} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
      {eyePair(82, 118, 124, 4.5, eye, gid)}
    </g>
  );
}

function dragonArt(p: Pal, eye: string, gid: string): ReactElement {
  return (
    <g>
      <path d="M96 96 L48 40 L58 82 L30 62 L52 98 L26 92 L58 114 Z" fill={p.body} opacity="0.75" />
      <path d="M108 92 L168 34 L152 84 L184 62 L156 104 L180 104 L146 122 Z" fill={p.body} />
      <path d="M108 94 L160 46 L148 88 L172 70 L150 106 Z" fill={p.a} opacity="0.22" />
      <path
        d="M78 150 C 46 158 30 148 24 132 C 36 142 52 144 66 138 L 60 128 L 84 130 Z"
        fill={p.body}
      />
      <path d="M24 132 l-10 -8 l4 12 l-10 2 l12 6 Z" fill={p.a} />
      <path
        d="M100 74 C 126 74 142 94 146 116 C 150 140 136 160 108 166 C 86 170 66 162 60 144 C 54 126 66 112 80 106 C 88 88 92 74 100 74 Z"
        fill={p.body}
      />
      <path
        d="M92 112 q-14 10 -12 32 q0 12 12 18"
        stroke={p.b}
        strokeWidth="5"
        fill="none"
        opacity="0.5"
        strokeLinecap="round"
        strokeDasharray="7 5"
      />
      <path
        d="M100 76 C 96 60 100 46 116 40 C 134 34 148 42 150 54 C 152 64 144 70 132 72 L 138 80 L 116 82 C 106 82 102 80 100 76 Z"
        fill={p.body}
      />
      <path d="M118 42 C 112 28 116 16 128 10 C 122 22 124 32 130 40 Z" fill={p.c} />
      <path d="M132 44 C 130 32 136 22 146 18 C 140 28 141 36 146 44 Z" fill={p.c} />
      <path d="M148 58 l16 6 l-14 4 l10 6 l-20 -2 Z" fill={p.body} />
      <path d="M150 62 l8 3 l-7 2 Z" fill={p.a} opacity="0.7" />
      <path d="M96 78 l-6 -10 l12 4 l-2 -12 l10 8 Z" fill={p.c} opacity="0.9" />
      {eyePair(128, 140, 56, 3.5, eye, gid)}
    </g>
  );
}

function beastArt(p: Pal, eye: string, gid: string): ReactElement {
  return (
    <g>
      <path d="M42 118 C 28 110 20 96 24 82 C 30 94 40 102 52 106 Z" fill={p.body} />
      <path d="M70 140 l-6 30 l12 0 l2 -26 Z" fill={p.body} opacity="0.7" />
      <path d="M126 140 l-4 30 l12 0 l0 -26 Z" fill={p.body} opacity="0.7" />
      <path
        d="M48 150 C 40 118 56 88 88 80 C 118 72 146 86 154 108 C 160 124 156 142 146 152 C 130 164 66 164 48 150 Z"
        fill={p.body}
      />
      <path
        d="M56 116 l6 -16 l8 10 l6 -18 l9 12 l7 -18 l9 12 l8 -16 l8 12 l10 -12 l4 14 C 118 84 84 88 56 116 Z"
        fill={p.body}
      />
      <path d="M60 112 l8 -12 l8 8 l8 -14 l8 10" stroke={p.a} strokeWidth="2.5" fill="none" opacity="0.45" />
      <path d="M62 148 l-8 32 l16 0 l4 -28 Z" fill={p.body} />
      <path d="M132 148 l-4 32 l16 0 l2 -28 Z" fill={p.body} />
      <path d="M54 178 l-6 4 l7 1 Z M62 179 l-4 5 l6 0 Z" fill={p.b} />
      <path d="M128 178 l-6 4 l7 1 Z M136 179 l-4 5 l6 0 Z" fill={p.b} />
      <path
        d="M138 104 C 156 100 172 106 178 118 C 182 128 176 138 164 140 L 170 148 L 148 146 C 136 144 130 134 132 122 Z"
        fill={p.body}
      />
      <path d="M144 104 l-4 -14 l12 8 Z M158 102 l0 -14 l10 10 Z" fill={p.body} />
      <path d="M164 140 l8 6 l-10 1 Z" fill={p.b} />
      <path d="M160 142 l2 6 l3 -5 Z" fill={p.b} />
      <path d="M64 132 q-6 8 -4 16 M74 138 q-4 8 -2 14" stroke={p.c} strokeWidth="2.5" fill="none" opacity="0.5" />
      {eyePair(155, 167, 118, 3.5, eye, gid)}
    </g>
  );
}

function birdArt(p: Pal, eye: string, gid: string): ReactElement {
  return (
    <g>
      <path
        d="M92 96 C 62 74 34 68 14 76 C 34 84 44 94 50 106 C 58 100 72 98 92 104 Z"
        fill={p.body}
        opacity="0.8"
      />
      <path d="M20 78 q14 2 26 12 M32 74 q10 4 18 14" stroke={p.a} strokeWidth="2" fill="none" opacity="0.4" />
      <path
        d="M104 98 C 130 66 162 52 188 56 C 172 66 164 76 160 88 C 148 84 138 86 130 92 C 136 96 138 102 138 108 C 124 102 112 102 104 108 Z"
        fill={p.body}
      />
      <path d="M112 100 q22 -20 48 -30" stroke={p.a} strokeWidth="2.5" fill="none" opacity="0.45" />
      <path d="M88 142 L 60 176 L 74 172 L 70 184 L 84 176 L 84 188 L 96 172 Z" fill={p.body} />
      <path d="M84 152 l-14 20 M90 156 l-6 20" stroke={p.c} strokeWidth="2" fill="none" opacity="0.5" />
      <path
        d="M100 88 C 118 92 128 108 126 128 C 124 146 114 158 100 162 C 86 158 76 146 74 128 C 72 108 82 92 100 88 Z"
        fill={p.body}
      />
      <path
        d="M88 122 q6 6 12 0 q6 6 12 0 M90 134 q5 5 10 0 q5 5 10 0"
        stroke={p.b}
        strokeWidth="2.5"
        fill="none"
        opacity="0.5"
      />
      <path
        d="M100 60 C 112 60 120 68 120 78 C 120 86 114 92 106 94 L 94 94 C 86 92 80 86 80 78 C 80 68 88 60 100 60 Z"
        fill={p.body}
      />
      <path d="M92 62 l-2 -12 l8 8 l2 -12 l6 10 l6 -8 l0 12 Z" fill={p.c} />
      <path d="M96 86 L 104 86 L 102 98 C 101 102 99 102 98 98 Z" fill={p.b} />
      <path d="M92 160 l-4 14 l6 0 l2 -12 Z M106 160 l2 14 l6 0 l-4 -12 Z" fill={p.body} />
      <path
        d="M86 174 l-5 5 l7 1 Z M94 175 l-3 6 l6 0 Z M112 174 l5 5 l-7 1 Z M104 175 l3 6 l-6 0 Z"
        fill={p.b}
      />
      {eyePair(91, 109, 76, 3.5, eye, gid)}
    </g>
  );
}

function plantArt(p: Pal, eye: string, gid: string): ReactElement {
  return (
    <g>
      <path
        d="M74 170 C 64 156 60 146 64 134 L 76 142 L 80 128 L 92 140 L 100 126 L 108 140 L 120 128 L 124 142 L 136 134 C 140 146 136 156 126 170 Z"
        fill={p.body}
      />
      <path
        d="M84 140 C 80 116 84 96 96 84 L 104 84 C 116 96 120 116 116 140 C 108 148 92 148 84 140 Z"
        fill={p.body}
      />
      <path d="M92 96 q-4 20 0 40 M108 96 q4 20 0 40" stroke={p.c} strokeWidth="2.5" fill="none" opacity="0.5" />
      <path
        d="M84 120 C 66 116 54 104 52 88 C 62 98 72 102 84 102"
        stroke={p.body}
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M116 116 C 136 112 148 100 150 84 C 140 94 128 98 116 98"
        stroke={p.body}
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M56 90 l-8 -6 l4 10 Z M148 86 l8 -6 l-4 10 Z" fill={p.a} />
      <path
        d="M100 84 C 78 84 62 72 60 56 C 72 62 82 62 90 58 C 88 46 94 36 104 32 C 104 42 108 50 116 54 C 128 50 140 54 146 64 C 136 66 128 72 124 80 C 116 86 108 86 100 84 Z"
        fill={p.a}
        opacity="0.85"
      />
      <path
        d="M100 84 C 86 82 76 74 74 64 M104 82 C 114 78 122 70 124 62"
        stroke={p.b}
        strokeWidth="2.5"
        fill="none"
        opacity="0.5"
      />
      <circle cx="102" cy="62" r="7" fill={p.b} opacity="0.9" />
      <path d="M70 106 q-8 10 -2 20 q8 -6 2 -20Z M132 102 q10 8 6 20 q-10 -4 -6 -20Z" fill={p.a} opacity="0.8" />
      {eyePair(90, 112, 112, 4, eye, gid)}
    </g>
  );
}

function bugArt(p: Pal, eye: string, gid: string): ReactElement {
  return (
    <g>
      <path
        d="M78 128 L 46 118 L 30 134 M78 140 L 44 142 L 30 158 M84 150 L 60 164 L 54 180 M122 128 L 154 118 L 170 134 M122 140 L 156 142 L 170 158 M116 150 L 140 164 L 146 180"
        stroke={p.body}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M100 122 C 124 122 140 136 140 152 C 140 166 122 176 100 176 C 78 176 60 166 60 152 C 60 136 76 122 100 122 Z"
        fill={p.body}
      />
      <path
        d="M68 142 q32 -10 64 0 M66 154 q34 -10 68 0 M72 165 q28 -8 56 0"
        stroke={p.a}
        strokeWidth="2.5"
        fill="none"
        opacity="0.55"
      />
      <path
        d="M100 96 C 116 96 126 106 126 118 C 126 128 116 134 100 134 C 84 134 74 128 74 118 C 74 106 84 96 100 96 Z"
        fill={p.body}
      />
      <path d="M100 98 l0 34" stroke={p.c} strokeWidth="2" opacity="0.5" />
      <path d="M84 106 q6 -6 14 -6" stroke={p.b} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" />
      <path
        d="M100 68 C 112 68 120 76 120 86 C 120 94 112 100 100 100 C 88 100 80 94 80 86 C 80 76 88 68 100 68 Z"
        fill={p.body}
      />
      <path
        d="M88 96 C 80 104 78 112 82 118 C 84 110 88 104 94 100 Z M112 96 C 120 104 122 112 118 118 C 116 110 112 104 106 100 Z"
        fill={p.c}
      />
      <path
        d="M92 70 C 84 58 76 52 66 50 M108 70 C 116 58 124 52 134 50"
        stroke={p.body}
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="66" cy="50" r="3.5" fill={p.a} />
      <circle cx="134" cy="50" r="3.5" fill={p.a} />
      {eyePair(92, 108, 84, 4, eye, gid)}
    </g>
  );
}

function devilArt(p: Pal, eye: string, gid: string): ReactElement {
  return (
    <g>
      <path d="M74 92 C 52 84 40 68 40 50 C 52 62 62 68 74 70 L 70 106 Z" fill={p.body} opacity="0.8" />
      <path d="M126 92 C 148 84 160 68 160 50 C 148 62 138 68 126 70 L 130 106 Z" fill={p.body} opacity="0.8" />
      <path
        d="M118 150 C 142 152 156 144 160 128 C 152 136 142 138 132 136"
        stroke={p.body}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M158 130 l12 -8 l-4 14 l10 2 l-14 6 Z" fill={p.a} />
      <path d="M84 140 L 78 172 L 68 178 L 88 178 L 92 146 Z" fill={p.body} />
      <path d="M116 140 L 122 172 L 132 178 L 112 178 L 108 146 Z" fill={p.body} />
      <path
        d="M100 78 C 120 80 130 94 128 114 C 126 132 116 146 100 150 C 84 146 74 132 72 114 C 70 94 80 80 100 78 Z"
        fill={p.body}
      />
      <path d="M100 104 l7 10 l-7 10 l-7 -10 Z" fill="none" stroke={p.a} strokeWidth="2" opacity="0.7" />
      <path d="M76 96 C 62 104 56 116 58 128 L 50 138 L 64 136 L 70 124 Z" fill={p.body} />
      <path d="M124 96 C 138 104 144 116 142 128 L 150 138 L 136 136 L 130 124 Z" fill={p.body} />
      <path
        d="M50 138 l-6 6 M54 140 l-4 8 M150 138 l6 6 M146 140 l4 8"
        stroke={p.b}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M100 48 C 114 48 124 58 124 70 C 124 82 114 90 100 90 C 86 90 76 82 76 70 C 76 58 86 48 100 48 Z"
        fill={p.body}
      />
      <path d="M86 52 C 78 42 76 30 82 20 C 84 32 88 40 96 46 Z" fill={p.c} />
      <path d="M114 52 C 122 42 124 30 118 20 C 116 32 112 40 104 46 Z" fill={p.c} />
      <path d="M78 66 l-12 -4 l10 10 Z M122 66 l12 -4 l-10 10 Z" fill={p.body} />
      <path d="M90 80 q10 6 20 0" stroke={p.a} strokeWidth="2" fill="none" opacity="0.8" />
      {eyePair(91, 109, 68, 3.5, eye, gid)}
    </g>
  );
}

function undeadArt(p: Pal, eye: string, gid: string): ReactElement {
  return (
    <g>
      <path d="M60 150 C 48 156 44 166 48 176 C 54 168 60 164 68 162 Z" fill={p.body} opacity="0.5" />
      <path d="M140 148 C 152 156 156 166 152 176 C 146 168 140 164 132 162 Z" fill={p.body} opacity="0.5" />
      <path
        d="M100 50 C 124 54 136 74 136 100 C 136 122 140 140 148 154 L 134 148 L 130 166 L 118 152 L 112 172 L 100 154 L 88 172 L 82 152 L 70 166 L 66 148 L 52 154 C 60 140 64 122 64 100 C 64 74 76 54 100 50 Z"
        fill={p.body}
      />
      <path
        d="M84 84 q-4 34 -8 58 M100 80 q0 36 0 62 M116 84 q4 34 8 58"
        stroke={p.c}
        strokeWidth="2.5"
        fill="none"
        opacity="0.45"
      />
      <path
        d="M88 96 q12 6 24 0 M90 106 q10 5 20 0 M92 116 q8 4 16 0"
        stroke={p.a}
        strokeWidth="2"
        fill="none"
        opacity="0.5"
      />
      <path
        d="M100 44 C 116 44 126 54 126 68 C 126 80 116 88 100 88 C 84 88 74 80 74 68 C 74 54 84 44 100 44 Z"
        fill={p.body}
      />
      <path
        d="M100 50 C 111 50 119 57 119 68 C 119 77 111 83 100 83 C 89 83 81 77 81 68 C 81 57 89 50 100 50 Z"
        fill="#07060a"
      />
      <path
        d="M62 118 l-10 8 M60 122 l-8 12 M58 118 l-12 4 M138 118 l10 8 M140 122 l8 12 M142 118 l12 4"
        stroke={p.a}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {eyePair(92, 108, 68, 3.5, eye, gid)}
    </g>
  );
}

function materialArt(p: Pal, eye: string, gid: string): ReactElement {
  return (
    <g>
      <path d="M70 140 L 64 174 L 88 174 L 90 144 Z" fill={p.body} />
      <path d="M130 140 L 136 174 L 112 174 L 110 144 Z" fill={p.body} />
      <path d="M62 174 l28 0 M110 174 l28 0" stroke={p.c} strokeWidth="3" opacity="0.6" />
      <path d="M58 84 L 38 96 L 34 128 L 46 148 L 62 144 L 56 120 L 64 100 Z" fill={p.body} />
      <path d="M142 84 L 162 96 L 166 128 L 154 148 L 138 144 L 144 120 L 136 100 Z" fill={p.body} />
      <path d="M34 146 l24 -4 l2 16 l-24 4 Z" fill={p.body} />
      <path d="M166 146 l-24 -4 l-2 16 l24 4 Z" fill={p.body} />
      <path d="M66 78 L 134 78 L 142 100 L 136 142 L 110 150 L 90 150 L 64 142 L 58 100 Z" fill={p.body} />
      <path d="M52 72 L 84 64 L 90 84 L 58 92 Z" fill={p.body} />
      <path d="M148 72 L 116 64 L 110 84 L 142 92 Z" fill={p.body} />
      <path d="M56 76 l28 -7 M144 76 l-28 -7" stroke={p.a} strokeWidth="2" opacity="0.5" />
      <path
        d="M100 92 l-6 14 l8 6 l-4 16 M112 96 l6 12 l-8 8"
        stroke={p.a}
        strokeWidth="2.5"
        fill="none"
        opacity="0.9"
        strokeLinecap="round"
      />
      <path d="M100 118 l7 -6 l-3 12 Z" fill={p.b} opacity="0.8" />
      <path d="M84 44 L 116 44 L 122 58 L 118 74 L 82 74 L 78 58 Z" fill={p.body} />
      <path d="M84 60 l32 0" stroke={p.c} strokeWidth="2.5" opacity="0.6" />
      {eyePair(92, 108, 56, 3.5, eye, gid)}
    </g>
  );
}

const FAMILY_RENDERERS: Record<MonsterFamily, (p: Pal, eye: string, gid: string) => ReactElement> = {
  Slime: slimeArt,
  Dragon: dragonArt,
  Beast: beastArt,
  Bird: birdArt,
  Plant: plantArt,
  Bug: bugArt,
  Devil: devilArt,
  Undead: undeadArt,
  Material: materialArt,
};

export function MonsterArt({ speciesId, size, rarity = 'Common', boss = false }: MonsterArtProps) {
  const species = speciesById(speciesId);
  const h = hashString(speciesId);
  const family: MonsterFamily = species?.family ?? FAMILY_ORDER[h % FAMILY_ORDER.length];
  const accents = SPECIES_ACCENTS[speciesId] ?? FALLBACK_ACCENTS[h % FALLBACK_ACCENTS.length];
  const p: Pal = { body: FAMILY_BODY[family], a: accents[0], b: accents[1], c: accents[2] };
  const eye = boss || family === 'Devil' ? '#d06a2e' : GOLD;
  const gid = `ma${h.toString(36)}${boss ? 'b' : ''}${rarity === 'Common' ? '' : rarity.toLowerCase()}`;

  const tier = species?.tier ?? 3;
  const scale = (0.88 + tier * 0.045) * (boss ? 1.12 : 1);
  const rim = rarity === 'Rare' ? EMBER : rarity === 'Alpha' ? GOLD : null;

  const render = FAMILY_RENDERERS[family];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={species?.name ?? speciesId}
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id={`${gid}-eg`}>
          <stop offset="0%" stopColor={eye} stopOpacity="0.85" />
          <stop offset="100%" stopColor={eye} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${gid}-fog`}>
          <stop offset="0%" stopColor="#d8d4c8" stopOpacity="0.11" />
          <stop offset="100%" stopColor="#d8d4c8" stopOpacity="0" />
        </radialGradient>
        {boss ? (
          <radialGradient id={`${gid}-aura`}>
            <stop offset="0%" stopColor={EMBER} stopOpacity="0.32" />
            <stop offset="100%" stopColor={EMBER} stopOpacity="0" />
          </radialGradient>
        ) : null}
        {rim ? (
          <filter id={`${gid}-rim`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation={rarity === 'Alpha' ? 2.5 : 4}
              floodColor={rim}
              floodOpacity="0.85"
            />
          </filter>
        ) : null}
      </defs>

      {/* faint fog drifting near the ground */}
      <ellipse cx="62" cy="148" rx="72" ry="30" fill={`url(#${gid}-fog)`} />
      <ellipse cx="142" cy="160" rx="64" ry="24" fill={`url(#${gid}-fog)`} />

      {/* boss aura glow behind the silhouette */}
      {boss ? <ellipse cx="100" cy="118" rx="88" ry="84" fill={`url(#${gid}-aura)`} /> : null}

      {/* soft ground shadow */}
      <ellipse cx="100" cy="173" rx={boss ? 66 : 56} ry="9" fill="#000" opacity="0.55" />

      {/* the silhouette, scaled by tier (and boss), rim-glowed by rarity */}
      <g
        transform={`translate(100 128) scale(${scale.toFixed(3)}) translate(-100 -128)`}
        filter={rim ? `url(#${gid}-rim)` : undefined}
      >
        {render(p, eye, gid)}
      </g>

      {/* boss menace: drifting embers */}
      {boss ? (
        <g fill={EMBER}>
          <circle cx="48" cy="96" r="1.8" opacity="0.8" />
          <circle cx="160" cy="76" r="1.4" opacity="0.7" />
          <circle cx="38" cy="60" r="1.2" opacity="0.55" />
          <circle cx="146" cy="126" r="1.6" opacity="0.7" />
          <circle cx="170" cy="46" r="1.1" opacity="0.5" />
          <circle cx="64" cy="38" r="1.3" opacity="0.5" />
        </g>
      ) : null}
    </svg>
  );
}
