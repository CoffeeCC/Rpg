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
// The pure pixel arithmetic lives apart from the filesystem work, so the app's
// test runner can exercise it without pulling `pngjs` out of the ROOT install.
// See that file's header.
import {
  CARD_FOIL_MATERIAL,
  CARD_FOIL_TIERS,
  CARD_MATERIAL,
  combineNormals,
  cutFoilAlbedo,
} from './cardPack.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const STAGE_DIR = join(ROOT, 'web', 'art-staging', 'materials', 'board');
/** Must match `BAKED_ROOT`'s board set in `web/src/render/battleMaterials.ts`. */
const PUBLISH_DIR = join(ROOT, 'web', 'public', 'art', 'materials', 'board');
/** The card set is baked to its own staging dir and published to its own root. */
const CARD_STAGE_DIR = join(ROOT, 'web', 'art-staging', 'materials', 'cards');
/** Must match `BAKED_CARD_ROOT` in `web/src/render/cardMaterials.ts`. */
const CARD_PUBLISH_DIR = join(ROOT, 'web', 'public', 'art', 'materials', 'cards');

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

// =========================================================================
// THE CARD SET — the same pack, one shape family further on.
// =========================================================================
//
// `bake.py` emits eight card shapes at ONE frame, all billboards: the matte
// stock, the gilt border, the back, and one foil MASK per rarity. Three of
// those publish exactly like board furniture. The five foil masks do not, and
// the difference is the whole reason this section exists rather than a second
// `PUBLISH_DIR` constant.
//
// A MASK IS NOT A SPRITE. `card_foil_rare.png` in staging is white where the
// card is foil and black everywhere else, on a fully OPAQUE card-shaped alpha
// (measured: alpha mean 254 over the whole silhouette, R mean 48). Hand that
// to the renderer as an albedo and it draws a black card with white lines on
// it, because the sprite shader multiplies albedo by light and blends on
// alpha — there is nowhere for "this pixel is foil" to go.
//
// So the foil layer is REPACKED here into a sprite the renderer can draw:
//
//   albedo    the BORDER's own gilt, cut to the mask. Not an invented gold:
//             `bake.py` states that every white piece of a foil mask is the
//             footprint of a piece of `card_border`, so sampling the border
//             under the mask always lands on gilt and the foil can never
//             introduce a colour the card does not already have.
//   normal    the border's moulding COMBINED with the grating. See below.
//   material  R roughness, G specular, B = THE MASK, A = the border's AO.
//
// B is the payload. `lighting.ts` rides iridescence on the specular lobe and
// scales it by this channel, so the mask stops being a picture and becomes the
// number that says how holographic each pixel is.
//
// STARTER AND COMMON THEREFORE PUBLISH AS FULLY TRANSPARENT IMAGES, and that
// is correct rather than a bug to be tidied away. Their masks are black by
// design — foil is a rarity signal and a deck where everything shines says
// nothing — so cutting the gilt to the mask leaves nothing. `bake.py`'s
// argument carries: a missing file is a special case somebody has to remember,
// and the lookup stays `card_foil_${card.rarity}` with no branch in it.
const CARD_SHAPES = ['card_stock', 'card_border', 'card_back'];

function packCardMaterial(outDir, name, aoImage, { roughness, specular }, iridescence = null) {
  const px = aoImage.width * aoImage.height;
  const r = Math.round(roughness * 255);
  const g = Math.round(specular * 255);
  const out = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = iridescence ? iridescence[i] : 0;
    // AO is baked grey, so any of RGB is the value. Red, by convention with
    // `planeToRgba` and with `packMaterial` above.
    out[i * 4 + 3] = aoImage.data[i * 4];
  }
  const to = join(outDir, `${name}_material.png`);
  writePng(to, aoImage.width, aoImage.height, out);
  return statSync(to).size;
}

function foilTiers(stageDir) {
  const baked = new Set(
    readdirSync(stageDir)
      .filter((f) => /^card_foil_[a-z]+\.png$/.test(f))
      .map((f) => f.slice('card_foil_'.length, -4)),
  );
  return CARD_FOIL_TIERS.filter((t) => baked.has(t));
}

