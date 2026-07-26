// =========================================================================
// THE CANVAS UNDER THE FIGHT — `?r=lantern` on the battlefield.
//
// The map's counterpart is `components/LanternMap.tsx` and this is deliberately
// its twin: it owns a canvas, a device, a frame loop and a camera, and it draws
// underneath a DOM tree it does not modify. ENGINE_PLAN §1.2, again:
//
//   THE GPU DRAWS EVERY SURFACE. THE DOM DRAWS TEXT AND HIT TARGETS.
//
// The one structural difference is which way the two coordinate systems are
// reconciled, and `render/battleScene.ts`'s header is where that is argued: the
// map CARRIES a square DOM lattice onto the projected board with one CSS
// transform, and an arena has no lattice to carry, so this measures the DOM's
// own boxes and solves for the camera that stands a piece in each one.
//
// So this component WRITES NOTHING to the DOM. It reads `.bf-figure` rects and
// draws. Every click target, every `title`, every `data-nav-item`, the two heal
// aim registrations, `elementFromPoint`, the aim line's `getBoundingClientRect`
// maths and the whole `--bf-scale` ladder are untouched and cannot be broken by
// anything in this file.
//
// IF ANYTHING HERE FAILS — no WebGL2, no float targets, a lost context — it
// renders nothing and says why. The DOM battlefield is still underneath doing
// its job, which is §4's flag working as designed.
// =========================================================================

import { useEffect, useRef, useState } from 'react';
import { createDevice, type Device } from '../lantern/gl/device';
import { Renderer } from '../lantern/renderer';
import { makeCamera, DEFAULT_TILT, type Camera } from '../lantern/scene/camera';
import { formatHud, type HudStats } from '../lantern/debug/hud';
import {
  ARENA_BORDER,
  ARENA_DEPTH,
  arenaCamera,
  buildBattleScene,
  type FieldAnchors,
  type FigureBox,
} from './battleScene';
import {
  createBattleMaterialLibrary,
  requestArenaFloor,
  requestBackdrop,
  requestBoardFurniture,
  requestFigureArt,
  type BattleMaterialLibrary,
} from './battleMaterials';
import './lanternBattle.css';

/**
 * The grade, carried over from the map rather than re-tuned by eye.
 *
 * Same numbers, same reasons (`LanternMap.tsx`): AgX over ACES because ACES
 * eats the lantern's warmth (§9.6), and a bloom threshold above 1 so only the
 * candle flames clear it. An arena is brighter than a dungeon corridor — see
 * the ambient note in `battleScene.ts` — so the threshold does more work here:
 * at the renderer's own 1.0 default the whole lit floor blooms and the fight
 * goes milky.
 */
const LOOK = {
  exposure: 1,
  bloomStrength: 0.32,
  bloomThreshold: 1.25,
  tonemap: 'agx' as const,
};

/** One combatant, as the component needs to know about it. */
export interface BattleFigureRef {
  uid: string;
  side: 'enemy' | 'ally';
  /** Material id for the painted figure, or null for a bare plinth. */
  textureId: string | null;
  /** Where that painting lives. Null means there is none — 41 of 92 monsters. */
  artUrl: string | null;
  felled?: boolean;
  acting?: boolean;
  /** Mirror the art, so the near rank faces up-board at the far one. */
  flip?: boolean;
}

export interface LanternBattlefieldProps {
  /**
   * The live `.bf-figure` boxes, keyed by uid.
   *
   * A ref rather than a prop of rects on purpose: rects are measured in the
   * frame loop, so a 60 fps camera never re-renders `BattleStage`. The map made
   * the same call for the same reason.
   */
  figureRefs: React.RefObject<Map<string, HTMLElement>>;
  figures: readonly BattleFigureRef[];
  /** §8 item 9's explicit uniform: how much of the rail is still burning. */
  energy: number;
  maxEnergy: number;
  /** The opponent's, in a duel. Undefined against a monster — see `candleFrameRightX`. */
  enemyEnergy?: number;
  enemyMaxEnergy?: number;
  /** The gate's ground texture, or null off-gate (a duel is chalked in town). */
  arenaUrl: string | null;
  /** The painting that stands behind the fight. Data now, not a `ReactNode`. */
  backdropUrl: string | null;
  debug?: boolean;
}

