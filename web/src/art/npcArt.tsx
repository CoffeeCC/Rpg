// Tavern & town NPC portraits: bust-framed procedural SVG, cold-ash dark
// fantasy palette with one warm gold-candlelight accent per character (see
// heroArt.tsx / monsterArt.tsx for the sibling idiom this matches). Each NPC
// in engine/data/npcs.ts gets a distinct silhouette — headwear, hair, build,
// and a prop drawn from their actual role — plus a hooded-stranger fallback
// for any id this file doesn't recognize.
import type { ReactElement } from 'react';

/** Accent hex per NPC id — also used by the dialogue UI to tint their lines. */
export const NPC_ACCENTS: Record<string, string> = {
  dovey: '#c9862a', // amber ale
  bram: '#6f8aa8', // steel-blue watch
  maribel: '#9a86b8', // lavender wool
  ott: '#b0854a', // hay / leather ochre
  kess: '#c9432e', // rival crimson
  casque: '#e0c878', // candle cream-gold
  rowan: '#7a9e5a', // moss green
  fennick: '#8a7d94', // slate-violet mourning
  sess: '#e0a83c', // lantern amber
  grude: '#b34f28', // forge-ember rust
};

const UNKNOWN_ACCENT = '#8a94a4';

/** Ordinary skin tones — a touch cooler/paler for the eldest characters. */
const SKIN = '#c2a184';
const SKIN_PALE = '#c7bba8';

/** Small plain dark eyes — these are mortals lit by lamplight, not glowing monsters. */
function eyes(x1: number, x2: number, y: number, r = 2.2): ReactElement {
  return (
    <g fill="#211a14">
      <circle cx={x1} cy={y} r={r} />
      <circle cx={x2} cy={y} r={r} />
    </g>
  );
}

/** Warm rim-light stroke along the right edge of the head, from candlelight
 * off-frame. Shared across every portrait for a consistent tavern glow. */
function rim(cx: number, cy: number, r: number, gid: string): ReactElement {
  return (
    <path
      d={`M ${cx + r * 0.32} ${cy - r * 0.94} A ${r} ${r} 0 0 1 ${cx + r * 0.32} ${cy + r * 0.94}`}
      stroke="#f0c87a"
      strokeWidth={2.4}
      strokeLinecap="round"
      fill="none"
      opacity={0.55}
      filter={`url(#${gid}-rim)`}
    />
  );
}

// ---------------------------------------------------------------------------
// Per-NPC busts. Canvas is 200x200; head centered near (100, 92), shoulders
// fill/crop the bottom of the frame (portrait framing, not full body).
// ---------------------------------------------------------------------------

/** Innkeeper Dovey: round, warm, kerchief tied over greying hair, tankard
 * raised near the shoulder, apron ties at the collar. */
function doveyArt(gid: string): ReactElement {
  const garment = '#171310';
  const a = NPC_ACCENTS.dovey;
  return (
    <g>
      <path d="M40 150 C 44 122 68 108 100 108 C 132 108 156 122 160 150 L 160 200 L 40 200 Z" fill={garment} />
      <path d="M78 130 q22 -8 44 0" stroke={a} strokeWidth="3" fill="none" opacity="0.7" />
      <path d="M92 132 L 96 152 L 104 152 L 108 132 Z" fill={a} opacity="0.5" />
      <path d="M84 108 L 82 128 L 92 128 L 92 108 Z M 108 108 L 108 128 L 118 128 L 116 108 Z" fill={SKIN} />
      <circle cx="100" cy="88" r="34" fill={SKIN} />
      {/* kerchief over the crown, hair peeking at the sides */}
      <path d="M68 78 C 70 56 88 46 100 46 C 112 46 130 56 132 78 C 118 70 82 70 68 78 Z" fill={a} />
      <path d="M100 46 C 96 40 100 34 108 34 L 106 44 Z" fill={a} />
      <path d="M66 92 q-8 6 -6 20 M134 92 q8 6 6 20" stroke="#4a3a28" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.85" />
      <path d="M70 76 q30 -10 60 0" stroke="#0c0a08" strokeWidth="2" fill="none" opacity="0.4" />
      {eyes(90, 110, 90)}
      <path d="M92 104 q8 4 16 0" stroke="#5a3a28" strokeWidth="2" fill="none" opacity="0.6" />
      {/* tankard raised at the shoulder */}
      <g transform="translate(148 116)">
        <path d="M0 10 L26 10 L24 32 L2 32 Z" fill="#5c452f" />
        <path d="M2 12 L24 12" stroke={a} strokeWidth="2" opacity="0.7" />
        <path d="M26 14 C 34 14 34 26 26 26" fill="none" stroke="#5c452f" strokeWidth="4" />
        <ellipse cx="13" cy="10" rx="13" ry="3" fill="#e6cf7a" opacity="0.85" />
      </g>
      {rim(100, 88, 34, gid)}
    </g>
  );
}

