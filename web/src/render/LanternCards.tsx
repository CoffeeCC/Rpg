// =========================================================================
// THE CANVAS UNDER THE HAND — `?r=lantern` on the cards.
//
// Twin of `LanternBattlefield`, one screen further down. It owns a canvas, a
// device, a frame loop and a camera, and it draws underneath a DOM tree it does
// not modify. ENGINE_PLAN §1.2:
//
//   THE GPU DRAWS EVERY SURFACE. THE DOM DRAWS TEXT AND HIT TARGETS.
//
// A card's body is a surface and it was the largest one in the game with no
// renderer behind it: `bake.py` has modelled the stock, the gilt, the back and
// five foil masks since the card bake landed, and nothing drew any of them.
//
// SO THIS COMPONENT WRITES NOTHING TO THE DOM. It reads `.playing-card` rects
// and draws. The fan, the hover lift, the selection ring, the `--i`/`--n`
// ladder, `.hand-slot`'s nav registration, the number keys, every `title` and
// every click target are untouched and cannot be broken by anything in here.
// Paul likes the floating hand; the hand is exactly as it was, with a physical
// card behind it.
//
// IT SPANS THE WHOLE STAGE, not the hand zone, and that is forced rather than
// chosen. `battle.css` gives `.hand-fan` a `margin-top: -118px` so the hand
// rides up over the battlefield — a canvas clipped to `.hand-zone` would cut
// the top two thirds off every card. The piles sit at the ends of the same
// zone, so one box covers all of it.
//
// IF ANYTHING HERE FAILS — no WebGL2, no float targets, a lost context, an
// unbaked card set — it renders nothing and says why. The DOM cards are still
// underneath doing their job, which is §4's flag working as designed.
// =========================================================================

import { useEffect, useRef, useState } from 'react';
import type { CardRarity } from '../engine/types';
import { createDevice, type Device } from '../lantern/gl/device';
import { Renderer } from '../lantern/renderer';
import { formatHud, type HudStats } from '../lantern/debug/hud';
import {
  buildCardScene,
  cardCamera,
  composeTransforms,
  decomposeTransform,
  type CardBox,
} from './cardScene';
import { createCardMaterialLibrary, requestCardFurniture, type CardMaterialLibrary } from './cardMaterials';
import './lanternBattle.css';

/**
 * The grade, and it is NOT the arena's.
 *
 * Same tonemap and the same argument for it (AgX over ACES, `LanternMap.tsx`),
 * but the bloom comes almost all the way off. A card carries the densest block
 * of small text in the game and it sits ON TOP of this canvas — bloom is light
 * spilling sideways, and a gilt frame blooming under 8px rules text puts a halo
 * exactly where the player is trying to read. The threshold sits above anything
 * the hand's lantern can produce on card stock, so what is left is a little
 * lift on the specular hits of the gilt and the foil, which is the one place
 * spill is telling the truth.
 */
const LOOK = {
  exposure: 1,
  bloomStrength: 0.18,
  bloomThreshold: 1.45,
  tonemap: 'agx' as const,
  /**
   * THE GLOBAL SPECULAR MULTIPLIER, at nearly four times the renderer's own
   * default of 0.25.
   *
   * That default is right for the board it was set on: a dungeon floor, a
   * timber frame and a painted figure all want a hint of sheen, and the one
   * genuinely polished thing on the arena is the brass. A card is the opposite
   * mix — gilt, foil and a lacquered back are most of its surface area, and the
   * highlight is not a hint on them, it is the read. `Material.material`'s G
   * channel is what keeps the stock out of it: the publisher writes 0.3 there
   * against 1.0 for the gilt, so this multiplies a moulding by 0.9 and card
   * board by 0.27.
   */
  specular: 0.9,
  // THE ONE OPTION THE ARENA DOES NOT SET, and the one this whole component
  // needs. A board renderer owns its box and clears it to the night colour; an
  // OVERLAY that spans the stage to catch eight cards would paint that night
  // over the entire fight. Paired with `createDevice`'s own `transparent`
  // below — the buffer having an alpha channel and the composite writing one
  // are two different facts, set in two different files.
  transparent: true,
};

/** One card in the hand, as the component needs to know about it. */
export interface HandCardRef {
  /** `CardInstance.uid` — stable while the card is held. */
  uid: string;
  /** Which foil mask the face carries. Drives nothing else. */
  rarity: CardRarity;
  /** Cannot be afforded, or the hand is locked. `.playing-card.unplayable`. */
  dim?: boolean;
}

