// Hero battle art: five FULLY DISTINCT figures (SVG only, souls tone).
// Each class gets its own silhouette, pose, and build — no shared base.
// Ground shadow + fog wash are shared visual language (as in monsterArt.tsx);
// everything else below is bespoke per class.
import type { ReactElement } from 'react';
import type { ClassName } from '../engine/types';

/** main accent (trim/energy) / bright accent (highlights, eyes) / metal tone / third identity accent */
interface ClassPal {
  a: string;
  b: string;
  metal: string;
  c: string;
}

const CLASS_PAL: Record<ClassName, ClassPal> = {
  Warrior: { a: '#b3541e', b: '#e08a4a', metal: '#9aa2ae', c: '#5a3a28' },
  Mage: { a: '#5f7391', b: '#9db8d8', metal: '#7d94a8', c: '#8a6fb8' },
  Thief: { a: '#5c7d52', b: '#94b088', metal: '#8a94a4', c: '#8a6a3a' },
  Bard: { a: '#c9a227', b: '#e6cf7a', metal: '#a89478', c: '#8a6fb8' },
  Knight: { a: '#8a94a4', b: '#c4ccd8', metal: '#b8c0cc', c: '#c9a227' },
};

/** near-black body/garment fill, one per class (bare skin, robe, leathers, doublet, plate). */
const BODY: Record<ClassName, string> = {
  Warrior: '#171310',
  Mage: '#100f16',
  Thief: '#0f130f',
  Bard: '#151013',
  Knight: '#121316',
};

const BONE = '#d8d2c4';

function plainEyes(x1: number, x2: number, y: number, r: number): ReactElement {
  return (
    <g fill={BONE} opacity="0.85">
      <circle cx={x1} cy={y} r={r} />
      <circle cx={x2} cy={y} r={r} />
    </g>
  );
}