/** Watch Captain Bram: stern, close-cropped grey, an open-faced watch helm
 * with a brow guard, gorget collar, sword hilt at the shoulder. */
function bramArt(gid: string): ReactElement {
  const garment = '#12141a';
  const a = NPC_ACCENTS.bram;
  return (
    <g>
      <path d="M42 152 C 46 122 70 108 100 108 C 130 108 154 122 158 152 L 158 200 L 42 200 Z" fill={garment} />
      {/* gorget / high collar */}
      <path d="M78 108 L 100 128 L 122 108 L 122 118 L 100 138 L 78 118 Z" fill="#2a2e36" stroke={a} strokeWidth="1.5" />
      <path d="M84 108 L 84 126 L 92 126 L 92 108 Z M 108 108 L 108 126 L 116 126 L 116 108 Z" fill={SKIN} />
      <circle cx="100" cy="86" r="33" fill={SKIN} />
      {/* open-faced helm with brow guard */}
      <path d="M66 82 C 66 56 82 40 100 40 C 118 40 134 56 134 82 L 124 82 C 124 60 114 50 100 50 C 86 50 76 60 76 82 Z" fill="#232830" stroke={a} strokeWidth="2" />
      <path d="M70 74 L 130 74 L 128 82 L 72 82 Z" fill="#1a1e24" />
      <path d="M96 40 L 104 40 L 106 34 L 94 34 Z" fill={a} />
      {eyes(90, 110, 90)}
      <path d="M84 106 q16 6 32 0" stroke="#3a3028" strokeWidth="2" fill="none" opacity="0.55" />
      {/* pauldron edge + sword hilt at the far shoulder */}
      <path d="M124 112 C 140 108 154 114 156 128 C 156 136 148 140 140 138 L 136 122 Z" fill="#1e2228" stroke={a} strokeWidth="1.5" />
      <path d="M146 128 L 146 172" stroke="#3a3d44" strokeWidth="5" />
      <path d="M138 132 L 154 132 L 154 138 L 138 138 Z" fill={a} opacity="0.85" />
      <circle cx="146" cy="128" r="5" fill={a} />
      {rim(100, 86, 33, gid)}
    </g>
  );
}

/** Old Maribel: a widow's shawl tied over white hair like a hood, knitting
 * needles and a wool skein held near the shoulder. */
