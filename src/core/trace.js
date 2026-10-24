const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

export function loopArea(pts) {
  let a = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  return a / 2;
}

export function traceMask(mask, mw, mh, ox, oy) {
  const vw = mw + 1;
  const out = new Uint8Array(vw * (mh + 1));
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (!mask[y * mw + x]) continue;
      if (y === 0 || !mask[(y - 1) * mw + x]) out[y * vw + x] |= 1;
      if (x === mw - 1 || !mask[y * mw + x + 1]) out[y * vw + x + 1] |= 2;
      if (y === mh - 1 || !mask[(y + 1) * mw + x]) out[(y + 1) * vw + x + 1] |= 4;
      if (x === 0 || !mask[y * mw + x - 1]) out[(y + 1) * vw + x] |= 8;
    }
  }
  const loops = [];
  for (let vy = 0; vy <= mh; vy++) {
    for (let vx = 0; vx <= mw; vx++) {
      const v0 = vy * vw + vx;
      while (out[v0]) {
        const m = out[v0];
        let d = m & 1 ? 0 : m & 2 ? 1 : m & 4 ? 2 : 3;
        const pts = [];
        let x = vx, y = vy;
        for (;;) {
          pts.push(x + ox, y + oy);
          out[y * vw + x] &= ~(1 << d);
          x += DX[d];
          y += DY[d];
          if (x === vx && y === vy) break;
          const mm = out[y * vw + x];
          const a = (d + 1) & 3;
          const c = (d + 3) & 3;
          let nd = -1;
          if (mm & (1 << a)) nd = a;
          else if (mm & (1 << d)) nd = d;
          else if (mm & (1 << c)) nd = c;
          if (nd < 0) break;
          d = nd;
        }
        loops.push(pts);
      }
    }
  }
  return loops;
}

export function traceLabel(labels, w, h, label, box, dilate) {
  const pad = dilate ? 2 : 1;
  const x0 = Math.max(0, box.x0 - pad);
  const y0 = Math.max(0, box.y0 - pad);
  const x1 = Math.min(w, box.x1 + 1 + pad);
  const y1 = Math.min(h, box.y1 + 1 + pad);
  const mw = x1 - x0;
  const mh = y1 - y0;
  let mask = new Uint8Array(mw * mh);
  for (let y = 0; y < mh; y++) {
    const row = (y + y0) * w + x0;
    for (let x = 0; x < mw; x++) if (labels[row + x] === label) mask[y * mw + x] = 1;
  }
  if (dilate) {
    const d = mask.slice();
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (!mask[y * mw + x]) continue;
        if (x > 0) d[y * mw + x - 1] = 1;
        if (x < mw - 1) d[y * mw + x + 1] = 1;
        if (y > 0) d[(y - 1) * mw + x] = 1;
        if (y < mh - 1) d[(y + 1) * mw + x] = 1;
      }
    }
    mask = d;
  }
  return traceMask(mask, mw, mh, x0, y0);
}

export function pointInPolygon(px, py, pts) {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1];
    const xj = pts[j * 2], yj = pts[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function groupLoops(loops) {
  const outers = [];
  const holes = [];
  for (const pts of loops) {
    const a = loopArea(pts);
    if (a > 0) outers.push({ pts, area: a, holes: [] });
    else if (a < 0) holes.push({ pts, area: -a });
  }
  for (const o of outers) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < o.pts.length; i += 2) {
      if (o.pts[i] < x0) x0 = o.pts[i];
      if (o.pts[i] > x1) x1 = o.pts[i];
      if (o.pts[i + 1] < y0) y0 = o.pts[i + 1];
      if (o.pts[i + 1] > y1) y1 = o.pts[i + 1];
    }
    o.box = [x0, y0, x1, y1];
  }
  outers.sort((a, b) => a.area - b.area);
  for (const hole of holes) {
    const px = (hole.pts[0] + hole.pts[2]) / 2 + 0.0001;
    const py = (hole.pts[1] + hole.pts[3]) / 2 + 0.0001;
    for (const o of outers) {
      if (o.area <= hole.area) continue;
      if (px < o.box[0] || px > o.box[2] || py < o.box[1] || py > o.box[3]) continue;
      if (pointInPolygon(px, py, o.pts)) {
        o.holes.push(hole);
        break;
      }
    }
  }
  return outers;
}
