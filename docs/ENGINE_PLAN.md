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
| **M1** | **Lantern core** — GL context, sprite batcher, HDR target, tonemap, bloom, debug HUD. The board drawn on the GPU with today's art. | Looks *the same*. Deliberately. Proof the floor renders at 60fps with nothing new on it. |
| **M2** | **Materials + per-pixel lighting** — the Lab's pipeline as a build step, normal-mapped diffuse and specular, soft shadows from world geometry. | **The first real moment.** The lantern rakes across the board instead of just clearing fog. |
| **M3** | **The tilt** — board camera, walls given front faces, pieces stand up as billboards with contact shadows. | It becomes a board with pieces on it. |
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

The orbit test becomes standing QC: **every** asset gets it, and a spread above
~0.10 with peak and trough ~180° apart is a reject.

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
