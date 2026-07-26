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

## How to check your own work

Open `http://localhost:5174/lantern-lab.html`, load a finished PNG with the
"Load a file…" button, and look at the **Normal** view.

- Good: even mid-grey overall with crisp detail everywhere, R and G both
  varying, no large dead flat regions.
- Bad: strong overall colour cast in the normal (means baked directional light
  survived), or blocky rectangular structure (means JPEG got in somewhere).
- The panel prints how much tonal range the height used. **Aim above 60%.**
  The current JPEG tiles score 23%.
