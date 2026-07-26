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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const STAGE_DIR = join(ROOT, 'web', 'art-staging', 'materials', 'board');
/** Must match `BAKED_ROOT`'s board set in `web/src/render/battleMaterials.ts`. */
const PUBLISH_DIR = join(ROOT, 'web', 'public', 'art', 'materials', 'board');

/**
 * Copy every shape's albedo and normal map. Skips `_ao.png` (intermediate
 * only) and non-shape files like the `_sheet.png` contact sheet `art:sheet`
 * leaves behind, which is a debug artifact, not a runtime map.
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

  if (!quiet) {
    console.log(
      `[art:board:publish] ${files.length} file(s), ${(bytes / 1048576).toFixed(2)} MB -> ${PUBLISH_DIR}`,
    );
  }
  return { copied: files.length, bytes };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = publishBoard();
  process.exit(result.copied > 0 ? 0 : 1);
}
