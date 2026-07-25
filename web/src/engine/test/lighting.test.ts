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
    expect(f).toMatch(/\.lantern-turn:focus-visible\s*\{[^}]*outline:\s*none/);
    expect(f).toMatch(/\.lantern-turn:focus-visible::after\s*\{[^}]*content/);
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
