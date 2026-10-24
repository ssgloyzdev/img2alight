import { quantize } from './quantize.js';
import { despeckle, labelStats } from './regions.js';
import { traceLabel, groupLoops } from './trace.js';
import { smoothPolygon, polygonToLoop, rectLoop, flattenLoop, polyBBox } from './curves.js';

export const DETAIL = {
  low: { k: 8, minArea: 20, eps: 1.5, minLoop: 12 },
  medium: { k: 16, minArea: 8, eps: 1.0, minLoop: 6 },
  high: { k: 32, minArea: 4, eps: 0.7, minLoop: 3 },
  ultra: { k: 56, minArea: 2, eps: 0.5, minLoop: 1.5 }
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
  const dilate = options.overlap === true;
  const { width: w, height: h } = img;
  await onProgress(0.02, 'Kuantisasi warna');
  await tick();
  const { labels, palette } = quantize(img, preset.k);
  const k = palette.length;
  await onProgress(0.15, 'Membersihkan bintik');
  await tick();
  const merged = despeckle(labels, w, h, preset.minArea);
  const stats = labelStats(labels, w, h, Math.max(k, 1));
  const colors = meanColors(img, labels, Math.max(k, 1));
  const order = [];
  for (let c = 0; c < k; c++) if (stats.area[c] > 0) order.push(c);
  order.sort((a, b) => stats.area[b] - stats.area[a]);
  const layers = [];
  let seq = 0;
  const opaqueRatio = stats.opaque / (w * h);
  let startIdx = 0;
  if (order.length && opaqueRatio >= 0.999) {
    const c = order[0];
    layers.push({
      id: ++seq,
      name: 'Background',
      kind: 'background',
      rgb: colors[c].map(Math.round),
      visible: true,
      shapes: [{ outer: rectLoop(0, 0, w, h), holes: [] }]
    });
    startIdx = 1;
  }
  let pathCount = 0;
  for (let oi = startIdx; oi < order.length; oi++) {
    const c = order[oi];
    const box = { x0: stats.x0[c], y0: stats.y0[c], x1: stats.x1[c], y1: stats.y1[c] };
    const loops = traceLabel(labels, w, h, c, box, dilate);
    const groups = groupLoops(loops);
    const shapes = [];
    for (const g of groups) {
      if (g.area < preset.minLoop) continue;
      const poly = smoothPolygon(g.pts, preset.eps);
      const outer = polygonToLoop(poly);
      if (!outer) continue;
      const holes = [];
      for (const hl of g.holes) {
        if (hl.area < preset.minLoop) continue;
        const hp = polygonToLoop(smoothPolygon(hl.pts, preset.eps));
        if (hp) holes.push(hp);
      }
      const shape = { outer, holes };
      shape.bbox = polyBBox(flattenLoop(outer));
      shapes.push(shape);
    }
    if (shapes.length) {
      pathCount += shapes.length;
      layers.push({
        id: ++seq,
        name: 'Region ' + String(layers.length + 1).padStart(3, '0'),
        kind: 'region',
        rgb: colors[c].map(Math.round),
        visible: true,
        shapes
      });
    }
    await onProgress(0.2 + (0.78 * (oi + 1)) / order.length, 'Menelusuri kontur ' + (oi + 1) + '/' + order.length);
    await tick();
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
      shapes: pathCount + (startIdx ? 1 : 0),
      ms: Date.now() - t0,
      opaqueRatio
    }
  };
}
