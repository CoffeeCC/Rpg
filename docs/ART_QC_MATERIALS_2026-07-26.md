# Materials QC — de-shaded board tiles (2026-07-26)

Ran the job from `ART_BRIEF_MATERIALS.md`: repaint the 10 gate ground/wall
tiles as flat-lit, tileable 1024×1024 PNGs, plus 2 emissive masks for the
abyss gate's ember cracks. Output is staged at
`web/art-staging/materials/tiles_new/` (gitignored) — this file is the
durable record, since the staging dir itself isn't. **Nothing was wired
into the game.** `TILE_TEXTURES` in `web/src/art/iconArt.ts` still points at
the shipped JPGs; that's deliberate — the lighting engine milestone that
consumes these textures hasn't landed yet.

## Two rounds were needed

Round 1 (Grok, self-orchestrated): correct subject/palette/tiling/global
flatness, but tonal range measured 2–52% against a 60% target — "flat
lighting" got read as "low local contrast," producing near-uniform-grey
materials. I tried to rescue it with a math-based per-channel contrast
stretch and that went badly wrong — clipped channels, blown-out neon colour
shifts. That stretch is destructive and not reversible, so round-1 output
was discarded rather than patched further.

Round 2: re-briefed Grok on the actual distinction — no *global* gradient
across a tile (keep), strong *local* contrast between adjacent features,
i.e. real ambient occlusion baked into the paint, explained by geometry not
canvas position (fix). All 10 albedos regenerated clean. The 2 emissive
masks from round 1 were fine and untouched throughout.

## Verified with the project's own lab tool, not eyeballed

`web/public/lantern-lab.html` — Rec.709 luminance 2nd/98th percentile
tonal-range span, and the 16-angle orbit test for baked directional
lighting. Every image was also viewed with the Read tool before acceptance,
since Grok's own file labelling has been wrong before.

| tile | tonal range | orbit test |
|---|---|---|
| verdant_ground | 56% | PASS |
| verdant_wall | 74% | PASS |
| hollow_ground | 55% | PASS |
| hollow_wall | 71% | PASS |
| sunken_ground | 61% | PASS |
| sunken_wall | 78% | PASS |
| storm_ground | 55% | PASS |
| storm_wall | 78% | PASS |
| **abyss_ground** | 58% | **PASS** (was the priority: shipped JPG **FAILED** at spread 0.182, peak/trough 180° apart — the textbook baked-light signature) |
| abyss_wall | 60% | PASS |

All 10 pass the orbit test clean — no baked directional light on any tile,
which was the defect the brief called "the single most common reason 2D
games look wrong the moment real lighting is added." 4 of 10 land just under
the 60% tonal-range target (55–58%, vs. baselines of 11–30%) rather than
clearing it; left as-is rather than a third Grok round, since the
higher-priority defect (directionality) is fixed on all 10 and this is a
smaller residual gap to close later if the consuming engine work wants more
precision.

Tiling verified programmatically: left/right and top/bottom edge pixel
deltas (0.4–2.0) are well under each image's own local pixel-to-pixel
variation (0.6–12.0) — seams don't show.

Full per-tile numbers, the manifest mapping outputs to the JPGs they
replace, and the round-1 low-contrast tiles (kept for reference, not for
use) are in `web/art-staging/materials/tiles_new/`.
