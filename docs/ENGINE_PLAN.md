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

### 1.2 It is a board game on a table, and everything is on the board

Paul, and this is the load-bearing sentence in the whole document: *"the Player
and the map should be like Game pieces on a Board game and the UI should be
Part of the Board game map itself."* Plus: *"I do want the UI to also Interact
with the Lighting... when a card hovers it should cast a shadow... i dont just
want flat 2d Buttons and Menus."*

Take that literally. **There is one board, one lantern, and everything in the
game is a physical object sitting on that board at some height above it.**

- The **map** is the board — timber, slate, inlaid tile, painted parchment.
- The **hero and the monsters** are pieces standing on it. Carved, painted,
  with thickness, casting contact shadows onto the board they stand on.
- The **UI is furniture on the same board.** The hand of cards is real cards
  lying on the table. The draw pile is a stack with edges. The vigor rail is a
  row of candles. The log is a strip of vellum. Buttons are brass plates and
  routed recesses. Panels are trays cut into the wood.

This is not decoration. It is the organising principle, and it **removes** work:

**There is no "world lighting" and "UI lighting".** There is one lit scene. The
split I had drawn in this section — world on the GPU, UI in DOM — was drawn in
the wrong place. The right split is:

> **The GPU draws every SURFACE. The DOM draws TEXT and HIT TARGETS.**

DOM elements stay exactly where they are, at exactly the same rects, carrying
exactly the same text, handlers, ARIA and `data-nav-item` attributes — they just
become *transparent*. Their visible surface is drawn by the renderer underneath
them, lit, textured, casting a real shadow. So:

- `nav/` keeps working on all 22 screens because the box tree is unchanged.
- Text stays crisp DOM text at every breakpoint, and stays selectable and
  announced.
- Every panel, card and button becomes a lit material for free, because the
  renderer does not know the difference between a card and a wall.

**Elevation becomes a first-class scene property.** Everything has a `z` above
the board. A card in the hand rests a couple of millimetres up; hovered, it
*lifts* — and its shadow softens and slides, and the specular sweeps across its
varnish, because that is what lifting a card does. The hover effect Paul asked
for is not an effect at all; it is the physics falling out of the model. Same
for a pressed button sinking into its recess.

**It settles the camera.** You look at a board from above, at an angle — not
straight down (you would see no pieces) and not rotated to a diamond (boards are
not). The orthographic tilt of `LIGHTING_PLAN.md` §12 is exactly the board-game
camera, arrived at twice from two different directions.

**It gives the art direction a spine.** Every asset now has one obvious
question — *what is this thing made of?* — instead of an open-ended one. Wood,
brass, wax, vellum, pewter, slate, painted tin. A brief in those terms is one
Grok can execute consistently across 125 assets, and consistency is most of what
makes work look expensive.

**And it turns an existing hack into the design.** The battlefield today lights
the arena by counting lit candles in the HUD with a CSS `:has()` selector
(`lighting.css:762–815`) — a HUD-reads-world data path that exists nowhere in
TypeScript and was, frankly, a cheat. On a board, the candle rail is *a rail of
candles sitting on the board*, and of course it lights the board. The cheat
becomes the mechanism.

#### What still stays DOM, unchanged

Every menu, rail, panel, log, tooltip, sheet, overlay and button **as an
element**: its box, its text, its handlers, its focus behaviour, its ARIA. Only
its *painted surface* moves to the renderer.

#### The old framing, and why it was wrong

`LIGHTING_PLAN.md` §5 rejected every lighting library with *"every one assumes
it owns the renderer. The fight is DOM."* That was right about libraries and
wrong as a general principle, and the board model is what shows the difference.
The problem was never that the DOM was in the way — it was that those libraries
wanted to own the *text and the layout* too. Letting the renderer own surfaces
while the DOM keeps layout and text gives up nothing and gains everything.

### 1.2b The world becomes a scene. Text stays DOM.

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
| **M0** | **Lantern Lab** — `web/public/lantern-lab.html`. Material baker: albedo → height → normal + AO, live-lit preview, PNG export. | ✅ **Done.** Drag a light across a real tile and see whether derived normals hold up. They do — measured, §7. |
| **M1** | **Lantern core** — GL context, sprite batcher, HDR target, tonemap, bloom, debug HUD, Scene, Renderer. The board drawn on the GPU with today's art. | ✅ **Done.** `web/public/lantern-board.html` — real tiles, real hero sprite, painter-sorted, 2.3 ms CPU at 1200x750. Flat and bright on purpose: M1 draws **albedo only**, so nothing is dark yet. M2 is where light lands. |
| **M2** | **Materials + per-pixel lighting** — the Lab's pipeline as a build step, normal-mapped diffuse and specular, soft shadows from world geometry. | **The first real moment.** The lantern rakes across the board instead of just clearing fog. |
| **M3** | **The board becomes an object** — see §11. Piece bases, contact shadows, board edge and thickness, a table under it, tile seams. Camera tilt and wall front faces already landed early, in M1/M2. | It becomes a board with pieces on it. |
| **M4** | **The furniture** — UI surfaces drawn as lit materials under the DOM text. Elevation, contact shadows, hover-lift, pressed buttons. | Every screen, all at once. Cards lift and cast. No flat rectangles left. |
| **M5** | **Radiance cascades** — real 2D GI. Bounce, colour bleed, penumbra that closes. `AMBIENT_FLOOR` dies here. | Shadows get *structure* instead of a constant. |
| **M6** | **Volumetrics + emitters** — god rays through a doorway, glowing shrines, a fire card lighting the room for a turn. | Atmosphere. The murk's honest successor. |
| **M7** | **The battle board.** | The arena stops being a different game visually. |
| **M8** | **Grade** — LUT, vignette, dispersion, grain, dithering. | The cinematic pass. |

**Why the cascades moved from third to fifth.** They are the headline and the
only milestone with genuine research risk. M2, M3 and M4 are each a large
visible win and each well understood — so putting three of them first means the
game *looks like the vision* before the risky work starts, and a stalled M5
leaves it far better than it found it rather than half-converted. That is the
same "nothing may break the map and the battlefield at once" discipline applied
to schedule rather than to code.

No dates. The honest shape is that M1 and M2 are days each, M3 and M4 are about
a week each, and anyone quoting a date for M5 before reading the cascade
research is guessing.

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

## 8. What the extraction audit found

A full audit of `FloorScreen.tsx` (829 lines) and `BattleScreen.tsx` (1479
lines) ran on 2026-07-25. The findings that change the plan:

**Good news, and it is bigger than expected.**

- **The map grid already has zero focusable children.** The whole grid is a
  single nav widget — `navItem({ widget: true, initial: true, role: 'group' })`
  on `.map-frame` (`FloorScreen.tsx:511–521`), with cells as plain `<span>`s.
  A canvas carrying the same props is a **drop-in**. The map's controller
  support survives the port untouched.
- **Wall texturing is already a UV atlas lookup**, done in CSS: each wall cell
  windows the same full-grid-sized texture via `backgroundPosition`
  (`FloorScreen.tsx:431–438`). That maps onto GPU sampling directly.
- **Tile clutter is already deterministic** — position-hashed, no `Math.random`
  (`tileArt.tsx:30–33`). Keep the hash and every floor's clutter is identical.

**Things that must be designed, not ported.**

1. **`LightLayer` loses its input entirely.** It measures occluders, anchor and
   responders out of live DOM with a `MutationObserver`. Under a canvas there
   are no `.map-cell.wall` boxes. Occluders come from the tile grid — which is
   what §12 of the lighting plan already decided, and which *deletes* the
   `occluderPad` fudge rather than porting it.
2. **`lightresponse.css` has nothing to write to.** `--lit`/`--lx`/`--ly`/
   `--twinkle` are written onto real elements every fourth frame; the rim is an
   **alpha-shaped `drop-shadow`** that traces the sprite silhouette. Reproducing
   that needs an alpha-dilate pass per sprite — not free, and easy to overlook.
3. **Two nav registrations sit on world elements**: the hero and each ally
   figure become focus stops when a heal is aimable (`BattleScreen.tsx:1204,
   1252–1254`), reached by bounding-rect scoring in `nav/geometry.ts`. Fix:
   transparent proxy elements over the canvas — which is exactly the §1.2 model
   anyway, so this costs nothing extra.
4. **`BattleView.backdrop` is a `ReactNode`** (`BattleScreen.tsx:90`). The view
   model hands the renderer a React element. Must become data (a texture id),
   and **both** adapters — solo and duel — have to change together.
5. **`--cell` and `--bf-scale` are the real source of truth for scale**, CSS
   tokens resolved across four breakpoints, with `battle.css` `!important`-ing
   over the components' inline sizes. The TSX numbers are hints, not authority.
   The renderer must own that ladder explicitly.
6. **`isRevealed`/`isOpened`/`isBroken` are `Array.includes`** over string keys
   (`floors.ts:135–145`) — ~250 linear scans per render today. At 60fps GPU
   redraw that becomes the frame budget. **These need to be `Set`s, and that
   fix is independent of everything else here.**
7. **Source-level CSS tests will fail.** `engine/test/lighting.test.ts`
   regex-matches ~15 CSS rules against raw source. Deleting the DOM they select
   for fails tests without changing a pixel. They need to be migrated
   deliberately, not deleted in passing.

**Cleanup to decide before building an atlas:** `TileFill`'s procedural SVG path
is unreachable for all five gates; 41 of 92 monster PNGs are not in
`PAINTED_MONSTERS`; `.tile-prop` opacity is declared twice with different values
(`App.css:827` 0.82 vs `floor.css:118` 0.92); object halos are declared twice.

---

## 9. Decisions closed by the graphics research (2026-07-25)

A full research pass on radiance cascades, render targets, normal-map
derivation, 2D soft shadows and HDR ran on 2026-07-25. It closed every open
question in this document and **overturned one conclusion**, which is recorded
first because it is the one that would otherwise have cost weeks.

### 9.1 Derived normals: right for tiles, WRONG for characters

M0 measured a textbook normal map off the shipped `hollow_wall` tile and I read
that as "derived normals work". That claim was too broad, and the statistics I
used **cannot tell a correct normal map from an inside-out one** — a map whose
bumps are all inverted has identical mean and range.

The literature is blunt. Moreira, Coutinho & Chaimowicz, *Analysis and
Compilation of Normal Map Generation Techniques for Pixel Art* (SBGames 2022,
arXiv:2212.09692) evaluates six methods and concludes **"none of the automated
techniques could deliver completely satisfactory geometry."** Luminance→Sobel
specifically produces **inverted volumes** wherever an artist painted shading:
the image is `albedo x irradiance`, and the gradient of that product is not the
surface gradient. A painted crevice becomes a bump. Worse, the artifact is
invisible under the light direction the artist implied and only appears as the
light swings away — i.e. it is invisible in a screenshot and obvious in the one
feature we are building.

**The correct test, and the result.** Orbit the light through 360° and correlate
the lit image against the flat albedo at each angle. Baked-in lighting shows up
as a strong peak at the baked direction and a trough 180° opposite. Measured on
`hollow_wall`, 16 angles:

> correlation **0.4187 – 0.4433**, spread **0.025**, peak at 180°, trough at
> 293° — **113° apart, not 180°.**

Flat, with no directional signature. **The tile's derived normals are sound.**
That is consistent with the paper rather than against it: it explicitly allows
luminance→Sobel "for texture-like sprites where noise reads as detail", and a
cave wall is exactly that — a stochastic surface with almost no artist-implied
form lighting.

**So the pipeline splits by asset class:**

| assets | method | why |
|---|---|---|
| **10 tiles** | luminance → auto-level → dual-band Sobel (the Lab) | measured sound; stochastic texture is the good case |
| **92 monsters, 5 heroes, 10 npcs, 3 sprites** | **EDT beveling** — Euclidean distance transform of the alpha silhouette, edge mask, blend, smooth, Sobel | the paper's best *automatic* method; **it cannot invert volumes** because it derives from the silhouette, not from painted tone. Every one of these is already a transparent PNG, so the alpha it needs is there. |
| the ~20 assets that carry the look | hand-authored or four-illumination-angle | the paper's only consistently good results |

The orbit test becomes standing QC — but **not with one rig and one threshold**,
and that correction is worth more than the original claim.

#### Correction (2026-07-26): the point-light rig is invalid on sprites