export interface LanternCardsProps {
  /** The `.battle-stage` box, for finding the piles. Read only, never written. */
  stageRef: React.RefObject<HTMLElement | null>;
  /**
   * The live `.hand-slot` boxes, keyed by hand index.
   *
   * The same ref `BattleScreen` already keeps for the aim line's origin, reused
   * rather than duplicated: rects are measured in the frame loop, so a 60 fps
   * camera never re-renders the hand. The battlefield made the same call.
   */
  slotRefs: React.RefObject<Map<number, HTMLElement>>;
  hand: readonly HandCardRef[];
  debug?: boolean;
}

/**
 * Where the face-down cards are.
 *
 * The three pile widgets — deck, embers, ashes — each show a `CardBack` at 84px,
 * which is a real card at two thirds size. `battle.css` already gives them the
 * stacked-edge box-shadow that makes a pile read as a pile, and that shadow is
 * DOM and stays.
 *
 * THE RIVAL TAMER'S FACE-DOWN HAND IS DELIBERATELY NOT HERE. `.bf-foe-card`
 * draws a `CardBack` at 22px inside the portrait chip, and the back's whole
 * content is a rose-engine rosette whose ring pitch `bake.py` measured against a
 * 132px card. At 22px it is four pixels of ring: the bake resolves to mush, and
 * it would be mush painted over an opaque HUD rail. The crisp SVG is the better
 * drawing at that size, which is the same judgement §1.2 makes for text.
 */
const PILE_SELECTOR = '.hand-zone .pile-cardback';

