/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * lighting.test.ts — guards for the v21 light model (src/lighting.css).
 *
 * These are source-level invariants, not rendering tests: the things asserted
 * here are exactly the ones that were broken in the wild, are invisible in a
 * unit test suite, and are cheap to re-break by accident during a later CSS
 * tidy-up. Each block says which real bug it is standing guard over.
 *
 * Read from disk, NOT via Vite's `?raw`: the bundler rewrites/normalises CSS on
 * the way through, and these assertions are about the source text as authored.
 * tsconfig.app.json scopes types to ["vite/client"], so the reference directive
 * above is what keeps `tsc -b` (which type-checks this directory, unlike
 * `tsc --noEmit`) green without widening the app's global types.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const lighting = read('../../lighting.css');
const floor = read('../../floor.css');
const battle = read('../../battle.css');

/** Strip comments so a rule quoted in prose can never satisfy an assertion. */
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const lightingRules = strip(lighting);
const floorRules = strip(floor);
const battleRules = strip(battle);

/** Collapse whitespace so matching does not depend on formatting. */
const flat = (css: string) => css.replace(/\s+/g, ' ');

describe('lighting.css is actually loaded', () => {
  it('is imported by floor.css, the last stylesheet in the bundle', () => {
    // If this import is ever dropped, every rule in lighting.css silently
    // stops applying — including the pointer-events fixes below, which would
    // bring back the un-clickable party-target buttons with no test failing.
    expect(flat(floorRules)).toContain("@import './lighting.css';");
  });

  it('declares the light colour tokens the rest of the file consumes', () => {
    for (const token of ['--lume-core', '--lume-warm', '--lume-deep', '--lume-cast']) {
      expect(lightingRules).toContain(token);
    }
  });
});

describe('the end-turn Lantern does not swallow clicks meant for the UI beneath it', () => {
  // THE BUG (Paul): "the end turn button also overlaps with trying to use
  // items on party members." Measured cause: the wrapper <div> and the
  // rectangular <img> hit-tested across the full 128x158 corner, so
  // elementFromPoint on the 4th party-target button returned IMG.lantern-img
  // and a real click there did not reach the button.
  const f = flat(lightingRules);

  it('the .floor-lantern-turn wrapper is pointer-transparent', () => {
    expect(f).toMatch(/\.floor-lantern-turn\s*\{[^}]*pointer-events:\s*none/);
  });

  it('…but the button inside it is not — it must stay clickable', () => {
    expect(f).toMatch(/\.floor-lantern-turn\s*>\s*\.lantern-turn\s*\{[^}]*pointer-events:\s*auto/);
  });

  it('the rectangular lantern painting does not re-square the hit area', () => {
    expect(f).toMatch(/\.lantern-img\s*\{[^}]*pointer-events:\s*none/);
  });

  it('every decorative light layer is inert', () => {
    for (const layer of ['.lantern-cast', '.lantern-flame', '.lantern-glow', '.lantern-rays', '.lantern-embers']) {
      expect(f).toMatch(new RegExp(`\\${layer}[^{]*\\{[^}]*pointer-events:\\s*none`));
    }
  });

  it('the field-items list reserves the corner the Lantern is docked in', () => {
    // A round hit area does not save a button that is *positioned* under the
    // Lantern. FloorScreen renders the items list as the panel's last child,
    // straight into that corner, so the space has to be reserved in layout.
    expect(flat(floorRules)).toMatch(/\.floor-panel\s*>\s*\.option-list\s*\{[^}]*padding-right:\s*\d+px/);
  });

  it('the Lantern stays keyboard/gamepad focusable with a visible ring', () => {
    // The controller layer (nav/) relies on real DOM focus. Removing the
    // outline without replacing it would leave the Lantern invisible on a pad.
    // nav.css owns the cursor and deliberately styles plain `:focus` under
    // html[data-nav-input], because pad focus is programmatic and fails the
    // :focus-visible heuristic. lighting.css must ADD to that, never suppress
    // it — killing the outline on a :focus-visible guess would leave a
    // controller player unable to see the Lantern is selected.
    expect(f, 'lighting.css must not suppress nav.css’s ring').not.toMatch(
      /\.lantern-turn:focus(-visible)?\s*\{[^}]*outline:\s*none/,
    );
    expect(f).toMatch(/html\[data-nav-input='pad'\] \.lantern-turn:focus::after/);
    expect(f).toMatch(/html\[data-nav-input='key'\] \.lantern-turn:focus::after/);
    expect(f).toMatch(/\.lantern-turn:focus-visible::after[^{]*\{[^}]*content/);
  });
});

describe('the panel-scroll regression (v19 #7) stays fixed', () => {
  it('the floor panel clips with `clip`, never `hidden`', () => {
    // floor.css §7: `hidden` leaves the panel a programmatically SCROLLABLE
    // box, which the Lantern's corner footprint then shifts — "the window
    // scrolling on the map screen". `clip` is not a scroll container.
    const rule = flat(floorRules).match(/\.game:not\(\.battle-mode\)\s*\.game-main\s*>\s*\.panel\.floor-panel\s*\{[^}]*\}/);
    expect(rule, 'the floor-panel clamp rule went missing').toBeTruthy();
    expect(rule![0]).toContain('overflow: clip');
    expect(rule![0]).not.toContain('overflow: hidden');
  });

  it('nothing in lighting.css makes the map screen scrollable again', () => {
    expect(lightingRules).not.toMatch(/overflow:\s*(auto|scroll|hidden)/);
  });
});