The line above originally read "every asset gets it, and a spread above ~0.10
with peak and trough ~180° apart is a reject". That is right for tiles and
**wrong for characters**, and the measurement that shows it is a control I
should have run first: orbit a **flat** normal map — no material at all,
featureless by construction — and under a POINT light the first five monsters
score spreads of **0.145–0.338, three of them 180° apart**. A full failure out
of nothing. The cause is not the normals; it is the light's own falloff
sweeping across an off-centre sprite on a transparent background, so image
brightness tracks light angle no matter what the surface does.

Under a **directional** light the same control scores **exactly 0.000**. So:

| asset class | rig | gate |
|---|---|---|
| tiles (opaque, fill the frame) | point | spread > 0.10 **and** sep > 135° = reject |
| characters (transparent, off-centre) | directional | drift against the manifest |

The 0.10 threshold does not transfer to bevels either, and for a reason that
is structural rather than a tuning miss: a bevel **is** one large smooth
volume, so it responds to light direction *by design*. Nine of fifteen
monsters exceed 0.10 and none of them can mean an inverted volume, because the
height field is derived from the alpha silhouette and never reads a pixel of
tone. Those are recorded as **advisories**, and the character path gates on
drift instead — which is stable, meaningful, and actually catches regressions.

**The general lesson, which is the reusable part:** a QC threshold calibrated
on one asset class silently becomes a random number on another. Run the null
control — the input that must score zero — before trusting any threshold. The
tile rig had never been checked that way, and it would have rejected perfectly
good character art indefinitely.

Rejected: ML monocular normal estimation (StableNormal, Lotus et al.) as a
*shipped* output — trained on photographs, and the domain gap to stylised 2D
narrows but does not close. Fine as an artist's starting point.

### 9.2 WebGL2, single path. WebGPU is a trap here.

- The workload is a per-texel **gather** — texture-fetch-bound ray marching.
  There is no cross-thread cooperation, so compute shaders buy an estimated
  20–40% on one pass, not a category change. The canonical 2D RC reference
  implementation (jason.today) is fragment-shader WebGL.
- `RGBA16F` is renderable in WebGL2 via `EXT_color_buffer_float` (universal on
  WebGL2 hardware — treat as a hard requirement and fail loudly), and **linear
  filtering of half-float is core**, which is exactly what cascade upsampling
  needs. So the format story costs nothing.
- **The decisive fact: WebGPU on the Steam Deck is worse than WebGL2 today.**
  Chromium's Linux WebGPU rollout covers Intel Gen12+ (144+) and NVIDIA/Wayland
  (147+). **AMD is not on that list**, and the Deck is AMD. Shipping the
  headline feature behind a flag literally named `--enable-unsafe-webgpu` is a
  support-ticket generator. The Electron build does not rescue this; it inherits
  Chromium's gating.
- The web build cannot be WebGPU-only in 2026 regardless (~70% coverage; Linux
  desktop and Android Firefox are gaps), so WebGL2 must exist either way. Adding
  WebGPU means *both*, never WebGPU alone — two shader languages, two sets of
  driver bugs, and every lighting feature written twice.

**Do:** put a thin `Device` interface between the renderer and the API so a
WebGPU backend stays possible, and wire `EXT_disjoint_timer_query_webgl2` into
the M1 debug HUD so any future revisit is driven by numbers rather than by
fashion.

#### Two Steam targets, and they point the same way

Paul is targeting **both the Steam Deck and the Steam Machine**. Both run
SteamOS on AMD graphics — which is precisely the vendor Chromium's Linux WebGPU
rollout has *not* reached. Two AMD/Linux targets rather than one does not make
WebGPU a closer call; it makes it a worse one. WebGL2 runs unflagged on both.

*(Verify the Steam Machine's exact GPU before tuning against it — the AMD/SteamOS
part is confident, the specific silicon is not something to assert from memory.)*

What it does change is the **shape of the quality dial**, which is now a real
range rather than a fallback:

| target | intent |
|---|---|
| **Steam Deck** | the floor. `d₀ = 4`, bilinear fix off, 4-direction cascade 0, bloom chain shortened. Must hold 60fps at the Deck's native resolution — this is the setting that has to be *good*, not merely playable. |
| **Steam Machine** | the ceiling. `d₀ = 2`, bilinear fix on, base-16 cascade 0, full mip-chain bloom. Where HRC lands first. |
| **desktop web** | auto-detect between them off a startup timing probe. |

**Paul's dev machine is Windows/NVIDIA, and that is a hazard rather than a
reassurance.** Windows/NVIDIA is the single best-supported configuration for
every graphics API including WebGPU — so it is exactly the machine on which an
AMD/SteamOS problem is invisible. Anything that looks fine here has been tested
on the easy target. Treat "works on the desktop" as the beginning of
verification, not the end of it, and keep the Deck floor honest by measuring
against it rather than against this box.

**Native SteamOS is noted and deferred.** Paul: *"making this steam os native
would be super cool."* It is, and it changes nothing structurally — a native
build would be the same renderer against the same GL, through a different
window/input shim. Revisit after M4; nothing before then forecloses it.

Designing for a fixed spec was never going to happen; designing for a *spread*
with the Deck as the floor is the discipline that keeps the top end honest.
Build the dial in M1 alongside the debug HUD, not at the end.

### 9.3 Radiance cascade parameters (M5)

- **Branching α = 4.** Probe spacing doubles per axis as ray count quadruples,
  so every cascade texture is **the same size**. This is the choice everyone
  actually implements.
- **Cascade-0 probe spacing `d₀` = 2 px**, **6 cascades** at 1280x800
  (diagonal 1509 px), **RGBA16F** — alpha carries transmittance, which the
  interval merge needs. **≈49 MB**, ~60–70 MB with ping-pong. Fine.
- Interval geometry: `start(i) = t₀(4^i − 1)/3`, `length(i) = t₀·4^i`.
- Merge is **top-down**, and is premultiplied-alpha compositing:
  `L(a,c) = L(a,b) + β(a,b)·L(b,c)`, `β(a,c) = β(a,b)·β(b,c)`. Only merge where
  the near interval is not fully occluded.
- **The bilinear fix is mandatory, not optional.** Ringing is worst with small,
  high-opacity emitters — *a lantern in the dark is the pathological case for
  this algorithm*, and it is the entire game. Cost is 4x rays on every cascade
  but the topmost; it also fixes leaking past small occluders. Budget for it
  from the start rather than discovering it.
- Keep **mips off** for the occluder channel, or build a conservative
  max-opacity chain — averaged mips blur thin walls out of existence, which is a
  fog-of-war leak on the map.
- Cost is rays, not memory: ~6.1M intervals/frame, ~24M with the bilinear fix.
  Calibration point — Holographic RC measures 7.67 ms at 1024² on a 3080 Laptop.
  **Ship a quality dial** (drop `d₀` to 4, disable the bilinear fix) from day one.

**Holographic Radiance Cascades** (Freeman, Sannikov & Margel, arXiv:2505.02041)
uses anisotropic probe spacing and **resolves hard shadows at no added cost** —
standard RC's weakest point, and one we care about. Plan: build standard RC
first (the interval algebra is identical and the tutorial material all assumes
it), then port. Reference: `entropylost/amitabha`.

### 9.4 Two integration decisions that are easy to get wrong

1. **Do not collapse cascade 0 to a scalar.** Project its directions into a 2D
   circular-harmonic basis (`a₀ + a₁cos θ + b₁sin θ`) and evaluate that against
   each pixel's normal at full resolution. This is what makes bumps respond to
   *bounced* light and not merely to the lantern — a half-res GI field driving
   full-res normal shading, which is the correct frequency split. Use base-16 at
   cascade 0 if affordable; 4 directions fit the basis poorly.
2. **Pack height into the normal target's alpha** (normal XY in RG, Z
   reconstructed, height in A). Costs literally nothing and buys correct depth
   sorting plus **self-shadowing** — the research calls short-range height-field
   self-shadowing the single biggest upgrade over plain normal mapping, because
   the eye reads absence of contact darkening as "flat" no matter how good the
   normals are. On a board of physical pieces that is precisely the cue that
   sells the whole thing. Skip parallax offset: a near-orthographic camera
   barely moves the view vector, so it buys nothing.

### 9.5 No separate shadow system

RC produces penumbrae *by construction* — the penumbra hypothesis is the
algorithm's founding observation. A second shadow system would disagree with it
at every boundary. Share **one screen-space SDF** between the cascade march and,
if sharp contact shadows still need help before HRC lands, a short-range
full-resolution SDF march for the direct term only.

This retires 1D radial shadow maps (per-light fill cost, least principled
penumbra) and Slembcke's SFSS (excellent, but wants polygon outlines we would
have to author for every occluder to get a result RC gives free).

### 9.6 HDR chain

**`RGBA16F` → Jimenez mip-chain bloom → AgX → one baked 3D LUT.**

- **Bloom: Jimenez 13-tap mip chain, with the Karis average on the first
  downsample only.** A dark scene lit by small warm emitters is the worst case
  for firefly scintillation, and the Karis average is what actually kills it.
  Prefer a **soft knee** or no threshold at all over a hard bright-pass, which
  draws a visible onset line as objects brighten.
- **Tonemap: AgX, not ACES.** ACES skews bright saturated warms toward
  yellow-white — it would eat the exact lantern warmth the whole art direction
  rests on. AgX desaturates highlights toward white the way film does, and its
  long toe suits a game that lives in shadow. Watch its known blue→cyan shift if
  cold magic ends up mattering; correct downstream in the grade.
- **LUT: one 33³ 3D texture, applied post-tonemap** (a LUT on HDR values outside
  [0,1] is undefined). WebGL2 has native 3D textures — do not use the old 2D
  strip-atlas hack. **Bake AgX and the grade into a single LUT**; stacking two
  double-quantises and bands the darks, which is where this game lives.

### 9.7 Still open

- Whether the battlefield gets a real tile grid at M7, which would let it share
  the map's world-space solver instead of needing its own screen-space one.
- Whether hero assets eventually move to a 3D-authored G-buffer pipeline
  (the Dead Cells route — they never derived normals because they never had flat
  art). Revisit after M4, when there is something on screen to judge against.

---

## M1 progress (2026-07-26)

Landed since the device/camera/quality/bloom/tonemap/program/target commits:
`scene/sprite.ts` + `gl/spriteBatcher.ts` (painter-order-preserving batching —
sorts by `camera.sortKey`, then groups only ADJACENT same-texture runs, never
reordering across a depth boundary to shrink the draw call count), `gl/lut.ts`
(the §9.6 3D-LUT slot, `sampler3D`, `uLutMix` defaulting to 0 so it costs one
fetch and changes nothing until a grade ships), and `debug/hud.ts`
(`FrameTimer` + `TierAdapter`, which is the §9.2 piece that turns a frame-time
stream into the `stableFrames` count `quality.ts`'s `adaptTier` needs — that
glue did not exist before this pass — plus a thin
`EXT_disjoint_timer_query_webgl2` wrapper). All wired end to end in
`lantern-forge.html` and verified by `gl.readPixels` (rAF does not fire in a
headless preview pane; the forge already rendered synchronously for this
reason). 810 tests, `tsc` clean.

**What M1 still needs**, in order: a `Scene` type and a builder that turns
game/render state into one (today only the forge demo's synthetic board
exercises the sprite path — there is no bridge from `engine/` state yet, and
per the architecture rule `lantern/` must never import `engine/`, so this is a
`components/`-side adapter); wiring the whole chain into an actual
`?r=lantern` route behind the flag (§4) so it runs against the real map
instead of only the standalone HTML lab; and the G-buffer pass, which M1's
device/target/program plumbing supports but nothing has built yet — though
that may be better scoped as the start of M2 (materials + per-pixel
lighting), since M1's own bar is "looks the same, deliberately."

---

## 10. M1 closed: the assembly, and what it exposed

Paul, looking at a growing `lantern/` tree: *"does everything have a place
though?"* The answer at the time was **no**, and the diagnosis is worth keeping
because it is a failure mode this project is structurally prone to.

There were 2,000 lines of good, individually-tested parts — camera, batcher,
bloom, tonemap, LUT, HUD, quality tiers — and **no assembly**. No `Scene`, no
`Renderer`. The frame loop lived in `lantern-forge.html`, a demo page. A demo
page owning the pass order, the render targets and the composite shader is the
classic tell that the orchestrator has not been written: every piece is right
and nothing is plugged into anything.

That mattered urgently rather than eventually, because M2 adds materials and
lighting. Starting M2 would have added **more parts to the box**.

