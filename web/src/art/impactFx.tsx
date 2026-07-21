// Procedural SVG impact effects — the enemy already gets a color-filter flash
// on hit (battle.css .flash-*); this adds a shape that actually reads as the
// attack connecting, sized/positioned to sweep across the target figure.
export type ImpactKind = 'slash' | 'pierce' | 'fire' | 'frost' | 'bolt' | 'dark' | 'holy' | 'hit';

const IMPACT_COLOR: Record<ImpactKind, string> = {
  slash: '#f8f5ec',
  pierce: '#f0e8d8',
  fire: '#ff8a3c',
  frost: '#9fd8f0',
  bolt: '#f8e04a',
  dark: '#b888e8',
  holy: '#ffe89a',
  hit: '#f0e8d8',
};

export function ImpactEffect({ kind }: { kind: ImpactKind }) {
  const color = IMPACT_COLOR[kind];
  return (
    <div className="impact-fx-anchor">
      <svg viewBox="0 0 200 200" preserveAspectRatio="none" className={`impact-fx-inner impact-fx-${kind}`} style={{ color }}>
        {kind === 'slash' && (
          <g fill="none" stroke="currentColor" strokeLinecap="round">
            <path d="M-10 55 Q 100 95 210 30" strokeWidth="20" opacity="0.55" />
            <path d="M-10 100 Q 100 145 210 80" strokeWidth="15" opacity="0.85" />
            <path d="M-10 145 Q 100 185 210 125" strokeWidth="9" opacity="1" />
          </g>
        )}
        {kind === 'pierce' && (
          <g fill="currentColor">
            <path d="M-10 92 L180 86 L215 100 L180 114 L-10 108 Z" />
          </g>
        )}
        {(kind === 'hit' || kind === 'holy') && (
          <g fill="currentColor">
            <path d="M100 10 L118 82 L190 100 L118 118 L100 190 L82 118 L10 100 L82 82 Z" />
          </g>
        )}
        {kind === 'fire' && (
          <g fill="currentColor">
            <path
              d="M100 25 C 132 58 144 92 120 114 C 138 108 154 122 148 146
                 C 140 176 106 190 76 181 C 44 172 30 144 43 116
                 C 32 122 21 116 24 100 C 29 68 56 40 100 25 Z"
            />
          </g>
        )}
        {kind === 'frost' && (
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M100 8 L100 192 M8 100 L192 100 M28 28 L172 172 M172 28 L28 172" strokeWidth="10" opacity="0.9" />
            <path d="M100 8 L84 38 M100 8 L116 38 M8 100 L38 84 M8 100 L38 116" strokeWidth="7" opacity="0.8" />
          </g>
        )}
        {kind === 'bolt' && (
          <g fill="currentColor">
            <path d="M115 5 L50 110 L95 110 L75 195 L160 78 L108 78 Z" />
          </g>
        )}
        {kind === 'dark' && (
          <g fill="none" stroke="currentColor" strokeLinecap="round">
            <path d="M20 170 C 55 100 45 55 100 32 C 158 8 182 55 168 100" strokeWidth="12" opacity="0.85" />
            <path d="M38 188 C 72 128 66 78 118 55" strokeWidth="8" opacity="0.7" />
          </g>
        )}
      </svg>
    </div>
  );
}