export function LanternCards({ stageRef, slotRefs, hand, debug = false }: LanternCardsProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState('');

  // Everything the loop reads lives behind a ref: the loop runs at 60 fps and
  // must never be a reason for React to re-render the hand underneath it.
  const handRef = useRef(hand);
  handRef.current = hand;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // THE CANVAS IS CREATED HERE, NOT RENDERED BY REACT — the same fix
    // `LanternMap` and `LanternBattlefield` both record. `Device.dispose` ends
    // with `loseContext()`, and a lost context is PERMANENTLY lost for that
    // canvas element, so StrictMode's mount/unmount/remount would hand the
    // second mount a corpse and it would report itself as a missing extension.
    const canvas = document.createElement('canvas');
    canvas.className = 'lantern-canvas';
    host.appendChild(canvas);

    const result = createDevice(canvas, { transparent: true });
    if (!result.device) {
      setError(result.reason ?? result.status);
      canvas.remove();
      return;
    }
    setError(null);
    const device: Device = result.device;
    const renderer = new Renderer(device);
    const lib: CardMaterialLibrary = createCardMaterialLibrary(device.gl);
    requestCardFurniture(lib);

    let raf = 0;
    let disposed = false;
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

    /**
     * How big this card is drawn, and which way it is turned.
     *
     * NOT FROM THE BOUNDING BOX. `getBoundingClientRect` on a fanned card
     * returns the axis-aligned box around it, which at the 7.2 degrees a
     * five-card hand puts on its outer slots is 17% too wide — and which has
     * thrown away the SIGN of the rotation, because it is built from absolute
     * sines and cosines and the left of a fan turns the other way from the
     * right. The transform states both, so it is read from there and the rect
     * is used only for the centre, which rotation about the centre leaves
     * exactly where it is.
     *
     * TWO transforms, not one: `battle.css` fans and lifts the SLOT, and the
     * card inside breathes on its own 4.4s cycle. Compose them or the drawn
     * body slides 3px against the printed face once every four seconds.
     */
    function cardTransform(slot: Element, card: Element) {
      return composeTransforms(
        decomposeTransform(getComputedStyle(slot).transform),
        decomposeTransform(getComputedStyle(card).transform),
      );
    }

    /**
     * Read the hand's live geometry.
     *
     * READS ONLY. Nothing here writes a style, a class or an attribute, which
     * is what keeps a per-frame sweep to a single layout pass instead of a
     * read/write thrash — and there are about ten boxes, not three hundred.
     */
    function measure(scale: number): { cards: CardBox[]; cardWidthPx: number | null } {
      const hostRect = host!.getBoundingClientRect();
      const cards: CardBox[] = [];
      let baseWidth: number | null = null;

      const push = (
        el: Element,
        layout: { w: number; h: number },
        t: { scale: number; rotate: number },
        key: string,
        rarity: CardRarity | null,
        dim?: boolean,
      ) => {
        const r = el.getBoundingClientRect();
        // Mid-transition layouts hand over zero-size boxes. `placeCard` refuses
        // them as well; refusing here too keeps the zoom measurement clean.
        if (r.width < 2 || r.height < 2) return;
        if (layout.w < 2 || layout.h < 2) return;
        cards.push({
          key,
          cx: (r.left - hostRect.left + r.width / 2) * scale,
          cy: (r.top - hostRect.top + r.height / 2) * scale,
          w: layout.w * t.scale * scale,
          h: layout.h * t.scale * scale,
          rotate: t.rotate,
          rarity,
          dim,
        });
      };

      // The piles first, so a hand card that reaches one laps it rather than
      // the other way round — `buildCardScene` paints in the order it is given.
      const stage = stageRef.current;
      if (stage) {
        const piles = stage.querySelectorAll<HTMLElement>(PILE_SELECTOR);
        for (let i = 0; i < piles.length; i++) {
          const el = piles[i];
          push(
            el,
            { w: el.offsetWidth, h: el.offsetHeight },
            decomposeTransform(getComputedStyle(el).transform),
            `pile-${i}`,
            null,
          );
        }
      }

      for (let i = 0; i < handRef.current.length; i++) {
        const slot = slotRefs.current?.get(i);
        // `BattleScreen` never removes from this map, so an index left over
        // from a longer hand can still resolve to a detached node.
        if (!slot || !slot.isConnected) continue;
        const card = slot.querySelector<HTMLElement>('.playing-card');
        if (!card) continue;
        const t = cardTransform(slot, card);
        const layout = { w: card.offsetWidth, h: card.offsetHeight };
        push(card, layout, t, handRef.current[i].uid, handRef.current[i].rarity, handRef.current[i].dim);
        // THE SMALLEST, not the first and not the largest. Every unhovered card
        // is the breakpoint's exact size and the hovered one is 1.16x — taking
        // the largest would rescale the whole world every time the pointer
        // crossed a card, which moves the lantern and re-sweeps every foil.
        const w = layout.w * scale;
        if (w > 1 && (baseWidth === null || w < baseWidth)) baseWidth = w;
      }

      return { cards, cardWidthPx: baseWidth };
    }

    function frameAt(nowMs: number): HudStats | null {
      if (disposed) return null;
      const cssW = Math.max(64, host!.clientWidth);
      const cssH = Math.max(64, host!.clientHeight);
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      device.resize(cssW, cssH, dpr);
      const dev = device.size();
      // ONE camera, in DEVICE pixels, because that is the only space the vertex
      // shader knows and nothing here writes to the DOM. Same call the
      // battlefield makes, for the same reason.
      const scale = dev.width / cssW;

      const { cards, cardWidthPx } = measure(scale);
      const cam = cardCamera({ x: dev.width, y: dev.height }, cardWidthPx);
      const scene = buildCardScene({
        camera: cam,
        time: (nowMs - start) / 1000,
        materials: lib.materials,
        cards,
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

    // THE HEADLESS HOOK, same contract as `window.__lanternBattle`:
    // `requestAnimationFrame` never fires when the page is not compositing, so
    // every measured check goes through a synchronous render that PINS THE
    // CLOCK — two calls reading `performance.now()` are two different frames
    // and nothing can be diffed.
    const hook = {
      frame: (t?: number) => frameAt(t ?? start),
      gl: device.gl,
      canvas,
      boxes: () => measure(device.size().width / Math.max(64, host!.clientWidth)).cards,
      materials: () => Array.from(lib.materials.keys()),
    };
    (window as unknown as { __lanternCards?: typeof hook }).__lanternCards = hook;

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      delete (window as unknown as { __lanternCards?: unknown }).__lanternCards;
      renderer.dispose();
      lib.dispose();
      device.dispose();
      canvas.remove();
    };
    // Mounted once per fight, like the battlefield's: `BattleStage` remounts per
    // encounter, so the device's life is the fight's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debug]);

  return (
    <div className="lantern-cards" ref={hostRef} aria-hidden="true">
      {/* The canvas is appended by the effect — see the note there. */}
      {error && <p className="lantern-error">Card renderer unavailable — {error}</p>}
      {debug && <pre className="lantern-hud">{hud}</pre>}
    </div>
  );
}
