// =========================================================================
// THE CANVAS UNDER THE MAP — `?r=lantern` on the real game.
//
// ENGINE_PLAN §10, §15.1 and §18 all end with the same line: "nothing is wired
// into the game yet." This is the wiring. Everything the renderer has learned
// — HDR, per-pixel lighting, shadows, the slab, pieces, per-tile light binning,
// the faint emitters — draws a real expedition floor here, underneath the DOM
// grid that keeps every click, tooltip, ARIA role and `data-nav-item` exactly
// where they were.
//
// THE SPLIT (§1.2): THE GPU DRAWS EVERY SURFACE, THE DOM DRAWS TEXT AND HIT
// TARGETS. So this component owns a canvas and a camera, and it moves the DOM
// cell lattice onto the projected board with ONE CSS transform — see
// `render/boardCamera.ts` `latticeTransform` for why one transform is enough,
// and why that is what keeps `nav/` working unmodified on all 22 screens.
//
// IT OWNS NO GAME STATE. The reducer moves the hero; this glides the PIECE
// toward where the reducer already put him, which is the same thing
// `FloorScreen` does to `.hero-walker` and for the same reason: the hero IS
// the light source down here, so a hero who teleports is a lantern that
// teleports, and every soft shadow in the frame snaps between two arrangements
// instead of sweeping.
//
// IF ANYTHING HERE FAILS — no WebGL2, no float targets, a lost context — it
// renders nothing and says why. The DOM map is still underneath doing its job,
// which is the whole point of §4's flag.
// =========================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Character } from '../engine/entities/Character';
import type { Expedition } from '../engine/systems/floors';
import { createDevice, type Device } from '../lantern/gl/device';
import { Renderer } from '../lantern/renderer';
import { makeCamera, DEFAULT_TILT, type Camera } from '../lantern/scene/camera';
import { formatHud, type HudStats } from '../lantern/debug/hud';
import { BOARD_BORDER, buildFloorScene, snapshotFloor } from '../render/floorScene';
import { createMaterialLibrary, requestUnitArt, type MaterialLibrary } from '../render/materials';
import {
  clampCentre,
  clampZoom,
  extentCentre,
  followHero,
  latticeCss,
  latticeTransform,
  scaleCamera,
  zoomFor,
  type BoardExtent,
  type CameraMode,
} from '../render/boardCamera';
import { STEP_MS, glidePosition, type Glide } from '../render/walk';
import '../lantern.css';

/**
 * The DOM lattice pitch, in CSS px, while the flag is on.
 *
 * A FIXED number, and that is the fix rather than a shortcut. ENGINE_PLAN §8
 * item 5: `--cell` is resolved across four breakpoints and is "the REAL source
 * of truth for scale today... the renderer must own that ladder explicitly."
 * It does now — `camera.zoom` is the only thing that decides how big a tile
 * draws, and the DOM lattice is a plain unscaled grid that one transform
 * carries onto it. `lantern.css` pins `--cell` to this value so the two cannot
 * drift; a mismatch shows up as hit targets sliding off their tiles as x
 * grows, which is a memorable afternoon.
 */
export const LANTERN_CELL_PX = 48;

/**
 * The grade, carried over from the harness rather than re-tuned by eye.
 *
 * `lantern-board.html` is where every one of these was argued and measured —
 * AgX over ACES because ACES eats the lantern's warmth (§9.6), a bloom
 * threshold above 1 so only the flame and the emitter cores clear it, and the
 * seam defaults `renderer.ts` already documents. The renderer's own defaults
 * differ slightly (bloom 0.55 at threshold 1.0), which on a dark dungeon
 * blooms the lit floor as well as the flame and washes the pool out. Stated
 * here so the game and the harness show the same picture.
 */
const LOOK = {
  exposure: 1,
  bloomStrength: 0.35,
  bloomThreshold: 1.2,
  tonemap: 'agx' as const,
};