export function publishCards({ quiet = false } = {}) {
  if (!existsSync(CARD_STAGE_DIR)) {
    if (!quiet) {
      console.error(
        `[art:cards:publish] no staging dir at ${CARD_STAGE_DIR} — run the card bake first`,
      );
    }
    return { copied: 0, packed: 0, bytes: 0 };
  }
  mkdirSync(CARD_PUBLISH_DIR, { recursive: true });

  let bytes = 0;
  let copied = 0;
  let packed = 0;

  // --- the three ordinary shapes: copy, then pack their AO ----------------
  for (const name of CARD_SHAPES) {
    for (const suffix of ['', '_normal']) {
      const from = join(CARD_STAGE_DIR, `${name}${suffix}.png`);
      if (!existsSync(from)) continue;
      const to = join(CARD_PUBLISH_DIR, `${name}${suffix}.png`);
      copyFileSync(from, to);
      bytes += statSync(to).size;
      copied++;
    }
    const aoPath = join(CARD_STAGE_DIR, `${name}_ao.png`);
    if (!existsSync(aoPath)) continue;
    bytes += packCardMaterial(CARD_PUBLISH_DIR, name, readImage(aoPath), CARD_MATERIAL[name]);
    packed++;
  }

  // --- the foil layers: gilt cut to the mask ------------------------------
  const borderPath = join(CARD_STAGE_DIR, 'card_border.png');
  const borderNormalPath = join(CARD_STAGE_DIR, 'card_border_normal.png');
  const borderAoPath = join(CARD_STAGE_DIR, 'card_border_ao.png');
  const tiers = foilTiers(CARD_STAGE_DIR);
  if (existsSync(borderPath) && existsSync(borderNormalPath) && existsSync(borderAoPath)) {
    const border = readImage(borderPath);
    const borderNormal = readImage(borderNormalPath);
    const borderAo = readImage(borderAoPath);
    for (const tier of tiers) {
      const name = `card_foil_${tier}`;
      const mask = readImage(join(CARD_STAGE_DIR, `${name}.png`));
      const grating = readImage(join(CARD_STAGE_DIR, `${name}_normal.png`));
      if (mask.width !== border.width || mask.height !== border.height) {
        throw new Error(
          `${name} is ${mask.width}x${mask.height} and card_border is ` +
            `${border.width}x${border.height} — the card family shares ONE frame`,
        );
      }
      const px = mask.width * mask.height;
      const albedo = cutFoilAlbedo(border, mask);
      const irid = new Uint8ClampedArray(px);
      for (let i = 0; i < px; i++) irid[i] = mask.data[i * 4];
      const albedoPath = join(CARD_PUBLISH_DIR, `${name}.png`);
      writePng(albedoPath, mask.width, mask.height, albedo);
      bytes += statSync(albedoPath).size;
      copied++;

      const normalPath = join(CARD_PUBLISH_DIR, `${name}_normal.png`);
      writePng(normalPath, mask.width, mask.height, combineNormals(borderNormal, grating));
      bytes += statSync(normalPath).size;
      copied++;

      bytes += packCardMaterial(CARD_PUBLISH_DIR, name, borderAo, CARD_FOIL_MATERIAL, irid);
      packed++;
    }
  }

  if (!quiet) {
    console.log(
      `[art:cards:publish] ${copied} file(s) + ${packed} material map(s), ` +
        `${(bytes / 1048576).toFixed(2)} MB -> ${CARD_PUBLISH_DIR}`,
    );
  }
  return { copied, packed, bytes };
}

/**
 * Publish whatever has been baked, and say nothing about what has not.
 *
 * Two staging trees now, and a bake only ever fills ONE of them: `npm run
 * art:board` writes furniture, `npm run art:cards` writes the card set. Running
 * both publishers unconditionally means every board bake ends with a complaint
 * that the cards are missing, which trains everyone to ignore the line that
 * would matter if the cards really were.
 */
export function publishAll() {
  const board = existsSync(STAGE_DIR) ? publishBoard() : { copied: 0, packed: 0, bytes: 0 };
  const cards = existsSync(CARD_STAGE_DIR) ? publishCards() : { copied: 0, packed: 0, bytes: 0 };
  return { copied: board.copied + cards.copied, board, cards };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = publishAll();
  if (result.copied === 0) {
    console.error(
      `[art:publish] nothing staged. Run \`npm run art:board\` or \`npm run art:cards\` first.\n` +
        `  looked in ${STAGE_DIR}\n  and       ${CARD_STAGE_DIR}`,
    );
  }
  process.exit(result.copied > 0 ? 0 : 1);
}
