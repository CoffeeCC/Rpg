# Lighting: architecture and phased plan

Status as of **2026-07-26**. Written so any session — Claude Code on the PC,
Codex, a fresh clone — can pick this up without the conversation it came from.

Approved by Paul on 2026-07-26 ("Go for it dude").

**Phase 1 is built and its tests are green** — see the measured numbers in §4.
**Phase 2 is not started**, and its design changed on 2026-07-25: the lattice is
solved in WORLD space on the map, not screen space, and the game is moving to
an orthographic tilt. Both decisions and their arguments are in §12, which is
the first thing to read if §2 and §4 seem to disagree with each other.

---

## 1. Where the engine is today

`web/src/art/lightEngine.ts` computes light rather than painting it:

- inverse-square falloff with a smooth window that reaches exactly zero at
  `reach` (the window is not cosmetic — without it the profile has a step in
  it at the rim, which is what made an early version read as "a yellow circle")
- 2D shadow volumes cast from rectangle occluders measured out of the live DOM
- area-light penumbra by multi-sampling the flame (`FLAME_SAMPLES = 7`)
- 4-octave value-noise flicker driving both intensity and the flame's position
- "murk": two counter-drifting baked noise tiles, composited `source-atop` so
  it can only land on darkness

`web/src/components/LightLayer.tsx` mounts it: **one half-resolution canvas
composited over the DOM**. The canvas is filled with night and the lit region
is *cut away* with `destination-out`, so the art underneath shows through where
light reaches. It never renders the scene and never reads the canvas back.

Consumers: `FloorScreen.tsx` (map — hero is the light, reach = MOV) and
`BattleScreen.tsx` (arena — vigor drives intensity). `lightresponse.css` turns
the per-element `--lit` / `--lx` / `--ly` / `--twinkle` properties into sheen,
rim and glint.

### The problem this plan exists to solve

Paul, on the lit map: the diagonal shadow boundaries around a pointed corner
are geometrically plausible, *"but it just doesn't look like the light is
actually bouncing."*

He is right. **The engine models direct light only.** Occluded regions are
filled with one flat constant (`AMBIENT_FLOOR = 0.34`). No indirect term, no
colour bleed, no light spilling around corners. A shadow edge is therefore a
boundary rather than a falloff, and shadow interiors are uniformly dead.

---

## 2. Recommended architecture

**Split the light into two terms on two clocks.**

- **DIRECT** stays exactly what it is: analytic vector geometry on the half-res
  2D canvas, per frame, filling night and cutting it away.
- **INDIRECT** becomes a coarse **directional radiance lattice**, solved on the
  CPU *off the frame loop*, seeded by analytic direct irradiance, propagated
  cell-to-cell with occlusion blocking and per-cell albedo. Composited as two
  small upscaled images: `destination-out` to lift night where bounce landed,
  `source-atop` to tint the remaining darkness with the bouncing surface's
  colour.

  **The lattice lives in WORLD space on the map** — one cell per map tile,
  ~250 of them — and in screen space (~64x40 at 1280x800) in battle, which has
  no tile grid to live in. Same `solveIndirect` interface, two scene providers.
  This was originally spec'd as screen-space everywhere; §12 is why it changed
  and what it buys.

`AMBIENT_FLOOR` is deleted.

> **The trade-off, named:** indirect runs at ~10Hz on a ~10-canvas-px lattice,
> so it lags the direct light by a frame or two and cannot resolve detail finer
> than ~20 CSS px. Bought deliberately — indirect light really is low-frequency
> and slow — and it is what keeps this on the CPU with no second renderer and
> no fallback path to maintain.

### The composite discipline is load-bearing

`destination-out` for luminance means indirect can only ever *remove* night;
`source-atop` for colour means it physically cannot land in the lit pool. That
is what structurally prevents the bounce from becoming a second glow — the
"yellow circle" returning through the last available door. Assert the
operations, don't just describe them.

---

## 3. Where albedo comes from

The crux, because the engine currently has no concept of surface colour.
**Decision: sample the painted art the player is already looking at.**

