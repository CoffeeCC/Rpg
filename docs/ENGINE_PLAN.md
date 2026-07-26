# Lantern: building the engine

Started **2026-07-25**. Written so any session — Claude Code, Codex, a fresh
clone — can pick this up cold. Read `docs/LIGHTING_PLAN.md` first; it is the
history this replaces, and §12 of it holds decisions that still stand.

Paul, granting scope: *"The goal here is to really create our own game engine,
with lighting at the forefront. Lighting is going to be a Heavy Heavy focus. It
needs to be Visually Stunning. If we need to go 3d or change Art styles from the
Images we currently have just say the word... Take the Role of an Experimental
Top Quality Game Engineer Developer and Fire on all cylinders. You have Full
Decision making ability."*

So the decisions below are made, not proposed. Each one names what it costs.

---

## 0. The one-paragraph version

The world becomes a GPU scene; the UI stays DOM. A new renderer under
`web/src/lantern/` owns the map and the battlefield — HDR, normal-mapped
per-pixel lighting, and real 2D global illumination via radiance cascades. Every
menu, rail, log, sheet and overlay stays exactly where it is, as HTML. We remain
in TypeScript: no Unity, no engine port. Art stays 2D and gains normal maps.

---

## 1. The three decisions that matter

### 1.1 Stay in TypeScript. Do not move to Unity.

Paul offered to hook Grok up to Unity and produce 3D models. Declining, and the
reason is not sentiment about the existing code.

**The game logic is the moat; the renderer is the replaceable part.** What is
actually in this repo is a decade-of-evenings pile of *systems*: `cardBattle`,
`floors`, `lootGen`, `saveGame` with a full migration chain, `chronicleIntel`,
`drill`, `sets`, `bindings`, `retelling`, `statBreakdown` — against ~700 passing
tests, plus hundreds of recorded voice lines and a controller-nav layer. Moving
to Unity means rewriting all of that in C# in order to change how pixels get
drawn. That is rewriting the game to replace the renderer.

**And Unity would not win the thing we actually want.** Unity's URP 2D renderer
gives 2D lights, shadow casters and normal maps — roughly milestone M2 below,
out of the box. The thing that makes this *stunning* rather than merely lit is
real-time 2D global illumination, and in Unity you would be writing that
yourself too, in HLSL, against a renderer you do not control. If the hard part
is bespoke either way, do it where the other 40,000 lines already live.

**Steam is not a reason to leave.** A WebGL2/WebGPU game wrapped in Electron
ships to Steam like anything else. Vampire Survivors shipped there as an
HTML5/Phaser game; Cookie Clicker is on Steam; Slay the Spire is Java. The
wrapper is a solved, boring problem, and it has a bonus: **the Steam build is
Chromium we control**, so it can assume GPU features the open web build cannot.

**What this costs.** No editor. No inspector, no scene view, no drag-a-slider
tuning. We pay that back in §6 with an in-game debug overlay and hot-reloadable
tuning constants, and it is a real cost — expect to spend real time on tooling
that Unity would have handed over free.

### 1.2 The world becomes a scene. The UI stays DOM.

`LIGHTING_PLAN.md` §5 rejected every lighting library with: *"every one assumes
it owns the renderer. The fight is DOM."* That was correct, and it is worth
being precise about what it was correct *about*, because it reads like an
argument against this whole document and it is not.

The fight was never "DOM versus GPU". It was that a lighting library wants to own
**everything**, including the text, the menus and the accessibility tree — so
adopting one meant rebuilding 22 screens as sprite scenes and losing layout,
text and controller focus.

The split every real game makes is different and we take it: **the world is a
scene the GPU draws; the UI is a separate layer on top.** Here that layer
happens to be HTML, and that is a genuine advantage rather than a compromise —
free text shaping, free layout at four breakpoints, free accessibility, and
`web/src/nav/` keeps working unmodified on all 22 screens.

Concretely, this moves to canvas:

- the map grid: floor, walls, breakables, ground items, the hero token
- the battlefield: backdrop, unit sprites, impact effects
- all lighting, everywhere

and this does **not**:

- every menu, rail, panel, log, tooltip, sheet, overlay and button
- all text, anywhere
- the card hand, the portraits, the HUD

### 1.3 Art stays 2D. It gains normal maps.

The other half of Paul's offer was changing art style / going 3D. Also
declining, and this one is worth arguing because the instinct is reasonable.