function maribelArt(gid: string): ReactElement {
  const garment = '#151013';
  const a = NPC_ACCENTS.maribel;
  return (
    <g>
      <path d="M40 154 C 44 124 68 110 100 110 C 132 110 156 124 160 154 L 160 200 L 40 200 Z" fill={garment} />
      <path d="M84 110 L 84 128 L 92 128 L 92 110 Z M 108 110 L 108 128 L 116 128 L 116 110 Z" fill={SKIN_PALE} />
      <circle cx="100" cy="88" r="32" fill={SKIN_PALE} />
      {/* shawl drawn over the head like a soft hood, tied under the chin */}
      <path d="M62 92 C 58 58 76 34 100 34 C 124 34 142 58 138 92 C 138 70 122 52 100 52 C 78 52 62 70 62 92 Z" fill={garment} stroke={a} strokeWidth="2" />
      <path d="M86 104 C 90 112 110 112 114 104" stroke={a} strokeWidth="2.5" fill="none" opacity="0.7" />
      <path d="M70 90 q6 -6 8 -16 M130 90 q-6 -6 -8 -16" stroke="#d8d2c4" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" />
      {eyes(90, 110, 90)}
      <path d="M90 104 q10 3 20 0" stroke="#6a5a5a" strokeWidth="1.6" fill="none" opacity="0.5" />
      <path d="M78 96 q4 6 2 12 M122 96 q-4 6 -2 12" stroke="#a8988a" strokeWidth="1.2" fill="none" opacity="0.4" />
      {/* crossed knitting needles + wool skein at the shoulder */}
      <g transform="translate(140 122)">
        <circle cx="8" cy="8" r="10" fill="none" stroke={a} strokeWidth="3" opacity="0.85" />
        <circle cx="8" cy="8" r="5" fill="none" stroke={a} strokeWidth="1.6" opacity="0.5" />
        <path d="M-6 -8 L 20 30" stroke="#8a9098" strokeWidth="2" strokeLinecap="round" />
        <path d="M22 -8 L -4 30" stroke="#8a9098" strokeWidth="2" strokeLinecap="round" />
      </g>
      {rim(100, 88, 32, gid)}
    </g>
  );
}

/** Stablemaster Ott: broad, weathered, a flat brimmed cap, a wisp of straw
 * tucked behind the ear, a horseshoe pendant at the collar. */
function ottArt(gid: string): ReactElement {
  const garment = '#14120d';
  const a = NPC_ACCENTS.ott;
  return (
    <g>
      <path d="M38 154 C 44 122 70 106 100 106 C 130 106 156 122 162 154 L 162 200 L 38 200 Z" fill={garment} />
      <path d="M86 106 q14 6 28 0 l -2 14 l -24 0 Z" fill="#2a2318" />
      <circle cx="100" cy="164" r="9" fill="none" stroke={a} strokeWidth="2.4" opacity="0.8" />
      <path d="M84 108 L 82 128 L 92 128 L 92 108 Z M 108 108 L 108 128 L 118 128 L 116 108 Z" fill={SKIN} />
      <circle cx="100" cy="86" r="34" fill={SKIN} />
      {/* flat brimmed cap */}
      <ellipse cx="100" cy="58" rx="34" ry="7" fill="#2a2318" />
      <path d="M76 58 C 76 42 86 32 100 32 C 114 32 124 42 124 58 C 112 52 88 52 76 58 Z" fill="#332a1c" stroke={a} strokeWidth="1.6" />
      {/* straw wisp behind the ear */}
      <path d="M132 78 l14 -10 M132 80 l16 -4 M132 82 l14 2" stroke="#c9a94a" strokeWidth="1.6" opacity="0.75" />
      <path d="M68 96 q6 -8 14 -10 M132 96 q-6 -8 -14 -10" stroke="#4a3a24" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.7" />
      {eyes(90, 110, 90)}
      <path d="M84 104 q16 8 32 0" stroke="#5a3a24" strokeWidth="2.4" fill="none" opacity="0.6" />
      {rim(100, 86, 34, gid)}
    </g>
  );
}

/** Kess the Rival: young, fierce, tight headband, twin dagger hilts crossed
 * behind the shoulders, a sharp ponytail whipped to one side. */
