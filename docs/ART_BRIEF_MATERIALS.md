# Material brief — de-shaded board tiles

For the Grok run scheduled **2026-07-26, 18:14** (quota resets 18:04).
Context: `docs/ENGINE_PLAN.md`. Read §1.2 (the board-game model) and §7 (the art
pipeline) before starting.

---

## What changed, and why this is a re-shoot rather than new art

The game is getting a real lighting engine. From now on the engine computes the
light: direction, falloff, shadows, ambient occlusion, bounce. That makes
**painted-in lighting a bug**, because it double-shades — the engine's shadow
lands on top of the shadow already in the texture and the result goes muddy and
dead. It is the single most common reason 2D games look wrong the moment real
lighting is added.

So every texture below is the same subject as the one it replaces, **repainted
flat**. It should look slightly boring on its own. That is correct. The engine
supplies everything that was removed, and supplies it *correctly for where the
lantern actually is*.

Second change: **the world is a board game.** The map is a physical board on a
table — timber, slate, inlaid tile, painted parchment. These textures are the
board's surface, not a photograph of a place. Materials should read as things a
craftsman made: grain, wear at the edges, chipped paint, tarnish.

---

## Hard requirements

1. **PNG, not JPEG.** Non-negotiable. Deriving a normal map means
   differentiating the image, and differentiation amplifies JPEG's 8x8 block
   noise into visible ridges across the whole surface. This was measured.
2. **1024x1024, seamlessly tileable.** Edges must wrap in both axes.
3. **FLAT, EVEN, AMBIENT LIGHT.** No cast shadows. No directional highlight. No
   baked ambient occlusion. No vignette. No "lit from the upper left". If you
   can tell where the light was, it is wrong.
4. **Keep the local relief.** Flat lighting does NOT mean flat surface — mortar
   lines, cracks, grain, rivets, tile joins and chips must all still be visible
   as *tonal* variation. That variation is what the normal map is derived from.
   A texture with no relief produces no normals and the whole exercise fails.
   **Deep detail, no directional light** is the target.
5. **Use the full tonal range.** Measured on the current `hollow_wall.jpg`: only
   **23%** of the available range was in use, because the art is very dark. That
   costs precision in every derived map. Keep the midtones open — the engine
   darkens it, so it does not need to arrive dark.
6. No text, no letters, no numerals, no watermarks, no creatures, no people.

## The 10 tiles

Five gates, ground and wall each. Match the existing palette and subject of the
file being replaced — check `web/public/art/tiles/<gate>_<kind>.jpg` first.

| gate | feel |
|---|---|
| `verdant` | sun-dappled woodland — mossed stone, packed earth, root and leaf litter |
| `hollow` | deep caverns — raw hewn rock, dry dust, mineral veins |
| `sunken` | drowned temple-city — wet cut stone, silt, barnacle and weed |
| `storm` | wind-scoured peaks — cracked slate, frost, lichen |
| `abyss` | the wound — blackened basalt, ember-cracks, glassy fracture |

Ground tiles read as *floor seen from above at a slight angle*. Wall tiles read
as a *vertical face* — this matters now, because M3 gives walls a real front
face for the lantern to rake across.

**`abyss` is the one exception to rule 3:** its ember-cracks are genuinely
emissive. Paint them at their own glow colour, still with no cast light spilling
onto the surrounding rock — the engine will do the spilling. Deliver a separate
`abyss_wall_emissive.png` and `abyss_ground_emissive.png`: black everywhere,
with just the emitting parts in colour.

## Output

Staging only — `web/art-staging/materials/`. **Do not write into
`web/public/`**; Vite copies all of `public/` into `dist`, so staging there
would ship every intermediate.

Emit `manifest.json` mapping each output file to the source file it replaces,
plus a `QC_REPORT.md`. **View every image before reporting it done** — the
labelling has been wrong before while the quality was fine, so check that each
file is the gate it claims to be.

## The measured baseline you are beating

Every shipped tile was run through the Lab's orbit test and level meter on
2026-07-25. This is what you are replacing:

| tile | orbit | spread | tonal range |
|---|---|---|---|
| verdant ground | pass | 0.009 | 16% |
| verdant wall | pass | 0.012 | 23% |
| abyss wall | pass | 0.016 | **6%** |
| storm wall | pass | 0.017 | 29% |
| sunken ground | pass | 0.024 | **50%** ← best of the set |
| hollow wall | pass | 0.025 | 23% |
| storm ground | pass | 0.026 | 30% |
| sunken wall | pass | 0.037 | 29% |
| hollow ground | pass | 0.067 | 11% |
| **abyss ground** | **FAIL** | **0.182** | 14% |

