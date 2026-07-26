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
