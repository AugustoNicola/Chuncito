/**
 * Fire rising off a word, drawn by a fragment shader.
 *
 * The word's own letters are the heat source: they are drawn white into a mask,
 * and every pixel of the canvas looks a little way *down* for a letter, along a
 * path bent by noise that scrolls upwards. Near a letter it is hot, further up
 * it cools; more noise breaks that heat into licks, and a narrow threshold
 * gives the licks hard edges. The heat then runs through the tier's own ramp
 * (deep, flat, bright colour), so a mangan burns green and a yakuman gold.
 *
 * The flames can only rise from letters, and the canvas is exactly as wide as
 * the word, so the fire never spreads sideways past it.
 *
 * WebGL 1 on purpose, for the oldest phone at the table. Where there is no
 * WebGL the canvas stays empty and the title keeps its glow, which is all the
 * fire ever adds.
 *
 * Kept cheap for a phone (the first version lagged on one): the noise is read
 * from a small random texture rather than computed -- nine texture reads a
 * pixel instead of some eight hundred operations -- the canvas is never drawn
 * finer than 1.5 device pixels per CSS pixel, and the fire stops whenever its
 * canvas is off screen.
 */

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMask; // the heat field: 1 on a letter, cooling above it
uniform sampler2D uNoise; // 256 x 256 random bytes
uniform vec2 uRes;      // canvas, device pixels
uniform float uDpr;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uHot;
varying vec2 vUv;

// Smooth value noise, two independent channels in one read: the texture is
// random bytes, and sampling between texel centres at a smoothstepped offset
// is the interpolation. Wrapped with mod so the coordinates stay small enough
// for a phone's floats.
vec2 noise2(vec2 p) {
  vec2 i = mod(floor(p), 256.0);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return texture2D(uNoise, (i + f + 0.5) / 256.0).rg;
}
// Three octaves of both channels: the slow bend in the flames.
vec2 fbm2(vec2 p) {
  vec2 v = 0.5 * noise2(p);
  v += 0.25 * noise2(p * 2.03 + vec2(1.7, 9.2));
  v += 0.125 * noise2(p * 4.1 + vec2(5.3, 2.8));
  return v / 0.875;
}
// Four octaves of one: the licks.
float fbm(vec2 p) {
  float v = 0.5 * noise2(p).r;
  v += 0.25 * noise2(p * 2.03 + vec2(1.7, 9.2)).r;
  v += 0.125 * noise2(p * 4.1 + vec2(5.3, 2.8)).r;
  v += 0.0625 * noise2(p * 8.3 + vec2(3.1, 7.7)).r;
  return v / 0.9375;
}
float heatAt(vec2 p) {
  vec2 uv = p * uDpr / uRes;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(uMask, uv).a;
}