- Map: `TILE_TEXTURES[gateId]` ground/wall JPGs drawn once into an 8x8
  offscreen canvas, one `getImageData`, cached by URL forever.
- Battle: `backdrop_{gate}.jpg` sampled into a **24x16 grid**, not one average,
  so ground bleeds differently from sky.
- Same-origin from `public/`, so no canvas taint.

Fallback chain:

| Tier | Source | Role |
|---|---|---|
| 1 | `data-albedo` on the DOM element, read during the existing measure sweep | general mechanism + escape hatch; zero new layout reads |
| 2 | texture sampling (above) | the default; does the actual work |
| 3 | declared table keyed by tile char, beside `TILE` in `engine/systems/floors.ts` | deterministic, node-testable; the fallback on load failure, taint, or SVG backdrops |

Rejected: reading back the direct-light canvas (stalls the compositor on a
Deck) and sampling the composited DOM.

**Sampling beats declaring** for a reason worth keeping: the bounce hue is
derived from the same art it has to sit next to, so it cannot clash with it.

---

## 4. Phases

Each is independently shippable and independently verifiable. The game is
played daily — nothing may break the map and the battlefield at once.

### Phase 1 — Merge the occluder union · **BUILT 2026-07-25**

Collapse occluders into maximal rects before casting (a 10-cell wall run → 1),
plus per-frame Vogel rotation of the sample disc.

**This is the fan of diagonals Paul keeps reporting.** Every wall cell casts
its own gradient-filled quad, so alternating AA seams (light) and `occluderPad`
overlaps (dark) radiate from every corner. Note `occluderPad` was added to seal
corner *leaks* and made the dark half of this artifact worse.

- Files: `art/occluderMerge.ts` (new, 155), `art/lightEngine.ts` (+70/−8),
  `engine/test/occluderMerge.test.ts` (new, 380)
- **Rejecting tests, as measured.** Every one runs the engine both ways —
  `renderLight(..., mergeRuns=false)` is the old geometry — and asserts the old
  path is broken before asserting the new one is not:

  | | old | new |
  |---|---|---|
  | shadow depth along a padded wall | alternates 1,2,1,2 — variance > 0 | constant 1 — variance **exactly 0** |
  | shadow depth, unpadded wall | **0 behind every seam** (light leaking) | ≥1 everywhere, variance 0 |
  | polygon fills, 10-cell wall | 209 | **11** |
  | sample-disc angle over 500 frames | 1 distinct value | 16/16 angular bins |

