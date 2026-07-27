// =========================================================================
// THE FLAG, AND THE CADENCE.
//
// ENGINE_PLAN §4's arrangement only holds if `dom` is the answer to every
// question that is not exactly `r=lantern`. A flag that could be turned on by
// a typo, a stale link or a leftover parameter would mean the default path is
// not really the default — and the default path is the game Paul plays daily.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { debugFrom, renderModeFrom } from '../flag';
import { STEP_MS, glidePosition, lerp, stepProgress } from '../walk';

describe('?r=lantern', () => {
  it('turns the canvas on, and only for that exact value', () => {
    expect(renderModeFrom('?r=lantern')).toBe('lantern');
    expect(renderModeFrom('?foo=1&r=lantern&bar=2')).toBe('lantern');
    expect(renderModeFrom('r=lantern')).toBe('lantern');
    expect(renderModeFrom('?r=LANTERN')).toBe('lantern');
    expect(renderModeFrom('?r= lantern ')).toBe('lantern');
  });

  it('falls back to the DOM map for everything else', () => {
    for (const q of ['', '?', '?r=', '?r=dom', '?r=lantrn', '?renderer=lantern', '?lantern', '?r=lantern2', '?x=y']) {
      expect(renderModeFrom(q)).toBe('dom');
    }
  });

  it('ignores a hash, which is where a router would put its state', () => {
    expect(renderModeFrom('?r=lantern#/floor')).toBe('lantern');
    expect(renderModeFrom('#r=lantern')).toBe('dom');
  });

  it('gates the HUD separately, so the flag alone is a clean frame', () => {
    expect(debugFrom('?r=lantern')).toBe(false);
    expect(debugFrom('?r=lantern&debug=1')).toBe(true);
    expect(debugFrom('?debug=0')).toBe(false);
  });
});

describe('one step, three consumers', () => {
  it('is linear across the tile', () => {
    expect(stepProgress(0)).toBe(0);
    expect(stepProgress(STEP_MS / 2)).toBeCloseTo(0.5, 9);
    expect(stepProgress(STEP_MS)).toBe(1);
  });

  it('clamps rather than overshooting a queued walk', () => {
    expect(stepProgress(-50)).toBe(0);
    expect(stepProgress(STEP_MS * 4)).toBe(1);
    expect(lerp(3, 7, stepProgress(STEP_MS * 4))).toBe(7);
  });

  it('puts the piece BETWEEN tiles part way through a step', () => {
    // The whole reason the glide survives the port: the hero is the light, so
    // a piece that jumps takes every shadow in the room with it. Landing on
    // the destination tile immediately would be indistinguishable from having
    // no glide at all, which is the bug this is here to reject.
    const g = { fromX: 2, fromY: 2, toX: 2, toY: 3, start: 1000 };
    expect(glidePosition(g, 1000)).toEqual({ x: 2, y: 2 });
    const mid = glidePosition(g, 1000 + STEP_MS / 2);
    expect(mid.y).toBeGreaterThan(2);
    expect(mid.y).toBeLessThan(3);
    expect(glidePosition(g, 1000 + STEP_MS)).toEqual({ x: 2, y: 3 });
    // A frame that arrives late must not overshoot into the next tile.
    expect(glidePosition(g, 1000 + STEP_MS * 9)).toEqual({ x: 2, y: 3 });
  });

  it('still agrees with the stylesheet', () => {
    // floor.css is the one copy no import can keep honest, and the two have to
    // agree or a multi-tile walk either stutters or snaps at each tile. This
    // is the check that catches somebody retuning the CSS alone.
    const css = readFileSync(fileURLToPath(new URL('../../floor.css', import.meta.url)), 'utf8');
    const glide = /\.hero-walker\.glide\s*\{[^}]*transition:\s*transform\s+(\d+)ms/.exec(css);
    expect(glide).not.toBeNull();
    expect(Number(glide![1])).toBe(STEP_MS);
    const gait = /\.hero-walker\.glide\s+\.hero-walker-art\s*\{[^}]*animation:\s*hero-gait\s+(\d+)ms/.exec(css);
    expect(gait).not.toBeNull();
    expect(Number(gait![1])).toBe(STEP_MS);
  });
});

