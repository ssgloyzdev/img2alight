import { quantize } from './quantize.js';
import { despeckle, labelStats } from './regions.js';
import { traceMask, groupLoops } from './trace.js';
import { fitLoop } from './fit.js';
import { smoothImage } from './preprocess.js';
import { smoothPolygon, polygonToLoop, rectLoop, flattenLoop, polyBBox } from './curves.js';

export const DETAIL = {
  low: { k: 8, minArea: 20, eps: 1.5, sigma: 2.0, smooth: 2, maxShapes: 40, minLoop: 12 },
  medium: { k: 16, minArea: 8, eps: 1.0, sigma: 1.5, smooth: 2, maxShapes: 120, minLoop: 6 },
  high: { k: 32, minArea: 4, eps: 0.6, sigma: 1.0, smooth: 2, maxShapes: 300, minLoop: 3 },
  ultra: { k: 56, minArea: 2, eps: 0.4, sigma: 0.7, smooth: 1, maxShapes: 800, minLoop: 1.5 }
};

const tick = () => new Promise((r) => setTimeout(r, 0));

export function toHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex) {
  const v = parseInt(hex.slice(1, 7), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function meanColors(img, labels, k) {
  const sum = new Float64Array(k * 3);
  const num = new Int32Array(k);
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const l = labels[i];
    if (l < 0) continue;
    sum[l * 3] += img.data[i * 4];
    sum[l * 3 + 1] += img.data[i * 4 + 1];
    sum[l * 3 + 2] += img.data[i * 4 + 2];
    num[l]++;
  }
  const out = [];
  for (let c = 0; c < k; c++) out.push(num[c] ? [sum[c * 3] / num[c], sum[c * 3 + 1] / num[c], sum[c * 3 + 2] / num[c]] : [0, 0, 0]);
  return out;
}

export async function vectorize(img, options = {}, onProgress = () => {}) {
  const t0 = Date.now();
  const preset = DETAIL[options.detail || 'medium'];
  const maxShapes = Math.max(1, Math.round(options.maxShapes || preset.maxShapes));
  const smoothLevel = options.smooth ?? preset.smooth;
  const { width: w, height: h } = img;
  await onProgress(0.02, 'Menghaluskan gambar');
  await tick();
  const work = smoothLevel > 0 ? smoothImage(img, smoothLevel) : img;
  await onProgress(0.08, 'Kuantisasi warna');
  await tick();
  const { labels, palette } = quantize(work, Math.min(preset.k, Math.max(2, maxShapes)));
  const k = palette.length;
  await onProgress(0.15, 'Membersihkan bintik');
  await tick();
  const merged = despeckle(labels, w, h, preset.minArea);
  const stats = labelStats(labels, w, h, Math.max(k, 1));
  const colors = meanColors(work, labels, Math.max(k, 1));
  const order = [];
  for (let c = 0; c < k; c++) if (stats.area[c] > 0) order.push(c);
  order.sort((a, b) => stats.area[b] - stats.area[a]);
  const n = order.length;
  const rankOf = new Int16Array(Math.max(k, 1)).fill(-1);
  order.forEach((c, i) => (rankOf[c] = i));
  const rank = new Int16Array(w * h);
  for (let i = 0; i < w * h; i++) rank[i] = labels[i] < 0 ? -1 : rankOf[labels[i]];
  const opaqueRatio = stats.opaque / (w * h);
  const fullBase = n > 0 && opaqueRatio >= 0.999;
  const cand = [];
  for (let i = fullBase ? 1 : 0; i < n; i++) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let j = i; j < n; j++) {
      const c = order[j];
      if (stats.x0[c] < x0) x0 = stats.x0[c];
      if (stats.y0[c] < y0) y0 = stats.y0[c];
      if (stats.x1[c] > x1) x1 = stats.x1[c];
      if (stats.y1[c] > y1) y1 = stats.y1[c];
    }
    const mw = x1 - x0 + 1;
    const mh = y1 - y0 + 1;
    const mask = new Uint8Array(mw * mh);
    for (let y = 0; y < mh; y++) {
      const row = (y + y0) * w + x0;
      for (let x = 0; x < mw; x++) if (rank[row + x] >= i) mask[y * mw + x] = 1;
    }
    const groups = groupLoops(traceMask(mask, mw, mh, x0, y0));
    for (const g of groups) {
      if (g.area < preset.minLoop) continue;
      cand.push({ rank: i, g, area: g.area });
    }
    await onProgress(0.15 + (0.35 * (i + 1)) / n, 'Menelusuri lapisan ' + (i + 1) + '/' + n);
    await tick();
  }
  const base = cand.filter((c) => c.rank === 0);
  const rest = cand.filter((c) => c.rank !== 0).sort((a, b) => b.area - a.area);
  const budget = Math.max(0, maxShapes - base.length - (fullBase ? 1 : 0));
  const kept = new Set(base.concat(rest.slice(0, budget)));
  const dropped = cand.length - kept.size;
  const byRank = new Map();
  let done = 0;
  for (const c of cand) {
    if (!kept.has(c)) continue;
    const outer = fitOne(c.g.pts, preset);
    if (!outer) continue;
    const holes = [];
    for (const hl of c.g.holes) {
      if (hl.area < preset.minLoop) continue;
      const hp = fitOne(hl.pts, preset);
      if (hp) holes.push(hp);
    }
    const shape = { outer, holes };
    shape.bbox = polyBBox(flattenLoop(outer));
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank).push(shape);
    if (++done % 25 === 0) {
      await onProgress(0.5 + 0.48 * (done / kept.size), 'Mencocokkan kurva ' + done + '/' + kept.size);
      await tick();
    }
  }
  const layers = [];
  let seq = 0;
  let shapeTotal = 0;
  if (fullBase) {
    layers.push({
      id: ++seq,
      name: 'Background',
      kind: 'background',
      rgb: colors[order[0]].map(Math.round),
      visible: true,
      shapes: [{ outer: rectLoop(0, 0, w, h), holes: [] }]
    });
    shapeTotal++;
  }
  for (let i = 0; i < n; i++) {
    const shapes = byRank.get(i);
    if (!shapes || !shapes.length) continue;
    shapeTotal += shapes.length;
    layers.push({
      id: ++seq,
      name: 'Region ' + String(layers.length + 1).padStart(3, '0'),
      kind: 'region',
      rgb: colors[order[i]].map(Math.round),
      visible: true,
      shapes
    });
  }
  for (const L of layers) L.color = toHex(L.rgb);
  await onProgress(1, 'Selesai');
  return {
    layers,
    width: w,
    height: h,
    stats: {
      clusters: k,
      mergedSpeckles: merged,
      layers: layers.length,
      shapes: shapeTotal,
      dropped,
      ms: Date.now() - t0,
      opaqueRatio
    }
  };
}

function fitOne(pts, preset) {
  const fitted = fitLoop(pts, { eps: preset.eps, sigma: preset.sigma });
  if (fitted) return fitted;
  const poly = smoothPolygon(pts, preset.eps);
  return polygonToLoop(poly);
}
