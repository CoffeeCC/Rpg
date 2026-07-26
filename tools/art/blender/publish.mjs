// Publish the board furniture bakes out of gitignored staging into
// `web/public/art/materials/board/`, where Vite (and therefore a real build)
// can actually reach them.
//
// Mirrors `tools/art/bake.mjs`'s `publishOne`/`PUBLISHED_MAPS` convention for
// the character/tile bevel bakes: colour + normal ship, AO does not. AO here
// is an input to the normal bake's shading check and is never sampled by the
// renderer at runtime (`render/battleMaterials.ts` only ever requests
// `<name>.png` and `<name>_normal.png`) — publishing it would double the
// payload for a map nothing reads.
//
// Runs standalone (`node tools/art/blender/publish.mjs`) so the staging tree
// left by a previous `npm run art:board` can be republished without paying
// for another Cycles render, and `run.mjs` also calls it automatically after
// a successful bake so the common path stays one command.
import { readdirSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImage, writePng } from '../image.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const STAGE_DIR = join(ROOT, 'web', 'art-staging', 'materials', 'board');
/** Must match `BAKED_ROOT`'s board set in `web/src/render/battleMaterials.ts`. */
const PUBLISH_DIR = join(ROOT, 'web', 'public', 'art', 'materials', 'board');

/**
 * THE MATERIAL MAP — what a surface is made of, per pixel.
 *
 * `Material.material` in `lantern/scene/scene.ts` reads one RGBA texture:
 * R roughness, G specular strength, B iridescence, A occlusion. This is where
 * it comes from, and it is a PACK rather than a bake — every channel already
 * exists, they were just never carried to the renderer together.
 *
 * BRASS IS DETECTED BY NAME, and that is not a shortcut. `split()` in
 * `bake.py` emits every fitting as `<name>_brass` from the same assembly and
 * the same frame precisely so the metal is separable from the timber it sits
 * on — ENGINE_PLAN §19.1, and Paul's *"wherever there is wood joints meeting
 * ... to be brass fittings, so we can play with reflective metal and the
 * lighting."* The suffix IS the material declaration; re-deriving it from
 * pixels would be guessing at something the baker already knows.
 *
 * The numbers, and why they are far apart rather than a gentle nudge: a broad
 * soft highlight reads as pale paint, and a small hard one that TRAVELS as the
 * lantern moves reads as polished metal. Halfway between reads as neither.
 */
const BRASS = { roughness: 0.12, specular: 1.0 };
const TIMBER = { roughness: 0.86, specular: 0.35 };

/**
 * Pack one shape's material map, or return null if it has no AO to carry.
 *
 * AO IS THE ONLY CHANNEL THAT NEEDS A FILE, which is why a missing `_ao.png`
 * means no map at all rather than a flat one: without occlusion the map would
 * carry two constants the renderer can already default to, and every byte of
 * it would be waste.
 */
function packMaterial(stageDir, outDir, name) {
  const aoPath = join(stageDir, `${name}_ao.png`);
  if (!existsSync(aoPath)) return 0;
  const ao = readImage(aoPath);
  const brass = name.endsWith('_brass');
  const { roughness, specular } = brass ? BRASS : TIMBER;
  const r = Math.round(roughness * 255);
  const g = Math.round(specular * 255);
  const out = new Uint8ClampedArray(ao.width * ao.height * 4);
  for (let i = 0; i < ao.width * ao.height; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    // Iridescence is zero for furniture. The cards carry their own foil masks
    // per rarity and set this channel themselves; timber and brass never do.
    out[i * 4 + 2] = 0;
    // AO is baked as a grey image, so any of RGB is the value. Red, by
    // convention with `planeToRgba`.
    out[i * 4 + 3] = ao.data[i * 4];
  }
  const to = join(outDir, `${name}_material.png`);
  writePng(to, ao.width, ao.height, out);
  return statSync(to).size;
}

/**
 * Copy every shape's albedo and normal map, and PACK its material map.
 *
 * `_ao.png` is still not copied — it ships folded into the material map's
 * alpha instead, which is the same bytes doing a job rather than sitting
 * unread. Non-shape files like the `_sheet.png` contact sheet are debug
 * artifacts and never ship.
 */
export function publishBoard({ quiet = false } = {}) {
  if (!existsSync(STAGE_DIR)) {
    if (!quiet) {
      console.error(
        `[art:board:publish] no staging dir at ${STAGE_DIR} — run \`npm run art:board\` first`,
      );
    }
    return { copied: 0, bytes: 0 };
  }

  mkdirSync(PUBLISH_DIR, { recursive: true });

  const files = readdirSync(STAGE_DIR).filter(
    (f) => f.endsWith('.png') && !f.endsWith('_ao.png') && !f.startsWith('_'),
  );

  let bytes = 0;
  for (const f of files) {
    const from = join(STAGE_DIR, f);
    const to = join(PUBLISH_DIR, f);
    copyFileSync(from, to);
    bytes += statSync(to).size;
  }

  // One material map per SHAPE, not per file — the shape names are the colour
  // maps, i.e. everything that is not a `_normal.png`.
  const shapes = files.filter((f) => !f.endsWith('_normal.png')).map((f) => f.slice(0, -4));
  let packed = 0;
  for (const name of shapes) {
    const size = packMaterial(STAGE_DIR, PUBLISH_DIR, name);
    if (size > 0) {
      packed++;
      bytes += size;
    }
  }

  if (!quiet) {
    console.log(
      `[art:board:publish] ${files.length} file(s) + ${packed} material map(s), ` +
        `${(bytes / 1048576).toFixed(2)} MB -> ${PUBLISH_DIR}`,
    );
  }
  return { copied: files.length, packed, bytes };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = publishBoard();
  process.exit(result.copied > 0 ? 0 : 1);
}