function glowEyes(x1: number, x2: number, y: number, r: number, color: string, gid: string): ReactElement {
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
// Per-class figures. Canvas is 200x200, ground line near y=176.
// ---------------------------------------------------------------------------

/** Broad, bareheaded warrior with a war-braid; a massive greatsword is planted
 * point-down in the earth and gripped two-handed at the pommel; one heavy
 * pauldron, the other shoulder bare. */
function warriorArt(p: ClassPal, _gid: string): ReactElement {
  const B = BODY.Warrior;
  return (
    <g>
      {/* wide-planted legs */}
      <path d="M76 132 L64 178 L82 178 L88 136 Z" fill={B} />
      <path d="M124 132 L136 178 L118 178 L112 136 Z" fill={B} />
      <path d="M62 174 L84 174 L84 180 L60 180 Z M116 174 L138 174 L138 180 L118 180 Z" fill="#0a0806" />
      {/* broad torso */}
      <path
        d="M72 84 C 68 100 66 116 70 132 C 84 140 116 140 130 132 C 134 116 132 100 128 84 C 116 76 84 76 72 84 Z"
        fill={B}
      />
      <path d="M78 92 C 90 96 110 96 122 92" stroke={p.c} strokeWidth="2" fill="none" opacity="0.5" />
      <path d="M84 132 L116 132" stroke={p.a} strokeWidth="3" opacity="0.7" />
      {/* single heavy pauldron, right shoulder only */}
      <path
        d="M118 78 C 132 70 148 74 152 90 C 154 100 148 108 136 108 C 128 108 122 102 120 94 Z"
        fill="#1c1712"
        stroke={p.a}
        strokeWidth="2"
      />
      <path d="M124 84 q10 -4 20 2" stroke={p.b} strokeWidth="1.5" fill="none" opacity="0.6" />
      {/* bare left shoulder, just a strap */}
      <path d="M70 84 C 66 80 64 76 66 72" stroke={p.a} strokeWidth="2" fill="none" opacity="0.5" />
      {/* arms reaching up to the pommel */}
      <path d="M74 86 C 80 90 84 91 88 92" stroke={B} strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d="M126 88 C 120 90 116 91 112 92" stroke={B} strokeWidth="12" fill="none" strokeLinecap="round" />
      {/* bare head with war-braid */}
      <circle cx="100" cy="58" r="20" fill={B} />
      <path
        d="M116 66 C 122 84 120 108 112 140 C 116 142 120 142 122 140 C 128 108 128 82 120 62 Z"
        fill="#120e0b"
      />
      <path d="M117 76 l6 0 M116 92 l7 0 M114 108 l7 0" stroke={p.c} strokeWidth="1.4" opacity="0.5" />
      {plainEyes(93, 107, 59, 2)}
      {/* greatsword, tip planted in the ground */}
      <path d="M96 110 L104 110 L102 176 L100 182 L98 176 Z" fill={p.metal} />
      <path d="M100 114 L100 172" stroke={p.b} strokeWidth="1" opacity="0.6" />
      <path d="M82 106 L118 106 L118 112 L82 112 Z" fill={p.a} />
      <path d="M95 80 L105 80 L105 106 L95 106 Z" fill="#3a3028" />
      <circle cx="100" cy="76" r="6" fill={p.a} />
      {/* both hands gripping the pommel */}
      <ellipse cx="88" cy="92" rx="7" ry="6" fill={B} />
      <ellipse cx="112" cy="92" rx="7" ry="6" fill={B} />
    </g>
  );
}

/** Tall, thin mage floating just off the ground; robe tapers to wisps instead
 * of feet. A crooked staff carries an orbiting glow of motes. */
function mageArt(p: ClassPal, gid: string): ReactElement {
  const B = BODY.Mage;
  return (
    <g>
      {/* robe hem tapering into wisps — no feet */}
      <path d="M84 150 C 78 162 74 172 78 182" stroke={B} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d="M96 154 C 94 166 92 176 96 186" stroke={B} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.65" />
      <path d="M108 154 C 110 166 112 176 108 186" stroke={B} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.65" />
      <path d="M118 150 C 124 162 128 172 124 182" stroke={B} strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.5" />
      {/* long tapering robe */}
      <path
        d="M100 66 C 118 70 128 90 130 116 C 132 134 128 148 118 156 C 106 150 94 150 82 156 C 72 148 68 134 70 116 C 72 90 82 70 100 66 Z"
        fill={B}
      />
      <path d="M84 96 q16 -8 32 0 M80 116 q20 -8 40 0 M78 136 q22 -8 44 0" stroke={p.c} strokeWidth="1.6" fill="none" opacity="0.4" />
      {/* thin arm holding the staff */}
      <path d="M76 92 C 62 100 52 108 48 120" stroke={B} strokeWidth="9" fill="none" strokeLinecap="round" />
      <ellipse cx="46" cy="124" rx="6" ry="5" fill={B} />
      {/* deep hood over a dark void */}
      <path
        d="M100 24 C 122 26 134 46 132 70 C 130 90 116 100 100 100 C 84 100 70 90 68 70 C 66 46 78 26 100 24 Z"
        fill={B}
      />
      <path
        d="M100 32 C 116 34 124 50 122 68 C 120 84 110 92 100 92 C 90 92 80 84 78 68 C 76 50 84 34 100 32 Z"
        fill="#050409"
      />
      {glowEyes(92, 108, 64, 4.5, p.b, gid)}
      {/* crooked staff, taller than the figure, motes orbiting the crook */}
      <path d="M46 30 C 40 26 38 20 42 14 C 46 20 46 26 48 30 Z" fill="#3a3226" />
      <path d="M47 30 L43 178" stroke="#3a3226" strokeWidth="4" />
      <circle cx="45" cy="26" r="9" fill={`url(#${gid}-orb)`} />
      <circle cx="45" cy="26" r="4" fill={p.b} opacity="0.9" />
      <circle cx="29" cy="18" r="2" fill={p.c} opacity="0.8" />
      <circle cx="61" cy="20" r="1.6" fill={p.b} opacity="0.7" />
      <circle cx="53" cy="40" r="1.8" fill={p.c} opacity="0.7" />
    </g>
  );
}

/** Low, crouched thief in half-mask, twin daggers held in reversed grip, a
 * scarf trailing hard in the wind. */
function thiefArt(p: ClassPal, gid: string): ReactElement {
  const B = BODY.Thief;
  return (
    <g>
      {/* crouched, bent legs */}
      <path d="M78 150 C 70 156 66 166 70 178 L 84 178 C 82 168 84 158 90 150 Z" fill={B} />
      <path d="M118 138 C 128 144 136 154 134 166 L 148 168 C 148 154 140 142 128 132 Z" fill={B} />
      {/* low, forward-leaning torso */}
      <path
        d="M84 108 C 78 122 78 136 86 148 C 100 154 116 150 124 140 C 128 126 124 112 114 102 C 104 96 92 98 84 108 Z"
        fill={B}
      />
      <path d="M92 116 q14 -4 26 4" stroke={p.c} strokeWidth="1.6" fill="none" opacity="0.5" />
      {/* scarf trailing hard in the wind */}
      <path
        d="M112 104 C 130 100 148 92 160 76 C 150 96 156 108 172 112 C 156 116 150 130 158 144 C 144 136 132 138 122 148"
        fill="none"
        stroke={p.a}
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* low crouched head, half-mask over the lower face */}
      <circle cx="94" cy="86" r="17" fill={B} />
      <path
        d="M80 90 C 82 100 88 106 96 106 C 104 106 110 100 112 90 L 108 88 C 104 94 88 94 84 88 Z"
        fill="#0b0d0b"
      />
      {glowEyes(89, 99, 82, 2.6, p.b, gid)}
      {/* twin daggers, reversed grip */}
      <g transform="rotate(18 70 132)">
        <path d="M66 108 L72 106 L76 148 L70 150 Z" fill={p.metal} />
        <path d="M63 100 L75 96 L77 102 L65 106 Z" fill={p.a} />
      </g>
      <g transform="rotate(-14 136 122)">
        <path d="M132 100 L138 98 L142 140 L136 142 Z" fill={p.metal} />
        <path d="M129 92 L141 88 L143 94 L131 98 Z" fill={p.a} />
      </g>
    </g>
  );
}