**Closed by `scene/scene.ts` and `renderer.ts`.** The Scene is the renderer's
entire input — sprites, materials, lights, an occupancy grid, night colour,
time — and `render(scene)` is the whole public surface. That is what makes §2's
isolation rule enforceable rather than aspirational: there is nowhere in the
signature for a monster, a card or a DOM node to get in. Verified by grep, and
it held through an unsupervised overnight run.

### What building it exposed

**The engine could not draw a standing piece.** `buildVertexData` scaled every
quad's height by `cos(tilt)` — which is to say every sprite was a floor decal.
The hero lay face-up on the board like a printed counter, and a wall's front
face was impossible to express. That is the centre of the board-game model and
it simply was not in the data model.

Fixed with `Sprite.upright`, one trig function: lying down squashes by
`cos(tilt)`, standing up scales by `sin(tilt)`. At the shipping 55° they differ
by ~1.4x; the tell is at the extremes, where a nearly-top-down camera collapses
a standing piece to nothing while a decal stays full size. **That is exactly
why a top-down camera cannot show pieces, stated as geometry**, and it is now a
test rather than a paragraph.

This is the argument for building the assembly early rather than late: the gap
was invisible while the parts sat in a box, and obvious within one frame of
them being connected.

### Honest state of the M1 preview

`lantern-board.html` draws **albedo only**. `scene.lights` and
`scene.occluders` are read for the HUD count and otherwise ignored — direct
lighting is M2 and the cascade solve is M5. So the board renders flat and
bright, which is *correct for an unlit render* and looks nothing like the game.
Do not read it as a regression; there is no lighting in it yet to be wrong.

### Known cleanups, deliberately deferred

- **`lantern-forge.html` still owns a private pass sequence.** It is a rig for
  the post chain on a synthetic HDR input, which is a legitimate thing to have,
  but it now duplicates what `Renderer` does. Fold it into `Renderer` +
  `RenderOptions` (which already carries every toggle it exposes) or retire it
  in favour of the board page.
- **`gl/lut.ts` is filed under `gl/` but is really a pass.** Harmless, wrong
  drawer.
- **Nothing is wired into the game yet.** `?r=lantern` from §4 does not exist;
  `FloorScreen` still renders through the DOM. That is deliberate — the flag is
  worth adding when there is something better than the DOM map to show, which
  is M2, not before.

---

## 11. Why it does not look like a board yet (2026-07-26)

Paul, on the first lit frame: *"the board still doesn't look like a game board
though — does that come at a later step?"*

Partly later, and partly a gap in this plan that his question exposed. §1.2
adopted "a board game on a table" as the organising metaphor and then the
milestones treated it as an **art-direction label**. It is not. It is a short
list of concrete geometric features, and almost none of them existed:

| cue | why it matters | status before M3 |
|---|---|---|
| **Pieces have bases** | a disc or plinth under a figure is the single strongest signal that it is a game piece rather than a picture of one | missing |
| **Contact shadow** | what makes an object sit ON a surface. Without it a piece floats, however well it is lit | missing |
| **Board edge and thickness** | a board is a slab with a visible rim; ours was an infinite tile plane that simply stopped | missing |
| **A table underneath** | gives the board a context and makes it an OBJECT rather than the whole world. Everything outside it was flat `night`, which reads as void | missing |
| **Tile seams** | inlaid or printed pieces have edges; continuous rock texture reads as terrain, not as a board | missing |
| **Material variety** | wood, brass, wax, vellum, pewter — the "what is this made of" brief | pending the de-shaded art re-shoot |

Only *one* of those — contact shadows — appeared anywhere in the milestone
table, and it was a clause inside M3 rather than a thing with a design.

**The lesson for the rest of this plan:** an organising metaphor has to be
decomposed into features that can be built and seen, or it stays a mood and
the renderer keeps getting better at something nobody asked for. The lighting
work was not wrong — it is the foundation the rest sits on — but "make it look
like a board" was never going to fall out of it.

M3 is now that list, in that order. The camera tilt and wall front faces that
M3 originally owned both landed early, during M1 and M2.

---

## 12. The art direction, stated by Paul (2026-07-26)

> *"the flat top down tile based movement we are moving away from can manifest
> as the tiles that are walls can just be blocky wall game pieces with textures
> on them. and our character piece and enemy pieces travel around the board in
> turns. but with the character being our only source of significant light.
> there can be wall sconces and glowing things that give off faint bits of
> light though. maybe some floaty beings kind of like what ocarina of time has
> in the forest that also give off very small bits of luminescence maybe some
> glowing mushrooms. the occasional lit torch."*

This is the whole game's look in one paragraph, so it belongs in the plan
verbatim rather than paraphrased. Three things follow from it.

### 12.1 Walls are pieces, not floor

A wall tile is a **block sitting on the board** — top face, front face, a hint
of side so corners read as volume — with a contact shadow at its base like any
other piece. Not a textured floor tile with a front face bolted on. A wall
block and a hero piece become the same kind of object at different sizes,
which means they share the base/shadow machinery rather than each having their
own.

### 12.2 One bright light, many faint ones — and this is the cheap case

The hero's lantern is the only significant light. Everything else is a
whisper: sconces, a lit torch, glowing mushrooms, drifting luminescent
beings (the Lost Woods wisps). Faint means **small reach**, and small reach is
what makes this affordable — a mushroom lighting two tiles touches about a
dozen tiles and costs nothing anywhere else on the board.

It also gives the lighting engine the one thing it has been missing: something
to *contrast against*. A single light in a void has no scale. A pinprick of
green at the end of a corridor is what tells you how dark the corridor is.

### 12.3 The consequence: M2's light cap is now the blocker

**This is a real limit that has to be lifted before the direction above can
exist.** `renderer.ts` culls lights once per frame against the viewport and
then takes the first `MAX_LIGHTS = 8`. So the ceiling is **eight lights on
screen, total** — not eight per tile. One corridor of sconces and mushrooms
exhausts it, and the failure mode is silent: lights past the eighth simply do
not appear.

**The fix is per-tile light binning (clustered forward), not cascades.** Worth
stating plainly because the temptation is to reach for M5:

- **Cascades buy BOUNCE.** They are O(1) in lights as a side effect, but that
  is not what they are for and they are the milestone with real research risk.
- **Binning buys COUNT**, which is what this art direction actually needs, and
  it is a contained, well-understood piece of work: bin light indices into a
  coarse grid over the board, upload it as a texture, and have each fragment
  read only the handful of lights whose reach covers its tile.

Binning also makes M5 cheaper rather than competing with it — the cascade
solver wants the same spatial structure to seed from.

**So the order changes:** light binning + emitters slots in as its own step
before the tilt/board work is finished, because a board full of blocks with a
single 8-light budget cannot show what the direction is asking for.

### 12.4 Emitters this unlocks, roughly in order of cheapness

| emitter | notes |
|---|---|
| wall sconce / lit torch | static, warm, tiny reach. The easiest, and the one that makes corridors legible |
| glowing mushroom | static, cool green, very faint. Clusters well |
| drifting wisp | MOVING emissive sprite. The showcase — a light that is also a thing you can watch |
| ember cracks (abyss gate) | already has emissive art planned in the re-shoot brief |

All of these are `indirectOnly` candidates in the `Light` type — they should
not cast sharp shadows, both because it is physically right for a dim source
and because it keeps them off the expensive vector path.

---

## 13. Camera framing: the whole board, with a lean (2026-07-26)

Decided rather than proposed, under the standing authority in the header. Paul
confirmed the direction in §12 ("I think you nailed the idea") and this was the
one question left open by it.

**The camera shows the WHOLE BOARD as an object.** The rim and the table are
visible essentially every frame. It is not locked rigid — it drifts slightly
toward the hero and can ease in a little, the way a person leans over a table
to look at their own piece — but the board never scrolls out from under the
player.

### Why, over following the hero

Following the hero was inherited from `FloorScreen`, where the DOM map
`scrollTo`s the player's cell into view. It was never chosen; it was just what
the old screen did.

The board-game model argues against it, and §12's idea argues hardest:

- **Fog of war stops being a convention and becomes a physical fact.** The
  board is entirely, materially present. You cannot see the far corners
  because it is DARK there, not because a system is withholding them. That is
  only true if the far corners are actually on screen and actually unlit.
- **Unexplored space becomes something you are sitting in front of**, rather
  than something off-screen. That is the difference between a board and a
  level.
- **The rim and the table earn their keep.** §11 added them precisely to make
  the board read as an object; a camera that never shows the edge means that
  work is invisible most of the time.
- It is also the cheap case for everything downstream: culling is trivial, and
  a fixed frame is the regime the radiance-cascade research (§9.3) calls the
  happy one, since it is what lets Path of Exile 2 use screenspace cascades.

### What it costs, and this is a real constraint on the GAME

**Floors now have to fit a board.** A dungeon floor can no longer be arbitrarily
large and scrolled through; it has to be a shape a person could look at on a
table. That is a game-design constraint, not a rendering one, and it lands on
`engine/systems/floors.ts` — both the hand-authored `FloorDef` grids and the
generated wild floors.

**Flagged, not decided.** Options, roughly in order of how much they preserve:

1. **Size floors to the board.** Simplest, and arguably better design — a
   hand-sized dungeon per floor, more floors. The current floors are already
   around 20x14, which fits.
2. **Board-sized regions.** A large floor is several boards; crossing an edge
   is a deliberate transition, like turning over a map tile in a real game.
3. **Let the board be bigger than the frame after all**, and accept the
   metaphor weakening at large sizes.

Nothing in the renderer forecloses any of these; the camera takes a centre and
a zoom either way. This needs Paul's call before the map is ported.

### Legibility check, since the Deck is the floor

At 1280x800 with a 22x14 board and 55 degrees of tilt, tiles land near 50px
wide and a hero piece stands roughly 70px tall on screen. Readable. A board
much larger than that starts to make pieces too small to identify at a glance,
which is the practical limit on option 1 above.

---

## 14. Vertical layers (2026-07-26)

> Paul: *"if we have a large game area that the playable space fits within the
> confines of the board. in order to get more space we may have to think
> vertically and add depth and layers to the map. which im sure our lighting
> would benefit from. like some tiles are climable revealing a 2nd layer or 3rd
> layer and the map beneath the current layer becomes invisible"*

This answers the open question left by §13. The camera frames the whole board,
so floors must fit a board — and rather than shrinking floors or scrolling
them, **the board grows upward**. A tiered board is more board-game-like, not
less; stacked tiers are a physical thing you can hold.

### Why the lighting gains more from this than from anything else planned

Not "more surfaces" — something sharper. **The only vertical surfaces in the
game today are wall front faces.** Everything else is flat floor, and a lantern
on flat floor is a circle. Elevation introduces cliff faces, stair risers,
ledge undersides and drop edges: surfaces at many angles, which is what makes
light read as light rather than as a radius.

Two specific images to build toward, both nearly free once tile heights exist:

- **A shaft of lantern-light falling from an upper layer into a dark room
  below.** Probably the most striking single thing a 2D lighting engine can
  produce, and the reason to keep light spilling downward even while the lower
  layer is not drawn.
- **A piece's contact shadow falling OFF a ledge** rather than stopping at it.
  Contact shadow is already the cue that something rests on a surface (§11);
  at an edge it becomes the cue for how far the drop is.

### What it costs the engine

**1. The occupancy grid stops being binary.** `scene/scene.ts` stores one byte
per tile, solid or not. M3 added a `uOccluderHeight` uniform meaning "every
block is this tall", with a comment that per-tile heights were not yet needed.
**That assumption is now retired.**

The right structure is a **height field**: each tile stores the height of its
solid column, and `traceShadow` compares the ray's height against that column
as it steps. Cheap, standard, and it yields ledge-shadows-floor for free
rather than as a special case. It also subsumes `uOccluderHeight` instead of
extending it.

**2. Painter order changes meaning.** `camera.sortKey` deliberately clamps the
height term so a raised object can never sort past its own row — that is what
stops a held lantern drawing through the wall in front of it, and there is a
test for it. Layers need the opposite in some cases. The `LAYER_` constants
added in M3 are a *paint order* concept (table / board / decal / piece); layer
ELEVATION is a second axis and the two have to compose rather than compete.

**3. Legibility is the real risk, and it is a design risk rather than a
rendering one.** Multi-level maps are famously hard to read from above. Board
games get away with it by being physically tiered, where the step is visible.
The drop edge must be unmistakable, which is as much an art and lighting job
as a geometry one.