void main() {
  vec2 p = vUv * uRes / uDpr;          // CSS pixels, y up
  vec2 q = p / 30.0;
  // Scrolling up, with a slow sway across so the tongues lean and wave.
  vec2 rise = vec2(sin(uTime * 0.7 + p.y * 0.02) * 0.4, -uTime * 1.4);
  // The heat field (letters, smeared upwards and cooling), sampled along a
  // path bent by noise: hardly bent at the letters, more the higher it goes.
  vec2 warp = fbm2(q + rise) - 0.5;
  float near = heatAt(p);
  float bend = mix(36.0, 4.0, near);
  float heat = heatAt(p + warp * bend);

  // Licks: fast, fine noise, also scrolling up, breaks the heat apart.
  float n = fbm(q * 2.3 + warp * 2.0 + vec2(0.0, -uTime * 2.8));
  float t = heat * (0.12 + 1.45 * n);
  // Thinning out over the last few pixels at either end of the word, so a
  // flame leaning past it tapers off instead of being cut down a line.
  float w = uRes.x / uDpr;
  t *= smoothstep(0.0, 12.0, p.x) * smoothstep(0.0, 12.0, w - p.x);

  // A hard edge, then the ramp: a dark rim of the deep colour, the deep
  // colour, the flat one, and the bright core nearest the letters.
  float edge = smoothstep(0.29, 0.31, t);
  vec3 col = mix(uDeep * 0.4, uDeep, smoothstep(0.31, 0.42, t));
  col = mix(col, uMid, smoothstep(0.42, 0.6, t));
  col = mix(col, uHot, smoothstep(0.6, 0.85, t));
  // Embers' light just outside the flames, faint.
  float haze = 0.25 * smoothstep(0.1, 0.29, t) * (1.0 - edge);
  gl_FragColor = vec4(col * edge + uDeep * 0.5 * haze, edge + haze * 0.5);
}`;

/** "#rgb", "#rrggbb" or "rgb(r, g, b)" as 0..1 channels; grey if unreadable. */
export function parseColour(text: string): [number, number, number] {
  const s = text.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((v) => Number(v) / 255) as [number, number, number];
  return [0.6, 0.6, 0.6];
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('fire shader:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

/**
 * Draws `title`'s letters, where they stand on screen, into `mask` at the
 * size of `canvas`. Letter by letter from the laid-out text, so the browser's
 * own spacing and line breaks (a two-line "Kazoe Yakuman") are what the fire
 * rises from.
 */
function drawLetters(mask: HTMLCanvasElement, canvas: HTMLCanvasElement, title: HTMLElement, dpr: number) {
  const ctx = mask.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const box = canvas.getBoundingClientRect();
  mask.width = canvas.width;
  mask.height = canvas.height;
  ctx.clearRect(0, 0, mask.width, mask.height);
  const cs = getComputedStyle(title);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const range = document.createRange();
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (!ch.trim()) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      const m = ctx.measureText(ch);
      // The range's box is the font's content area, ascent above the baseline.
      const ascent = m.fontBoundingBoxAscent || r.height * 0.8;
      ctx.fillText(ch, r.left - box.left, r.top - box.top + ascent);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx;
}

/**
 * Turns the letters into the heat field, in place: each column is smeared
 * upwards, cooling linearly to nothing over `reach` pixels, then softened
 * sideways so the field has no hard steps for the noise to catch on. Once per
 * layout, on the CPU; the shader only ever samples the result.
 */
export function heatField(alpha: Uint8ClampedArray, w: number, h: number, reach: number, soften: number): Float32Array {
  const heat = new Float32Array(w * h);
  const cool = 1 / Math.max(1, reach);
  for (let x = 0; x < w; x++) {
    let carried = 0;
    // Bottom row up: rows count down the canvas.
    for (let y = h - 1; y >= 0; y--) {
      const own = alpha[(y * w + x) * 4 + 3]! / 255;
      carried = Math.max(own, carried - cool);
      heat[y * w + x] = carried;
    }
  }
  // A box blur along each row, twice, approximates a gaussian.
  const r = Math.max(1, Math.round(soften));
  const row = new Float32Array(w);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += heat[o + Math.min(w - 1, Math.max(0, x))]!;
      for (let x = 0; x < w; x++) {
        row[x] = sum / (2 * r + 1);
        sum += heat[o + Math.min(w - 1, x + r + 1)]! - heat[o + Math.max(0, x - r)]!;
      }
      heat.set(row, o);
    }
  }
  return heat;
}

/** 256 x 256 RGBA of seeded random bytes (mulberry32): the shader's noise. */
function noiseBytes(): Uint8Array {
  const bytes = new Uint8Array(256 * 256 * 4);
  let seed = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i++) {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    bytes[i] = ((t ^ (t >>> 14)) >>> 0) & 255;
  }
  return bytes;
}

/**
 * Starts the fire on `canvas`, rising off `title`, in the colours read from
 * `palette`'s `--limit-b`, `--limit` and `--limit-a`. Returns the stop.
 */
export function startFire(canvas: HTMLCanvasElement, title: HTMLElement, palette: HTMLElement): () => void {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return () => {};
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return () => {};
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return () => {};
  gl.useProgram(program);

  // One triangle that covers the canvas.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // Unit 1: the noise, made once. Seeded, so the fire is the same fire on
  // every phone and every load.
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseBytes());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  // Unit 0: the heat field, redrawn on every layout.
  gl.activeTexture(gl.TEXTURE0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uRes = u('uRes'), uDpr = u('uDpr'), uTime = u('uTime');
  const cs = getComputedStyle(palette);
  gl.uniform3fv(u('uDeep'), parseColour(cs.getPropertyValue('--limit-b')));
  gl.uniform3fv(u('uMid'), parseColour(cs.getPropertyValue('--limit')));
  gl.uniform3fv(u('uHot'), parseColour(cs.getPropertyValue('--limit-a')));
  gl.uniform1i(u('uMask'), 0);
  gl.uniform1i(u('uNoise'), 1);

  const mask = document.createElement('canvas');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame = 0;
  let stopped = false;
  const started = performance.now();

  const draw = (now: number) => {
    // Kept small, so the shader's float precision never runs out.
    gl.uniform1f(uTime, still ? 2.5 : ((now - started) / 1000) % 600);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  // Only while the canvas is on screen: scrolled off, the fire stops.
  let visible = true;
  const loop = (now: number) => {
    frame = 0;
    if (stopped || !visible) return;
    draw(now);
    frame = requestAnimationFrame(loop);
  };
  const watch = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible && !still && !frame && !stopped) frame = requestAnimationFrame(loop);
  });
  watch.observe(canvas);

  const layout = () => {
    if (stopped) return;
    // 1.5 at most: a phone's third device pixel would triple the work for an
    // edge nobody can see is any sharper at arm's length.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const ctx = drawLetters(mask, canvas, title, dpr);
    if (!ctx) return;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // The heat is spent before it reaches the top of the canvas, so the
    // flames end in tips of their own rather than at its edge.
    const above = title.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
    const reach = Math.max(10, above) * dpr;
    const heat = heatField(image.data, canvas.width, canvas.height, reach, 3 * dpr);
    for (let i = 0; i < heat.length; i++) {
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255;
      image.data[i * 4 + 3] = Math.round(heat[i]! * 255);
    }
    // Straight alpha in, as drawn: the field is the alpha, nothing else.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uDpr, dpr);
    if (still) draw(performance.now());
  };

  const resize = new ResizeObserver(layout);
  resize.observe(canvas);
  layout();
  // The mask has to be drawn in the real face, not a fallback.
  void document.fonts?.ready.then(layout);
  if (!still) frame = requestAnimationFrame(loop);

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    watch.disconnect();
    // Not loseContext(): the canvas can be started again (React's dev mode
    // does, at once), and a lost context would stay lost. It goes with it.
  };
}