/** Bard mid-stride, wide-brim feathered hat, lute slung across the back, one
 * hand raised mid-verse with faint music-line glyphs drifting off it. */
function bardArt(p: ClassPal, _gid: string): ReactElement {
  const B = BODY.Bard;
  return (
    <g>
      {/* lute slung across the back, peeking past the shoulder */}
      <g transform="rotate(18 130 130)" opacity="0.92">
        <ellipse cx="130" cy="130" rx="19" ry="25" fill="#4a3626" />
        <ellipse cx="130" cy="130" rx="14" ry="19" fill="#5c452f" />
        <path d="M126 104 L134 104 L132 66 L128 66 Z" fill="#3a2c1e" />
      </g>
      {/* mid-stride legs */}
      <path d="M82 138 C 74 148 68 160 72 176 L 86 176 C 86 164 90 152 96 142 Z" fill={B} />
      <path d="M114 140 C 122 152 122 164 116 176 L 130 176 C 134 162 132 148 124 136 Z" fill={B} />
      {/* torso, slight turn */}
      <path
        d="M84 92 C 78 106 78 122 86 136 C 100 142 112 140 120 132 C 124 118 122 102 114 90 C 104 84 92 85 84 92 Z"
        fill={B}
      />
      <path d="M90 100 q12 -4 22 2" stroke={p.a} strokeWidth="1.6" fill="none" opacity="0.5" />
      {/* one arm raised mid-verse */}
      <path d="M116 96 C 128 84 136 70 136 56" stroke={B} strokeWidth="9" fill="none" strokeLinecap="round" />
      <ellipse cx="137" cy="52" rx="6" ry="5" fill={B} />
      {/* other arm relaxed at the side */}
      <path d="M84 100 C 78 112 76 122 80 132" stroke={B} strokeWidth="9" fill="none" strokeLinecap="round" />
      {/* faint music-line glyphs drifting off the raised hand */}
      <g stroke={p.a} strokeWidth="1.6" fill="none" opacity="0.6" strokeLinecap="round">
        <path d="M144 44 q6 -4 12 0" />
        <path d="M150 32 q6 -4 12 2" />
        <circle cx="144" cy="46" r="2" fill={p.a} stroke="none" />
        <circle cx="150" cy="36" r="1.6" fill={p.b} stroke="none" />
      </g>
      {/* head, wide-brim feathered hat */}
      <circle cx="98" cy="70" r="16" fill={B} />
      <ellipse cx="98" cy="58" rx="30" ry="7" fill={B} />
      <path d="M98 52 C 92 40 94 26 104 18 C 100 30 100 42 106 52 Z" fill={p.a} />
      <path d="M78 60 q20 -6 40 0" stroke={p.b} strokeWidth="1.6" opacity="0.5" fill="none" />
      {plainEyes(94, 102, 71, 2)}
    </g>
  );
}

/** Tower-silhouette knight: full helm with a narrow glowing eye-slit, a kite
 * shield covering half the body, a sword resting on the free shoulder. */
