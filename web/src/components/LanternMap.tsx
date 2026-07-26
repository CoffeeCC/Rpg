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
  FRAMING_MS,
  clampCentre,
  extentCentre,
  followHero,
  latticeCss,
  latticeTransform,
  pinchFactor,
  scaleCamera,
  touchSpan,
  tweenDone,
  tweenZoom,
  zoomAbout,
  zoomFor,
  type BoardExtent,
  type CameraMode,
  type TouchSpan,
  type ZoomTween,
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
  /** A framing change in flight, or null. See `boardCamera.ZoomTween`. */
  const tweenRef = useRef<ZoomTween | null>(null);

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
      // THE FRAMING, in priority order. A framing change in flight owns the
      // zoom outright; failing that the camera re-fits on resize, until the
      // player takes the wheel and `zoomedRef` hands it over for good.
      const tw = tweenRef.current;
      if (tw) {
        cam.zoom = tweenZoom(tw, nowMs);
        if (tweenDone(tw, nowMs)) tweenRef.current = null;
      } else if (!zoomedRef.current) {
        cam.zoom = zoomFor(modeRef.current, ext, cam.viewport, cam.tilt);
      }

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

    /**
     * The camera's screen space is the HOST's box, not the viewport's — that
     * is what `cam.viewport` is set from every frame. Anchoring against raw
     * `clientX` works only while the canvas happens to start at the window
     * edge, and drifts by exactly the offset the moment anything sits beside
     * it.
     */
    const toSurface = (clientX: number, clientY: number) => {
      const r = host!.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };
    const currentExtent = (): BoardExtent => {
      const s = snapRef.current;
      return { width: s.width, height: s.height, border: BOARD_BORDER };
    };

    // Zoom about the CURSOR, not the frame centre — see `zoomAbout`. Still
    // multiplicative, for the reason `lantern-board.html` gives: perceived zoom
    // is logarithmic, so a fixed increment crawls when you are zoomed in and
    // lurches when you are zoomed out.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomedRef.current = true;
      tweenRef.current = null; // the hand beats the framing key
      pannedRef.current = true; // zooming somewhere IS choosing where to look
      zoomAbout(camRef.current, toSurface(e.clientX, e.clientY), e.deltaY > 0 ? 0.92 : 1.087, currentExtent());
    };
    surface.addEventListener('wheel', onWheel, { passive: false });

    // PAN, clamped to the board's own edges (§17.1). Middle-drag or
    // shift-drag, because plain left-drag on a cell is click-to-move and the
    // cells are the layer on top.
    let panning: { x: number; y: number } | null = null;
    /** Live touch contacts, by pointerId. Mouse and pen never enter this. */
    const touches = new Map<number, { x: number; y: number }>();
    let span: TouchSpan | null = null;

    /** Drag the camera by a screen delta. Shared by the mouse and the two-finger pan. */
    const panBy = (dx: number, dy: number) => {
      pannedRef.current = true;
      const cam = camRef.current;
      const cos = Math.cos(cam.tilt);
      // MOVE THE CAMERA, NOT THE BOARD (§17.1). Dragging right pulls the view
      // left, which is what looking across a table does.
      cam.centre = clampCentre(
        { x: cam.centre.x - dx / cam.zoom, y: cam.centre.y - dy / (cam.zoom * cos) },
        currentExtent(),
        cam.viewport,
        cam.zoom,
        cam.tilt,
      );
    };

    const twoTouches = () => {
      const it = touches.values();
      const a = it.next().value;
      const b = it.next().value;
      return a && b ? touchSpan(a, b) : null;
    };

    const onDown = (e: PointerEvent) => {
      // TOUCH. One finger is deliberately left alone: a tap on a cell is
      // click-to-move and the lattice is the layer on top (§1.2), so panning
      // on one finger would turn every attempted move into a drag. Two
      // fingers pan and pinch at once, which is also how they really behave.
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          span = twoTouches();
          tweenRef.current = null;
          zoomedRef.current = true;
        }
        return;
      }
      if (e.button !== 1 && !(e.button === 0 && e.shiftKey)) return;
      e.preventDefault();
      panning = { x: e.clientX, y: e.clientY };
      surface.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (!touches.has(e.pointerId)) return;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size !== 2 || !span) return;
        e.preventDefault();
        const next = twoTouches();
        if (!next) return;
        // Pinch first, about the pinch centre, then carry the residual drag.
        // Order matters: zooming changes px-per-tile, so a pan computed
        // against the old zoom lands short.
        zoomAbout(camRef.current, toSurface(next.centre.x, next.centre.y), pinchFactor(span, next), currentExtent());
        panBy(next.centre.x - span.centre.x, next.centre.y - span.centre.y);
        span = next;
        return;
      }
      if (!panning) return;
      panBy(e.clientX - panning.x, e.clientY - panning.y);
      panning = { x: e.clientX, y: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.delete(e.pointerId);
        // Dropping to one finger ends the gesture rather than re-seating it.
        // Re-seating would make the remaining finger yank the board as the
        // span jumps to whatever pair is left.
        if (touches.size < 2) span = null;
        return;
      }
      panning = null;
    };

    // Without this the browser claims the gesture for page scroll/zoom and
    // simply stops sending pointermove — the handlers above are correct and
    // never run. It is set here rather than in CSS so it lives next to the
    // code that depends on it, and is put back on teardown.
    const prevTouchAction = surface.style.touchAction;
    surface.style.touchAction = 'none';

    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointermove', onMove, { passive: false });
    surface.addEventListener('pointerup', onUp);
    surface.addEventListener('pointercancel', onUp);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      surface.style.touchAction = prevTouchAction;
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
      const cam = camRef.current;
      const s = snapRef.current;
      const next: CameraMode = modeRef.current === 'overview' ? 'play' : 'overview';
      const to = zoomFor(next, { width: s.width, height: s.height, border: BOARD_BORDER }, cam.viewport, cam.tilt);
      // The tween, not a cut. It owns the zoom until it finishes, after which
      // `zoomedRef` being false hands the framing back to the auto-fit — which
      // is already sitting at exactly `to`, so there is no seam at the join.
      tweenRef.current = { from: cam.zoom, to, startMs: performance.now(), durMs: FRAMING_MS };
      zoomedRef.current = false;
      modeRef.current = next;
      setMode(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="lantern-stage" ref={hostRef} aria-hidden="true">
      {/* The canvas is appended by the effect — see the note there. */}
      {error && <p className="lantern-error">Lantern renderer unavailable — {error}</p>}
      <p className="lantern-chip">
        LANTERN · {mode} · O framing · scroll zoom · shift-drag pan · two-finger touch
      </p>
      {debug && <pre className="lantern-hud">{hud}</pre>}
    </div>
  );
}
