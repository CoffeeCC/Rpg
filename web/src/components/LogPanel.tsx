interface LogPanelProps {
  lines: string[];
  recentCount?: number;
  /** v11: hero name + party nicknames, for actor-coloring ally lines. */
  allyNames?: string[];
}

type LineKind = 'turn' | 'ko' | 'heal' | 'telegraph' | 'ally' | 'enemy' | 'info';

// v11 battle readability: every line gets an actor/kind class so the log
// reads at a glance — green = yours, red = theirs, gold = telegraphs.
function classify(line: string, allyNames: string[]): LineKind {
  if (line.startsWith('⸻')) return 'turn';
  if (/falls|felled|will not come home|will not rise|is felled|The light leaves/.test(line)) return 'ko';
  if (line.includes(' — ') && line.endsWith('!')) return 'telegraph';
  if (line.includes('recovers') || line.includes('(+')) return 'heal';
  if (allyNames.some((n) => n && line.startsWith(n))) return 'ally';
  if (/strikes|suffers|withers|is Burned|is Poisoned|is Stunned|is Frozen|lessens you|feeds on/.test(line)) return 'enemy';
  return 'info';
}

const KIND_GLYPH: Record<LineKind, string> = {
  turn: '',
  ko: '☠',
  heal: '✚',
  telegraph: '⚡',
  ally: '⮞',
  enemy: '◂',
  info: '·',
};

export function LogPanel({ lines, recentCount = 6, allyNames = [] }: LogPanelProps) {
  const reversed = [...lines].reverse();
  return (
    <div className="log">
      {reversed.map((line, i) => {
        const kind = classify(line, allyNames);
        if (kind === 'turn') {
          return (
            <div key={lines.length - i} className="log-line log-turn">
              {line}
            </div>
          );
        }
        return (
          <div key={lines.length - i} className={`log-line log-${kind} ${i < recentCount ? 'recent' : ''}`}>
            <span className="log-glyph">{KIND_GLYPH[kind]}</span> {line}
          </div>
        );
      })}
    </div>
  );
}