function kessArt(gid: string): ReactElement {
  const garment = '#0f130f';
  const a = NPC_ACCENTS.kess;
  return (
    <g>
      <path d="M44 152 C 48 122 72 108 100 108 C 128 108 152 122 156 152 L 156 200 L 44 200 Z" fill={garment} />
      {/* crossed dagger hilts peeking over the shoulders */}
      <g transform="rotate(24 62 130)">
        <path d="M58 96 L66 94 L70 130 L60 132 Z" fill="#8a94a4" />
        <path d="M56 88 L70 84 L72 92 L58 96 Z" fill={a} />
      </g>
      <g transform="rotate(-24 138 130)">
        <path d="M134 96 L142 94 L138 132 L128 130 Z" fill="#8a94a4" />
        <path d="M130 88 L144 84 L142 92 L132 96 Z" fill={a} />
      </g>
      <path d="M84 108 L 82 126 L 92 126 L 92 108 Z M 108 108 L 108 126 L 118 126 L 116 108 Z" fill={SKIN} />
      <circle cx="100" cy="86" r="32" fill={SKIN} />
      {/* windswept ponytail thrown to one side */}
      <path d="M124 66 C 148 70 160 90 152 116 C 148 108 140 100 130 96 C 136 88 132 74 124 66 Z" fill="#241812" />
      <path d="M70 66 C 84 52 116 52 130 66 C 116 58 84 58 70 66 Z" fill="#241812" />
      {/* tight headband */}
      <path d="M68 72 q32 -14 64 0" stroke={a} strokeWidth="4" fill="none" opacity="0.85" />
      {eyes(90, 110, 88, 2.4)}
      <path d="M86 102 q14 -4 28 0" stroke="#6a2a20" strokeWidth="2" fill="none" opacity="0.6" />
      {rim(100, 86, 32, gid)}
    </g>
  );
}

/** Brother Casque: hood drawn deep in shadow, mostly-hidden tonsured head,
 * a small candle held up near the chest, rope-cinched collar. */
function casqueArt(gid: string): ReactElement {
  const garment = '#151013';
  const a = NPC_ACCENTS.casque;
  return (
    <g>
      <path d="M40 154 C 44 122 68 108 100 108 C 132 108 156 122 160 154 L 160 200 L 40 200 Z" fill={garment} />
      <path d="M84 128 q16 8 32 0" stroke={a} strokeWidth="2" fill="none" opacity="0.5" />
      {/* deep hood, void-dark interior like the friar keeps his face for prayer */}
      <path d="M60 96 C 56 58 76 32 100 32 C 124 32 144 58 140 96 C 138 70 122 46 100 46 C 78 46 62 70 60 96 Z" fill={garment} />
      <path d="M70 96 C 68 68 82 52 100 52 C 118 52 132 68 130 96 C 122 82 108 76 100 76 C 92 76 78 82 70 96 Z" fill="#08070a" />
      <circle cx="100" cy="82" r="30" fill={SKIN_PALE} opacity="0.9" />
      <path d="M76 88 C 76 68 86 56 100 56 C 114 56 124 68 124 88 L 116 88 C 116 72 108 64 100 64 C 92 64 84 72 84 88 Z" fill={garment} opacity="0.94" />
      {eyes(90, 110, 90, 2)}
      <path d="M92 102 q8 3 16 0" stroke="#5a4a42" strokeWidth="1.6" fill="none" opacity="0.5" />
      {/* candle held near the chest, warm halo */}
      <g transform="translate(94 138)">
        <rect x="0" y="6" width="6" height="20" fill="#d8cfa8" />
        <path d="M3 6 q-2 -8 0 -12 q2 4 0 12 Z" fill="#f0c878" />
        <circle cx="3" cy="0" r="9" fill={`url(#${gid}-glow)`} />
      </g>
      {rim(100, 82, 30, gid)}
    </g>
  );
}

/** Elder Rowan: ancient, a leaf-and-twig circlet in long white hair, a
 * full braided beard, the carved leaf-top of a staff at the shoulder. */
