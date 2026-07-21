// v12: the Last Lantern IS the turn marker. It holds bright and steady while
// the turn is yours; when you pass, the light dims and "the dark moves." One
// painting (art/fx/lantern.png, black keyed transparent), all state in CSS:
// a warm radial bloom, animated rays, and drifting embers on the player turn.

const LANTERN_SRC = `${(import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? ''}art/fx/lantern.png`;

export function LanternTurn({ yours, onEndTurn }: { yours: boolean; onEndTurn: () => void }) {
  return (
    <button
      className={`lantern-turn ${yours ? 'lantern-bright' : 'lantern-dim'}`}
      onClick={() => yours && onEndTurn()}
      disabled={!yours}
      title={yours ? 'Your turn — click the Lantern to hand the light back to the dark (E)' : 'The dark moves…'}
      aria-label={yours ? 'End turn' : 'Enemy turn in progress'}
    >
      <span className="lantern-glow" aria-hidden="true" />
      <span className="lantern-rays" aria-hidden="true" />
      {yours && (
        <span className="lantern-embers" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="ember" style={{ ['--e' as string]: i }} />
          ))}
        </span>
      )}
      <img src={LANTERN_SRC} alt="" className="lantern-img" draggable={false} />
      <span className="lantern-caption">{yours ? 'End Turn' : 'The dark moves…'}</span>
    </button>
  );
}
