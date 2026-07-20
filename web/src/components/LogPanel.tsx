interface LogPanelProps {
  lines: string[];
  recentCount?: number;
}

export function LogPanel({ lines, recentCount = 6 }: LogPanelProps) {
  const reversed = [...lines].reverse();
  return (
    <div className="log">
      {reversed.map((line, i) => (
        <div key={lines.length - i} className={`log-line ${i < recentCount ? 'recent' : ''}`}>
          {line}
        </div>
      ))}
    </div>
  );
}
