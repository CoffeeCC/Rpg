import { useEffect, useRef } from 'react';
import { bakeMurkTiles, renderLight, type MurkTiles, type Occluder } from '../art/lightEngine';
import '../lightlayer.css';
import '../lightresponse.css';

/**
 * The murk is baked ONCE for the whole app, not once per layer.
 *
 * It is a couple of 160px tiles of 3-octave noise — cheap to draw and not
 * cheap to compute, and every screen that lights anything wants the same two.
 * Lazy, because it touches `document` and this module gets imported by tests
 * that have no DOM.
 */
let MURK: MurkTiles | null = null;
function murkTiles(): MurkTiles | undefined {
  if (typeof document === 'undefined') return undefined;
  if (!MURK) MURK = bakeMurkTiles();
  return MURK;
}

/** The same painted lantern the battle screen hangs. */
const LAMP_SRC = `${(import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? ''}art/fx/lantern.png`;

/**
 * A real light, hung over a real screen.
 *
 * The occluders are not a hand-written list of boxes. They are read from the
 * LIVE DOM every time the layout changes: whatever elements match
 * `occluderSelector` are measured, and those measurements are what the engine
 * casts shadows from. So the thing throwing a shadow on screen is always
 * exactly the thing the player sees standing there — add an NPC to the town,
 * and the new card starts blocking light without anybody editing this file.
 *
 * Cost control, in order of how much they save:
 *  - the canvas is drawn at HALF resolution and scaled up by CSS. Light is
 *    all low spatial frequency; at 1280x800 the upscale is invisible and it
 *    quarters the fill cost.
 *  - occluders are re-measured on resize/mutation, NOT per frame. Measuring
 *    forces layout; doing it in the rAF loop would be the one genuinely
 *    expensive mistake available here.
 *  - the loop stops itself when the tab is hidden or motion is reduced.
 */
