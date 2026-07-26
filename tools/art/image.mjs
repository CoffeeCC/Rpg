/**
 * Image I/O for the material baker — pure JS, no native dependencies.
 *
 * `sharp` and `node-canvas` are both out: they are native modules, and a
 * pipeline that has to survive `npm i` on a clean checkout (and in CI, on a
 * machine with no build toolchain) cannot depend on a compile step. `pngjs`
 * and `jpeg-js` are pure JavaScript and decode everything this project ships.
 *
 * Everything downstream works on two shapes:
 *
 *   RGBA   Uint8ClampedArray, w*h*4, straight 0..255 as authored — NOT linearised.
 *          The Lab uploads its textures as RGBA8 (not SRGB8_ALPHA8) and takes
 *          luminance off the gamma-encoded values, so the offline port must do
 *          the same or the height field comes out differently weighted.
 *   plane  Float32Array, w*h, one channel.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import { createHash } from 'node:crypto';
import pngjs from 'pngjs';
import jpegjs from 'jpeg-js';

const { PNG } = pngjs;

/** @typedef {{ width: number, height: number, data: Uint8ClampedArray }} Bitmap */

/**
 * Decode a PNG or JPEG into straight RGBA8.
 * @param {string} file
 * @returns {Bitmap}
 */
export function readImage(file) {
  const buf = readFileSync(file);
  const ext = extname(file).toLowerCase();

  if (ext === '.jpg' || ext === '.jpeg') {
    const d = jpegjs.decode(buf, { useTArray: true, formatAsRGBA: true });
    return { width: d.width, height: d.height, data: new Uint8ClampedArray(d.data.buffer, d.data.byteOffset, d.data.length) };
  }

  const png = PNG.sync.read(buf);
  const n = png.width * png.height * 4;
  if (png.data.length === n) {
    return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
  }
  // 16-bit source: pngjs hands back two bytes per sample. Take the high byte.
  if (png.data.length === n * 2) {
    const out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) out[i] = png.data[i * 2];
    return { width: png.width, height: png.height, data: out };
  }
  throw new Error(`${file}: unexpected PNG payload ${png.data.length} for ${png.width}x${png.height}`);
}

/**
 * Write RGBA8 out as a PNG, creating the directory if it is missing.
 * @param {string} file
 * @param {number} width
 * @param {number} height
 * @param {Uint8ClampedArray|Uint8Array} rgba
 */
export function writePng(file, width, height, rgba) {
  mkdirSync(dirname(file), { recursive: true });
  const png = new PNG({ width, height });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length);
  writeFileSync(file, PNG.sync.write(png, { deflateLevel: 6 }));
}

/**
 * A single channel as an opaque grey PNG payload.
 * @param {Float32Array} plane values in 0..1
 * @param {Uint8ClampedArray|null} alpha optional per-pixel alpha 0..255
 */
export function planeToRgba(plane, alpha = null) {
  const out = new Uint8ClampedArray(plane.length * 4);
  for (let i = 0; i < plane.length; i++) {
    const v = Math.round(Math.max(0, Math.min(1, plane[i])) * 255);
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = alpha ? alpha[i] : 255;
  }
  return out;
}

/**
 * Encode a unit normal field the way the Lab's target holds it: n * 0.5 + 0.5,
 * with y left in texture space (y down). The engine's lighting shader is what
 * flips it — see P_LIT in `web/public/lantern-lab.html`:
 * `vec3 N = vec3(n.x, -n.y, n.z);`
 *
 * @param {Float32Array} normals w*h*3, unit length
 * @param {Uint8ClampedArray|null} alpha
 */
export function normalToRgba(normals, alpha = null) {
  const n = normals.length / 3;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      out[i * 4 + k] = Math.round(Math.max(0, Math.min(255, (normals[i * 3 + k] * 0.5 + 0.5) * 255)));
    }
    out[i * 4 + 3] = alpha ? alpha[i] : 255;
  }
  return out;
}

/** Content hash of a source file, so the manifest can tell a re-bake from a re-shoot. */
export function sha1(file) {
  return createHash('sha1').update(readFileSync(file)).digest('hex');
}