describe('the Steam Deck performance contract', () => {
  const keyframeBodies = [...lightingRules.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];

  it('defines keyframes at all (otherwise the assertions below are vacuous)', () => {
    expect(keyframeBodies.length).toBeGreaterThanOrEqual(4);
  });

  it('animates only compositor properties — never filter, shadow or geometry', () => {
    // Rule A. An animated `filter` or `box-shadow` re-rasterises the layer
    // every frame; `opacity`/`transform` are handled by the compositor. This
    // is the difference between 60fps and 30fps on a Deck's integrated GPU.
    const banned = /(^|[;{\s])(filter|box-shadow|background|backdrop-filter|width|height|top|left|right|bottom|inset|margin|padding|border-\w+-color)\s*:/;
    for (const [, name, body] of keyframeBodies) {
      expect(banned.test(body), `@keyframes ${name} animates a non-compositor property`).toBe(false);
    }
  });

  it('never attaches an animation to a per-cell map selector', () => {
    // Rule B. A floor is ~250 cells. The only cell allowed to animate is the
    // hero's, of which there is exactly one.
    const animated = [...lightingRules.matchAll(/([^{}]+)\{[^}]*animation:[^}]*\}/g)].map((m) => m[1].trim());
    for (const sel of animated) {
      if (!sel.includes('.map-cell')) continue;
      expect(sel, `${sel} would animate on every tile of the floor`).toContain('.player');
    }
  });

  it('keeps the animated blended light field smaller than the static one', () => {
    // Rule C. mix-blend-mode forces a backdrop read-back, so the big ambient
    // field is static and only the small near-field flickers.
    const before = flat(lightingRules).match(/\.floor-layout::before\s*\{[^}]*\}/)?.[0] ?? '';
    const after = flat(lightingRules).match(/\.floor-layout::after\s*\{[^}]*\}/)?.[0] ?? '';
    expect(before).toContain('mix-blend-mode: screen');
    expect(before).not.toContain('animation:');
    expect(after).toContain('animation:');
    const px = (rule: string) => Number(rule.match(/width:\s*min\((\d+)px/)?.[1] ?? 0);
    expect(px(after)).toBeGreaterThan(0);
    expect(px(after)).toBeLessThan(px(before));
  });

  it('the flicker periods are incommensurable, so the loop is not visible', () => {
    // Two sine-ish loops at 2.37s and 3.71s do not realign for ~146s. This is
    // the cheap stand-in for an feTurbulence noise filter, which was rejected
    // because an animated SVG filter re-runs its graph on the CPU per frame.
    expect(lightingRules).toContain('2.37s');
    expect(lightingRules).toContain('3.71s');
    expect(lightingRules).not.toMatch(/filter:\s*url\(/);
  });
});

describe('prefers-reduced-motion disables every light this file animates', () => {
  const rmIndex = lightingRules.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  const rmBlock = rmIndex >= 0 ? lightingRules.slice(rmIndex) : '';

  it('has a reduced-motion block', () => {
    expect(rmIndex).toBeGreaterThan(-1);
  });

  it('the block is LAST in the file', () => {
    // This repo has been bitten by a media-guarded rule losing the cascade to
    // a later unconditional rule of the same specificity. Anything appended
    // after this block could silently re-enable a flicker.
    expect(lightingRules.slice(rmIndex + 1)).not.toMatch(/@media/);
  });

  it('covers every selector that lighting.css animates', () => {
    const animatedSelectors = [...lightingRules.slice(0, rmIndex).matchAll(/([^{}]+)\{[^}]*animation:\s*(?!none)[^}]*\}/g)]
      .flatMap((m) => m[1].split(','))
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('@') && !s.startsWith('%') && !/^\d/.test(s));
    expect(animatedSelectors.length).toBeGreaterThan(3);
    for (const sel of animatedSelectors) {
      // the reduced-motion block lists the same selector, or a shorter one
      // that already covers it (e.g. `.lantern-embers` covers `.ember`)
      const leaf = sel.split(/\s+/).pop()!;
      expect(rmBlock, `nothing in the reduced-motion block turns off "${sel}"`).toContain(leaf);
    }
  });

  it('kills the pre-existing lantern and map animations too, not just the new ones', () => {
    for (const sel of ['.lantern-embers', '.map-grid .map-cell.reachable::before', '.map-grid .map-cell.threat::after']) {
      expect(rmBlock).toContain(sel);
    }
  });
});