function knightArt(p: ClassPal, gid: string): ReactElement {
  const B = BODY.Knight;
  return (
    <g>
      {/* wide, armored, planted legs */}
      <path d="M78 140 L72 178 L92 178 L94 142 Z" fill={B} />
      <path d="M122 140 L128 178 L108 178 L106 142 Z" fill={B} />
      <path d="M70 174 L94 174 L94 180 L68 180 Z M106 174 L130 174 L130 180 L106 180 Z" fill="#08090b" />
      {/* tower torso */}
      <path
        d="M70 84 C 66 104 66 124 72 142 C 90 150 110 150 128 142 C 134 124 134 104 130 84 C 116 74 84 74 70 84 Z"
        fill={B}
      />
      <path d="M100 84 L100 142" stroke={p.a} strokeWidth="1.4" opacity="0.4" />
      <path d="M78 96 L122 96 M76 116 L124 116" stroke={p.a} strokeWidth="1.2" opacity="0.35" />
      {/* sword resting on the free shoulder */}
      <g transform="rotate(-32 128 78)">
        <path d="M124 30 L132 30 L131 128 L128 134 L125 128 Z" fill={p.metal} />
        <path d="M116 96 L140 96 L140 102 L116 102 Z" fill={p.a} />
        <path d="M125 102 L131 102 L131 118 L125 118 Z" fill="#3a3028" />
      </g>
      {/* kite shield, covers roughly half the body */}
      <path
        d="M50 88 C 66 80 82 80 96 88 C 96 118 86 146 70 158 C 54 146 44 118 44 88 Z"
        fill="#15141a"
        stroke={p.a}
        strokeWidth="2.5"
      />
      <path d="M54 98 L70 110 L86 98" stroke={p.b} strokeWidth="3" fill="none" opacity="0.7" />
      <path d="M70 84 l5 8 l-5 8 l-5 -8 Z" fill={p.a} opacity="0.85" />
      {/* full helm */}
      <path
        d="M100 40 C 116 40 126 52 126 68 C 126 82 118 92 106 94 L 94 94 C 82 92 74 82 74 68 C 74 52 84 40 100 40 Z"
        fill={B}
      />
      <path
        d="M100 46 C 112 46 120 56 120 68 C 120 78 114 86 104 88 L 96 88 C 86 86 80 78 80 68 C 80 56 88 46 100 46 Z"
        fill="#06070a"
      />
      <path d="M100 40 C 96 34 96 28 100 22 C 104 28 104 34 100 40 Z" fill={B} />
      {/* narrow glowing gold eye-slit */}
      <g filter={`url(#${gid}-slitglow)`}>
        <rect x="86" y="65" width="28" height="3.5" rx="1.75" fill={p.c} opacity="0.95" />
      </g>
    </g>
  );
}

const FIGURE_RENDERERS: Record<ClassName, (p: ClassPal, gid: string) => ReactElement> = {
  Warrior: warriorArt,
  Mage: mageArt,
  Thief: thiefArt,
  Bard: bardArt,
  Knight: knightArt,
};

export function HeroArt({ className, size }: { className: ClassName; size: number }) {
  const p = CLASS_PAL[className];
  const gid = `ha-${className.toLowerCase()}`;
  const render = FIGURE_RENDERERS[className];

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={className} style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`${gid}-eg`}>
          <stop offset="0%" stopColor={p.b} stopOpacity="0.85" />
          <stop offset="100%" stopColor={p.b} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${gid}-fog`}>
          <stop offset="0%" stopColor="#d8d4c8" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#d8d4c8" stopOpacity="0" />
        </radialGradient>
        {className === 'Mage' ? (
          <radialGradient id={`${gid}-orb`}>
            <stop offset="0%" stopColor={p.b} stopOpacity="0.9" />
            <stop offset="100%" stopColor={p.a} stopOpacity="0" />
          </radialGradient>
        ) : null}
        {className === 'Knight' ? (
          <filter id={`${gid}-slitglow`} x="-60%" y="-200%" width="220%" height="500%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor={p.c} floodOpacity="0.9" />
          </filter>
        ) : null}
      </defs>

      <ellipse cx="100" cy="150" rx="70" ry="26" fill={`url(#${gid}-fog)`} />
      <ellipse cx="100" cy="176" rx="46" ry="8" fill="#000" opacity="0.55" />

      {render(p, gid)}
    </svg>
  );
}