export function LightLayer({
  occluderSelector,
  anchorSelector,
  responderSelector,
  reach = 620,
  reachCells,
  intensity = 0.62,
  flameSize = 26,
  lamp = false,
  ambient,
  maxDarkness,
  version,
}: {
  /** Elements that stop light. Measured live. */
  occluderSelector: string;
  /** Element the flame hangs at the top-centre of. Falls back to the layer. */
  anchorSelector?: string;
  /**
   * Elements that RESPOND to the light — chests, shrines, units, the things
   * worth picking up. Each gets `--lit` (how much light is landing on it) and
   * `--lx`/`--ly` (which way the flame is, as a unit vector) written on it, and
   * lightresponse.css turns those into a directional sheen, a rim on the side
   * facing the flame, and a glint. See `paintResponders`.
   */
  responderSelector?: string;
  reach?: number;
  /**
   * Reach in TILES rather than px, measured off the anchor element's width.
   *
   * On the map this is the whole point: the lantern reaches exactly as far as
   * the hero can walk, so "lit" and "I can move there" stop being two
   * different claims the UI has to reconcile with gold chips. Overrides
   * `reach` when set. Cells because the tile size is a CSS token that changes
   * at four breakpoints — px here would silently mean a different number of
   * tiles on a handheld than on the Deck.
   */
  reachCells?: number;
  intensity?: number;
  flameSize?: number;
  /** Render the visible lantern at the source, guttering on the same noise. */
  lamp?: boolean;
  /** Light left in full shadow. Lower = a harsher, more enclosed place. */
  ambient?: number;
  /** How dark unlit ground gets, 0..1. */
  maxDarkness?: number;
  /**
   * Bump to force a re-measure.
   *
   * On the map the light SOURCE moves — the hero walks, and `.map-cell.player`
   * becomes a different element. That is a class change, not a childList
   * change, so the MutationObserver below never sees it; without this the
   * lantern would stay parked where the hero entered the floor. Feeding the
   * hero's position in as a version string is far cheaper than observing
   * attributes across ~250 map cells.
   */
  version?: string | number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const occludersRef = useRef<Occluder[]>([]);
  const anchorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lampRef = useRef<HTMLDivElement>(null);
  /** Things that catch the light, with their centres. Measured, never per frame. */
  const respondersRef = useRef<{ el: HTMLElement; x: number; y: number; phase: number }[]>([]);
  const reachRef = useRef(reach);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const SCALE = 0.5;
    let raf = 0;
    let w = 0;
    let h = 0;

    /** Re-measure everything. Layout-reading, so never called from the loop. */
    const measure = () => {
      const box = host.getBoundingClientRect();
      w = Math.max(1, Math.round(box.width * SCALE));
      h = Math.max(1, Math.round(box.height * SCALE));
      canvas.width = w;
      canvas.height = h;

      occludersRef.current = [...document.querySelectorAll(occluderSelector)]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            x: (r.left - box.left) * SCALE,
            y: (r.top - box.top) * SCALE,
            w: r.width * SCALE,
            h: r.height * SCALE,
          };
        })
        // Anything with no area cannot block anything, and a zero-width rect
        // would produce a degenerate shadow quad.
        .filter((o) => o.w > 1 && o.h > 1);

      const anchorEl = anchorSelector ? document.querySelector(anchorSelector) : null;
      if (anchorEl) {
        const a = anchorEl.getBoundingClientRect();
        anchorRef.current = { x: (a.left + a.width / 2 - box.left) * SCALE, y: (a.top + a.height * 0.5 - box.top) * SCALE };
        // Reach in tiles, resolved against the tile the hero is standing on —
        // so it tracks --cell across every breakpoint without knowing it exists.
        reachRef.current = reachCells != null && a.width > 1 ? a.width * reachCells : reach;
      } else {
        // Hung over the square: top centre, a little way down from the edge.
        anchorRef.current = { x: w / 2, y: h * 0.08 };
        reachRef.current = reach;
      }

      respondersRef.current = responderSelector
        ? [...document.querySelectorAll<HTMLElement>(responderSelector)].map((el, i) => {
            const r = el.getBoundingClientRect();
            return {
              el,
              x: (r.left + r.width / 2 - box.left) * SCALE,
              y: (r.top + r.height / 2 - box.top) * SCALE,
              // Every glint on its own phase. A room where twelve things
              // twinkle on the same beat is a room with one animation in it.
              phase: (i * 2.399) % 6.283,
            };
          })
        : [];

      // Park the visible lamp on the source, in CSS px (canvas is half-res).
      if (lampRef.current) {
        lampRef.current.style.left = `${anchorRef.current.x / SCALE}px`;
        lampRef.current.style.top = `${anchorRef.current.y / SCALE}px`;
      }
    };

    measure();

    /**
     * Tell each object how the light is hitting it.
     *
     * This is the closest thing to a specular term available without normal
     * maps, and it is not a fake: the sheen sits on the side of the object the
     * flame is actually on, brightens by the same inverse-square the canvas
     * uses, and swings as the hero walks around it. A painted highlight cannot
     * do that — it points the same way from every angle, which is exactly what
     * makes painted "shine" read as a sticker.
     *
     * Every fourth frame. Light on a static object changes slowly (the hero
     * moves in 95ms steps, the flicker is low-frequency), and a custom-property
     * write on a dozen elements is a style invalidation on a dozen elements —
     * the one thing in this file that could actually cost the frame budget.
     */
    let tick = 0;
    const paintResponders = (src: { x: number; y: number }, flicker: number, t: number) => {
      const list = respondersRef.current;
      if (!list.length) return;
      const reachPx = reachRef.current * SCALE;
      for (const r of list) {
        const dx = src.x - r.x;
        const dy = src.y - r.y;
        const dist = Math.hypot(dx, dy) || 1;
        const d = Math.min(1, dist / reachPx);
        // The same profile the canvas cuts with, so an object never claims to
        // be catching light the pool around it says is not there.
        const lit = Math.max(0, (1 / (1 + 14 * d * d)) * Math.pow(Math.max(0, 1 - d * d), 2) * 3.2) * flicker;
        const st = r.el.style;
        st.setProperty('--lit', lit.toFixed(3));
        st.setProperty('--lx', (dx / dist).toFixed(3));
        st.setProperty('--ly', (dy / dist).toFixed(3));
        // A glint is a highlight the size of a point — it does not fade in and
        // out, it CATCHES. Sharpened to a spike so most of the cycle is dark
        // and the flash is brief, and gated on real light so nothing sitting
        // out in the dark twinkles at you.
        const spark = Math.pow(Math.max(0, Math.sin(t * 1.6 + r.phase)), 12);
        st.setProperty('--twinkle', (spark * Math.min(1, lit * 1.4)).toFixed(3));
      }
    };

    const start = performance.now();
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const live = renderLight(
        ctx,
        w,
        h,
        { pos: anchorRef.current, reach: reachRef.current * SCALE, intensity, size: flameSize * SCALE },
        occludersRef.current,
        t,
        !reduced.matches,
        ambient,
        maxDarkness,
        murkTiles(),
      );
      if (tick++ % 4 === 0) paintResponders(live.src, live.flicker, t);
      // ONE custom-property write, on ONE element, per frame. The lamp is a
      // child of this host, so it inherits without any element of its own
      // being touched — style invalidation stays confined to this subtree
      // instead of walking the town's whole card list.
      if (lampRef.current) {
        const st = lampRef.current.style;
        st.setProperty('--lamp-flicker', live.flicker.toFixed(3));
        st.setProperty('--lamp-x', `${(live.lean / SCALE).toFixed(1)}px`);
        st.setProperty('--lamp-y', `${(live.bob / SCALE).toFixed(1)}px`);
      }
      // Reduced motion is a still frame, so there is nothing to schedule.
      if (!reduced.matches && !document.hidden) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced.matches) raf = requestAnimationFrame(frame);
    };
    const ro = new ResizeObserver(() => {
      measure();
      if (reduced.matches) requestAnimationFrame(frame);
    });
    ro.observe(host);
    // The cast list grows and shrinks (badges, services, orb count), and each
    // change moves the things that block light.
    const mo = new MutationObserver(() => measure());
    mo.observe(host, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', onVisibility);
    reduced.addEventListener('change', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onVisibility);
    };
  }, [occluderSelector, anchorSelector, responderSelector, reach, reachCells, intensity, flameSize, lamp, ambient, maxDarkness, version]);

  return (
    <div className="light-layer" ref={hostRef} aria-hidden="true">
      <canvas ref={canvasRef} className="light-layer-canvas" />
      {lamp && (
        <div className="light-lamp" ref={lampRef}>
          <img src={LAMP_SRC} alt="" className="light-lamp-img" draggable={false} />
          <span className="light-lamp-flame" />
        </div>
      )}
    </div>
  );
}