function rowanArt(gid: string): ReactElement {
  const garment = '#111510';
  const a = NPC_ACCENTS.rowan;
  return (
    <g>
      <path d="M42 152 C 46 122 70 108 100 108 C 130 108 154 122 158 152 L 158 200 L 42 200 Z" fill={garment} />
      <path d="M84 108 L 82 126 L 92 126 L 92 108 Z M 108 108 L 108 126 L 118 126 L 116 108 Z" fill={SKIN_PALE} />
      <circle cx="100" cy="84" r="32" fill={SKIN_PALE} />
      {/* long braided beard covering the lower face and chest */}
      <path d="M78 98 C 76 122 80 146 92 152 L 108 152 C 120 146 124 122 122 98 C 108 108 92 108 78 98 Z" fill="#c8c2b0" />
      <path d="M88 112 l0 30 M100 116 l0 34 M112 112 l0 30" stroke="#8a8474" strokeWidth="1.6" opacity="0.5" />
      {/* long hair swept back */}
      <path d="M68 76 C 66 54 80 38 100 38 C 120 38 134 54 132 76 C 120 66 80 66 68 76 Z" fill="#d4ccb8" />
      {/* leaf-and-twig circlet */}
      <path d="M70 68 q30 -12 60 0" stroke="#5c452f" strokeWidth="3" fill="none" opacity="0.8" />
      <path d="M86 62 q4 -8 10 -2 q6 -6 8 4 q-8 4 -18 -2Z M112 66 q4 -6 10 0 q4 6 -4 8 q-6 -2 -6 -8Z" fill={a} opacity="0.85" />
      {eyes(90, 110, 88)}
      {/* leaf-carved staff top at the shoulder */}
      <g transform="translate(144 108)">
        <path d="M0 0 L0 70" stroke="#4a3a26" strokeWidth="4" />
        <path d="M-2 -4 q-10 -6 -4 -16 q10 2 8 16Z M2 -4 q10 -6 4 -16 q-10 2 -8 16Z" fill={a} />
      </g>
      {rim(100, 84, 32, gid)}
    </g>
  );
}

/** Gravedigger Fennick: gaunt, a flat mourning hat with a low brim shading
 * the eyes, high buttoned collar, a shovel resting over one shoulder. */
function fennickArt(gid: string): ReactElement {
  const garment = '#121318';
  const a = NPC_ACCENTS.fennick;
  return (
    <g>
      <path d="M42 154 C 46 124 70 110 100 110 C 130 110 154 124 158 154 L 158 200 L 42 200 Z" fill={garment} />
      <path d="M84 112 q16 8 32 0 l0 10 l-32 0Z" fill="#080810" />
      <circle cx="100" cy="120" r="3.5" fill={a} opacity="0.8" />
      <path d="M86 110 L 84 128 L 92 128 L 92 110 Z M 108 110 L 108 128 L 118 128 L 116 110 Z" fill={SKIN} />
      <circle cx="100" cy="88" r="31" fill={SKIN} />
      {/* low, flat-brimmed mourning hat, brim shading the eyes */}
      <ellipse cx="100" cy="66" rx="36" ry="7" fill="#0c0d12" stroke={a} strokeWidth="1.4" />
      <path d="M78 66 C 78 50 88 40 100 40 C 112 40 122 50 122 66 C 110 60 90 60 78 66 Z" fill="#101118" />
      <ellipse cx="100" cy="76" rx="26" ry="10" fill="#000" opacity="0.35" />
      {eyes(90, 110, 84, 2)}
      <path d="M88 102 q12 3 24 0" stroke="#3a3230" strokeWidth="1.6" fill="none" opacity="0.5" />
      {/* shovel resting diagonally over the shoulder */}
      <g transform="rotate(-30 132 100)">
        <path d="M130 20 L136 20 L134 148 L132 148 Z" fill="#5c452f" />
        <path d="M122 108 L 144 108 L 142 132 L 124 132 Z" fill="#8a94a4" stroke={a} strokeWidth="1.4" />
      </g>
      {rim(100, 88, 31, gid)}
    </g>
  );
}

/** Lamplighter Sess: wiry, a tight practical cap, a small lantern held up
 * near the cheek casting its own warm glow, the long lighting-pole angled
 * over the far shoulder. */