- On a real Hollow Gate floor: **24 wall rects → 8**.
- Merging closes the grid's `gap` exactly rather than by forcing every
  neighbour pair to overlap, so it fixes the leak `occluderPad` was added for
  AND the doubled darkness that pad introduced. The pad still earns its keep at
  junctions *between* merged runs (an L's two arms are two rectangles).
- `REDUCED_FLAME_SAMPLES = 11`: the spin smears the N penumbra steps across
  frames, and a still frame has no other frames to smear into, so reduced
  motion spends samples instead. Free — that frame is drawn once.
- That 5–6x cut in polygon fills is what buys the frame budget Phase 2 spends.

### Phase 2 — The lattice · 4–6 days

`lightField.ts`; solve off the rAF path; composite both passes; delete
`AMBIENT_FLOOR` and the per-edge length fade; union path per sample.

- Files: `art/lightField.ts` (new ~280), `lightEngine.ts` (+70/−60),
  `LightLayer.tsx` (+90), both consumers (+6 each), tests (~220)
- **Rejecting test:** in cells fully occluded from every flame sample, radiance
  must decrease monotonically with distance from the corner mouth. Old model is
  a flat constant, scoring correlation **0.000000**; new scores < −0.9.
- **Delivers by far the most visible improvement.**

### Phase 3 — Albedo · 2–3 days

Sampler + tier chain + per-cell albedo weighting.

- Files: `art/albedo.ts` (new ~130), `art/albedoTable.ts` (new ~40),
  `lightField.ts` (+50), `LightLayer.tsx` (+40), consumers (+8 each),
  tests (~100)
- **Rejecting test:** red-left/blue-right synthetic albedo — new gives R/B > 3
  on the left and < 1/3 on the right; old has no colour at all, ratio
  identically 1.0 on both sides.

### Phase 4 — Fill direction on responders

Responders learn a second light direction: `--fx` / `--fy`, where the *bounce*
comes from, alongside `--lx` / `--ly` for the key.

- **Rejecting test:** object in a wall's shadow beside a brightly lit wall on
  the far side from the flame — assert `fill > 0` and the key/fill angle
  exceeds 60°. The old engine only ever writes a direction pointing at the
  flame, so it scores identically 0° and cannot pass.
- Also: fill must respect occlusion (put a second wall behind the bouncing one
  → `fill ≈ 0`), which rejects any implementation that merely distance-weights
  nearby brightness.

### Phase 5 — Secondary emitters · the payoff

`data-emit="#ffb45a 0.8"` on shrines, stairs, enemy eyes, a fire card's impact.

**The vector direct pass costs O(lights); the lattice costs O(1) in lights.**
Every emitter after this is free — a shrine down a corridor, a burning card
lighting the battlefield for a turn, a boss's eyes.

- **Rejecting test:** solve cell-touch count identical with 1 emitter and with
  20. Plus: an emitter lights a corridor with the lantern removed entirely, and
  is blocked at a cross-wall.
- Emitters contribute indirect only, so they cast no sharp shadows.
  `data-emit-direct` is the escape hatch to promote one into the vector pass.

### Phase 6 — WebGL2 solver behind the same interface · **do not build now**

Only if a perf HUD on a real Deck shows the CPU solve above ~2ms at shipping
sizes. Interface (`solveIndirect(scene, light, opts) → RadianceField`) is
unchanged; the CPU path stays the guaranteed fallback.

Writing it down now is the point: it means Phases 2–5 are not a dead end, and
it means nobody reaches for WebGL early.

---

## 5. Why the alternatives lose

- **Screen-space blur of the direct buffer** — needs a canvas readback
  (compositor stall), has no albedo so can never bleed colour, and bleeds
  *through walls*, which on the map is a fog-of-war lie.
- **Jump-flood SDF** — gives visibility, not radiance transport; you still
  march it per receiver, and JFA on CPU is not cheaper than sweeps.
- **True radiosity** — O(n²) form factors for a result indistinguishable from
  ~12 propagation iterations at this cell size.
- **Radiance cascades** — best-looking answer, but mandates WebGL2, and its win
  is many lights at long range; this game has one lantern at 620px.
- **A lighting library (pixi-lights, illuminated.js, LightingJS)** — every one
  assumes it owns the renderer. The fight is DOM: real elements, CSS layout,
  text, painted PNG backdrops. Adopting one means rebuilding the battlefield
  and map as sprite scenes and losing layout, text and accessibility.
- **WebGL generally, now** — a lost context means no darkness, i.e. the scene
  at full brightness. That is exactly the "screen flashes when a card is
  played" bug already fought and fixed. A 2D fallback is therefore mandatory:
  two engines, two tunings, and the numeric mechanism tests degrade into
  screenshot diffs.

---

## 6. Sequencing trap

**Phase 1 must KEEP the per-edge length fade. Phase 2 must DELETE it.**

That fade is a hand-drawn stand-in for bounce — the comment in
`lightEngine.ts` says so outright. Removing it in Phase 1 ships shadows that
end on hard polygon lines. Removing it in Phase 2, where the lattice supplies
the real thing, is the moment the engine stops imitating indirect light and
starts computing it.

---

## 7. Resolution, motion, degradation

- **Keep half resolution.** Doubling it quadruples fill cost for zero visible
  gain (light has no high-frequency content; apparent sharpness comes from the
  DOM underneath, always full-res). Half-res also antialiases shadow edges
  before upscaling, which flatters the penumbra — full res would make N=7
  sample banding *more* visible. Make `SCALE` a named constant so the
  experiment is one line.
- **Never set `willReadFrequently`.** It forces a software canvas. Nothing here
  reads the canvas back, and that is a deliberate commitment.
- **`prefers-reduced-motion`:** the light stays, the motion goes. Solve once,
  no idle re-solve, no per-frame flicker modulation of indirect, fixed Vogel
  rotation with N raised to 11. The `version`-driven re-solve **must** still
  run — a hero step is a geometry change, not motion.
- **Degradation is null checks, not code paths.** No `document` → no murk, no
  albedo, no field. No 2D context → the layer renders nothing and the game is
  undimmed. Image failure or taint → tier 3. `solveIndirect` returns null →
  falls back to today's constant ambient byte-identically. Screens with no
  LightLayer are untouched because every CSS consumer is `var(--x, 0)`.

---

## 8. What could make it look worse

Ordered by likelihood of actually biting.

1. **Shadows go grey and the dungeon stops being frightening.** The most likely
   failure and the one Paul notices in a minute. Cap the *luminance* lift at
   ~0.25 of the night alpha while letting *chroma* run generously; expose
   `bounce` as a per-screen dial exactly as `ambient` is today (low on the map,
   where the murk *is* the unknown; higher in battle, where a stone room
   bounces). Dark-but-coloured, not lighter. A shadow with **structure**, not a
   shadow with more light in it.
2. **Bounce reads as a second glow.** Prevented structurally by the composite
   discipline in §2, not by tuning.
3. **Lattice blockiness — bilinear diamonds.** Two-step upscale plus a blur on
   the small source; cell size capped at ≤12 canvas px. Check at `?light=debug`
   with the false-colour overlay.
4. **Bounce pops when the hero steps.** Cross-fade over `STEP_MS`, the same
   constant the walk glide uses.
5. **Muddy albedo.** `bounceSaturation` step, plus a CI chroma floor on shipped
   gate textures so an art swap that averages to grey fails a test.
6. **Bleeding through walls.** Occupancy-blocked propagation by construction,
   with a 1%-through-a-3-cell-wall test. On the map this is a fog-of-war leak —
   a correctness bug, not a look bug.
7. **Colour clash with the painted art.** Self-correcting once Phase 3 lands:
   the hue is derived from that same art.
8. **Two coloured rims reading as a rainbow outline.** Fill amplitude capped at
   ~0.35 of `--lit`'s and restricted to the shaded side. Battle is the risk
   case — `lit-fig` already stacks two drop-shadows.
9. **Perf slips somewhere unmeasured.** `?light=perf` HUD with a documented
   criterion (p99 frame ≤16.6ms at 1280x800 on target), plus fill-count and
   cell-touch assertions in the unit suite so regressions are caught at the
   mechanism level.

---

## 9. Effort

Phases 1–3: roughly **1,000 LOC net new, ~600 of it tests**.
Phase 1 is 1–2 days, Phase 2 is 4–6, Phase 3 is 2–3. Call it **8–11 focused
days**.

---

## 10. Verification standard

This codebase verifies visually with Playwright against a real running app AND
with deterministic unit tests that assert the *mechanism*.

**Prefer tests that would REJECT the old behaviour over tests that merely
describe the new one.** Precedent: the flame-sample isotropy fix asserted the
minor/major axis ratio of the sample cloud — old sampling scored `0.000000`,
new scores `0.6244`, threshold `0.33`.

And assert that the repro actually fired. A green test that never triggered the
bug is indistinguishable from a fix. Print the before/after of the thing the
bug depends on; if it did not move, the run proves nothing.

---

## 11. Related open work (not lighting)

- ~~Controller nav on 19 of 22 screens.~~ **Done.** Every screen and overlay in
  `components/` now registers a nav scope from the shared `nav/` layer, and
  `controllerNav.test.ts`'s "screen conversion coverage" suite enforces it —
  a new screen cannot ship without someone deciding what its B button does.
- Aggregate HP on the rail portraits (enemy chip = sum of all enemies, hero
  chip = party sum).
- Fixed **slots** for enemies and party. Today both rows are plain flex
  containers mapping over live units and centre-packing, so a death reflows the
  row. Paul wants card-game-style slots.
- The battle view's bottom-left corner is occupied (draw pile x 60–150, hand
  from x~280, End Turn bottom-right) — moving anything there is Paul's call.

