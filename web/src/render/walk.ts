// =========================================================================
// THE STEP CADENCE — one number, three consumers.
//
// `FloorScreen` walks a click-to-move path one MOVE per `STEP_MS`; `floor.css`
// §12 transitions `.hero-walker` over the same interval; and the Lantern
// renderer glides the hero PIECE across the board over it too. All three have
// to agree or a multi-tile walk either stutters (steps slower than the glide)
// or snaps at each tile (faster).
//
// It lived as a private const in `FloorScreen` while there were two consumers
// and one of them was a stylesheet. A third consumer in a different directory
// is what makes it worth stating once — `test/walk.test.ts` asserts the CSS
// still says the same number, because the stylesheet is the one copy no import
// can keep honest.
// =========================================================================

/** How long one tile takes, in ms. */
export const STEP_MS = 190;

/**
 * Where a piece is, part way through a step.
 *
 * LINEAR, deliberately, and for the reason floor.css already gives: an eased
 * step accelerates and decelerates inside EVERY tile, so a five-tile walk
 * reads as five separate lunges. Linear segments chain into one continuous
 * travel. The gait bob is a separate, faster cycle and belongs to the art.
 */
export function stepProgress(elapsedMs: number, stepMs = STEP_MS): number {
  if (stepMs <= 0) return 1;
  const t = elapsedMs / stepMs;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** A piece in transit: where it left, where it is going, and when it started. */
export interface Glide {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** `performance.now()` at the moment the step began. */
  start: number;
}

/**
 * Where the piece is, part way between the tile it left and the one it is on.
 *
 * The reducer has ALREADY moved the hero when this is being evaluated — the
 * glide is presentation, exactly as `FloorScreen` transitions `.hero-walker`
 * while the game state has long since committed. It matters more here than
 * there, though, because on the canvas the hero IS the light: a piece that
 * teleports drags every shadow in the room with it between two frames, and all
 * the work the engine does on soft shadows is invisible if the thing casting
 * them never travels.
 */
export function glidePosition(g: Glide, nowMs: number): { x: number; y: number } {
  const t = stepProgress(nowMs - g.start);
  return { x: lerp(g.fromX, g.toX, t), y: lerp(g.fromY, g.toY, t) };
}