**3D models are not the shortcut to "stunning" here.** What makes a 2.5D game
look extraordinary is not polygon counts — it is per-pixel lighting on
well-authored 2D art, plus GI that actually bounces. Going 3D buys rigging,
skinning, animation blending, LODs, material authoring and a much longer
iteration loop, and it *costs* stylistic control: a hand-painted frame will out-
render an untextured Grok mesh every time, at a tenth of the pipeline.

**What I do want from Grok, and will ask for specifically at M2:** normal maps
and roughness/emissive masks for the existing tiles and sprites — or new albedo
art authored in the knowledge that it will be lit rather than pre-shaded. Flat
art with the shadows painted *into* it fights a lighting engine; that is the art
change that matters, and it is a change of intent, not of dimension.

Until then, M2 derives normals from the existing art automatically (height from
luminance, then a Sobel pass). That is good enough to prove the look and to show
Paul what to art-direct toward, and it costs no art hours to find out.

**Reversible on purpose.** Sprites are drawn from a material — albedo, normal,
and optional emissive/height. A 3D-rendered sprite sheet drops into exactly that
slot later. Choosing 2D now does not close the door; it declines to open it
before we know what is behind it.

---

## 2. Architecture

```
web/src/lantern/            the engine. no React, no DOM queries, no game rules.
  gl/         context, shader/program cache, VAOs, render targets, context loss
  scene/      Scene, Camera, Sprite, Material, Light, Occluder, Emitter
  passes/     gbuffer -> direct -> cascades -> composite -> bloom -> tonemap
  cascades/   the radiance cascade solver
  debug/      the HUD, false-colour overlays, the tuning panel
web/src/components/  React. builds a Scene from game state, mounts a <canvas>.
web/src/engine/      game rules. UNTOUCHED by any of this.
```

**Named after the game's own conceit.** The hero carries the only light down
there; `lighting.css` already calls it the Last Lantern. The engine is Lantern.

Three rules hold this together, and they are the ones to enforce in review:

1. **`lantern/` never imports from `engine/` or `components/`.** It takes a
   Scene and draws it. It does not know what a monster is. This is what keeps it
   testable headless and portable to the next game.
2. **`lantern/` never reads the DOM.** No `getBoundingClientRect`, no selectors.
   The current engine measures occluders out of live layout, which was clever
   and is exactly what §12 of the lighting plan found to be the ceiling: it ties
   light to the projection, forces AABBs, and returns bounding boxes rather than
   shapes. Geometry comes from world state now.
3. **The scene is rebuilt from game state, never mutated in place.** Same
   discipline as the reducer. A frame is a pure function of state plus time.

### The frame

```
  1  G-BUFFER      albedo · normal · emissive · height, one batched pass
  2  DIRECT        analytic lights, normal-mapped, soft shadows
  3  CASCADES      radiance cascades -> indirect radiance field
  4  COMPOSITE     direct + indirect + emissive, into an HDR target
  5  VOLUMETRIC    god rays / participating media (M5; the murk's successor)
  6  BLOOM         downsample chain on the HDR target
  7  TONEMAP       HDR -> LDR, then LUT grade, vignette, dither
```

`AMBIENT_FLOOR` dies at step 3, which is what it has been waiting for since the
lighting plan was written.

### Camera: orthographic tilt

`LIGHTING_PLAN.md` §12 holds unchanged — squash the axis-aligned grid, give
walls a visible front face, stand characters up as billboards. It was argued
there against isometric on three grounds (rectangle occluders, DOM bounding
boxes, and `nav/geometry.ts`), and **two of those three arguments dissolve once
the world is a GPU scene**. The third does not: rows and columns staying rows
and columns is what keeps the controller-nav spatial model honest, and that is
still the shipping blocker.

The honest restatement: with a real renderer, isometric becomes *possible*. It
stays *unchosen*, because HD-2D — the thing Paul actually named — is a tilted
camera, not a diamond grid, and because the tilt is where the lighting payoff
is. Straight top-down is the worst projection for showing off light: no vertical
surfaces means nothing for the lantern to rake across. Revisit after M4, with
the tilt on screen to compare against.

---

## 3. Milestones

Each is independently visible and gets a preview. The game is played daily, so
§5's rule holds throughout: **nothing may break the map and the battlefield at
once.**

