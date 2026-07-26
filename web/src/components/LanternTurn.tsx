// v12: the Last Lantern IS the turn marker. It holds bright and steady while
// the turn is yours; when you pass, the light dims and "the dark moves." One
// painting (art/fx/lantern.png, black keyed transparent), all state in CSS:
// a warm radial bloom, animated rays, and drifting embers on the player turn.
//
// v21 (lighting pass): the Lantern is now a real light SOURCE, not a picture
// of one. Two decorative layers were added and every layer's job is spelled
// out below; the light model, the flicker technique and the Steam Deck
// performance contract all live in lighting.css — read that file first.
// Every span here is `aria-hidden` and pointer-transparent (lighting.css §1):
// the button's hit area is its own round shape and nothing else, because the
// rectangular <img> used to swallow clicks meant for the party-target buttons
// laid out underneath it in the panel's corner.

const LANTERN_SRC = `${(import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? ''}art/fx/lantern.png`;

/**
 * `hostRef` is how §19.1's lantern CRADLE finds this button, and it is the only
 * thing this file gained for it.
 *
 * A ref callback writes no style, class, attribute or child — `render/
 * battleScene.ts` measures the box and draws a housing BEHIND it, exactly as
 * the portrait bezels do for `.bf-ring`. Optional because `FloorScreen` mounts
 * the same control and has no console to fit it into; absent, this component is
 * byte-for-byte what it was.
 */
export function LanternTurn({
  yours,
  onEndTurn,
  hostRef,
}: {
  yours: boolean;
  onEndTurn: () => void;
  hostRef?: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={hostRef}
      className={`lantern-turn ${yours ? 'lantern-bright' : 'lantern-dim'}`}
      onClick={() => yours && onEndTurn()}
      disabled={!yours}
      title={yours ? 'Your turn — click the Lantern to hand the light back to the dark (E)' : 'The dark moves…'}
      aria-label={yours ? 'End turn' : 'Enemy turn in progress'}
    >
      {/* The light this lantern THROWS. Screen-blended, so it brightens the
          pixels beneath it in their own colours instead of laying a flat wash
          over them. Behind everything (z0). */}
      <span className="lantern-cast" aria-hidden="true" />
      {/* The bloom around the glass. One element, two guttering layers on its
          pseudo-elements at incommensurable periods — see lighting.css §0b. */}
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
      {/* The hot core, sitting ON the glass in front of the painting. The
          smallest and fastest-guttering layer — this is what reads as "there
          is a flame in there" rather than "there is a glow behind there". */}
      <span className="lantern-flame" aria-hidden="true" />
      <span className="lantern-caption">{yours ? 'End Turn' : 'The dark moves…'}</span>
    </button>
  );
}
