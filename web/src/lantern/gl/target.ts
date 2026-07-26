// =========================================================================
// RENDER TARGETS — the HDR buffers the whole renderer draws through.
//
// Everything between the G-buffer and the tonemap lives in RGBA16F, and the
// alpha channel is not decoration: the radiance cascade merge composites like
// premultiplied alpha, with alpha carrying TRANSMITTANCE
// (L(a,c) = L(a,b) + beta(a,b) * L(b,c)). An RGB-only format would make the
// merge impossible, which is why R11G11B10 is allowed for bloom and nowhere
// else.
//
// Half-float rather than full: 16F is renderable via EXT_color_buffer_float
// (checked at device creation and treated as a hard requirement) and, more
// importantly, is LINEARLY FILTERABLE as core WebGL2. Cascade upsampling and
// the bloom tent both depend on hardware bilinear, and 32F filtering needs a
// separate extension for double the bandwidth and precision nobody here needs.
// =========================================================================

export type TargetFormat = 'rgba16f' | 'rgba8' | 'r11g11b10';

export interface Target {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
  readonly format: TargetFormat;
  dispose(): void;
}

function internalFormat(gl: WebGL2RenderingContext, f: TargetFormat): number {
  switch (f) {
    case 'rgba16f':
      return gl.RGBA16F;
    case 'r11g11b10':
      return gl.R11F_G11F_B10F;
    default:
      return gl.RGBA8;
  }
}

// No `type` companion to `internalFormat` here on purpose: allocation goes
// through `texStorage2D`, which takes only the sized internal format. The
// older `texImage2D` path needs a matching format/type triple and gets it
// wrong silently — a mismatched pair is a spec violation most drivers accept
// and then quietly store at the wrong precision.

export interface TargetOptions {
  format?: TargetFormat;
  /** LINEAR by default — the cascades and the bloom tent both need it. */
  filter?: 'nearest' | 'linear';
  /**
   * CLAMP_TO_EDGE by default, and it matters more than it sounds.
   *
   * A blur kernel reads outside the target near every border. Clamping
   * smears the edge pixel, which is invisible; REPEAT would wrap the opposite
   * side of the screen into the blur, so a bright lantern on the left would
   * put a faint glow on the right. That artifact is very hard to recognise as
   * a wrap once it is buried in a bloom chain.
   */
  wrap?: 'clamp' | 'repeat';
}

export function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  opts: TargetOptions = {},
): Target {
  const format = opts.format ?? 'rgba16f';
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));

  const texture = gl.createTexture();
  if (!texture) throw new Error('[lantern] could not create texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat(gl, format), w, h);
  const filter = opts.filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
  const wrap = opts.wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);

  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('[lantern] could not create framebuffer');
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(framebuffer);
    // Worth naming the likely cause: this is what a driver that reports
    // EXT_color_buffer_float but cannot actually render to 16F looks like.
    throw new Error(
      `[lantern] framebuffer incomplete (0x${status.toString(16)}) for ${w}x${h} ${format}. ` +
        'If this is rgba16f, the driver advertised float targets it cannot render to.',
    );
  }

  return {
    texture,
    framebuffer,
    width: w,
    height: h,
    format,
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
    },
  };
}

/**
 * Two targets you can bounce between.
 *
 * Separable blurs, the cascade merge and any iterative pass all need to read
 * one buffer while writing another. `swap` after each pass; `read` is always
 * the last thing written.
 */
export class PingPong {
  private a: Target;
  private b: Target;
  // Explicit fields rather than constructor parameter properties — see the
  // note in ProgramCache; `erasableSyntaxOnly` rejects the shorthand.
  private readonly gl: WebGL2RenderingContext;
  private readonly opts: TargetOptions;

  constructor(gl: WebGL2RenderingContext, width: number, height: number, opts: TargetOptions = {}) {
    this.gl = gl;
    this.opts = opts;
    this.a = createTarget(gl, width, height, opts);
    this.b = createTarget(gl, width, height, opts);
  }

  get read(): Target {
    return this.a;
  }

  get write(): Target {
    return this.b;
  }

  swap(): void {
    const t = this.a;
    this.a = this.b;
    this.b = t;
  }

  resize(width: number, height: number): void {
    if (this.a.width === width && this.a.height === height) return;
    this.a.dispose();
    this.b.dispose();
    this.a = createTarget(this.gl, width, height, this.opts);
    this.b = createTarget(this.gl, width, height, this.opts);
  }

  dispose(): void {
    this.a.dispose();
    this.b.dispose();
  }
}

/**
 * Bind a target (or the canvas, for `null`) and set the viewport to match.
 *
 * Together, because forgetting the viewport after binding a smaller target is
 * the single most common mistake in a multi-pass renderer, and its symptom —
 * a pass that renders into the bottom-left quarter of its target — looks like
 * a UV bug rather than a state bug.
 */
export function bindTarget(gl: WebGL2RenderingContext, target: Target | null, canvasW = 0, canvasH = 0): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
  if (target) gl.viewport(0, 0, target.width, target.height);
  else gl.viewport(0, 0, canvasW, canvasH);
}

/** Draw the fullscreen triangle. Assumes a program is already bound. */
export function drawFullscreen(gl: WebGL2RenderingContext): void {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** Bind textures to consecutive units and set the matching sampler uniforms. */
export function bindTextures(
  gl: WebGL2RenderingContext,
  program: { u(name: string): WebGLUniformLocation | null },
  textures: Record<string, WebGLTexture | null>,
): void {
  let unit = 0;
  for (const [name, tex] of Object.entries(textures)) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(program.u(name), unit);
    unit++;
  }
}
