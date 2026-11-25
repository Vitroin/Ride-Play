// Album-art colours for the Now Playing background (like Apple Music).
// Draws the cover small on a canvas and averages the top and bottom halves,
// favouring colourful pixels, then darkens them enough for white text to stay
// readable. Spotify's image CDN sends CORS headers, so the canvas isn't tainted;
// if it ever is, this returns null and the normal background stays.

const cache = new Map();
const N = 24; // sample grid: 24×24 = 576 pixels, a few ms on a phone

export async function artPalette(url) {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url);
  let result = null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, N, N);
    const px = ctx.getImageData(0, 0, N, N).data;
    const top = blend(px, 0, N / 2);
    const bottom = blend(px, N / 2, N);
    result = {
      a: toCss(tone(top, 0.24, 0.40)),     // lighter, top-left
      b: toCss(tone(bottom, 0.10, 0.24)),  // darker, bottom-right
    };
  } catch {
    result = null; // CORS, decode error, offline…
  }
  cache.set(url, result);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return result;
}

/** Weighted average of rows [r0, r1): colourful, mid-bright pixels count most. */
function blend(px, r0, r1) {
  let r = 0, g = 0, b = 0, w = 0;
  for (let y = r0; y < r1; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      const wt = 0.15 + s * (1 - Math.abs(l - 0.5) * 1.6) ** 2 * 3;
      r += px[i] * wt; g += px[i + 1] * wt; b += px[i + 2] * wt; w += wt;
      void h;
    }
  }
  return [r / w, g / w, b / w];
}

/** Keep the hue, nudge saturation up a little, clamp lightness into [lo, hi]. */
function tone(rgb, lo, hi) {
  const [h, s, l] = rgbToHsl(...rgb);
  return hslToRgb(h, Math.min(1, s * 1.15), Math.min(hi, Math.max(lo, l)));
}

const toCss = ([r, g, b]) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h, s, l) {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