Paul's "the map beneath the current layer becomes invisible" is doing most of
the work on that risk and is the right call — it sidesteps stacked-layer
legibility entirely. The refinement worth keeping: **light still spills
downward even when the lower layer is not drawn**, because that is how a player
learns there is something below.

### Open, for Paul

- Does exploring an upper layer reveal or remember the one below it?
- Is climbing a move, an action, or a tile property?
- Can a piece fall, or be pushed off an edge?
- Does line of sight cross layers — can you see a lit thing one tier down?

### Sequencing

Not next. The order stands: finish M3's board physicality, then **light
binning** (§12.3, which the emitter direction blocks on), then layers. But the
height-field data model should be designed before more code is written against
the binary grid, because every day it stays binary is another consumer to
migrate.

### 14.1 Revision: erase by light, and erase UPWARD (2026-07-26)

Paul, on the draft above: *"you are probably right about the light spilling
down layers. if we visually erase a layer it kind of kills that."*

Correct, and working it through inverts the rule.

**Do not erase the lower layer. Do not light it.** It stays physically
present and dark, and the player sees it only where light spills through a
gap. That is not a second mechanism bolted on for atmosphere — it is the
SAME principle §13 already runs on: fog of war is a physical fact, not a UI
convention. You do not erase the layer below any more than you erase the
unexplored half of the layer you are standing on. It is dark, and darkness is
the disambiguator.

It also makes the shaft of light the *only* way to perceive what is below,
which turns the best image in the engine into information rather than
decoration.

**The asymmetry is the part the first draft got wrong.** The legibility
problem is not the layer beneath — it is the layer ABOVE:

- **Below**: already hidden by the floor the player is standing on. Visible
  only through a hole or over an edge — and a hole is exactly where light
  falls through. Geometry does most of the hiding and light does the rest,
  self-consistently. Nothing needs deleting.
- **Above**: at a 55° tilt an upper platform in front of the player sits
  BETWEEN THE CAMERA AND THE PIECE. That is what actually breaks the read,
  and that is what has to fade or cull.

**The rule:** fade geometry above the active layer; keep everything below,
unlit except where light reaches. The ceiling gets out of the way; the
basement stays.

Consequence for the renderer: layer visibility is a **fade**, not a cull, and
it is keyed on elevation relative to the active layer rather than on a layer
index. A cull would pop as the player climbs; a fade is also what lets an
upper platform be *partially* transparent at its edge so the player can see
they are about to walk under something.

### 14.2 Falling pieces: a canned tumble, not a physics engine (2026-07-26)

Paul, clarifying what "can a piece fall" meant: *"im picturing some kind of
physics interaction. like a game piece tumbles off the edge or falls through a
trap tile, and sort of bounces around for a second before settling."*

Yes, and the scoping call is the whole decision.

**Do not add a physics engine.** For a small object falling a short distance,
ballistic motion plus damped bounces IS the physics — a parabola, restitution
around 0.4, two or three diminishing hops, angular velocity that damps out.
There is no constraint solving to do. What a real engine would add:

- collision geometry for every board feature, maintained forever
- an integration surface and a dependency
- **non-determinism across machines, which would break the multiplayer duels
  this game already ships.** A seeded tumble reproduces exactly; a solver does
  not. That alone settles it.

Call it 150 lines with no dependency.

**What sells it is not accuracy.** Three things do:

1. **The settle** — the final wobble before rest. This is what makes an object
   read as having weight rather than as a sprite following a curve.
2. **The contact shadow**, which already exists from M3. It tightens and
   darkens as the piece nears the floor and spreads as it rises. That is what
   turns "sprite moving down the screen" into "object falling through space",
   and it costs nothing new.
3. **Sound.** A wooden clatter does half the work.

**The free one: if the falling piece is the hero, the lantern falls with it.**
The light is attached to the hero's position, so a fall tumbles the entire
board's lighting — shadows sweeping the walls, the pool swinging, everything
settling as the piece comes to rest. No extra cost; it already works that way.

**Where it lives: presentation, not game logic.** The reducer commits
"piece X fell from tile A to tile B on layer 1" immediately and the renderer
plays the tumble afterwards. There is precedent in the codebase — `FloorScreen`
glides `.hero-walker` on a transform while the reducer has already moved the
hero. Same pattern, one axis further.

`Sprite.position.z` is already a first-class property, so a falling piece is
animating z and rotation. The infrastructure exists.

**The real risk is pacing, not implementation.** A one-second tumble is
delightful once and tedious on the fortieth trap tile. Keep it to 0.6–0.9s and
scale it with the existing animation-speed setting.

---

## 15. What a piece IS (2026-07-26)

> Paul: *"most game pieces irl are just plastic pieces with some art glued to
> it. is that how our game will function? or do I misunderstand? grok is just
> making the sticker for the piece right? Will the pieces have shape to them?"*

He understood it correctly. As built, a piece is an `upright` quad with a base
disc and a contact shadow — **a cardboard standee in a plastic clip.** Art
glued to a base. That is worth being explicit about rather than letting the
board-game language imply sculpted miniatures.

### The decision: a painted standee with CARVED RELIEF

Rejected, and why:

- **Sculpted miniatures.** Real form and real silhouette from any angle, at the
  cost of modelling, rigging and texturing 92 monsters — the pipeline §1.3
  already declined. It would also cost the painterly style, which is the thing
  the art actually has going for it.
- **Plain flat standee.** Honest and cheap, but it lights like a card. A
  lantern sweeping past changes its brightness and never its shape.

**The middle is what the art pipeline already supports, and it took Paul's
question to notice.** The EDT beveling built for character normal maps derives
a height field from the SILHOUETTE, bulging the shape toward its centre. That
is physically a **bas-relief** — a carved wooden figure, or pressed painted
tin. It was built as "the automatic method that cannot invert volumes"; its
other meaning is "the tool that turns a flat sprite into a carved one".

So under a moving lantern the piece does not light like a card: the cheekbone
catches, the shoulder falls away, the edge rolls off. A thin dark sliver for
the side edge gives it thickness. The result is honestly 2D and looks like a
2D thing made well, rather than 3D pretending badly.

### It splits cleanly with the Blender decision, the way a real game is made

| part | source | why |
|---|---|---|
| the plinth / base | Blender | hard-surface, identical across every piece, wants real bevels and baked AO |
| the figure in it | Grok + EDT relief | painted, characterful, 92 of them, style is the point |

That is exactly how a physical board game is manufactured: one moulded base for
every piece, a printed figure slotted into it.

### The limits, stated

- **A piece can never face away from the camera.** Standees billboard. Standard
  and fine, but it is a hard limit if the board is ever rotatable.
- **A piece has no volume for occlusion.** A hero behind a tall wall block is
  hidden by it rather than peeking over.
- **One true sculpted mini later is reasonable** — a boss, or the hero — as a
  luxury. It must not become the default for 92 monsters.

---

## 15.1 M3 landed: it is an object on a table now (2026-07-26)

§11 decomposed "a board game on a table" into five buildable cues and found
four of them missing. Four are now in, in the order §11 ranked them. What
follows is what shipped, what it cost, and what is still open — written for
whoever picks this up cold.

### What landed

**Piece bases and contact shadows** (`scene/piece.ts`). A piece is three
things: a contact shadow, a plinth with visible thickness, and the figure
standing on it. The load-bearing sentence is that *a standing sprite with no
contact shadow reads as a sticker however well it is lit* — the eye decides
"on the surface" versus "in front of the surface" almost entirely from the
darkening where the two meet.

The falloff law is that lifting an object **widens and fades** its shadow
together, opacity going as the inverse square of the growth, because the same
blocked light is being spread over that much more board. The widen-only
version is the one everybody writes and it reads as the object getting bigger
rather than lifting off.

The shadow is an ordinary sprite with a **black albedo and an alpha gradient**,
which is not a shortcut — the lit shader outputs `albedo.rgb * light`, so a
black texel under the standard blend leaves `dst * (1 - a)`. Occlusion of
light, in the HDR target, before the tonemap. No second blend mode, no
dedicated pass, and it behaves identically on the unlit path.

Thickness is free from the projection: the plinth is one disc drawn twice, at
`z = 0` and `z = thickness`. The tilt lifts the top copy up the screen and
what shows underneath is a crescent — which is exactly the silhouette of a
cylinder, whose top and bottom ellipses *are* the same ellipse, offset.

**Painter layers** (`scene/sprite.ts`), forced rather than designed. Sorting
by board `y` alone slices the front off every contact shadow whenever a piece
stands in the far half of its tile, because the tile row in front sorts after
it — 45% of the time, with a hard horizontal cut. Layers say what a y-sort
cannot: board surface first, then things resting on it, then things standing
up off it. The default (`upright` means piece, flat means board) reproduces
the old order exactly for every sprite that existed before, so nothing had to
be migrated. It also cut draw calls from 59 to 16, since the tiles now group.

**Walls as blocks** (§12.1). `wallBlockSprites` lives beside
`pieceBaseSprites` and shares its shadow, because §12.1's claim is that a wall
and a hero are the same kind of object at different sizes. A block is a
footprint shadow, a top face and a front face. Paint order is the part that
goes wrong: the top face is a *lying* quad that must nevertheless draw with
the pieces, because it is above the board and can legitimately hide the feet
of a figure standing behind it. Tested both ways round.

**Board edge, thickness and a table** (`scene/board.ts`). The trick for "the
board is proud of the table" is that the table sits at `z = -thickness`; the
projection drops negative z further down the screen, so the table surface
appears below the board's and the rim fills the gap. A table at `z = 0` is
just a bigger board.

The frame is **one quad**, not a ring of four strips: four strips need four
chamfer directions and therefore four textures or a quad rotation the sprite
format does not have. One quad with the chamfer baked around all four sides
of its texture gets every edge at once and the tile grid draws over the middle
of it.

The chamfer **tips the normal** rather than painting a gradient, and that is
the whole reason to do it here rather than in art: a painted edge looks the
same from every light angle, which is to say it looks painted.

The rim is not a special case for the board's outline — it is `ledgeFace`,
a vertical quad wherever the height of the world changes. A wall block's
front face is the same thing, and so is the step between two map layers when
§14 lands.

**Tile seams**, as a per-material `inlay` strength plus a seam and a chamfer
at every whole-tile boundary. The dark line alone is a drawn line and the eye
files it as texture; the chamfer is what makes it an edge, because the near
side of every tile then catches the lantern and the far side falls away.
Continuous rock reads as terrain you are inside; pieces with edges read as a
board you are looking at.

### The bug that was in every frame since M2

Standing quads mapped their surface normal to board **minus** y — into the
board, away from the viewer. Everything else in the projection says the camera
is on the `+y` side: `project` sends larger y down the screen, `sortKey`
paints larger y last, `visibleBounds` widens `maxY` so tall pieces below the
viewport still poke in. So wall faces were lit only by lights *behind* them,
and every character sprite met its own lantern at exactly 90° and contributed
nothing — **the hero rendered as a black silhouette in the middle of his own
pool of light**, and it read as "the art is dark". One sign, both symptoms.
The specular view vector had the same error.

Fixing the sign is not enough for pieces, so orientation became three-valued:
lying, a fixed vertical **face** (a wall), or a **billboard** (a piece). A
painted figure presents itself to whoever is looking, so its normal is the
view direction, and against that the overhead lantern lands at `cos(55°)`
instead of zero.

**The lesson, and it is the reusable part:** this was visible in every single
frame for two milestones and was only found by zooming in and asking why one
object was dark. A wrong sign in a basis does not look like a bug, it looks
like art direction. The false-colour views (`RenderOptions.debug`) would have
shown it immediately — `debug=5` draws the world normal — and nobody ran them
because nothing looked broken.

A second, quieter one from the same pass: `vHeight` per vertex had its pivot
factor inverted, which put the hero's entire body at *negative* height, under
the board. The only symptom was that the lighting looked slightly off. A unit
test found it in the same hour the feature was written; no amount of looking
would have.

### The rings that were not what they looked like

Reported as concentric arcs centred on the light at regular radii, diagnosed
as step-count quantisation in `traceShadow`. Measured first:

- `debug=4` shows the shadow term flat at 1.0 along an open-floor ray. On open
  floor the march finds nothing whatever the step count, so it cannot ring.
- 96 angles, every shadow transition bucketed by radius modulo the 0.75 step:
  a flat histogram.