function sessArt(gid: string): ReactElement {
  const garment = '#151013';
  const a = NPC_ACCENTS.sess;
  return (
    <g>
      <path d="M42 152 C 46 122 70 108 100 108 C 130 108 154 122 158 152 L 158 200 L 42 200 Z" fill={garment} />
      <path d="M84 108 L 82 126 L 92 126 L 92 108 Z M 108 108 L 108 126 L 118 126 L 116 108 Z" fill={SKIN} />
      <circle cx="100" cy="86" r="31" fill={SKIN} />
      {/* tight practical cap */}
      <path d="M70 78 C 68 56 82 44 100 44 C 118 44 132 56 130 78 C 118 70 82 70 70 78 Z" fill="#242018" stroke={a} strokeWidth="1.4" />
      <path d="M74 62 q26 -10 52 0" stroke="#0c0a08" strokeWidth="2" fill="none" opacity="0.4" />
      {eyes(90, 110, 88, 2.2)}
      <path d="M86 102 q14 4 28 0" stroke="#5a4030" strokeWidth="1.8" fill="none" opacity="0.55" />
      {/* long lighting-pole over the far shoulder */}
      <g transform="rotate(20 130 90)">
        <path d="M128 10 L132 10 L130 170 L126 170 Z" fill="#3a2c1e" />
      </g>
      {/* lantern held up near the cheek, its own warm halo */}
      <g transform="translate(46 96)">
        <circle cx="0" cy="0" r="16" fill={`url(#${gid}-glow)`} />
        <rect x="-8" y="-10" width="16" height="20" rx="2" fill="#3a3226" stroke={a} strokeWidth="1.6" />
        <rect x="-5" y="-7" width="10" height="14" fill="#f0c878" opacity="0.85" />
        <path d="M-9 -12 L9 -12 L6 -16 L-6 -16 Z" fill="#3a3226" />
      </g>
      {rim(100, 86, 31, gid)}
    </g>
  );
}

/** Fallback for any id not in the roster: a faceless hooded stranger, void
 * beneath the hood but for a single dim ember of candlelight. */
function hoodedStrangerArt(gid: string): ReactElement {
  const garment = '#100e10';
  return (
    <g>
      <path d="M40 156 C 44 124 68 108 100 108 C 132 108 156 124 160 156 L 160 200 L 40 200 Z" fill={garment} />
      <path
        d="M58 100 C 52 58 74 30 100 30 C 126 30 148 58 142 100 C 140 72 122 50 100 50 C 78 50 60 72 58 100 Z"
        fill={garment}
      />
      <path
        d="M70 98 C 68 70 82 54 100 54 C 118 54 132 70 130 98 C 122 82 108 76 100 76 C 92 76 78 82 70 98 Z"
        fill="#020103"
      />
      <circle cx="100" cy="90" r="2.6" fill="#e08a3c" opacity="0.85" />
      {rim(100, 86, 32, gid)}
    </g>
  );
}

const NPC_RENDERERS: Record<string, (gid: string) => ReactElement> = {
  dovey: doveyArt,
  bram: bramArt,
  maribel: maribelArt,
  ott: ottArt,
  kess: kessArt,
  casque: casqueArt,
  rowan: rowanArt,
  fennick: fennickArt,
  sess: sessArt,
};

const GLOW_NPCS = new Set(['casque', 'sess']);

export function NpcPortrait({ npcId, size }: { npcId: string; size: number }): ReactElement {
  const accent = NPC_ACCENTS[npcId] ?? UNKNOWN_ACCENT;
  const gid = `na-${npcId}`;
  const render = NPC_RENDERERS[npcId] ?? hoodedStrangerArt;

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={npcId} style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`${gid}-fog`}>
          <stop offset="0%" stopColor="#d8d4c8" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#d8d4c8" stopOpacity="0" />
        </radialGradient>
        <filter id={`${gid}-rim`} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor="#f0c87a" floodOpacity="0.6" />
        </filter>
        {GLOW_NPCS.has(npcId) ? (
          <radialGradient id={`${gid}-glow`}>
            <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        ) : null}
      </defs>

      <ellipse cx="100" cy="120" rx="76" ry="70" fill={`url(#${gid}-fog)`} />

      {render(gid)}
    </svg>
  );
}