export function LanternBattlefield({
  figureRefs,
  figures,
  energy,
  maxEnergy,
  enemyEnergy,
  enemyMaxEnergy,
  arenaUrl,
  backdropUrl,
  debug = false,
}: LanternBattlefieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState('');

  // Everything the loop reads lives behind a ref: the loop runs at 60 fps and
  // must never be a reason for React to re-render the fight underneath it.
  const figuresRef = useRef(figures);
  figuresRef.current = figures;
  const vigorRef = useRef({ lit: energy, total: maxEnergy });
  vigorRef.current = { lit: energy, total: maxEnergy };
  // `undefined` is meaningful here and is NOT the same as zero: no vigor at all
  // leaves the right rail's sockets empty, while zero burns none of a rail that
  // is really there. A duel that has spent its last point must still show the
  // wax it spent.
  const foeVigorRef = useRef<{ lit: number; total: number } | undefined>(undefined);
  foeVigorRef.current =
    enemyMaxEnergy === undefined ? undefined : { lit: enemyEnergy ?? 0, total: enemyMaxEnergy };
  const libRef = useRef<BattleMaterialLibrary | null>(null);
  const camRef = useRef<Camera>(makeCamera({ tilt: DEFAULT_TILT }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // THE CANVAS IS CREATED HERE, NOT RENDERED BY REACT, and it is a fix rather
    // than a style preference — the same one `LanternMap` records. `Device
    // .dispose` ends with `loseContext()`, and a lost context is PERMANENTLY
    // lost for that canvas element: the next `getContext('webgl2')` hands back
    // the same dead object and every `getExtension` on it returns null. Under
    // StrictMode's mount/unmount/remount that reads as "EXT_color_buffer_float
    // is missing", which is an accurate description of a corpse and a
    // completely misleading description of the machine.
    const canvas = document.createElement('canvas');
    canvas.className = 'lantern-canvas';
    host.appendChild(canvas);

    const result = createDevice(canvas);
    if (!result.device) {
      setError(result.reason ?? result.status);
      canvas.remove();
      return;
    }
    setError(null);
    const device: Device = result.device;
    const renderer = new Renderer(device);
    const lib = createBattleMaterialLibrary(device.gl, {
      width: 12,
      height: ARENA_DEPTH,
      border: ARENA_BORDER,
    });
    libRef.current = lib;
    // The frame-fixed furniture (§19.1): sockets, the rail strip, the
    // near-left corner. Requested once per fight — nothing here changes
    // between frames, unlike the backdrop or the figures' painted art.
    requestBoardFurniture(lib);

    let raf = 0;
    let disposed = false;
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

    /**
     * Read the fight's live geometry.
     *
     * READS ONLY. Nothing in this function writes a style, a class or an
     * attribute, which is what keeps a per-frame `getBoundingClientRect` sweep
     * to a single layout pass instead of a read/write thrash — and there are
     * about ten boxes, not three hundred.
     */
    function measure(scale: number): { anchors: FieldAnchors; boxes: FigureBox[] } {
      const hostRect = host!.getBoundingClientRect();
      const boxes: FigureBox[] = [];
      let enemyFeet: number | null = null;
      let partyFeet: number | null = null;
      for (const f of figuresRef.current) {
        const el = figureRefs.current?.get(f.uid);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const feetY = (r.bottom - hostRect.top) * scale;
        boxes.push({
          uid: f.uid,
          side: f.side,
          cx: (r.left - hostRect.left + r.width / 2) * scale,
          feetY,
          w: r.width * scale,
          h: r.height * scale,
          textureId: f.textureId,
          felled: f.felled,
          acting: f.acting,
          flip: f.flip,
        });
        // The rows are `align-items: flex-end`, so every unit in one shares a
        // feet line — but a mid-transition hover lift can move one of them, and
        // the LOWEST is the one standing on the board.
        if (f.side === 'enemy') enemyFeet = enemyFeet === null ? feetY : Math.max(enemyFeet, feetY);
        else partyFeet = partyFeet === null ? feetY : Math.max(partyFeet, feetY);
      }
      // THE CANDLE RAIL IS NOT MEASURED. It used to be pinned to the DOM
      // `.vigor-rail`'s right edge, which put the board's candles next to the
      // HUD's candles and read as two rails — and made board furniture a
      // function of HUD layout, so the narrow breakpoint moved them. It is
      // authored against the frame now: `battleScene.CANDLE_FRAME_X`.
      return {
        anchors: {
          viewport: { x: hostRect.width * scale, y: hostRect.height * scale },
          enemyFeet,
          partyFeet,
        },
        boxes,
      };
    }

    function frameAt(nowMs: number): HudStats | null {
      if (disposed) return null;
      const cssW = Math.max(64, host!.clientWidth);
      const cssH = Math.max(64, host!.clientHeight);
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      device.resize(cssW, cssH, dpr);
      const dev = device.size();
      // ONE camera, and it lives in DEVICE pixels because that is the only
      // space the vertex shader knows. The map keeps a CSS-pixel camera because
      // it has to hand the same projection to a CSS transform; nothing here
      // writes to the DOM, so measuring straight into device pixels removes a
      // conversion and the class of bug that comes with it.
      const scale = dev.width / cssW;

      const { anchors, boxes } = measure(scale);
      const cam = arenaCamera(anchors);
      camRef.current = cam;

      const scene = buildBattleScene({
        camera: cam,
        time: (nowMs - start) / 1000,
        materials: lib.materials,
        figures: boxes,
        vigor: vigorRef.current,
        enemyVigor: foeVigorRef.current,
      });
      return renderer.render(scene, LOOK);
    }

    const loop = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const stats = frameAt(now);
      if (stats && debug) setHud(formatHud(stats));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // THE HEADLESS HOOK. `requestAnimationFrame` never fires when the page is
    // not compositing, so every measured check in this project goes through a
    // synchronous render that PINS THE CLOCK — two calls reading
    // `performance.now()` are two different frames and nothing can be diffed.
    // Same contract as `window.__lantern`.
    const hook = {
      frame: (t?: number) => frameAt(t ?? start),
      gl: device.gl,
      canvas,
      camera: () => camRef.current,
      materials: () => Array.from(lib.materials.keys()),
    };
    (window as unknown as { __lanternBattle?: typeof hook }).__lanternBattle = hook;

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      delete (window as unknown as { __lanternBattle?: unknown }).__lanternBattle;
      renderer.dispose();
      lib.dispose();
      libRef.current = null;
      device.dispose();
      canvas.remove();
    };
    // Mounted once per fight: `BattleStage` itself remounts per encounter (the
    // entering-flash effect there says so), so the device's life is the fight's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debug]);

  // The board's own dressing, requested as it changes. `forget` first for the
  // backdrop because the id is fixed and the painting behind it is not.
  useEffect(() => {
    const lib = libRef.current;
    if (!lib) return;
    requestArenaFloor(lib, arenaUrl);
  }, [arenaUrl]);

  useEffect(() => {
    const lib = libRef.current;
    if (!lib) return;
    lib.forget('backdrop');
    requestBackdrop(lib, backdropUrl);
  }, [backdropUrl]);

  useEffect(() => {
    const lib = libRef.current;
    if (!lib) return;
    requestFigureArt(
      lib,
      figures
        .filter((f): f is BattleFigureRef & { textureId: string; artUrl: string } => !!f.textureId && !!f.artUrl)
        .map((f) => ({ textureId: f.textureId, url: f.artUrl })),
    );
  }, [figures]);

  return (
    <div className="lantern-arena" ref={hostRef} aria-hidden="true">
      {/* The canvas is appended by the effect — see the note there. */}
      {error && <p className="lantern-error">Lantern renderer unavailable — {error}</p>}
      {debug && <pre className="lantern-hud">{hud}</pre>}
    </div>
  );
}