- The radial brightness profile dips at **1.0-tile** spacing, not 0.75.
- Second difference of that profile: 9.34 shipped, 9.44 with bloom off, 1.51
  with the seams off. The seams carried six sevenths of the structure.

It was the inlay, and mostly the bevel half: a 0.85 tip leaves a floor tile's
normal at `z = 0.64` right at the seam, which against a near-overhead lantern
is most of the diffuse gone — a black line rather than a chamfer, reading as
arcs on a tilted board. Retuned to 0.035/0.72/0.32 and exposed as sliders.

**DDA landed anyway**, because the recommendation was right even though the
symptom was not. Fixed steps are wrong on a grid in the way fixed steps always
are: depending on ray *angle* they either sample both sides of a tile the ray
genuinely crosses (a corner leak) or sample the same tile twice. Walking tile
boundaries visits exactly the tiles the ray passes through, once each, in
order — so `SHADOW_STEPS` goes back to being a budget rather than a
correctness parameter, and it is the traversal a per-tile height field wants.

### The room lamp, which is a design decision and not a knob

§12 says the hero's lantern is the only significant light — **inside the
fiction**. The board is a physical object on a table in a room, and that room
has a lamp. Without one, the rim, the frame and the table are lit by ambient
alone and every bit of the edge work above is invisible, because the board's
own border blocks shadow the entire slab edge from the lantern. Correctly, and
uselessly.

It **casts**, and casting is what keeps it out of the fiction rather than a
flag would: raking from the near-left means the border blocks shadow the
dungeon interior from it completely, so it lands on the table, the rim and the
near and left frame and stops dead at the wall — and the board casts its own
shadow across the table, which is the object cue the whole section is for.
The other way was tried: a room lamp that casts nothing lights the dungeon
floor exactly as well as the table, and at any intensity that makes the rim
read, the darkness is gone.

`Light.castsShadow` survives regardless, for §12.2's faint emitters. Skipping
the march is where most of a light's cost goes, which is what makes "many
faint ones" affordable.

### What is still open

- **`uOccluderHeight` is a placeholder with a known expiry.** One global
  number for how tall a solid tile stands, so a receiver on top of the wall
  layer cannot be shadowed by it. §14's vertical map retires it. `traceShadow`
  is already shaped for the swap — it takes a `vec3 from`, skips by TILE
  rather than by distance, and now walks boundaries. The early-out becomes a
  per-tile comparison and the ray height at each step is a lerp toward the
  light. **One consumer only; do not add a second.**
- **`isSolid` and the shadow march deliberately disagree off-grid.** `isSolid`
  still answers true outside the board — that is a *gameplay* claim about
  where a piece may stand. The march treats off-board as empty, because out
  there is a table. Two questions that happened to share an answer while the
  board was the whole world.
- **Pieces have no normal maps**, so a figure lights flat and its head goes
  dark the moment the lantern is below it. This is the EDT-bevel path in §9.1
  and it is the single biggest remaining win on the pieces.
- **The table is one quad sized to `visibleBounds`.** Fine for a fixed camera
  (§13); it will need revisiting if the camera ever eases in far enough to
  matter.
- **Material variety** is still pending the de-shaded art re-shoot — the fifth
  cue in §11's table, and the only one not addressed here.
- **The seam chamfer is applied to standing quads on the x axis only.** A wall
  run gets a vertical groove between blocks, which is what stops it reading as
  one slab, but the horizontal seams on a face are not chamfered.
- **Nothing is wired into the game yet.** `?r=lantern` still does not exist;
  everything above lives in `lantern-board.html`. Unchanged from §10.

---

## 16. Buildings and sub-boards (2026-07-26)

> Paul: *"another way to enhance the size of the playable area without making
> the board ridiculously huge would be to add Some building tiles with
> enterances that subtly transport the player to a new map. back and forth."*

The third answer to §13's constraint, alongside §14's vertical layers — and
**by a wide margin the cheapest of the three.**

### It costs the renderer nothing

A "new map" is a different `Scene`. The renderer already draws exactly one
Scene per frame and has no idea what a floor is. Nothing new is needed:
no height field, no painter-order change, no fade rules, none of §14's cost.

**And the game already does this, bidirectionally.** `engine/game.ts` calls
`descend(exp, ...)` to swap floors and already has a "You climb back up" path.
A building entrance is structurally the same transition with a different
fiction and a different return anchor. This is a re-use, not a feature.

| | renderer cost | game cost |
|---|---|---|
| Buildings | **zero** | modest — a door tile, a return anchor, a transition |
| Layers (§14) | height field, painter order, fade rules | movement, fog of war, line of sight, falling |

### The argument that is not about cost

**A small interior is a BETTER lighting showcase than a big board.** One lantern
in a six-by-six room is the most dramatic case the engine has: walls close
enough to catch raking light, corners that go genuinely black, and a single
sconce that actually changes the room. A large board DILUTES the light — the
pool becomes a small bright patch in a wide dark field, and the drama flattens.

So this does not merely add space. It adds the *good kind* of space, and it is
the cheap option as well. That combination is rare enough to act on.

### Build the spill from the start

Light should escape a doorway **before** the player enters. A warm glow at a
threshold says the room beyond is lit and occupied — the same "information and
atmosphere in the same pixel" idea as §14.1's mushroom seen through a hole in
the floor. Nearly free once §12.3's emitters land, and it is what stops a door
reading as a menu option.

### How it composes with layers

They are complementary rather than competing, and the difference is worth
naming:

- **Buildings are discrete pockets.** Cheap, great for lighting, endless
  variety. What you lose is CONTINUITY — you cannot see the other space, so it
  is "more boards" rather than "more connected place".
- **Layers are continuous verticality.** Expensive, and what they buy is
  exactly the thing buildings cannot: looking down into somewhere you have not
  been yet.

### Sequencing change

**Buildings before layers.** They are nearly free, they are a better lighting
showcase, and they answer the space problem on their own. Layers become the
dramatic set-piece rather than the load-bearing solution, which is a much safer
place for the most expensive item on the roadmap to sit.

---

## 17. The board is too small to design on (2026-07-26)

> Paul: *"There just isnt much that we can do with a board this small. i cant
> plan layouts or enemy positions. its too small. we have to solve that
> somehow."*

**Measured before responding, and the measurement is the point.** The authored
floors in `engine/data/gates.ts` are 17–23 wide by 13–15 tall, 221–299 tiles.
The 22x14 test board was not an unrepresentative demo — it is exactly the
shipping floor size.

So this is not a rendering complaint. **The floors themselves are too small for
the game Paul wants to design, and §13's whole-board camera would have locked
that in permanently.** Catching it now is worth more than the decision it
overturns.

### Amendment to §13

§13 said *the camera always shows the whole board*. It now says:

> **The camera CAN always show the whole board.**

Two framings, one lerp between two `(centre, zoom)` states — which the camera
already takes, so this is nearly free:

- **OVERVIEW** — the whole board fits the frame. Planning: reading layout and
  enemy positions, not faces.
- **PLAY** — zoomed to the action, pieces fully readable, board extends past
  the frame.

This is not a compromise between two camera models. **It is what a person
actually does at a table**: lean back to survey and plan, lean in to move a
piece. The board-as-object read survives because the whole board is seen
regularly and deliberately, rather than never.

### What it buys, at 1280x800

If floors roughly double to 40x26:

| | tile | hero |
|---|---|---|
| Overview | 32 px | ~45 px |
| Play (2x) | 64 px | ~90 px |

Both readable for their purpose. 50x32 still works — 25px overview tiles are
enough to read shape and placement, which is all planning needs. So **floors
can grow roughly 2–2.5x in area** without losing the object.

### What this does to §14 and §16

It demotes them, healthily. Vertical layers and buildings were carrying the
weight of "how does this game have enough space", which made the two most
expensive items on the roadmap load-bearing. A board that can be 2.5x larger
answers the space problem on its own; layers and buildings become multipliers
and set-pieces rather than necessities.

### The honest fallback

If overview mode turns out not to give Paul enough to plan with, **the board
metaphor loses and the camera should simply follow the hero.** That is a real
possible outcome and it should be decided by him looking at the stress lab's
camera toggle, not by argument. Nothing in the renderer depends on which way it
goes — the camera takes a centre and a zoom either way.

### 17.1 The camera pans, clamped to the board (2026-07-26)

> Paul: *"Could we maybe have the game board scroll within the confines of the
> board edges? or do you think that would look strange?"*

Not strange, and it supersedes the last of §13's "the board never scrolls out
from under the player". The camera **pans, clamped to the board's own edges.**

**The rule that decides whether it looks right: MOVE THE CAMERA, NOT THE
BOARD.** A table that stays fixed while the board slides across it looks wrong,
because boards do not slide on tables by themselves. A camera panning over a
stationary board AND a stationary table reads as a person moving their head
over a large table. The pixels are identical; the feel is not.

Nothing needs fixing for this — `board.ts` already places the table as a
world-space sprite at `z = -thickness`, so it travels with the board. The rule
to preserve is simply: **never draw the table as a fixed backdrop.**

**Clamping to the board edges is what makes it feel like furniture.** Pushing
against a boundary and having it stop is what tells the player how much board
exists. A free-floating camera feels like software; a clamped one feels like an
object on a table.

Three consequences, all of them favourable:

- **It composes with §17's overview/play framings rather than replacing them.**
  The result is an ordinary tabletop camera: clamped pan to navigate, zoom range
  to plan versus act. Overview is just the zoom at which the clamp has nothing
  left to do.
- **It is already consistent with the fog of war.** Panning to an unexplored
  corner shows nothing, because it is dark — §14.1's "erase by light". Scrolling
  a dark board with only the lantern's pool lit IS the fog of war, rather than
  fighting it.
- **Edge behaviour is the detail to get right.** At a boundary the player should
  see the rim and a sliver of table: the signal that this is the end. What must
  not happen is scrolling until the board is half off-screen with dead space
  beside it.

This closes the space problem opened in §13 and complained about in §17. Boards
can now be as large as design wants, because the camera can reach all of them
without the board ever stopping being an object.

---

## 18. The light cap is gone, and the board has scenery (2026-07-26)

§12.3 named M2's light cap as the blocker for the whole art direction. It is
lifted. `renderer.ts` no longer culls to the viewport and takes the first eight
lights; lights are binned per tile, uploaded as textures, and each fragment
shades against only the handful whose reach covers where it stands.

### What the ceiling actually was

Worth restating because the shape of it is the lesson: `MAX_LIGHTS = 8` was
**eight lights on screen, total** — not eight per tile — because a GLSL uniform
array has to be sized at compile time, and `render()` sliced the culled list
down to fit. The ninth light did not appear anywhere, and nothing said so.

**Measured, on the harness, with 61 emitters on a 22x14 board:**

| | emitters measurably lighting their surroundings |
|---|---|
| old rule (`lightBudget: 8`) | **4** of 58 on screen |
| per-tile binning | **52** of 58 |

48 emitters that were invisible are now visible. The remaining 6 are either
inside the lantern's own pool (where a faint green lift is below the 6%
detection threshold) or among the 6 placements the bins dropped at that
density — which the HUD says out loud.

### The structure

`scene/lightBins.ts`, and it is pure — bounds and lights in, typed arrays out,
no GL anywhere near it. That is what makes the interesting half testable.

- **A coarse grid over the visible region**, 2 tiles per bin, padded by 3 tiles
  because culling keeps sprites whose box merely overlaps the view.
- **Each light writes its index into every bin its reach covers.** The
  footprint is the xy circle of radius `reach`, which is conservative by
  construction: 3D distance is never less than xy distance, so binning can
  over-include but never miss. That is the right direction to be wrong in.
- **A light data texture** — RGBA32F, three texels per light, one row each. A
  texture rather than a uniform array IS the fix: `texelFetch` takes a runtime
  index, so the light count stops being a shader-source question.
- **A bin texture** — R16UI, `binsX * capacity` by `binsY`, sentinel-terminated
  with 0xFFFF. The shader's inner loop breaks on the sentinel, so a bin holding
  two mushrooms costs two lights and not sixteen. Unused capacity is free.
- **Overflow evicts the weakest, and is reported.** A full bin scores the
  newcomer against its occupants at the bin centre and only evicts for
  something brighter. `HudStats` carries peak, capacity and drops, and
  `RenderOptions.debug = 6` false-colours bin occupancy. The bug this replaces
  was silent; a silent overflow would be the same bug one level down.