Two things to take from it:

1. **`abyss_ground` is the priority.** It fails the orbit test with a spread 7x
   any other tile and its peak and trough exactly 180° apart — the textbook
   signature of light painted into the art. The cause is almost certainly that
   the ember-glow was painted *spilling onto the surrounding rock*. Paint the
   cracks emissive; do not paint what they illuminate. The engine does that, and
   does it correctly for wherever the lantern actually is.
2. **Every tile is starved of tonal range.** The best is 50%, most sit at
   11–30%, `abyss_wall` is 6%. That is what "use the full tonal range" in the
   requirements means in numbers. **Target above 60% for all ten.**

## How to check your own work

Open `http://localhost:5174/lantern-lab.html`, load a finished PNG with the
"Load a file…" button, and look at the **Normal** view.

- Good: even mid-grey overall with crisp detail everywhere, R and G both
  varying, no large dead flat regions.
- Bad: strong overall colour cast in the normal (means baked directional light
  survived), or blocky rectangular structure (means JPEG got in somewhere).
- The panel prints how much tonal range the height used. **Aim above 60%.**
  The current JPEG tiles score 23%.

---

## Addendum (2026-07-26): what a CHARACTER asset is now

Not covered by the tile brief above, and it changes the intent rather than the
subject. See `docs/ENGINE_PLAN.md` §15.

**A monster or hero is a GAME PIECE, not an illustration of a creature.**
Picture a painted tin figure, a carved wooden piece, or a moulded plastic
miniature that someone has painted by hand — then photographed straight on.
The engine slots that figure into a plinth on the board and carves it into a
low relief so the lantern rakes across its form.

That last part is why the intent matters. The pipeline derives a height field
from the SILHOUETTE (EDT beveling) and bulges the shape toward its centre, so
the artwork's outline becomes its geometry. Art drawn as a flat illustration
produces a flat bulge; art drawn as a figure produces a figure.

### Requirements

1. **One clean, readable silhouette.** The outline IS the geometry. Wispy
   tendrils, thin trailing smoke and detached floating bits all become noise in
   the height field. A shape you could cut out of card and still recognise.
2. **Face the viewer, straight on.** These are billboards; they never turn.
   Three-quarter is fine, profile is not.
3. **Form readable from one angle.** Shoulders, brow, chest, limb thickness —
   the things a sculptor would emphasise so the piece reads across a table.
4. **NO painted lighting**, same as the tiles: no rim light, no cast shadow, no
   dramatic key from the upper left. The engine lights it, and painted-in
   lighting fights the derived normals. This is the single most common failure.
5. **Transparent background, PNG.** The alpha is not just masking — it is the
   input the relief is derived from. A sloppy matte becomes bad geometry.
6. **Feet flat and level at the bottom of the frame.** The figure stands in a
   plinth; a piece drawn mid-leap has nothing to stand on.

### What NOT to change

The existing painted style is the strength and should not become 3D-render
pastiche. The instruction is "paint this creature as a figurine someone owns",
not "make it look computer-generated".

### The matte must be HARD — measured, 2026-07-26

Added after Paul asked why the pieces look "ghostly transparent" on the lit
board. They are. Measured on the shipped sprites:

| sprite | fully opaque | partial alpha | mean alpha |
|---|---|---|---|
| `player.png` | 41% | 59% | 184/255 |
| `merchant.png` | 76% | 24% | 238/255 |
| `tamer.png` | **23%** | **77%** | **148/255** |

A figure that is 58% opaque on average is a ghost by construction.

**Why nobody noticed until now:** the old DOM map put these on a DARK
background, where partial alpha still reads as solid. The lit board is bright
underneath, so every soft pixel blends toward the floor. The lighting did not
cause this — it exposed it.

**And it costs geometry, not just looks.** The EDT bevel derives the relief
height field from the ALPHA channel, so a soft matte produces a soft, mushy
bulge. `tamer`, the softest matte of the three, also produced the flattest
relief. A vague outline is a vague figure.

**Requirement:** the figure is OPAQUE. Alpha is a cutout, not a fade. Only a
one-to-two pixel antialiasing band at the true silhouette edge may be partial.
No feathered edges, no soft glow bleeding outward, no semi-transparent robes,
smoke or aura — if something should glow, it belongs in the emissive channel,
which the engine composites as LIGHT rather than as transparency.

A quick check: the fraction of non-clear pixels that are fully opaque should be
**above 90%**. The current best is 76% and the worst is 23%.
