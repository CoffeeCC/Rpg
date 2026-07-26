// =========================================================================
// SPRITE BATCHER — the VAO/VBO half of scene/sprite.ts.
//
// `scene/sprite.ts` decides ORDER (painter-sorted, then grouped into
// adjacent same-texture runs) and PACKS one interleaved vertex buffer for
// the whole frame. This class owns the GL side of that: upload it once, then
// walk the batch list issuing one `drawArrays` per texture run at the right
// offset into the single buffer. One upload, N draw calls, no per-batch
// buffer churn.
//
// Program binding, the viewport uniform and blend state are the CALLER's
// job (see `lantern-forge.html` for the wiring) — this class only knows
// where the vertices live and how to draw a slice of them. That split
// matches `ProgramCache`/`PingPong` in this directory: GL objects that own a
// resource, not a pass.
// =========================================================================
import { FLOATS_PER_VERTEX, VERTICES_PER_SPRITE, type SpriteBatch } from '../scene/sprite';
import type { Program } from './program';

/**
 * The vertex shader. Screen-space input (px, origin top-left, y DOWN — the
 * same convention `camera.project` uses so nothing has to flip between the
 * two) converted to clip space. NDC y is UP, hence the one sign flip.
 */
export const SPRITE_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aTint;
uniform vec2 uViewport;
out vec2 vUV;
out vec4 vTint;
void main() {
  vec2 ndc = (aPos / uViewport) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  vUV = aUV;
  vTint = aTint;
}`;

/** Straight-alpha sample * tint. The scene target is premultiplied by the caller's blend mode, not here. */
export const SPRITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vTint;
uniform sampler2D uAtlas;
out vec4 outColor;
void main() {
  vec4 c = texture(uAtlas, vUV) * vTint;
  outColor = c;
}`;

const STRIDE = FLOATS_PER_VERTEX * 4; // bytes

export class SpriteBatcher {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  /** Floats currently allocated in the GPU buffer. Grows, never shrinks. */
  private capacity = 0;
  private vertexCount = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('[lantern] could not create sprite batcher GL objects');
    this.vao = vao;
    this.vbo = vbo;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE, 16);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * Upload one frame's packed vertices.
   *
   * Grows the GPU buffer on demand and re-uses it otherwise — `bufferData`
   * on every frame would force the driver to allocate a fresh buffer each
   * time, which is exactly the churn a dynamic-draw buffer exists to avoid.
   */
  upload(vertexData: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    if (vertexData.length > this.capacity) {
      // Headroom so a scene that grows by a few sprites doesn't reallocate
      // every single frame while it does.
      const grown = Math.ceil(vertexData.length * 1.5);
      gl.bufferData(gl.ARRAY_BUFFER, grown * 4, gl.DYNAMIC_DRAW);
      this.capacity = grown;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexData);
    this.vertexCount = vertexData.length / FLOATS_PER_VERTEX;
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * Draw batches built from the SAME sprite order as the last `upload`.
   * `program` must already be bound (`gl.useProgram`) with `uViewport` set.
   * Returns the draw call count, for the debug HUD.
   */
  draw(program: Program, batches: readonly SpriteBatch[], textures: ReadonlyMap<string, WebGLTexture>): number {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    let offset = 0;
    let calls = 0;
    for (const batch of batches) {
      const count = batch.sprites.length * VERTICES_PER_SPRITE;
      const tex = textures.get(batch.textureId);
      if (tex && offset + count <= this.vertexCount) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(program.u('uAtlas'), 0);
        gl.drawArrays(gl.TRIANGLES, offset, count);
        calls++;
      }
      offset += count;
    }
    gl.bindVertexArray(null);
    return calls;
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.vbo);
    this.capacity = 0;
    this.vertexCount = 0;
  }
}