// =========================================================================
// THE FLAG-OFF GUARANTEE, AS A PROPERTY OF THE STYLESHEET
//
// ENGINE_PLAN §4: with `?r=lantern` absent the battle screen must be the game
// that has always shipped. `BattleScreen` only adds the `lantern-battle` class
// under the flag, so that guarantee reduces to one static claim — EVERY rule in
// `lanternBattle.css` is scoped under `.lantern-battle` — and a static claim is
// better checked by a test that runs forever than by one browser session.
//
// This is a real trap and not a hypothetical: the surfaces the renderer takes
// over are removed by turning the DOM's own paint off (`.bf-rail`'s timber,
// `.vigor-candles`, `.stage-backdrop`, the portrait chips' fake socket). Every
// one of those rules would silently strip the shipping fight of its furniture
// if its scope were ever dropped, and the symptom — an unstyled left rail on
// the DEFAULT path — is exactly the kind of thing nobody tests for.
// =========================================================================
describe('lanternBattle.css cannot reach the default path', () => {
  const css = readFileSync(fileURLToPath(new URL('../lanternBattle.css', import.meta.url)), 'utf8');

  /** Selectors, with comments and at-rule preludes stripped out. */
  function selectors(source: string): string[] {
    const noComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const out: string[] = [];
    for (const block of noComments.split('}')) {
      const head = block.slice(0, block.indexOf('{'));
      if (block.indexOf('{') < 0) continue;
      for (const sel of head.split(',')) {
        const s = sel.trim();
        if (!s || s.startsWith('@')) continue;
        out.push(s);
      }
    }
    return out;
  }

  it('finds the rules at all, so an empty parse cannot pass by accident', () => {
    // Without this the whole suite is vacuous the moment the regex above stops
    // matching — the classic way a "nothing is unscoped" assertion goes green.
    const all = selectors(css);
    expect(all.length).toBeGreaterThan(8);
    expect(all.some((s) => s.includes('.bf-rail'))).toBe(true);
    expect(all.some((s) => s.includes('.vigor-candles'))).toBe(true);
  });

  it('scopes every single selector under .lantern-battle', () => {
    for (const sel of selectors(css)) {
      expect(sel, `unscoped selector in lanternBattle.css: ${sel}`).toContain('.lantern-battle');
    }
  });

  it('never removes a box from flow — hidden, never display:none, on the figures', () => {
    // §21.2's trap. `visibility: hidden` keeps the `<img>` at its resolved size,
    // which is the box the renderer measures; `display: none` collapses
    // `.bf-figure` to the nameplate's width and the fight draws at the wrong
    // size. The same reasoning now covers the portrait chips, whose rects the
    // bezels are fitted to.
    const figureRule = /\.bf-figure\s*>\s*img[\s\S]*?\{([^}]*)\}/.exec(css);
    expect(figureRule).not.toBeNull();
    expect(figureRule![1]).toContain('visibility: hidden');
    expect(figureRule![1]).not.toContain('display: none');
  });

  it('leaves the HP ring itself alone — it is data, and data stays DOM', () => {
    // §1.2 gives text and readouts to the DOM. The bezel's bore is sized to
    // land on `.bf-ring`, so hiding the ring would remove the very thing the
    // fitting frames. Only the chip's FAKE recess (`::after`) comes off.
    expect(css).not.toMatch(/\.bf-ring-svg[^{]*\{[^}]*display:\s*none/);
    expect(css).not.toMatch(/\.bf-ring-(track|fill)[^{]*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.bf-ring::after[^{]*\{[^}]*display:\s*none/);
  });

  it('takes the impact flare only where a piece is drawn to replace it', () => {
    // ENGINE_PLAN §21.7 -> §1.2: the flare is a SURFACE, so the GPU draws it
    // and the DOM's SVG comes off. But `BattleScreen` renders `ImpactEffect`
    // in TWO places — inside `.bf-figure`, which the renderer measures and
    // stands a lit piece in, and inside the rival tamer's `.bf-ring` portrait
    // chip in a duel, where NOTHING is drawn behind it. An unscoped
    // `.impact-fx-anchor { display: none }` would delete the duel's only hit
    // feedback on the tamer and leave a blank chip.
    const flare = selectors(css).filter((s) => s.includes('.impact-fx-anchor'));
    expect(flare, 'the flare is still a flat DOM overlay on the lit path').toHaveLength(1);
    expect(flare[0]).toContain('.bf-figure');
    expect(flare[0]).toContain('.lantern-battle');
    expect(/\.impact-fx-anchor[^{]*\{[^}]*display:\s*none/.test(css)).toBe(true);
  });

  it('leaves the damage popups and the aim reticle in the DOM', () => {
    // §1.2 draws the line: the GPU takes SURFACES, the DOM keeps TEXT and HIT
    // TARGETS. A damage number is text and has to stay crisp at four
    // breakpoints; the reticle marks which `.bf-unit` the d-pad is sitting on,
    // which is a hit target's own state. Neither belongs on the board, and a
    // stylesheet that took them would be the port overreaching.
    // Against the SELECTORS, not the source text — the rule above explains in
    // a comment why the reticle stays, and a raw `toMatch` on the file would
    // fail on the explanation rather than on a rule.
    for (const sel of selectors(css)) {
      for (const kept of ['.dmg-popup', '.popup-layer', '.aim-reticle', '.aim-c']) {
        expect(sel, `lanternBattle.css should not touch ${kept}`).not.toContain(kept);
      }
    }
  });
});

// =========================================================================
// THE COMMAND BAR'S PAINT, AND WHERE THE CANVAS IS HOSTED
//
// §19's player console needed two things `lanternBattle.css` did not do: the
// renderer's host had to span the whole `.battle-stage` rather than just
// `.battlefield`, and `.hand-zone`'s opaque plank had to come off so the
// fittings behind the piles and the End Turn lantern are not drawn behind a
// wall. Both are the same move `.bf-rail`, `.vigor-candles` and
// `.stage-backdrop` already made, and both are stripped PAINT rather than
// changed LAYOUT — which is the property these check.
// =========================================================================
describe('the console comes off the DOM and onto the board', () => {
  const css = readFileSync(fileURLToPath(new URL('../lanternBattle.css', import.meta.url)), 'utf8');
  const battle = readFileSync(fileURLToPath(new URL('../../battle.css', import.meta.url)), 'utf8');
  /** Rules as (selector list, body), comments removed. */
  const rules = (() => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const out: { sels: string[]; body: string }[] = [];
    for (const block of bare.split('}')) {
      const i = block.indexOf('{');
      if (i < 0) continue;
      out.push({
        sels: block
          .slice(0, i)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        body: block.slice(i + 1),
      });
    }
    return out;
  })();
  const ruleFor = (sel: string) => rules.find((r) => r.sels.length === 1 && r.sels[0] === sel);

  it('takes .hand-zone’s surface and NOTHING that positions its children', () => {
    // The shipping bar is a 180deg gradient, a 2px gold rail, three inset
    // shadows and a filigree `::before`. All four are surfaces. Its flex row,
    // its padding and its 176px min-height are LAYOUT, and every hit target in
    // the fight is positioned by them.
    const rule = ruleFor('.lantern-battle .hand-zone');
    expect(rule).toBeDefined();
    const body = rule!.body;
    expect(body).toContain('background: none');
    expect(body).toContain('box-shadow: none');
    expect(body).toMatch(/border-top-color:\s*transparent/);
    for (const layout of ['display', 'padding', 'min-height', 'gap', 'justify-content', 'align-items', 'flex']) {
      expect(body, `lanternBattle.css must not restyle .hand-zone's ${layout}`).not.toContain(`${layout}:`);
    }
    // And the filigree on the rail, which is joinery painted in CSS.
    expect(css).toMatch(/\.lantern-battle\s+\.hand-zone::before[^{]*\{[^}]*display:\s*none/);
  });

  it('leaves the CARDS alone — they are contents, not carpentry', () => {
    // The card render is its own pass, and that is what decides this list.
    //
    // `.pile-cardback` USED TO BE HERE, on the reasoning that taking its paint
    // "would strip a surface nothing else draws yet". That premise expired the
    // moment the card pass landed: `cardScene.ts` draws the baked `card_back`
    // — engine-turned rosette, gilt double border, lit and catching the
    // lantern — at the pile's own box. Keeping the CSS paint on top would put
    // a flat painting over a lit surface, which is §1.2 backwards.
    //
    // `.hand-fan` left for the same reason. It is not restyled for LOOK — the
    // card pass needs it because `.hand-zone` is a stacking context
    // (`position: relative` + `z-index: 1`), so a stage-level canvas painted
    // card bodies OVER every card's name, art and rules text while reading as
    // correct in every computed style. The fan's z-index is the fix.
    //
    // Everything still listed is genuinely contents or layout: the slots are
    // geometry the renderer MEASURES rather than replaces, and the counts and
    // names are text, which §1.2 leaves in the DOM.
    //
    // Selectors only: the stylesheet's prose says why these are left alone, and
    // a substring search over the whole file would match the explanation.
    const allSels = rules.flatMap((r) => r.sels);
    for (const untouched of ['.hand-slot', '.pile-count-num', '.pile-name']) {
      expect(allSels.some((s) => s.includes(untouched)), `${untouched} must keep its own paint`).toBe(false);
    }
  });

  it('hosts the canvas on the STAGE, at a specificity v5.css cannot beat', () => {
    // battle.css records the trap by name: v5.css's `.battle-stage >
    // *:not(.stage-backdrop)` is 0,2,0 and loaded later, so it forces
    // `position: relative` onto every direct child of the stage — which would
    // drop the canvas into the flex column and reflow the fight around it.
    // The repair is the same 0,3,0-or-better shape battle.css already uses.
    expect(battle).toContain('.panel.battle-stage > .battle-enter-flash');
    const rule = ruleFor('.panel.battle-stage.lantern-battle > .lantern-arena');
    expect(rule).toBeDefined();
    expect(rule!.body).toMatch(/position:\s*absolute\s*!important/);
    expect(rule!.body).toMatch(/inset:\s*0\s*!important/);
    expect(rule!.body).toMatch(/z-index:\s*0\s*!important/);
    // Still transparent to the pointer: §8 item 4's touch targeting reads
    // `elementFromPoint(...).closest('[data-enemy-uid]')`, and a canvas that ate
    // events would return the canvas — over the WHOLE stage now, not just the
    // battlefield, so this matters more than it did.
    expect(rule!.body).toContain('pointer-events: none');
  });

  it('lifts both DOM bands above the canvas rather than re-parenting them', () => {
    // §1.2: the DOM keeps its box, its text and its hit targets and simply
    // stops painting. Nothing moves in the tree; the canvas goes behind.
    const lift = rules.find(
      (r) =>
        r.sels.includes('.lantern-battle .battlefield') && r.sels.includes('.lantern-battle .hand-zone'),
    );
    expect(lift).toBeDefined();
    expect(lift!.body).toMatch(/z-index:\s*1/);
  });
});