**`RenderOptions.lightBudget` reinstates the old ceiling deliberately.** Set it
to 8 and the renderer does exactly what it did before: cull to the viewport,
take the first eight, lose the rest. That is what made the table above
measurable rather than asserted, and it is in the harness as a two-button
toggle.

Binning does not compete with M5 — the cascade solver wants the same spatial
structure to seed from, and cascades are now a BOUNCE feature rather than a
light-count rescue.

### The emitters (§12.4), and one thing they forced

`scene/emitters.ts`: sconce/torch, glowing mushroom, drifting wisp. All
procedural — a flame, a cap and a soft radial core are shapes made of
arithmetic, so no art was blocked on this and the look is tunable without a
re-shoot. All `indirectOnly` and `castsShadow: false`, which is right for a dim
source and is where most of a light's cost lives.

**`Material.emissiveStrength` had to arrive early, and Paul's "very tiny" is
why.** A sprite that is only visible by the light falling on it forces its
brightness and its reach to be one number: turn a wisp down until it lights
nothing and it stops being visible; turn it up until it reads and it is a
second lantern. Emissive splits them. A wisp now paints at ~2.5 in HDR and
casts intensity 0.95 over 3.2 tiles. It is the scalar stand-in for M6's
emissive map; the shader term is the same one.

**Placement is found, not scattered.** Mushrooms grow only in actual corners —
an open tile with two *perpendicular* solid neighbours, because two opposite
ones is a corridor, and a mushroom every second tile down a corridor reads as
installed lighting rather than as something that grew. Thinned by a coordinate
hash, so a board looks identical every session.

