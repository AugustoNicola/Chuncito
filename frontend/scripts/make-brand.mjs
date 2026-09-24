/**
 * Renders the favicons and the link-preview image into `public/`.
 *
 *   node scripts/make-brand.mjs
 *
 * They are drawn by the system Firefox from the app's own pieces -- the chun
 * glyph used as a mask in the accent colour, the wordmark's font and spacing,
 * the theme's background -- so they are the home title, not a redrawing of it.
 * Re-run it if the mark or the palette changes; the outputs are committed.
 *
 * Writes:
 *   favicon.svg          the tab icon for browsers that take SVG
 *   favicon.ico          16, 32 and 48 px, for everything else
 *   apple-touch-icon.png 180 px, opaque, for a phone's home screen
 *   og.png               1200 x 630, the preview a shared link unfurls into
 */
import puppeteer from 'puppeteer-core';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const theme = readFileSync(join(root, 'src/ui/theme.css'), 'utf8');
const token = (name) => {
  const m = theme.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`no --${name} in theme.css`);
  return m[1].trim();
};
const ACCENT = token('accent');
const BG = token('bg');
const RAISED = token('bg-raised');
const FONT = token('font');

// The glyph, recoloured. It is drawn inside the tile's 300 x 400 box.
const glyph = readFileSync(join(pub, 'tiles/r.svg'), 'utf8')
  .replace(/fill:#[0-9a-f]{6}/gi, `fill:${ACCENT}`);
const glyphUrl = `data:image/svg+xml;base64,${Buffer.from(glyph).toString('base64')}`;

/**
 * The square icon: the glyph on the raised background. Opaque, since a
 * transparent blue mark disappears on a dark tab bar. Rounded for a tab;
 * square for the home screen, where iOS rounds it itself (and would fill
 * transparent corners with black).
 */
const inner = glyph.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
/**
 * The glyph's own extent inside the tile box (35..272 x 3..400), so the icon
 * frames the mark rather than the tile's margins. `weight` thickens the
 * strokes: at 16 px the brush lines are thinner than a pixel otherwise.
 */
const GLYPH = { x: 35, y: 3, w: 237, h: 397 };
const iconSvg = (rx, { weight = 0, height = 336 } = {}) => {
  const k = height / GLYPH.h;
  const dx = (400 - GLYPH.w * k) / 2 - GLYPH.x * k;
  const dy = (400 - height) / 2 - GLYPH.y * k;
  const paths = weight === 0 ? inner
    : inner.replace(/stroke:none/g, `stroke:${ACCENT};stroke-width:${weight};stroke-linejoin:round`);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">'
    + `<rect width="400" height="400" rx="${rx}" fill="${RAISED}"/>`
    + `<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${k.toFixed(4)})">${paths}</g>`
    + '</svg>\n';
};

/** The link preview: the home title, large, on the app's background. */
const ogHtml = `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:630px;box-sizing:border-box;background:${BG};
  display:flex;align-items:center;justify-content:center;
  font-family:${FONT};color:${ACCENT}">
  <div style="display:flex;align-items:center;gap:0.3em;font-size:168px;font-weight:600;
    letter-spacing:0.04em">
    <span style="width:0.74em;height:1em;background:currentColor;
      mask:url('${glyphUrl}') center / contain no-repeat"></span>
    Chuncito
  </div>
</div>
</body></html>`;

/** An .ico holding PNGs, which every current browser reads. */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);   // planes
    header.writeUInt16LE(32, at + 6);  // bits per pixel
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

// Firefox is a snap and cannot read a profile under /tmp (see browser-smoke).
const profileDir = mkdtempSync(join(homedir(), 'snap', 'firefox', 'common', 'chuncito-brand-'));
const browser = await puppeteer.launch({
  browser: 'firefox', executablePath: '/usr/bin/firefox', headless: true, userDataDir: profileDir,
});
try {
  const page = await browser.newPage();
  /** A page screenshot: opaque, which is what the preview wants. */
  const shoot = async (html, width, height) => {
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'load' });
    return Buffer.from(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } }));
  };
  /** An SVG drawn onto a canvas, which keeps its transparency (a screenshot cannot). */
  const raster = async (svg, size) => {
    const url = await page.evaluate(async (svg, size) => {
      const img = new Image();
      img.src = `data:image/svg+xml;base64,${btoa(svg)}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0, size, size);
      return canvas.toDataURL('image/png');
    }, svg, size);
    return Buffer.from(url.split(',')[1], 'base64');
  };

  await page.setContent('<!doctype html><html><body></body></html>');
  const favicon = iconSvg(88);
  writeFileSync(join(pub, 'favicon.svg'), favicon);
  const icons = [];
  for (const [size, weight] of [[16, 16], [32, 8], [48, 4]]) {
    icons.push({ size, data: await raster(iconSvg(88, { weight }), size) });
  }
  writeFileSync(join(pub, 'favicon.ico'), ico(icons));
  writeFileSync(join(pub, 'apple-touch-icon.png'), await raster(iconSvg(0, { height: 290 }), 180));
  writeFileSync(join(pub, 'og.png'), await shoot(ogHtml, 1200, 630));
  console.log('wrote favicon.svg, favicon.ico, apple-touch-icon.png, og.png');
} finally {
  await browser.close();
  rmSync(profileDir, { recursive: true, force: true });
}