export interface LanternMapProps {
  exp: Expedition;
  player: Character;
  bossDefeated: boolean;
  /** The wrapper holding `.map-row`s. Its transform is written every frame. */
  cellsRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Where wheel and pan gestures are listened for — the `.map-grid` itself.
   *
   * NOT the canvas. The canvas sits UNDER the cell lattice and is
   * pointer-transparent, so an event over a tile never reaches it. Listening
   * on the common ancestor is what makes "scroll anywhere over the map to
   * zoom" work instead of "scroll over the margin".
   */
  surfaceRef?: React.RefObject<HTMLElement | null>;
  debug?: boolean;
}

export function LanternMap({ exp, player, bossDefeated, cellsRef, surfaceRef, debug = false }: LanternMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<string>('');
  const [mode, setMode] = useState<CameraMode>('play');

  // The snapshot pays every `Array.includes` once per state change instead of
  // ~250 linear scans per frame. See `render/floorScene.ts`.
  const snap = useMemo(() => snapshotFloor(exp, player, bossDefeated), [exp, player, bossDefeated]);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const modeRef = useRef<CameraMode>(mode);
  modeRef.current = mode;

  // Mutable per-frame state. Deliberately refs and not React state: at 60 fps
  // a `setState` per frame would re-render the whole floor screen, and the
  // whole point of the flag is that the DOM path is untouched underneath.
  const camRef = useRef<Camera>(makeCamera({ tilt: DEFAULT_TILT }));
  const glideRef = useRef<Glide | null>(null);
  const zoomedRef = useRef(false);
  /**
   * The player has taken the camera. Follow stops until the hero moves again.
   *
   * Without this the pan is unusable rather than merely imperfect: follow runs
   * every frame, so dragging the view more than the deadzone away from the
   * hero is undone on the very next frame and the board springs back. §17.1
   * asks for a clamped pan you can actually navigate with, and the natural
   * moment to hand the camera back is the next move — which is also the moment
   * the player has said what they care about.
   */
  const pannedRef = useRef(false);
  const libRef = useRef<MaterialLibrary | null>(null);

  const floorKey = `${exp.gateId}:${exp.floorIndex}`;
  const lastFloorRef = useRef(floorKey);

  // --- the glide ----------------------------------------------------------
  // Arriving on a NEW FLOOR is a cut, not a walk — gliding there would send
  // the piece sailing across the board from wherever it stood on the last one.
  // Same rule, same reason, as `FloorScreen`'s walker.
  useEffect(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const cut = lastFloorRef.current !== floorKey;
    lastFloorRef.current = floorKey;
    const prev = glideRef.current;
    const at = prev && !cut ? glidePosition(prev, now) : { x: exp.x, y: exp.y };
    glideRef.current = { fromX: at.x, fromY: at.y, toX: exp.x, toY: exp.y, start: cut ? now - STEP_MS : now };
    pannedRef.current = false;
  }, [exp.x, exp.y, floorKey]);

  // --- the board, the device, the frame loop ------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // THE CANVAS IS CREATED HERE, NOT RENDERED BY REACT, and that is a fix
    // rather than a style preference.
    //
    // `Device.dispose` ends with `WEBGL_lose_context.loseContext()` — the
    // right thing, since it tells the driver to drop the context now instead
    // of at GC. But a lost context is PERMANENTLY lost for that canvas
    // element: `getContext('webgl2')` hands back the same dead object and
    // every `getExtension` on it returns null.
    //
    // React StrictMode mounts, unmounts and remounts every effect in dev. So a
    // React-owned canvas gets its context created, killed, and then asked for
    // again — and the second `createDevice` reports "EXT_color_buffer_float is
    // missing", which is a completely accurate description of a corpse and a
    // completely misleading description of the machine. It looked exactly like
    // a hardware capability problem and it was a lifecycle one.
    //
    // A canvas that is born and buried with the device cannot have that
    // problem, in dev or after any future remount.
    const canvas = document.createElement('canvas');
    canvas.className = 'lantern-canvas';
    host.appendChild(canvas);
    canvasRef.current = canvas;

    const result = createDevice(canvas);
    if (!result.device) {
      setError(result.reason ?? result.status);
      canvas.remove();
      canvasRef.current = null;
      return;
    }
    setError(null);
    const device: Device = result.device;
    const renderer = new Renderer(device);

    const extent: BoardExtent = { width: snapRef.current.width, height: snapRef.current.height, border: BOARD_BORDER };
    const lib = createMaterialLibrary(device.gl, snapRef.current.gateId, extent);
    libRef.current = lib;
    requestUnitArt(lib, snapRef.current.units.map((u) => u.speciesId ?? '').filter(Boolean));

    // First framing: the whole board, then step in. `zoomedRef` records that
    // the player has taken the wheel, after which the camera stops re-fitting
    // on every resize and leaves the zoom where they put it.
    camRef.current = makeCamera({ tilt: DEFAULT_TILT, centre: extentCentre(extent) });

    let raf = 0;
    let disposed = false;
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

    function frameAt(nowMs: number): HudStats | null {
      if (disposed) return null;
      const cssW = Math.max(64, host!.clientWidth);
      const cssH = Math.max(64, host!.clientHeight);
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      device.resize(cssW, cssH, dpr);
      const dev = device.size();

      const s = snapRef.current;
      const ext: BoardExtent = { width: s.width, height: s.height, border: BOARD_BORDER };
      const cam = camRef.current;
      cam.viewport = { x: cssW, y: cssH };
      if (!zoomedRef.current) cam.zoom = zoomFor(modeRef.current, ext, cam.viewport, cam.tilt);

      const hero = glideRef.current
        ? glidePosition(glideRef.current, nowMs)
        : { x: s.heroTile.x, y: s.heroTile.y };

      if (pannedRef.current) {
        cam.centre = clampCentre(cam.centre, ext, cam.viewport, cam.zoom, cam.tilt);
      } else {
        followHero(cam, hero, ext);
      }

      // ONE camera, in CSS px, scaled into device px for the GPU. See
      // `scaleCamera`: the projection is linear in zoom and viewport, so this
      // is exact rather than an approximation that drifts at fractional DPR.
      const k = dev.width / cssW;
      const glCam: Camera = { ...scaleCamera(cam, k), viewport: { x: dev.width, y: dev.height } };

      const scene = buildFloorScene(s, {
        camera: glCam,
        time: (nowMs - start) / 1000,
        heroAt: hero,
        materials: lib.materials,
      });
      // ONE render call, and every entry point goes through this function.
      // That is deliberate: `lantern-board.html` learned the hard way that a
      // second call site with its own option list silently drops whatever was
      // added last, and a pixel diff against a dropped option reports zero
      // change — which looks exactly like a dead feature.
      const stats = renderer.render(scene, LOOK);

      // THE HIT TARGETS follow the projection, not the layout. One transform,
      // written imperatively so a 60 fps camera never re-renders React.
      const cells = cellsRef.current;
      if (cells) cells.style.transform = latticeCss(latticeTransform(cam, LANTERN_CELL_PX));
      return stats;
    }

    const loop = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const stats = frameAt(now);
      if (stats && debug) setHud(formatHud(stats));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // The headless hook. `requestAnimationFrame` never fires when the page is
    // not compositing, so every measured check in this project goes through a
    // synchronous render — and one that PINS THE CLOCK, because two calls that
    // read `performance.now()` are two different frames and nothing can be
    // diffed. Same contract as `lantern-board.html`'s `boardOnce`.
    const hook = {
      frame: (t?: number) => frameAt(t ?? start),
      scene: (t = 0) =>
        buildFloorScene(snapRef.current, {
          camera: camRef.current,
          time: t,
          heroAt: glideRef.current ? glidePosition(glideRef.current, start) : snapRef.current.heroTile,
          materials: lib.materials,
        }),
      gl: device.gl,
      canvas,
      camera: () => camRef.current,
      /** Where the PIECE is right now, which mid-step is not where the hero is. */
      heroAt: (t?: number) =>
        glideRef.current
          ? glidePosition(glideRef.current, t ?? (typeof performance !== 'undefined' ? performance.now() : Date.now()))
          : snapRef.current.heroTile,
    };
    (window as unknown as { __lantern?: typeof hook }).__lantern = hook;

    // --- input ----------------------------------------------------------
    // SCROLL TO ZOOM, multiplicative, for the reason `lantern-board.html`
    // gives: perceived zoom is logarithmic, so a fixed increment crawls when
    // you are zoomed in and lurches when you are zoomed out.
    const surface: HTMLElement = surfaceRef?.current ?? host;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomedRef.current = true;
      camRef.current.zoom = clampZoom(camRef.current.zoom * (e.deltaY > 0 ? 0.92 : 1.087));
    };
    surface.addEventListener('wheel', onWheel, { passive: false });

    // PAN, clamped to the board's own edges (§17.1). Middle-drag or
    // shift-drag, because plain left-drag on a cell is click-to-move and the
    // cells are the layer on top.
    let panning: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 1 && !(e.button === 0 && e.shiftKey)) return;
      e.preventDefault();
      panning = { x: e.clientX, y: e.clientY };
      surface.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!panning) return;
      pannedRef.current = true;
      const cam = camRef.current;
      const cos = Math.cos(cam.tilt);
      // MOVE THE CAMERA, NOT THE BOARD (§17.1). Dragging right pulls the view
      // left, which is what looking across a table does.
      cam.centre = {
        x: cam.centre.x - (e.clientX - panning.x) / cam.zoom,
        y: cam.centre.y - (e.clientY - panning.y) / (cam.zoom * cos),
      };
      const s = snapRef.current;
      cam.centre = clampCentre(cam.centre, { width: s.width, height: s.height, border: BOARD_BORDER }, cam.viewport, cam.zoom, cam.tilt);
      panning = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      panning = null;
    };
    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointermove', onMove);
    surface.addEventListener('pointerup', onUp);
    surface.addEventListener('pointercancel', onUp);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      surface.removeEventListener('wheel', onWheel);
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onUp);
      delete (window as unknown as { __lantern?: unknown }).__lantern;
      renderer.dispose();
      lib.dispose();
      libRef.current = null;
      device.dispose();
      canvas.remove();
      canvasRef.current = null;
      const cells = cellsRef.current;
      if (cells) cells.style.transform = '';
    };
    // The device is rebuilt when the GATE changes, because the tile art it
    // uploads is per-gate. Everything else the loop re-reads from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exp.gateId, debug]);

  // Painted figures arrive as the floor's roster changes.
  useEffect(() => {
    const lib = libRef.current;
    if (!lib) return;
    requestUnitArt(lib, exp.units.map((u) => u.speciesId ?? '').filter(Boolean));
  }, [exp.units]);

  // OVERVIEW versus PLAY (§17). Lean back to survey, lean in to move a piece —
  // which is what a person actually does at a table.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'o' && e.key !== 'O') return;
      e.preventDefault();
      zoomedRef.current = false;
      setMode((m) => (m === 'overview' ? 'play' : 'overview'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="lantern-stage" ref={hostRef} aria-hidden="true">
      {/* The canvas is appended by the effect — see the note there. */}
      {error && <p className="lantern-error">Lantern renderer unavailable — {error}</p>}
      <p className="lantern-chip">
        LANTERN · {mode} · O framing · scroll zoom · shift-drag pan
      </p>
      {debug && <pre className="lantern-hud">{hud}</pre>}
    </div>
  );
}