describe('cast intensity tracks the flame that produces it', () => {
  // The defining property of modelled light vs. a decorative overlay: the
  // light a flame throws is the same physical quantity as the flame's own
  // brightness, so the two cannot run on independent timers.
  const f = flat(lightingRules);
  const ruleFor = (selector: string) =>
    f.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`))?.[0] ?? '';
  const animOf = (selector: string) =>
    ruleFor(selector).match(/animation:\s*([\w-]+)\s+([\d.]+m?s)/)?.slice(1, 3).join(' ') ?? '';

  it('the flame, its cast and the room it lights share one signal', () => {
    const flame = animOf('.lantern-bright .lantern-flame');
    expect(flame, 'the flame is not animated at all').toBeTruthy();
    expect(animOf('.lantern-bright .lantern-cast'), 'the cast drifts from the flame').toBe(flame);
    expect(animOf('.floor-layout::after'), 'the room drifts from the flame').toBe(flame);
  });

  it('the big ambient field is deliberately NOT on that signal', () => {
    // Indirect, multiply-bounced light is smoothed almost flat in a real
    // room — and it is the largest blended surface, so holding it still is
    // both the physically honest choice and the cheap one.
    expect(animOf('.floor-layout::before')).toBe('');
  });

  it('light falls off on an inverse-square-shaped ramp, not a linear one', () => {
    // An evenly-spaced gradient is the classic tell of a fake light: it reads
    // as fog. Real falloff collapses fast near the source, then trails.
    for (const sel of ['.lantern-cast', '.floor-layout::after']) {
      const stops = [...ruleFor(sel).matchAll(/\/\s*([\d.]+)\)\s*(\d+)%/g)].map((m) => ({ a: Number(m[1]), at: Number(m[2]) }));
      expect(stops.length, `${sel} has too few stops to shape a falloff`).toBeGreaterThanOrEqual(3);
      expect(stops[1].a, `${sel} fades linearly`).toBeLessThan(stops[0].a * 0.75);
    }
  });
});

describe('the battle vigor candles are a real light source', () => {
  // They are literally lit candles with wax, wicks, gutter animations and
  // smoke — and before this pass they cast no light at all.
  const f = flat(lightingRules);

  it('a lit candle casts, and a snuffed one stops casting', () => {
    expect(f).toMatch(/\.candle\.lit::after\s*\{[^}]*opacity:\s*1/);
    expect(f).toMatch(/\.candle\.lit::after\s*\{[^}]*animation:/);
    expect(f).toMatch(/\.candle\.out::after\s*\{[^}]*opacity:\s*0/);
  });

  it("its cast runs on the candle rail's own 1.7s gutter period", () => {
    // battle.css animates .candle-flame with candleFlicker 1.7s; the light
    // must share that period or the flame and its glow visibly disagree.
    expect(battleRules).toMatch(/candleFlicker\s+1\.7s/);
    expect(f).toMatch(/\.candle\.lit::after\s*\{[^}]*animation:\s*lumeGutterA\s+1\.7s/);
  });

  it('separate flames are phase-offset, not pulsing in unison', () => {
    const delays = [...lightingRules.matchAll(/\.candle:nth-child\(\d\)\.lit::after\s*\{\s*animation-delay:\s*(-?[\d.]+)s/g)];
    expect(delays.length).toBeGreaterThanOrEqual(3);
    expect(new Set(delays.map((d) => d[1])).size).toBe(delays.length);
  });

  it("the room's light on that side is driven by how many candles burn", () => {
    // Spend vigor, a candle gutters out, the room gets measurably darker.
    // Read straight off the rail with :has() — no JS, no prop plumbing
    // through BattleScreen.tsx, which this lane does not own.
    expect(f).toMatch(/\.battlefield:has\(\.vigor-candles \.candle\.lit\)\s*\{[^}]*--vigor-lume/);
    expect(f).toMatch(/nth-child\(3\)\.lit\)\s*\{[^}]*--vigor-lume/);
    expect(f).toMatch(/\.battlefield::after\s*\{[^}]*var\(--vigor-lume\)/);
  });
});

describe('shadow is a cooler light, not an absence of light', () => {
  it('declares a cool shade tint', () => {
    expect(lightingRules).toMatch(/--lume-shade:\s*\d+ \d+ \d+/);
  });

  it('shaded surfaces are tinted with it rather than neutral black', () => {
    // warm-vs-black reads flat; warm-vs-cool reads solid.
    for (const sel of ['.floor-panel .map-frame::after', '.battle-stage .battlefield::before']) {
      const rule = flat(lightingRules).match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`))?.[0] ?? '';
      expect(rule, `no rule for ${sel}`).toBeTruthy();
      expect(rule, `${sel} still shades with neutral black`).toContain('--lume-shade');
    }
  });

  it('the war table is lit from the Lantern, not from a contradictory key', () => {
    // The first pass grazed the frame from the top-left while the only
    // visible light source on the screen sat in the bottom-right corner.
    const rule = flat(lightingRules).match(/\.floor-panel \.map-frame::after\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/radial-gradient\(ellipse[^)]*at 100% 100%, rgba\(var\(--lume-warm\)/);
  });
});