| | | what Paul sees |
|---|---|---|
| **M1** | **Lantern core** — GL context, sprite batcher, HDR target, tonemap, bloom, debug HUD. The map's existing art, drawn on the GPU. | Looks *the same*. Deliberately. Proof the floor renders at 60fps with nothing new on it. |
| **M2** | **Per-pixel lighting** — derived normal maps, normal-mapped diffuse + specular, soft shadows from world geometry. | **The first real moment.** The lantern rakes across wall faces instead of just clearing fog. This is where the art ask gets made. |
| **M3** | **Radiance cascades** — real 2D GI. Bounce, colour bleed, penumbra that closes. | The headline. Shadows get *structure* instead of a constant. |
| **M4** | **Orthographic tilt** — grid squash, wall front faces, billboarded characters. | The HD-2D read. |
| **M5** | **Volumetrics + emitters** — god rays through a doorway, glowing shrines, a fire card lighting the room for a turn. | Atmosphere. The murk's honest successor. |
| **M6** | **Battle through the same renderer.** | Consistency; the arena stops being a different game visually. |
| **M7** | **Grade** — LUT, vignette, dispersion, grain, dithering. | The cinematic pass. |

**M1–M3 is the real project.** M4–M7 are large but well-understood; M3 is the
one with genuine research risk, which is why a research agent is on it before a
line of it gets written.

No dates. The honest shape is that M1 is days, M2 is days, M3 is weeks, and
anyone quoting a date for M3 before reading the cascade research is guessing.

---

## 4. How this ships without breaking the game Paul plays daily

- **The new renderer lives behind `?r=lantern` from M1 until it wins.** Both
  paths run. The DOM map is the default until the canvas map is *better*, not
  until it is *finished*.
- **The old light engine is not deleted at M1.** `art/lightEngine.ts` and the
  Phase 1 merge stay live on the DOM path until M4 retires it. Phase 1's tests
  keep guarding it in the meantime.
- **`engine/` is untouched.** If the renderer is a disaster, `git revert` on
  `lantern/` returns a fully working game.
- **Every milestone lands on master behind the flag**, not on a long-lived
  branch. Codex pushes to master in parallel; a six-week renderer branch would
  be a merge catastrophe.

---

## 5. What could go wrong

Ordered by how likely it is to actually bite.

1. **The canvas map loses the DOM map's crispness.** Text on tiles, hover
   affordances and focus rings are things HTML does perfectly and a canvas does
   by hand. Mitigation: the tile *chrome* — selection rings, move-range chips,
   hover targets, nav focus — stays DOM, positioned over the canvas. Only the
   painted world moves. This also keeps `nav/` working with real elements.
2. **M3 turns out to be a month.** Radiance cascades are new, subtle, and
   documented mostly in talks. Mitigation: M2 must stand on its own as a shipped
   improvement, so a stalled M3 leaves the game better than it found it.
3. **Perf on the Deck.** A cascade solve is not free and the Deck is the target.
   Mitigation: the debug HUD lands in **M1**, not when it is needed. Cascade
   count and resolution are dials from the first day they exist.
4. **Context loss shows an unlit scene.** The old plan's specific fear. It
   inverts here — the renderer owns the whole world, so a lost context is a black
   frame, not a blown-out one. Handle `webglcontextlost`, hold the last frame,
   rebuild resources, and never treat "no GL" as "no darkness".
5. **Derived normal maps look like embossed mush.** Very possible on flat art.
   Mitigation: M2 ships a per-material strength dial and a hand-authored override
   path from day one, and if derived normals are bad the answer is the Grok art
   ask, not a worse renderer.
6. **The art starts fighting the lighting.** Existing tiles have shadow painted
   into them; lighting painted art double-shades. Expect a de-shading pass on
   the tile set at M2, and expect it to be the largest art bill in the project.
7. **Two renderers diverge and both rot.** The flag is a liability past its
   usefulness. Delete the DOM world path at M4, on purpose, in its own commit.

---

## 6. Tooling we owe ourselves

Unity would have given these free; declining Unity means building them, and
building them *early* rather than when desperate.

- **`?r=lantern&debug=1`** — frame time p50/p99, draw calls, cascade cost, GPU
  timer queries, live light count.
- **False-colour overlays** — direct only, indirect only, normals, albedo,
  overdraw, cascade level. Debugging light by looking at the final image is how
  weeks get lost.
