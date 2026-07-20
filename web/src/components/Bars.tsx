interface BarProps {
  label: string;
  current: number;
  max: number;
  kind: 'hp' | 'mp';
}

export function Bar({ label, current, max, kind }: BarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className="bar-row">
      <span className="label">{label}</span>
      <div className="bar-track">
        <div className={`bar-fill ${kind}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="value">
        {current}/{max}
      </span>
    </div>
  );
}
