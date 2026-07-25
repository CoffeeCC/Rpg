import { useEffect, useRef } from 'react';
import { renderLight, type Occluder } from '../art/lightEngine';
import '../lightlayer.css';

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
  reach = 620,
  intensity = 0.62,
  color = [255, 186, 92] as [number, number, number],
  flameSize = 26,
  lamp = false,
}: {
  /** Elements that stop light. Measured live. */
  occluderSelector: string;
  /** Element the flame hangs at the top-centre of. Falls back to the layer. */
  anchorSelector?: string;
  reach?: number;
  intensity?: number;
  color?: [number, number, number];
  flameSize?: number;
  /** Render the visible lantern at the source, guttering on the same noise. */
  lamp?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const occludersRef = useRef<Occluder[]>([]);
  const anchorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lampRef = useRef<HTMLDivElement>(null);

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
      } else {
        // Hung over the square: top centre, a little way down from the edge.
        anchorRef.current = { x: w / 2, y: h * 0.08 };
      }

      // Park the visible lamp on the source, in CSS px (canvas is half-res).
      if (lampRef.current) {
        lampRef.current.style.left = `${anchorRef.current.x / SCALE}px`;
        lampRef.current.style.top = `${anchorRef.current.y / SCALE}px`;
      }
    };

    measure();

    const start = performance.now();
    const frame = (now: number) => {
      const live = renderLight(
        ctx,
        w,
        h,
        { pos: anchorRef.current, reach: reach * SCALE, intensity, color, size: flameSize * SCALE },
        occludersRef.current,
        (now - start) / 1000,
        !reduced.matches,
      );
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
  }, [occluderSelector, anchorSelector, reach, intensity, color, flameSize, lamp]);

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
