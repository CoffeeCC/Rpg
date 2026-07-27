# Materials QC — painted furniture albedo (SAMPLE)

**Date:** 2026-07-26
**Brief:** `docs/ART_BRIEF_MATERIALS.md`, plus `BRIEF_FOR_GROK.md` in this directory
**Scope:** ONE piece — the console deck. Nothing installed; `web/public/` untouched.

## Why this was worth doing

Measured on the shipped bakes, before anything was changed:

| asset | size | mean RGB | unique luminance values | tonal range |
|---|---|---|---|---|
| `console_body` | 1024x348 | (161.7, 134.4, 104.6) | **2** | **0.5%** |
| `console_body_brass` | 1024x348 | (190.8, 167.7, 111.3) | 3 | 0.8% |
| `log_well` | 1024x573 | (161.7, 134.4, 104.6) | 2 | 0.5% |
| `wall_face` / `_tall` / `_chipped` | — | (187.5, 182.4, 180.6) | 2 | 0.4% |
| `pile_tray`, `lantern_cradle` | — | (161.7, 134.4, 104.6) | 2 | 0.5% |

Every one is a flat constant fill straight out of `bake.py`'s `WOOD_FRAME`,
`STONE` and `BRASS` tuples. The albedo channel was doing nothing at all; all
the shape lives in the normal and material maps.

**One correction to the premise.** These are not 1024x1024 tiles. They are
cut-out shapes at assorted aspect ratios carrying a real alpha silhouette, and
`console_body` REPEAT-WRAPS horizontally in units of `CONSOLE_BODY_REPEAT_UNIT`
(4.0 board units). So the deliverable is not "a new tile" — it is a seamless
material cut into the existing silhouette, which is what was done. The alpha
channel of both outputs is **byte-identical** to the shipped file, and the
normal and material maps were not touched, so the geometry is exactly what it
was and only the paint changed.

## Result

| output | tonal range before | after | target |
|---|---|---|---|
| `console_body` | 0.5% | **80.9%** | >60% |
| `console_body_brass` | 0.8% | 37.7% | see note |

Source materials, measured independently of Grok's self-report:

| material | size | format | mean RGB | target RGB | tonal range | quadrant spread | JPEG blockiness |
|---|---|---|---|---|---|---|---|
| `console_timber` | 1024x1024 | PNG | (161.6, 132.0, 102.4) | (162, 134, 105) | 74.3% | 2.69 | 0.981 |
| `console_brass` | 1024x1024 | PNG | (190.2, 167.2, 110.2) | (191, 168, 111) | 44.1% | 4.63 | 1.002 |

- **Blockiness** is mean `|dL|` on the 8-pixel grid over mean `|dL|` off it.
  Both sit at ~1.0, i.e. no JPEG 8x8 structure. Grok warned its generator used
  a JPEG intermediate; measured, nothing survived into the delivered PNG.
- **Quadrant spread** stands in for "is there a global gradient". Both are
  under 5 luminance levels across the whole canvas — no painted key light.
- **Seams** verified numerically and by eye at 2x2. Edge rows/columns are
  force-matched with a blend band about 20px deep (2% of the frame); the
  interior is not mirrored (full-mirror difference 37 vs interior gradient 10).

## Two rounds on the brass, and why

**Round 1 passed every measurement and was rejected on sight.** It scored 70.0%
tonal range and 1.38 quadrant spread — better numbers than the round that
shipped — and it looked like crushed pepper scattered on yellow. Dense
near-black speckle covering most of the surface, no continuity of metal
anywhere, and a feature scale far too coarse for what it is actually drawn on:
the brass parts of this piece are strips about **35 pixels wide**, so anything
larger than a few pixels reads as random noise rather than patina.

Round 2 was re-briefed on exactly that — smooth continuous alloy as the
dominant read, tarnish as a fine film with nothing below sRGB luminance 90,
features 2–6px. It measures *worse* (44.1% vs 70.0%) and looks correct. That
is the whole point of viewing the image: **the metric was not wrong, it was
measuring the wrong thing.** Contrast is not quality.

Consequently the 37.7% on `console_body_brass` is **deliberate and not a
miss**. The >60% target in the brief was written for full-frame ground and wall
tiles; pushing a 35px brass bead to 60% is what produced the round-1 gravel.

## Verified by eye versus by measurement

- **By eye** (every image opened and looked at, not trusted from a filename):
  both source materials, the 2x2 tiling sheet, and both composited outputs
  against the real silhouette. Sheets kept as `_compare_console.png`,
  `_compare_brass2.png`, `_tile2x2_console_timber.png`.
- **By measurement:** size, true PNG encoding, mean RGB, 2nd–98th percentile
  tonal range, quadrant spread, 8x8 blockiness ratio, wrap continuity,
  mirror-symmetry check, and alpha equality against the shipped file.

## Honest residuals

1. **Timber repetition is visible when tiled.** The knot pattern reads as a
   repeat at 2x2. Acceptable for a deck that repeats once or twice across the
   board; would want breaking up if it were ever used as a large field.
2. **The brass reads as machine-brushed rather than hand-finished cast.** The
   hairlines are regular because round 2 was generated procedurally. It is
   correct metal and a large improvement, but it is not yet *characterful*.
3. **Wear is generic, not placed.** The brief asked for tarnish "where a thumb
   would rest". A tiled material cannot know where the thumb goes; the burnish
   is broad and soft but not positioned against the shape. Placing it needs
   per-shape painting rather than a tiled swatch.
4. **The white scuffs on the timber are a little bright** — they read closer to
   chalk than to worn oil in places.

## Not done

The other pieces (`log_well`, `pile_tray`, `lantern_cradle`, `brass_strap`,
`exhaust_grate`, the four wall shapes) are untouched, pending Paul's call on
whether this sample is the right direction. The timber and brass materials here
are reusable for all of them as-is.