describe('readability is not sacrificed to atmosphere', () => {
  it('interactive tiles keep their colour-coded identity halos', () => {
    // Paul must still be able to tell a chest from a shrine from a stair
    // across the room. The lighting pass re-aimed the black contact shadow
    // and left every coloured halo exactly as it was.
    const halos: Array<[string, string]> = [
      ['chest', 'rgba(212, 175, 55, 0.6)'],
      ['shrine', 'rgba(90, 200, 230, 0.55)'],
      ['event-tile', 'rgba(169, 127, 224, 0.55)'],
      ['stairs', 'rgba(233, 220, 194, 0.45)'],
      ['breakable', 'rgba(180, 130, 70, 0.4)'],
    ];
    for (const [cls, colour] of halos) {
      const rule = flat(lightingRules).match(new RegExp(`\\.map-cell\\.${cls}\\s\\.cell-top\\s*\\{[^}]*\\}`))?.[0] ?? '';
      expect(rule, `no lit rule for .${cls}`).toBeTruthy();
      expect(rule, `.${cls} lost its identity halo`).toContain(colour);
    }
  });

  it('shadows all point the same way, away from the key light', () => {
    // The one trick that makes flat CSS boxes read as solid. Every contact
    // shadow on the map offsets down-and-right by the same amount.
    const contact = [...lightingRules.matchAll(/drop-shadow\((-?\d+)px (-?\d+)px/g)];
    expect(contact.length).toBeGreaterThan(4);
    for (const [, x, y] of contact) {
      expect(Number(x)).toBeGreaterThan(0);
      expect(Number(y)).toBeGreaterThan(0);
    }
  });
});

describe('the aura is contained by masking, not by being turned off', () => {
  it('the panel-level light fields fade out before the panel border', () => {
    // "it also overlaps the borders of its menus". The panel already clips
    // with `overflow: clip`; the fix is to leave it nothing lit to clip.
    for (const pseudo of ['::before', '::after']) {
      const rule = flat(lightingRules).match(new RegExp(`\\.floor-layout${pseudo}\\s*\\{[^}]*\\}`))?.[0] ?? '';
      expect(rule).toContain('mask-image');
      expect(rule).toContain('mask-composite: intersect');
      expect(rule).toMatch(/linear-gradient\(to left, transparent 0, #000 \d+px\)/);
      expect(rule).toMatch(/linear-gradient\(to top, transparent 0, #000 \d+px\)/);
    }
  });

  it('the Lantern is still genuinely lit — the glow was not simply deleted', () => {
    const f = flat(lightingRules);
    expect(f).toMatch(/\.lantern-bright \.lantern-cast\s*\{[^}]*opacity:\s*1/);
    expect(f).toMatch(/\.lantern-bright \.lantern-flame\s*\{[^}]*opacity:\s*1/);
    expect(battleRules).toContain('.lantern-rays');
  });

  it('the flame and the light it casts are positioned from the same tokens', () => {
    // Otherwise a later tweak to the button's dock silently leaves the room's
    // light pointing at empty air.
    expect(lightingRules).toMatch(/--lt-flame-x:\s*calc\(var\(--lt-inset-x\)/);
    expect(lightingRules).toMatch(/--lt-flame-y:\s*calc\(var\(--lt-inset-y\)/);
    expect(floorRules).toMatch(/right:\s*var\(--lt-inset-x/);
    expect(floorRules).toMatch(/bottom:\s*var\(--lt-inset-y/);
  });
});