- **A tuning panel** with every constant live-editable and a "copy as TS" button,
  so a good-looking frame becomes source without a round trip.
- **Deterministic headless tests.** The mechanism-level standard from
  `LIGHTING_PLAN.md` §10 carries over unchanged and is *more* important here:
  prefer tests that would reject the old behaviour, and assert the repro fired.
  Shader output is testable by rendering to a target and reading back known
  pixels — slow, but it is a test, and "it looked right on my machine" is not.

---

## 7. The art pipeline

Paul: *"Whatever tool you think we could use to convert our images into whatever
we need... If we just need sprites then we don't need Unity right? make sure
grok can hook into it."*

Correct — no Unity, and no 3D tool of any kind. But the division of labour is
not the obvious one.

### Grok generates exactly one channel: albedo

**Everything else is computed, and this is not a cost decision.** A normal map
must correspond to its albedo *pixel for pixel* — the bump has to sit on the
brick. Ask a diffusion model for "the normal map of this image" and it generates
a *different image* that happens to look like a normal map. The channels will
not register, and misregistered normals look worse than no normals: the light
picks out detail that is not in the art. Generative models cannot produce
pixel-aligned companion maps, and no amount of prompting fixes it.

So: **Grok makes the paint, math makes the surface.**

| channel | source |
|---|---|
| albedo | Grok `image_gen` — see the brief change below |
| height | derived: local ONNX depth estimate (Depth Anything V2), luminance fallback |
| normal | derived from height (Sobel), per-material strength |
| AO | derived from height |
| emissive | declared mask per material + hand-painted overrides |
| roughness | declared per material + overrides |

Height from *depth estimation* rather than from luminance, because
height-from-luminance asserts "bright means high", which is wrong the moment the
art contains a dark object under a bright light — and that is most of this art.
Luminance stays as the offline fallback.

### The tool is `tools/art/`, in this repo

Not a GUI application. The pipeline must re-run unattended over ~125 assets,
run in CI, and keep its per-material tuning in version control beside the art. A
workflow where somebody drags sliders in an app is a workflow that cannot be
re-run when the art changes — and the art will change.

**Laigter** (free, open-source, purpose-built for exactly this, has a CLI) is
worth installing as the *reference to check our output against*. It is not the
pipeline, for the reason above.

A `materials.json` manifest declares each material's channels, its normal
strength, its roughness and its emissive rule; the build packs the result into
atlases. Hand-authored overrides always win over derived ones.

### What must change in the Grok brief

1. **Stop baking shadows into the art.** The largest and cheapest win available,
   and it is a prompt change, not a tool change. Current tiles have lighting
   painted into them. Lighting painted art double-shades — cast shadow on top of
   painted shadow — and it is the single most common reason 2D games look wrong
   the moment real lighting is added. Briefs need: *flat even ambient light, no
   cast shadows, no directional highlight, no baked ambient occlusion, no
   vignette.* The art should look slightly boring on its own. That is correct;
   the engine supplies what was removed.
2. **PNG, not JPG, for anything that gets lit.** JPEG's 8x8 DCT blocks are
   invisible in colour and become **visible ridges** in a normal map, because
   deriving a normal means differentiating the image and differentiation
   amplifies exactly that noise. Tiles are already 1024x1024, so resolution is
   not the problem — the format is.
3. **Tiles must tile.** Seamless edges, asserted in CI.

### Scope: ~125 assets, not 453

Of 453 images, the 164 cards and 100 icons are UI and are never lit. The world
set is 10 tiles, 92 monsters, 5 backdrops, 5 heroes, 10 npcs, 3 sprites and fx.
Only those need materials, and the tiles are the ones that matter most — they
fill the screen.

Existing art is not thrown away. It becomes the albedo channel, minus a
de-shading pass on the tile set (expect this to be the largest single art bill
in the project, and expect it to be worth it).

---

## 8. Open, and mine to close

- WebGL2 versus WebGPU as the target — research in flight. The likely answer is
  WebGL2 for the web build and WebGPU for the Steam/Electron build behind one
  interface, but that is a guess until the report lands, and if WebGPU support
  is universal enough it is one path.
- Cascade count, probe spacing and interval scaling at 1280x800 — pending the
  same research.
- Whether the battlefield gets a real tile grid at M6, which would let it share
  the map's world-space solver instead of needing its own screen-space one.
