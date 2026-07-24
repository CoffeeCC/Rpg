// Environmental SVG backdrops: full-bleed scenes rendered BEHIND game UI.
// Contract: everything stays DARK and LOW-CONTRAST so bone-colored UI text
// reads on top of it — a bottom vignette on every scene guarantees nothing
// in the center-bottom third exceeds roughly #2a2830. viewBox is always
// '0 0 1200 600', preserveAspectRatio 'xMidYMid slice', width/height 100%.
import type { ReactElement } from 'react';
import type { GateId } from '../engine/types';

const GOLD = '#c9a227';
const EMBER = '#b3541e';
const VIOLET = '#8a6fb8';
const COLD = '#5f7391';
const SICK = '#6d7d5a';

/** Vertical darkening gradient stacked on top of every scene so the lower
 * two-thirds (where dialogue/HUD text sits) never gets too bright. */
function vignetteDef(gid: string): ReactElement {
  return (
    <linearGradient id={`${gid}-vig`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#000" stopOpacity="0" />
      <stop offset="40%" stopColor="#000" stopOpacity="0.08" />
      <stop offset="65%" stopColor="#000" stopOpacity="0.55" />
      <stop offset="100%" stopColor="#000" stopOpacity="0.9" />
    </linearGradient>
  );
}

function vignetteRect(gid: string): ReactElement {
  return <rect x="0" y="0" width="1200" height="600" fill={`url(#${gid}-vig)`} />;
}

function sceneShell(gid: string, defs: ReactElement, content: ReactElement): ReactElement {
  return (
    <svg
      viewBox="0 0 1200 600"
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      role="img"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <defs>
        {vignetteDef(gid)}
        {defs}
      </defs>
      {content}
      {vignetteRect(gid)}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Gate battle backdrops
// ---------------------------------------------------------------------------

function verdantScene(gid: string): ReactElement {
  const defs = (
    <>
      <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#171b14" />
        <stop offset="55%" stopColor="#10130f" />
        <stop offset="100%" stopColor="#0a0a0d" />
      </linearGradient>
      <radialGradient id={`${gid}-shaft`}>
        <stop offset="0%" stopColor={SICK} stopOpacity="0.16" />
        <stop offset="100%" stopColor={SICK} stopOpacity="0" />
      </radialGradient>
    </>
  );
  const content = (
    <>
      <rect x="0" y="0" width="1200" height="600" fill={`url(#${gid}-sky)`} />
      {/* far canopy silhouette */}
      <path
        d="M0 130 C 120 90 220 150 340 110 C 460 76 560 140 700 104 C 840 70 960 132 1080 96 C 1140 84 1180 96 1200 108 L1200 0 L0 0 Z"
        fill="#12150f"
        opacity="0.85"
      />
      {/* fog light shafts between the trunks */}
      <ellipse cx="260" cy="260" rx="60" ry="260" fill={`url(#${gid}-shaft)`} transform="rotate(6 260 260)" />
      <ellipse cx="640" cy="280" rx="50" ry="280" fill={`url(#${gid}-shaft)`} transform="rotate(-4 640 280)" />
      <ellipse cx="960" cy="250" rx="55" ry="260" fill={`url(#${gid}-shaft)`} transform="rotate(5 960 250)" />
      {/* distant back trunk, faded */}
      <path
        d="M600 600 C 594 420 606 240 620 90 C 636 100 648 116 646 140 C 660 240 654 420 656 600 Z"
        fill="#0f120c"
        opacity="0.55"
      />
      {/* left gnarled trunk with root splay */}
      <path
        d="M170 600 C 160 440 150 300 168 170 C 176 130 208 108 232 112 C 224 150 214 168 226 188 C 214 220 206 300 214 420 C 218 480 224 540 228 600 Z"
        fill="#12140f"
      />
      <path
        d="M170 560 C 130 552 96 566 70 594 M182 570 C 150 578 128 598 118 600 M226 566 C 250 566 268 582 280 600"
        stroke="#0d0f0a"
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M228 250 C 260 236 288 244 308 268 M212 320 C 180 314 158 328 146 352" stroke="#1a2014" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.8" />
      {/* right gnarled trunk */}
      <path
        d="M1010 600 C 1000 440 994 300 1012 176 C 1022 134 1058 114 1082 122 C 1070 156 1058 174 1070 196 C 1054 232 1046 320 1054 430 C 1058 490 1064 546 1068 600 Z"
        fill="#111310"
      />
      <path d="M1012 260 C 976 246 944 256 922 282 M1074 336 C 1108 328 1136 344 1150 368" stroke="#1a2014" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.8" />
      {/* hanging moss strands */}
      <g stroke={SICK} strokeWidth="2" fill="none" opacity="0.32" strokeLinecap="round">
        <path d="M300 140 q6 60 -4 130" />
        <path d="M340 150 q-8 50 2 110" />
        <path d="M860 132 q8 56 -6 128" />
        <path d="M900 146 q-6 46 4 104" />
        <path d="M660 120 q4 40 -6 92" />
      </g>
      {/* uneven ground with root shadows */}
      <path d="M0 560 C 200 540 380 566 600 552 C 820 538 1000 566 1200 548 L1200 600 L0 600 Z" fill="#0a0a0a" />
    </>
  );
  return sceneShell(gid, defs, content);
}

function hollowScene(gid: string): ReactElement {
  const defs = (
    <>
      <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0f1014" />
        <stop offset="60%" stopColor="#0b0b0e" />
        <stop offset="100%" stopColor="#09090c" />
      </linearGradient>
      <radialGradient id={`${gid}-ember`}>
        <stop offset="0%" stopColor={EMBER} stopOpacity="0.4" />
        <stop offset="100%" stopColor={EMBER} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${gid}-mist`}>
        <stop offset="0%" stopColor={COLD} stopOpacity="0.14" />
        <stop offset="100%" stopColor={COLD} stopOpacity="0" />
      </radialGradient>
    </>
  );
  const content = (
    <>
      <rect x="0" y="0" width="1200" height="600" fill={`url(#${gid}-sky)`} />
      {/* ceiling stalactite row */}
      <path
        d="M0 0 L1200 0 L1200 70 L1120 130 L1050 76 L980 150 L900 82 L820 160 L740 90 L660 140 L580 84 L500 158 L420 92 L340 148 L260 86 L180 156 L100 96 L20 140 L0 80 Z"
        fill="#0c0c10"
      />
      <path
        d="M300 0 L340 90 L360 0 Z M640 0 L668 74 L692 0 Z M960 0 L992 100 L1020 0 Z"
        fill="#0a0a0d"
        opacity="0.9"
      />
      {/* distant ember glow, low right */}
      <ellipse cx="980" cy="420" rx="260" ry="150" fill={`url(#${gid}-ember)`} />
      <ellipse cx="1020" cy="440" rx="90" ry="50" fill={EMBER} opacity="0.14" />
      {/* cave walls framing the sides */}
      <path d="M0 600 L0 180 C 60 220 90 300 70 400 C 56 470 30 540 0 600 Z" fill="#0c0d10" />
      <path d="M1200 600 L1200 160 C 1130 210 1096 300 1120 400 C 1136 470 1168 540 1200 600 Z" fill="#0d0e11" />
      {/* mid stalagmites */}
      <path d="M150 600 L172 470 L200 600 Z M980 600 L1004 500 L1036 600 Z M540 600 L560 520 L582 600 Z" fill="#0a0a0d" />
      {/* cold mist drifting low */}
      <ellipse cx="360" cy="480" rx="240" ry="60" fill={`url(#${gid}-mist)`} />
      <ellipse cx="760" cy="500" rx="260" ry="55" fill={`url(#${gid}-mist)`} />
      {/* uneven cave floor */}
      <path d="M0 560 C 240 540 420 572 660 550 C 880 532 1040 566 1200 546 L1200 600 L0 600 Z" fill="#08080a" />
    </>
  );
  return sceneShell(gid, defs, content);
}

function sunkenScene(gid: string): ReactElement {
  const defs = (
    <>
      <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0e161a" />
        <stop offset="55%" stopColor="#0b1214" />
        <stop offset="100%" stopColor="#090c0d" />
      </linearGradient>
      <linearGradient id={`${gid}-water`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0d1a1c" />
        <stop offset="100%" stopColor="#070c0d" />
      </linearGradient>
    </>
  );
  const content = (
    <>
      <rect x="0" y="0" width="1200" height="600" fill={`url(#${gid}-sky)`} />
      {/* back wall with arched windows */}
      <path
        d="M0 0 L1200 0 L1200 340 L0 340 Z"
        fill="#0b1416"
      />
      <path
        d="M180 340 L180 200 C 180 160 218 132 250 132 C 282 132 320 160 320 200 L320 340 Z"
        fill="#08100f"
      />
      <path
        d="M540 340 L540 180 C 540 132 588 96 628 96 C 668 96 716 132 716 180 L716 340 Z"
        fill="#08100f"
        opacity="0.9"
      />
      <path
        d="M900 340 L900 210 C 900 168 940 138 972 138 C 1004 138 1044 168 1044 210 L1044 340 Z"
        fill="#08100f"
      />
      {/* receding pillars, some tilted/broken */}
      <path d="M120 600 L112 220 L150 220 L156 600 Z" fill="#0a1315" />
      <path d="M340 600 L332 240 L368 240 L374 600 Z" fill="#0a1315" opacity="0.9" transform="rotate(2 350 400)" />
      <path d="M560 600 L546 200 L586 202 L596 600 Z" fill="#091214" />
      <path d="M820 600 L812 236 L848 236 L854 600 Z" fill="#0a1315" opacity="0.9" transform="rotate(-3 830 400)" />
      <path d="M1040 600 L1030 216 L1070 216 L1078 600 Z" fill="#0a1315" />
      {/* broken pillar fragment lying across the floor */}
      <path d="M420 486 L470 470 L680 500 L676 522 L466 494 L424 508 Z" fill="#08100f" opacity="0.85" />
      {/* waterline glimmer band */}
      <rect x="0" y="404" width="1200" height="3" fill={COLD} opacity="0.35" />
      <g stroke={COLD} strokeWidth="1.4" opacity="0.28">
        <path d="M60 404 L220 404 M300 404 L470 404 M560 404 L760 404 M840 404 L980 404 M1040 404 L1180 404" />
      </g>
      {/* still water below the line, faint reflections */}
      <rect x="0" y="407" width="1200" height="193" fill={`url(#${gid}-water)`} />
      <g stroke={COLD} strokeWidth="1" opacity="0.12">
        <path d="M150 430 L150 470 M580 420 L580 480 M1050 434 L1050 468" />
      </g>
    </>
  );
  return sceneShell(gid, defs, content);
}

function stormScene(gid: string): ReactElement {
  const defs = (
    <>
      <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#14181f" />
        <stop offset="55%" stopColor="#0f1217" />
        <stop offset="100%" stopColor="#0a0a0d" />
      </linearGradient>
      <filter id={`${gid}-bolt`} x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#d7cfa8" floodOpacity="0.65" />
      </filter>
    </>
  );
  const content = (
    <>
      <rect x="0" y="0" width="1200" height="600" fill={`url(#${gid}-sky)`} />
      {/* storm clouds */}
      <g fill="#171b22" opacity="0.85">
        <ellipse cx="220" cy="90" rx="220" ry="60" />
        <ellipse cx="560" cy="60" rx="260" ry="70" />
        <ellipse cx="920" cy="100" rx="240" ry="66" />
        <ellipse cx="1180" cy="70" rx="180" ry="56" />
      </g>
      <g fill="#1c212a" opacity="0.5">
        <ellipse cx="380" cy="120" rx="180" ry="40" />
        <ellipse cx="760" cy="130" rx="200" ry="44" />
      </g>
      {/* lightning fork frozen mid-sky */}
      <path
        d="M660 40 L620 150 L654 156 L600 280 L636 240 L616 320"
        stroke="#d7cfa8"
        strokeWidth="3"
        fill="none"
        opacity="0.8"
        filter={`url(#${gid}-bolt)`}
      />
      {/* jagged mountain ridge */}
      <path
        d="M0 340 L90 260 L180 320 L280 220 L370 300 L470 200 L560 290 L660 230 L760 310 L860 240 L960 300 L1060 250 L1150 310 L1200 270 L1200 600 L0 600 Z"
        fill="#0c0d10"
      />
      <path
        d="M280 220 L330 250 L370 300 M660 230 L710 262 L760 310"
        stroke="#14161c"
        strokeWidth="6"
        fill="none"
        opacity="0.6"
      />
      {/* wind-bent banners on poles, foreground */}
      <g>
        <path d="M180 600 L180 380" stroke="#15130f" strokeWidth="5" />
        <path d="M180 392 C 220 388 258 400 288 420 C 260 414 226 416 198 428 C 224 424 250 432 270 448 C 240 444 210 446 184 454 Z" fill={EMBER} opacity="0.4" />
        <path d="M980 600 L980 400" stroke="#15130f" strokeWidth="5" />
        <path d="M980 412 C 946 408 914 420 890 440 C 916 434 946 436 970 448 C 948 444 926 452 908 466 C 934 462 958 470 976 480 Z" fill={COLD} opacity="0.35" />
      </g>
      {/* ridge foreground rock */}
      <path d="M0 560 C 220 540 420 574 660 552 C 880 534 1040 568 1200 548 L1200 600 L0 600 Z" fill="#0a0a0c" />
    </>
  );
  return sceneShell(gid, defs, content);
}

function abyssScene(gid: string): ReactElement {
  const defs = (
    <>
      <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#100c17" />
        <stop offset="60%" stopColor="#0b0910" />
        <stop offset="100%" stopColor="#08070c" />
      </linearGradient>
      <radialGradient id={`${gid}-glow`}>
        <stop offset="0%" stopColor={VIOLET} stopOpacity="0.24" />
        <stop offset="100%" stopColor={VIOLET} stopOpacity="0" />
      </radialGradient>
    </>
  );
  const content = (
    <>
      <rect x="0" y="0" width="1200" height="600" fill={`url(#${gid}-sky)`} />
      <ellipse cx="600" cy="80" rx="520" ry="220" fill={`url(#${gid}-glow)`} />
      {/* the dark's hanging roots descending from above */}
      <path
        d="M420 0 C 400 90 360 150 300 200 C 340 190 380 160 410 120 C 400 190 360 250 300 300 C 350 286 400 250 430 200 C 424 260 400 320 360 370"
        stroke="#1c1626"
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M760 0 C 780 100 820 168 880 220 C 840 208 800 176 772 132 C 786 200 826 262 884 312 C 836 300 792 264 764 216 C 774 276 800 336 840 384"
        stroke="#1a1522"
        strokeWidth="13"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M600 0 C 604 70 596 130 570 180 C 590 174 606 158 616 138 C 612 190 596 236 566 274"
        stroke="#181320"
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* faint violet glow along root undersides */}
      <path
        d="M300 200 C 340 190 380 160 410 120 M300 300 C 350 286 400 250 430 200 M772 132 C 786 200 826 262 884 312"
        stroke={VIOLET}
        strokeWidth="2"
        fill="none"
        opacity="0.3"
        strokeLinecap="round"
      />
      {/* floating motes */}
      <g fill={VIOLET} opacity="0.5">
        <circle cx="220" cy="260" r="2.2" />
        <circle cx="980" cy="220" r="1.8" />
        <circle cx="500" cy="340" r="2" />
        <circle cx="860" cy="380" r="1.6" />
        <circle cx="140" cy="420" r="1.8" />
      </g>
      <g fill={GOLD} opacity="0.35">
        <circle cx="660" cy="300" r="1.6" />
        <circle cx="360" cy="440" r="1.4" />
      </g>
      {/* void floor, barely there, with faint glow cracks */}
      <path d="M0 560 C 260 546 440 572 660 556 C 880 542 1020 570 1200 552 L1200 600 L0 600 Z" fill="#07060a" />
      <path d="M300 560 q60 -10 120 4 M760 566 q70 -8 130 6" stroke={VIOLET} strokeWidth="1" opacity="0.18" fill="none" />
    </>
  );
  return sceneShell(gid, defs, content);
}

const GATE_SCENES: Record<GateId, (gid: string) => ReactElement> = {
  verdant: verdantScene,
  hollow: hollowScene,
  sunken: sunkenScene,
  storm: stormScene,
  abyss: abyssScene,
};

export function BattleBackdrop({ gateId }: { gateId: GateId }): ReactElement {
  const render = GATE_SCENES[gateId] ?? verdantScene;
  return render(`bd-${gateId}`);
}

// ---------------------------------------------------------------------------
// Town backdrop
// ---------------------------------------------------------------------------

export function TownBackdrop(): ReactElement {
  const gid = 'bd-town';
  const defs = (
    <>
      <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#141126" />
        <stop offset="55%" stopColor="#100e1c" />
        <stop offset="82%" stopColor="#1a1416" />
        <stop offset="100%" stopColor="#0a0a0d" />
      </linearGradient>
      <radialGradient id={`${gid}-treeglow`}>
        <stop offset="0%" stopColor="#9ec4a8" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#9ec4a8" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${gid}-win`}>
        <stop offset="0%" stopColor={EMBER} stopOpacity="0.8" />
        <stop offset="100%" stopColor={EMBER} stopOpacity="0" />
      </radialGradient>
    </>
  );
  const content = (
    <>
      <rect x="0" y="0" width="1200" height="600" fill={`url(#${gid}-sky)`} />
      {/* the Last Lantern: an iron cage taller than a man, one patient flame */}
      <ellipse cx="600" cy="205" rx="300" ry="210" fill={`url(#${gid}-win)`} opacity="0.55" />
      <g>
        <path d="M588 600 L591 268 L609 268 L612 600 Z" fill="#0e0c14" opacity="0.96" />
        <path d="M566 268 L634 268 L624 148 L576 148 Z" fill="#0e0c14" opacity="0.96" />
        <path d="M576 148 L600 112 L624 148 Z" fill="#0e0c14" opacity="0.96" />
        <path d="M580 262 L585 158 M600 264 L600 154 M620 262 L615 158" stroke="#2a2433" strokeWidth="3.2" />
        <ellipse cx="600" cy="205" rx="64" ry="74" fill={`url(#${gid}-win)`} />
        <path d="M600 232 C 588 218 590 200 600 184 C 610 200 612 218 600 232 Z" fill={EMBER} opacity="0.95" />
        <path d="M600 224 C 595 216 596 206 600 198 C 604 206 605 216 600 224 Z" fill="#f6e29b" opacity="0.9" />
        <circle cx="600" cy="126" r="3.6" fill={GOLD} opacity="0.6" />
      </g>
      {/* low rooftop skyline */}
      <path
        d="M0 460 L60 460 L60 420 L120 420 L120 460 L180 460 L200 400 L220 460 L300 460 L300 430 L360 430 L360 460 L420 460 L440 410 L460 460 L540 460 L540 424 L600 424 L600 460 L680 460 L700 402 L720 460 L800 460 L800 432 L860 432 L860 460 L940 460 L960 406 L980 460 L1060 460 L1060 422 L1120 422 L1120 460 L1200 460 L1200 600 L0 600 Z"
        fill="#0b0a10"
      />
      {/* a couple of lit windows */}
      <ellipse cx="200" cy="436" rx="26" ry="18" fill={`url(#${gid}-win)`} />
      <rect x="194" y="428" width="12" height="16" fill={EMBER} opacity="0.85" />
      <ellipse cx="700" cy="438" rx="24" ry="16" fill={`url(#${gid}-win)`} />
      <rect x="694" y="430" width="12" height="14" fill={EMBER} opacity="0.8" />
      <ellipse cx="960" cy="440" rx="22" ry="16" fill={`url(#${gid}-win)`} />
      <rect x="954" y="432" width="12" height="14" fill={EMBER} opacity="0.75" />
      {/* wardstone pillars flanking the street */}
      <g>
        <path d="M110 600 L104 380 C 104 366 116 356 132 356 C 148 356 160 366 160 380 L154 600 Z" fill="#131018" />
        <path d="M116 400 L148 400 M118 440 L146 440" stroke={GOLD} strokeWidth="1.6" opacity="0.4" />
        <circle cx="132" cy="372" r="4" fill={GOLD} opacity="0.55" />
        <path d="M1040 600 L1034 380 C 1034 366 1046 356 1062 356 C 1078 356 1090 366 1090 380 L1084 600 Z" fill="#131018" />
        <path d="M1046 400 L1078 400 M1048 440 L1076 440" stroke={GOLD} strokeWidth="1.6" opacity="0.4" />
        <circle cx="1062" cy="372" r="4" fill={GOLD} opacity="0.55" />
      </g>
      {/* street ground */}
      <path d="M0 560 C 240 546 420 572 660 554 C 880 538 1040 566 1200 550 L1200 600 L0 600 Z" fill="#09090b" />
    </>
  );
  return sceneShell(gid, defs, content);
}

// ---------------------------------------------------------------------------
// Card back
// ---------------------------------------------------------------------------

/** Grok-painted card backs. 'lantern' (the game's core motif) is the default;
 * 'embermoth' is available as an alt for anywhere a second design is wanted. */
export const CARD_BACK_SRC = {
  lantern: 'art/cards/back_lantern.jpg',
  embermoth: 'art/cards/back_embermoth.jpg',
} as const;

export function CardBack({ width, variant = 'lantern' }: { width: number; variant?: keyof typeof CARD_BACK_SRC }): ReactElement {
  const height = Math.round(width * 1.4);
  return (
    <img
      src={CARD_BACK_SRC[variant]}
      width={width}
      height={height}
      alt="Card back"
      draggable={false}
      style={{ display: 'block', width, height, borderRadius: Math.max(2, width * 0.045), objectFit: 'cover' }}
    />
  );
}
