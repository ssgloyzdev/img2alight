import { flattenLoop, polyBBox } from './curves.js';

export function shapePolys(shape) {
  if (!shape._polys) {
    shape._polys = [flattenLoop(shape.outer), ...shape.holes.map(flattenLoop)];
    shape.bbox = polyBBox(shape._polys[0]);
  }
  return shape._polys;
}

function fillShape(out, w, h, shape, r, g, b) {
  const polys = shapePolys(shape);
  const bb = shape.bbox;
  const yMin = Math.max(0, Math.floor(bb.y0 - 1));
  const yMax = Math.min(h - 1, Math.ceil(bb.y1 + 1));
  if (yMax < yMin) return;
  const rows = new Array(yMax - yMin + 1);
  for (const poly of polys) {
    const n = poly.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      let x1 = poly[i * 2], y1 = poly[i * 2 + 1], x2 = poly[j * 2], y2 = poly[j * 2 + 1];
      if (y1 === y2) continue;
      if (y1 > y2) {
        let t = x1;
        x1 = x2;
        x2 = t;
        t = y1;
        y1 = y2;
        y2 = t;
      }
      const ys = Math.max(yMin, Math.ceil(y1 - 0.5));
      const ye = Math.min(yMax, Math.ceil(y2 - 0.5) - 1);
      const k = (x2 - x1) / (y2 - y1);
      for (let y = ys; y <= ye; y++) {
        const x = x1 + (y + 0.5 - y1) * k;
        (rows[y - yMin] || (rows[y - yMin] = [])).push(x);
      }
    }
  }
  for (let ry = 0; ry < rows.length; ry++) {
    const xs = rows[ry];
    if (!xs) continue;
    xs.sort((a, b) => a - b);
    const y = ry + yMin;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(w - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
      for (let x = xa; x <= xb; x++) {
        const o = (y * w + x) * 4;
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = b;
        out[o + 3] = 255;
      }
    }
  }
}

export function rasterize(layers, w, h, soloId = null) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (const L of layers) {
    if (soloId !== null ? L.id !== soloId : !L.visible) continue;
    for (const s of L.shapes) fillShape(out, w, h, s, L.rgb[0], L.rgb[1], L.rgb[2]);
  }
  return out;
}