---

## 12. Projection and lattice space — decided 2026-07-25

Paul: *"The goal here is to really create our own game engine, with lighting at
the forefront. I'm envisioning like an HD2D Fire Emblem map movement. Do you
think it would be possible to make this an isometric 2D tile based engine? or
should we stick to top down? I just don't want to be too limited in the
future."* Then, asked to choose: *"whatever is highest quality and will look
the best."*

### Decision: orthographic tilt, not isometric

Squash the axis-aligned grid vertically, give walls a visible **front face** (a
vertical band), stand characters up as billboards. Rows stay rows and columns
stay columns.

**HD-2D is not isometric.** Octopath, Triangle Strategy and Live A Live are a
tilted *perspective* camera with billboarded sprites; the diamond read comes
from camera rotation, not from a diamond grid. True 2:1 dimetric is the
FFT/Tactics Ogre tradition — a different look, and the one Paul did not name.

**Why not isometric, concretely.** Three things break, and they are not
cosmetic:

1. `Occluder` is an axis-aligned rect; `facingEdges` assumes an AABB; and
   `occluderMerge` merges axis-aligned rects. Iso cells are rhombi, so all
   three need general convex-polygon versions — and so does the Phase 2
   lattice's occupancy test.
2. **In the DOM, a transformed element's `getBoundingClientRect()` returns its
   bounding box, not its shape.** The measure sweep in `LightLayer` would
   silently start reporting occluders *larger than the walls they stand for*.
   That is a fog-of-war lie, not a look bug.