**Wisps are on a tether, not behind a fence** (Paul: *"they can kind of drift
out of the board a bit"*). The offset is a sum of two sines whose amplitudes
total exactly 1, so containment is by construction — no restoring force to
tune, and no chance of one escaping on a frame nobody watched. Two octaves
rather than one, because a single sine per axis is an ellipse and the eye reads
an ellipse as a track within seconds. They may drift past the rim, and out
there they light the table, which is the strongest statement in the renderer
that the board is an object in a room.

### Three numbers that were wrong until they were measured

1. **A dozen sconces are not faint even though one is.** At 1.6 intensity over
   2.8 tiles, one sconce read beautifully — and a sconce on every wall face
   that could take one raised the mean luminance of the board interior by 15%
   and the darkness was gone. Retuned to 1.25 over 2.4, and the harness default
   density dropped from 0.35 to 0.12. **Density is as much a part of "very
   tiny" as intensity is**, and only the second of those lives in the emitter.
2. **A wisp at reach 1.9 lit nothing it flew over.** Core 100/255 against a 3.5
   background, halo 3.9 against 3.6 — a bright dot with no relationship to the
   surface under it. The board is half a tile proud of the table, so a wisp 0.9
   above the board is 1.4 above the wood, and 1.4 out of 1.9 is where the
   falloff window has already eaten four fifths of the light. Reach 3.2 at
   intensity 0.95: halo gain 1.29–1.43x over the table, and the board's own
   mean rose 2%.
3. **The glow could not sit in its own sprite's plane.** A billboard's normal is
   the view direction, so a light level with the quad leaves every fragment
   above it facing 90 degrees away — a flame with a bright waist and a black
   tongue, which looks exactly like bad art. The light sits forward and up by a
   FRACTION of the sprite size (0.75 / 0.65), which keeps N·L above 0.8 at every
   corner at any scale. Tested rather than eyeballed.

### Checked and clean

- **No firefly scintillation.** The worst case for the bloom's Karis average is
  a small bright emitter in motion, so it was measured rather than assumed:
  over 36 consecutive frames a wisp's core varies by 1.0% of its mean with
  Karis on and 1.4% with it off. The mipmapped procedural sprite is doing most
  of that work.
- **A wisp over the table draws on top of it.** The one case in the scene where
  a sprite is above the table but not above the board, which a y-sort alone
  gets wrong. `LAYER_PIECE` handles it, and there is a test staging exactly
  that pair.

### Also landed: scroll to zoom

Paul: *"my first inclination is to scroll to zoom and i cannot please add that
lol"*. There was no wheel handler at all, so the reflex failed silently.

Multiplicative rather than additive, because perceived zoom is logarithmic and
a fixed increment crawls when zoomed in and lurches when zoomed out. The slider
stays the source of truth and is written back, so the two controls cannot
disagree.

**It is centre-anchored, not cursor-anchored, and that is a deliberate stop.**
Keeping the board point under the pointer fixed means moving the camera CENTRE,
which is exactly the state §17.1's clamped pan is about to own. It is one line
on top of pan once pan exists — unproject the cursor before and after, add the
difference — and a second, unclamped writer of the centre now would only have
to be unpicked.

### What is still open

- **Bin capacity is 16 and the default bin size is 2 tiles.** At 61 emitters on
  a 22x14 board the peak bin fills and 6 placements drop. That is far past the
  design point (the harness defaults peak at 5 of 16) and it degrades by losing
  the least visible light, but it is the number to raise first if a real floor
  ever reports drops. §17's larger boards make bins cheaper, not dearer — the
  grid caps at 64 per axis and grows the bin size instead.
- **`Material.emissive` as a MAP is still M6.** The scalar covers a uniformly
  glowing sprite and cannot do ember cracks on an otherwise dark wall.
- **A wisp's height is measured above the BOARD, not above what it is over.**
  Past the rim it is half a tile further from the table than it looks, which
  the reach now absorbs. Following the surface would be nicer and is not free.
- **Emitters are not wired into the game**, same as everything else here —
  `?r=lantern` still does not exist.

---

## 19. The player console (2026-07-26)

> Paul: *"I do want the Menus and buttons that were in the old version to be
> physically a part of the Board Border, like attached to the sides of it.
> facing the player im assuming that should be doable in blender"*

This is §1.2's "the UI is furniture on the same board" made concrete, and the
instinct is right. One refinement is needed, because taken literally it breaks
against a decision made an hour earlier.

### The conflict

**§17.1 made the board pan and zoom, clamped to its own edges.** UI physically
attached to the board's border would therefore:

- shrink past readability when zoomed out,
- leave the frame entirely when zoomed in,
- slide away when panned.

UI bolted to a moving object stops being usable. This is not a small tuning
problem; it is a straight contradiction between two things that are both wanted.

### The resolution: attach it to the TABLE, not the board

A **player console** at the near edge of the table, facing the player, fixed
while the board pans and zooms behind it.

This is more authentic rather than less. It is a **player board** — the
dashboard, card tray and resource track that sit in front of you at a real
table, separate from the main board, and which do not move when someone scrolls
the map. Physically continuous with the table, lit by the same lantern, casting
real shadows, made of the same brass and timber. Everything §1.2 asks for; it
simply is not glued to the thing that moves.

| surface | behaviour | role |
|---|---|---|
| the board | pans, zooms, clamped to its edges | the world |
| the player console | fixed at the near edge, always reachable | the interface |
| both | physical furniture on one table under one light | — |

It also means the console can be DESIGNED — a carved dashboard with dedicated
slots for the things that matter — rather than being whatever happens to fit
along a rim that may be off-screen.

### What Blender makes, and what it does not

Blender makes the **furniture**: brass plates, routed recesses, bezels, tabs,
the console body itself. Hard-surface, must look machine-made, wants real
bevels and baked AO — §7's exact case.

Blender does **not** make the UI. §1.2's split still holds and is what keeps
this affordable:

> **The GPU draws every SURFACE. The DOM draws TEXT and HIT TARGETS.**

So a button is a Blender-baked brass plate drawn by the renderer, with a
transparent DOM element on top carrying the label, the click handler, the ARIA
role and the `data-nav-item` attribute. All 22 screens keep working, controller
nav keeps working, and text stays crisp at every breakpoint — because none of
that moves.

### Open

- Does the console scroll internally when it holds more than fits (a hand of
  many cards), or does it page?
- Does it lift/tilt toward the player on hover, the way §1.2 gives cards
  elevation? Probably yes for the active tray, and it is nearly free.
- How much vertical space it may claim before the board is squeezed — this
  interacts with §17's readability numbers and should be measured, not guessed.

### 18.1 Emitters: what the first look shows (2026-07-26)

Recorded from a full-resolution render at 25 lights (0.5 ms, bins 15x17 peak
9/16). The mechanism works — the ceiling is gone and the board is legible in a
way it was not. Three things are wrong, in order of how much they cost:

**1. Sconce flames float.** They are drawn as bare flames hovering in a row
above the wall tops, with no bracket, no cup, no wall plate. They read as
disconnected candles rather than as lights MOUNTED on something, which
undercuts the whole "physical object" claim the board otherwise now makes.

This is an asset gap, not a lighting bug, and it is squarely §7's split:
a sconce bracket is hard-surface furniture that must look machine-made across
every instance — Blender's job, alongside the 17 shapes already baked. The
flame stays procedural; the thing it is mounted in should not be.

**2. The board is too bright overall, and it is the sconces doing it.** The
lit floor reads pale and washed rather than dark-with-pools. The agent already
found and partly fixed this ("a dozen sconces are not faint even though one
is" — density 0.35 to 0.12, brightness 1.6/2.8 to 1.25/2.4) and it is still
too much at the harness defaults. §12 is explicit that the hero's lantern is
the ONLY significant light; anything that collectively lifts the ambient floor
has stopped being a whisper. The dial exists; the default is wrong.

**3. Wisps read as fog patches, not points.** On the right of the frame they
appear as large diffuse green washes rather than as tiny drifting motes. Paul
asked for "very tiny" twice. The halo needs to be much smaller relative to the
core, and probably brighter at the core to compensate — a small bright point
reads as a light, a large dim blob reads as mist.

None of these are architectural. All three are tuning plus one asset.

### 18.2 Two defects the stress lab found, and one it did not finish (2026-07-26)

**FIXED — `traceShadow` failed OPEN.** The DDA loop ran a fixed `SHADOW_STEPS`
budget and then fell through to `return 1.0`. A ray that ran out of steps
before reaching the light therefore reported itself UNOBSTRUCTED. It never
showed while boards were 22x14 and the lantern's reach was 7, because no ray
was ever long enough; the moment §17 allowed large boards and a long-reach room
lamp, it painted diagonal FALSE-LIT BANDS across half the dungeon — worst at
the `floor` tier, whose budget is 12 steps, which is the Steam Deck.

Now returns `reachedLight ? 1.0 : 0.0`. Failing closed is strictly better here:
invented light is a lie about what the player can see, which on a fog-of-war
grid is a correctness bug rather than a look bug, while invented darkness is
merely conservative — and §14.1 already makes darkness this engine's honest
failure state. It costs little, because a ray long enough to exhaust the budget
belongs to a receiver far from the light where attenuation is already small.

**The constraint behind it, which is the durable lesson:** a light's reach must
not exceed what the march can verify. Past roughly `SHADOW_STEPS` tiles the
shadow term is guesswork whichever way it guesses, so reach and step budget have
to be tuned together per tier.

Verified: on the repro (30x20 board, room lamp, floor tier) bright pixels far
from the light fell to 0.4% of the far field, and the bands are visibly gone.

**FIXED — the renderer never drained its GPU timer.** `renderer.ts` called
`gpuTimer.begin()`/`end()` but never `poll()`. Results arrive several frames
later and must be collected, so `HudStats.gpuMs` read `0.00 ms` forever and one
`WebGLQuery` leaked per frame — 216,000 an hour at 60fps. `lantern-forge.html`
polls its own timer, which is exactly why nobody noticed: the page showing a
working number was not the page using this class. That zero appeared in every
screenshot this session and was skimmed past every time, which is the actual
lesson — a plausible-looking zero hides better than a missing field. Now reads
1.51 ms on the stress scene.

**FIXED (see below) — the table rendered as a staircase.** Visible in the near corner of the
stress lab: the table surface steps in tile-sized increments instead of lying
flat. The stress-lab agent reported this as "a sawtooth on the frame just
outside the near border, one tooth per tile" and could not place it — it
survives removing the contact-shadow decals AND a zero-radius light, so it is
neither. It is considerably more obvious than that description suggests. Repro
is in `lantern-stress.html`. Next person on the renderer should start here.

**ALSO OPEN, from the same session:** derived tile normals are unusable at
strength 1 under a grazing light — at knee height N·L on the floor is ~0.05, so
a 15 degree bump multiplies it several times and the floor becomes crumpled
foil. The maps are not wrong; they are authored for overhead light. Stress-lab
default is 0.35, and the shipping default should follow.


### 18.3 The staircase table: a category error, not a maths bug (2026-07-26)

Diagnosed and fixed. The sawtooth §18.2 left open — "one tooth per tile" on
the frame outside the near border — was **the board's occupancy grid casting
shadows onto the table**.

Found by bisecting the scene rather than reading the shader: removing sprites
by texture and measuring the region showed the table alone accounted for it,
and rendering the table in isolation showed a rectangular shadowed patch with
tile-quantised teeth along every lit boundary.

**Why it is a category error.** The occupancy grid describes walls standing ON
the board. Marching it for a surface UNDERNEATH the board is asking a question
the data cannot answer, and the 2D march has no height to reason with — so a
wall of any height casts an infinitely deep shadow regardless of where the
receiver sits. That is tolerable on the board plane and plainly wrong half a
tile below it, which is exactly where the teeth appeared.

**The fix:** below the board plane, the grid does not shadow. The board's own
shadow on the table is already a dedicated soft sprite in `scene/board.ts`,
which is the right mechanism — a slab's shadow is one soft rectangle, not a
per-tile stencil of the walls standing on top of it.

**What it is really a preview of.** §14's per-tile height field makes this
exact rather than merely correct, and turns the same machinery into an asset:
a ledge shadowing the floor below it is the SAME query, answered properly. The
current fix is the honest interim — it declines to answer rather than
answering wrongly.

---

## 19.1 What is ON the console — the inventory (2026-07-26)

§19 settled where the console lives and why it does not move. It did not say
what is on it. Paul, after seeing the first lit fight:

> *"I would really like the (Player board im going to call ) to be modeled with
> some nice wood and brass accents. A Dedicated place for the Vigor Candles
> Player and Enemy Portraits, The Discard Pile, The Exhaust pile or whatever we
> call that now. Something for the End Turn lantern to fit in to, and the
> Combat/Chronicle Log. It should all feel like a physical part of the game
> being played. not just a menu. then i think the Vigor candles wont look so
> weird. Like the candles should sit in sockets made for them, im debating
> having a placement for the Cards in hand aswell. but i kind of like the
> floating."*

**The last three sentences are the important ones**, and they are a diagnosis
rather than a decoration request.

### Why the candles looked wrong, and why a socket is the actual fix

`9f3cfa0` moved the vigor candles off the battlefield onto the board's left
frame band, because standing among the combatants made them read as pieces
(§15). That was right and they still looked odd — because a candle resting on a
bare strip of timber is a candle someone left there. **A socket is what makes an
object belong.** It is the same argument as §15's plinth: a piece in a plinth is
placed, a piece on a floor is dropped. Every item below therefore gets a
FITTING, not a position.

This also retires the compromise in `FRAME_INSET_TILES`. That constant is 2
rather than 1 only because the opaque `.bf-rail` HUD panel overlaps ~190px of
the canvas and the candles had to clear it — a workaround for a DOM panel that
the console replaces outright. When the console lands, the rail goes, and the
inset drops back.

### The slots

| slot | what it holds | note |
|---|---|---|
| candle sockets | the vigor rail | brass cup, drip pan, collar. Sized to `CANDLE_WIDTH` |
| portrait bezels | hero and enemy faces | two sizes; brass surround around painted art |
| discard tray | the discard pile | shallow wooden tray, card-shaped recess |
| exhaust | exhausted cards | must read as somewhere cards do NOT return from — scorched, a slot or grate, NOT a second tray. Distinguished by SILHOUETTE, not by a label |
| lantern cradle | the End Turn control | the lantern must look like it belongs there lit AND unlit |
| log well | the Chronicle | a recessed panel with a lip. §1.2 keeps the TEXT in the DOM; this is the well it sits in, never a texture with words baked into it |

Wood with visible grain, brass with a soft bevel, straps across the seams.

### Wear, later — but model for it now

Paul, immediately after: *"we can play with it in the future and add some wear
on the player board, some melted candle wax build up near the candles, and
stuff like that"*.

Deferred, not dropped, and it changes one thing about how the furniture is
built today. **Wear is where an object has been USED**, so it has to land in
specific places rather than as an overall grunge pass: wax pooling in and
around the candle sockets and running down the rail, brass polished bright
where a thumb rests and dull where it does not, the discard tray scuffed in a
card-shaped patch, scorch around the exhaust slot, timber darker along the near
edge where hands sit.

The consequence for the bake: **keep the sockets, trays and straps as separate
parts with their own UV space** rather than merging the console into one shell.
A wax layer that has to be painted onto a single atlas of the whole board is a
much worse job than one authored per fitting, and merged geometry cannot be
re-lit or re-textured independently later.

### The one open question

**Cards in hand: undecided, and deliberately left so.** Paul: *"im debating
having a placement for the Cards in hand aswell. but i kind of like the
floating."* Both readings are defensible — a fan of cards held above the table
is exactly what a player's hand does, and it is the one part of the interface
that genuinely is in your hands rather than on the table. Nothing here should
foreclose it: the console is designed with the hand floating, and a card ledge
can be added later without moving anything else.

---

## 20. It is wired into the game (2026-07-26)

Every section above §19 ends with some version of the same sentence — *"nothing
is wired into the game yet"*, *"`?r=lantern` still does not exist"*. It exists.
Load a real Hollow Gate floor with `?r=lantern` and the map is drawn by the
renderer: the slab, the wall blocks, the hero piece on his plinth carrying the
only significant light, painted chests and barrels and monster figures standing
on their own bases, glowing mushrooms in the corners, wisps drifting over the
dark, and everything the lantern has not reached genuinely black.

Measured on a real floor at 1154x650: **0.2–0.4 ms CPU, ~1.4 ms GPU, 58 draw
calls, 7 lights, bin peak 4 of 16, zero drops.**

### What was actually hard, and it was not the rendering

The rendering was the easy half — §§10–18 had already built all of it, and
`buildFloorScene` is a few hundred lines of "read the grid, emit sprites." The
hard question was the one §1.2 answers in a single line and does not explain how
to implement:

> **The GPU draws every SURFACE. The DOM draws TEXT and HIT TARGETS.**

A DOM cell is a square in a flow layout. A tile on a tilted board is a squashed
parallelogram somewhere else entirely. Keeping the click handler on the cell
while the art moves to the canvas means those two have to end up in the same
place, and the obvious implementations are both bad: positioning ~300 cells
absolutely per frame is layout thrash, and re-deriving the tile rect inside
`FloorScreen` puts the projection in two places that can disagree.

**The answer is that the projection of the board plane is AFFINE.** For `z = 0`:

    screenX = (x - cx) * zoom              + vw/2
    screenY = (y - cy) * zoom * cos(tilt)  + vh/2

which is a translate and a non-uniform scale — nothing else. So the DOM keeps
rendering rows of square cells at ONE fixed pitch, and **one CSS transform on
one wrapper element** carries the entire lattice onto the projected board.
Measured against `camera.project` itself rather than against a re-derivation of
the same algebra: cell corners land within **1.7e-5 px** of their tiles, and
`elementFromPoint` at the projected centre of a tile returns exactly that tile's
cell, at every corner of the board.

That is what keeps the whole of §1.2's promise cheap. `nav/` is untouched, all
22 screens are untouched, the map is still one widget with zero focusable
children, every `title` and `onClick` and `data-nav-item` is where it was, and
the transform is written imperatively so a 60 fps camera never re-renders React.

**It also closes §8 item 5 properly.** `--cell` was "the REAL source of truth for
scale today", resolved at four breakpoints. Under the flag it is pinned at 48px
and means nothing but lattice pitch; `camera.zoom` decides how big a tile draws.
The renderer owns the ladder, as §8 said it must.

### What landed

- **`web/src/render/`** — the bridge, and the only directory that imports from
  both `engine/` and `lantern/`. That is deliberate: it is what lets §2 rule 1
  keep holding, and a grep for `engine/` under `lantern/` still returns nothing.
  - `floorScene.ts` — pure `Expedition` + `Character` to `Scene`.
  - `boardCamera.ts` — pure. Fit, clamped pan, the zoom range, the two
    framings, the lattice transform, deadzone follow.
  - `materials.ts` — the GL side: procedural furniture up front, painted art
    requested asynchronously.
  - `walk.ts` — `STEP_MS` and the glide, now that there are three consumers.
  - `flag.ts` — `?r=lantern`, and `dom` for absolutely everything else.
- **`components/LanternMap.tsx`** — the canvas, the device, the frame loop, the
  camera and the input. Mounted only under the flag.
- **`lantern.css`** — every rule scoped under `.lantern-grid`, which does not
  exist with the flag off.
- **43 new tests** (1193 total), `tsc -b` clean.

### §8's traps, and which ones bit

- **`Array.includes` (item 6) — real, and fixed where §8 said to.**
  `snapshotFloor` strips the floor prefix and builds `Set`s once per state
  change; the builder never scans. `floors.ts` is untouched — its signatures are
  the game's, and this was a rendering concern all along.
- **`LightLayer` loses its input (item 1) — real.** It measures occluders,
  anchor and responders out of live DOM, and under a canvas there are no
  `.map-cell.wall` boxes. It is not rendered under the flag. Nothing is deleted.
- **`lightresponse.css` (item 2) — a non-event, by its own design.** Every rule
  in it is a function of `var(--lit, 0)`, so with nobody writing the property it
  degrades to nothing on its own. The alpha-dilate rim §8 worried about is not
  needed yet, because the canvas hero is a lit sprite rather than a DOM one.
- **`lighting.test.ts`'s ~15 source regexes (item 7) — never at risk**, because
  the flag means both paths coexist and no DOM or CSS was removed. All 1153
  pre-existing tests still pass, unchanged.

### Three bugs worth writing down

**1. "EXT_color_buffer_float is missing" was a LIFECYCLE bug, not a capability
one.** `Device.dispose` ends with `WEBGL_lose_context.loseContext()`, which is
the right thing to do. But a lost context is permanently lost FOR THAT CANVAS
ELEMENT: `getContext('webgl2')` hands back the same dead object and every
`getExtension` on it returns null. React StrictMode mounts, unmounts and
remounts every effect in dev — so a React-owned `<canvas>` had its context
created, killed, and then asked for again, and the second `createDevice`
reported a missing extension. A completely accurate description of a corpse and
a completely misleading description of the machine; it looked exactly like a
hardware capability problem. **The canvas is now created and removed by the
effect that owns the device**, so it cannot recur in dev or after any remount.

**2. The DOM hero was still standing on the board.** `.lantern-grid
.hero-walker { display: none }` lost an equal-specificity tie to floor.css §12,
because `FloorScreen` imports `LanternMap` — and therefore `lantern.css` —
BEFORE its own `../floor.css`. Every override in `lantern.css` is now specific
enough or `!important`, and every one of them is scoped under `.lantern-grid`,
which exists only while the flag is on, so none of them can reach the DOM path.

**3. The pan was unusable rather than merely imperfect.** Deadzone follow runs
every frame, so dragging the view further than the deadzone was undone on the
very next frame and the board sprang back. Follow is now suspended by a manual
pan and handed back the next time the hero moves — which is also the moment the
player has said what they care about.

### Two numbers that had to change from the harness

Both because the harness's board is not a real floor, and both worth stating
rather than quietly re-tuning:

- **The lantern is 7, not 9.** `lightCells` on a real floor is around 4.7 tiles
  against the harness's 7, and a shorter falloff window puts more of the same
  radiance on the nearest tiles. At 9 the pool came out near-white on stone that
  should read as lit sandstone.
- **The room lamp is 0.32, not 1.0.** The harness board has a solid ring of
  border blocks, so the lamp genuinely stopped at the wall — which is what
  §15.1 recorded and believed in general. A real floor's outer wall is one block
  tall and the lamp sits 15 tiles up, so the ray from an interior tile clears it
  almost immediately and a cold wash reaches the dungeon floor: exactly the
  thing §12 says must not happen. Lowered rather than removed, because without
  it the rim, the frame and the table are lit by ambient alone and every bit of
  §11's edge work is invisible.

### What is NOT ported

Stated plainly, because §4 says the DOM map stays the default until the canvas
map is BETTER, and this list is the distance left:

- **The battlefield.** `BattleScreen` is entirely untouched. §8 item 4
  (`BattleView.backdrop` is a `ReactNode`) and item 3 (two nav registrations on
  world elements) are both still open, and both are M7.
- **Ground clutter (`tileArt`), fog fringes, the leaving marker and the miniboss
  crown** are not drawn — art the renderer has no material for yet. The `beyond`
  veil is deliberately gone, since the light IS the veil now.
- **A unit whose painted art is missing draws as a bare plinth.** 41 of 92
  monsters have no painting (§8's cleanup list), and the DOM path falls back to
  a procedural SVG silhouette the canvas has no equivalent for.
- **Pieces still have no normal maps on this path.** The EDT bevel bake lives in
  gitignored staging; §15.1's "single biggest remaining win on the pieces"
  stands, and here it is not even wired up.
- **Overview/play is a toggle (`O`), not a lerp.** §17 asks for the lerp.
- **Zoom is centre-anchored, not cursor-anchored.** §18 left that as "one line
  on top of pan"; pan now exists, so it genuinely is one line, and it is not
  written yet.
- **Touch.** Wheel zoom and shift-drag or middle-drag pan only.

### Verified by eye versus by measurement

By **measurement**: the lattice against `camera.project` at six tiles, four
zooms and three centres; `elementFromPoint` returning the right cell at six
board positions; click-to-move walking three tiles from a click at a projected
tile centre; the glide sampled mid-step at y = 2.32 between tiles 2 and 3; the
HUD's frame, draw, light and bin numbers; 1193 tests; `tsc -b` clean; and with
the flag OFF, `.map-grid` carrying exactly its old class list, rows still direct
children of it, no lattice wrapper, the walker still `display: flex`,
`LightLayer`'s canvas still present, and no `__lantern` hook on `window`.

By **eye**: the frames themselves — that the board reads as a board, that the
pool reads as a lantern rather than as daylight, that the mushrooms read as
scenery rather than as decoration, and that the DOM map with the flag off is the
map that shipped.

---

## 21. The other half: the battlefield is on the board too (2026-07-26)

§20 ended with a list headed **What is NOT ported**, and the first line of it
was *"the battlefield. `BattleScreen` is entirely untouched."* It is touched.
Load a real Hollow Gate fight with `?r=lantern` and the arena is drawn by the
renderer: an inlaid stone slab in the gate's own tile art, the painted gate
scene standing up at the back of it as a lit flat, every combatant a piece on a
plinth with a contact shadow, and a rail of candles burning on the board's left
edge whose count is the vigor you have left to spend.

Everything that is text or a hit target is still DOM and still exactly where it
was: nameplates, HP grooves, intent telegraphs, corner badges, damage popups,
impact FX, the aim reticle, the whole hand of cards, and the aim line — which
still runs from a `getBoundingClientRect` on a hand slot to a
`getBoundingClientRect` on an enemy div, and now lands on a piece that is drawn
there *because* it was placed from that rect.

### 21.1 The map's trick does not apply, and its inverse does

This was the first real decision and it is the one worth writing down.

§20's whole affordability argument is that the board plane's projection is
AFFINE, so the DOM can keep rendering a square lattice at a fixed pitch and ONE
CSS transform carries the entire lattice onto the projected board. That works
because the map HAS a lattice: ~300 identical cells at a known pitch.

**A battlefield has no lattice.** `.bf-row` is a flex row whose unit widths come
from `--bf-scale`, from `.bf-plate`'s `min-width`, from how long a monster's
name is, and from how many escorts the pack rolled. There is no pitch to carry,
and no single transform can express "these five boxes, wherever the flexbox put
them".

So the same affine map is used in the OTHER DIRECTION, which costs nothing
because it is exactly invertible:

- the DOM lays the fight out exactly as it always has;
- the renderer MEASURES the two feet lines and solves for the one camera that
  puts its two authored RANKS on them;
- every figure's own `.bf-figure` box is then unprojected through that camera,
  so a piece stands precisely where its box stands.

Two anchors, two unknowns, one linear solve (`render/battleScene.ts`
`arenaCamera`):

    partyFeetPx - enemyFeetPx = (PARTY_RANK - ENEMY_RANK) * zoom * cos(tilt)
    enemyFeetPx               = (ENEMY_RANK - cy) * zoom * cos(tilt) + vh/2

Everything else — the slab, the frame, the rim, the table, the candles, the
painted flat — is authored in tiles against that camera and lands where the
solve puts it. Checked against `camera.project` itself rather than against a
re-derivation of the same algebra: the ranks land on the measured feet lines to
within 1e-6 px at four field heights and four row separations, and a figure's
quad draws back to the exact pixel width and height the DOM reserved for it.

**It closes §8 item 5 differently from the map, and deliberately.** The map
PINNED `--cell` at 48 and took the ladder over, because there `--cell` sized
nothing but the lattice. `--bf-scale` also sizes the plates, the badges and the
text, all of which stay DOM and still have to fit four breakpoints — pinning it
would overflow the fight on a short viewport, which is the exact failure the
clamp exists to prevent. §8's real instruction is *"the TSX numbers are hints,
not authority"*, and this obeys it completely: nothing in `battleScene.ts` reads
a `size={150}` or a `--bf-scale`. It measures the resolved box.

### 21.2 §8's traps, and which ones bit

- **Item 6, `BattleView.backdrop` is a `ReactNode` — real, and it paid for
  itself immediately.** It is `BattleScenery { painted: string | null; gateId:
  GateId | null }` now, and BOTH adapters changed together as §8 required:
  `useSoloBattleView` here and the duel adapter in `MultiplayerScreen.tsx`.
  `BattleStage` builds the identical `<img className="painted-scene">` from it,
  so the DOM path is unchanged — and the renderer, which previously could not
  have known there was a painting at all, can now stand it up at the back of the
  board and lay the floor in the gate's own stone. No `if (duel)` branch was
  added: a duel simply reports `gateId: null` and gets a chalk floor, which is
  what a ring in Everdusk is.
- **Item 3, two nav registrations on world elements — a non-event, exactly as
  §8 predicted.** The heal-aim stops on the hero and each ally are `navItem`
  props on `.bf-unit` divs, and the port never touches those divs. Only the
  `<img>` inside `.bf-figure` is hidden. `nav/geometry.ts` scores the same boxes
  it always did.
- **Item 4, `elementFromPoint(...).closest('[data-enemy-uid]')` — a non-event
  for the same reason.** The canvas is `pointer-events: none` and sits UNDER the
  units, so the probe never reaches it.
- **Item 9, `--vigor-lume` — real, and it is now the design.** `lighting.css`
  lights the arena by counting lit candles with a CSS `:has()` selector, a
  HUD-reads-world path that exists nowhere in TypeScript. `buildBattleScene`
  takes `vigor: { lit, total }` as an explicit input, stands that many candles
  on the board, and makes each burning one a real `Light`. The `:has()` rules
  and the `.candle` boxes are untouched and still run with the flag off.
- **`visibility: hidden`, never `display: none`.** The hidden `<img>` is the
  thing the renderer measures. Take it out of flow and `.bf-figure` collapses to
  the nameplate's width, the row re-spaces, and the renderer faithfully draws
  the fight at the wrong size.

### 21.3 Three things that were wrong until they were measured

**1. `occluders: null` does not mean "lit, with nothing blocking". It means NOT
LIT.** `renderer.ts:331` reads

    useLighting = opts.lit && lights.length > 0 && scene.occluders !== null

An arena is cleared ground — no walls, and §15's pieces have no volume to
occlude with — so `null` is the honest-looking answer, and it silently rendered
the entire fight as flat albedo. A measured horizontal luminance profile across
the field read **127, 125, 125, 121, 126, 122, 128, 120, 126**: no falloff
anywhere. That is indistinguishable by eye from "the lantern is simply too
bright", and an hour went into turning the lantern down before the profile was
taken. The arena now ships an EMPTY grid — present, all zeroes, saying the true
thing — and every ray marches to the light unobstructed.

**2. The lantern's HEIGHT is a legibility dial, not a staging one.** `sprite.ts`
already says why on `Sprite.billboard`: a piece's surface normal is the VIEW
direction, so a light directly overhead arrives near-edge-on to it while the
flat board underneath faces it square on. Hung at z = 2 the boar's column
measured **92, 102, 80, 83** against a bare-board reference of **92, 91, 87,
76** — a figure that is genuinely drawn and that you cannot see. At z = 1.15,
down between the ranks, the same piece measures 1.31x the board beside it and
the hero reads at 0.65x: bright against dark and dark against bright, both
legible.

**3. A dependence that is written down is not a dependence that is visible.**
Vigor drove the lantern as `0.25 + 0.75 * ratio`, which reads as a strong link
and is not one. The mean board luminance over a real fight moved from **87 at
three candles to 85 at two** — a 2% change. AgX spends most of its range
compressing highlights, so a quarter off the top is very nearly free. Bending
the curve to `0.2 + 0.8 * ratio^1.4` and brightening the candles puts the loss
where the eye still has resolution. Measured on the same fight and the same
sample grid: **98 / 87 / 65** mean board luminance at three / two / one candles
— a third of the room's light gone by the time the rail is down to one. Paul's
"spend down to one candle and the room genuinely darkens" is now true as a
number and not only as an intention.

### 21.4 What landed

- **`render/battleScene.ts`** — pure. The rank/feet solve, the figure
  placement, the candle rail, the scene build. No GL, no DOM, no React.
- **`render/battleMaterials.ts`** — the GL side. Procedural furniture up front
  (plinth, shadows, frame, rim, table, flame, and a generated wax candle with
  its own normals), painted art requested asynchronously. It deliberately does
  NOT reuse the map's library: an arena needs no wall art and no object icons,
  and it needs a backdrop that changes per fight, which is why `forget` exists.
- **`render/LanternBattlefield.tsx`** — the canvas, the device, the frame loop.
  It WRITES NOTHING to the DOM; it reads `.bf-figure` rects and draws.
- **`render/lanternBattle.css`** — every rule scoped under `.lantern-battle`,
  which does not exist with the flag off.
- **`components/BattleScreen.tsx`** — the flag, the figure refs, the scenery
  type, and `LightLayer` guarded off under the flag exactly as `FloorScreen`
  guards it.
- **30 new tests** (1244 total), `tsc -b` clean.

### 21.5 What is NOT ported

- **The board's frame, rim and table are off screen in the arena.** The camera's
  depth is fixed by the row separation, which leaves about three tiles above the
  enemy rank — enough for the painted flat OR for the frame and a strip of
  table, not for both. The flat wins, because it is the only surface up there
  carrying any art. The board-on-a-table read then comes from the plinths, the
  seams and the flat's own base line.
- **The candle rail is placed off `.bf-rail`'s right edge**, which is right at
  the desktop layout and wrong in the narrow layout mode where the rail runs
  across the TOP — the candles land in the middle of the board there. It needs
  the rail's ORIENTATION, not just its edge.
- **A hidden `<img>`'s CONTAINER box is what gets measured**, so a figure whose
  art overflows its container (the hero's PNG is authored 1:1.25) draws at the
  container's height rather than the image's. A few percent short.
- **`ImpactEffect`, the flash classes and the damage popups are still DOM
  overlays.** They are not lit and they do not cast. The felled fade and the
  acting lift are the only two combat states the renderer knows about.
- **The duel was not exercised live.** Both adapters changed together and the
  types line up, but a fresh character cannot enter the ring (no beasts), so the
  duel's own path is covered by a unit test on the off-gate chalk floor rather
  than by a fight.
- **No normal maps on the pieces here either.** Same as the map: §15.1's "single
  biggest remaining win on the pieces" is still not wired up on either path.

### 21.6 Verified by eye versus by measurement

By **measurement**: the rank solve against `camera.project` at four field
heights and four row separations, to within 1e-6 px; a figure's quad
round-tripping to the pixel size the DOM reserved for it; the piece-versus-board
contrast at both ranks (1.31x and 0.65x); the vigor ladder at 98 / 87 / 65 mean
board luminance for three / two / one candles; 1244 tests; `tsc -b` clean; and
with the flag OFF, a real fight showing `.battle-stage` carrying exactly its old
class list, no `.lantern-arena`, no `__lanternBattle` on `window`, `LightLayer`'s
canvas still present, `.stage-backdrop` still serving `art/backdrop_hollow.jpg`,
the figure `<img>` still `visibility: visible`, the candle wax still `display:
block`, and `--vigor-lume` still resolving to 0.11 off the `:has()` selector.

By **eye**: the frames themselves — that the arena reads as a lit board and not
as a floor, that the pieces stand on it rather than sit on it, that the candles
read as the thing lighting the room, that spending vigor visibly puts the room
out, and that the aim line still arcs from a card in the hand onto the monster
it is pointed at.