3. `nav/geometry.ts` picks focus targets by spatial relationship between
   bounding boxes. A diamond grid breaks controller nav as well — the thing
   §11 already names as the shipping blocker for Steam.

Plus the art: every tile and character redrawn iso-consistent, and (x+y)
painter's-order depth sorting. On top of the 8–11 days Phases 1–3 already need.

**The quality argument is the point, not a caveat.** Isometric's ceiling is
higher in the abstract. But a half-tuned polygon shadow caster looks worse than
a well-tuned rectangle one, and the budget is what it is. Orthographic tilt
gets the HD-2D read while **every occluder stays an axis-aligned rectangle**,
so Phases 1–5 survive untouched and the whole budget goes into tuning light
rather than into rebuilding geometry.

And it fixes the real problem: **straight top-down is the worst projection for
showing off lighting.** Looking down at a floor, there are no vertical surfaces
for the lantern to rake across, which is a large part of why the light does not
read as bouncing. Give walls a front face and the light has something to land
on. The front face is a *responder*, not an occluder — the tile footprint stays
the occluder.

True isometric later is then a camera change plus an art bill, not an engine
rewrite — which is exactly the "don't be limited in the future" ask.

### Decision: the map's lattice is solved in world space

Not screen space. One lattice cell per map tile.

- **Occlusion becomes exact.** A tile is wall or it is not. No DOM measuring,
  no AABB approximation, no `occluderPad` fudge inside the solve.
- **~250 cells instead of ~2,560**, so the savings buy more propagation
  iterations rather than fewer — higher quality, not merely cheaper.
- **The projection stops mattering to the solver.** Solve in tiles, project the
  result. That is the thing that actually removes the future limit; the camera
  becomes a rendering choice.
- **Phase 5's emitters get exact for free** — a shrine is on a tile.

Battle keeps a **screen-space** field: it has no tile grid, and its occluders
are genuinely DOM boxes. Same `solveIndirect(scene, light, opts) →
RadianceField` interface, two scene providers. The interface in §4 Phase 6 was
already written to allow this.

**What this costs:** two scene providers instead of one, and the map's
composite needs the tile→screen projection to upscale the field. Both are
bounded, and both are work Phase 2 was going to do in some form anyway.
