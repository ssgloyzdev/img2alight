export function dedupeCollinear(raw) {
  const n = raw.length / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n;
    const q = (i + 1) % n;
    const ax = raw[i * 2] - raw[p * 2], ay = raw[i * 2 + 1] - raw[p * 2 + 1];
    const bx = raw[q * 2] - raw[i * 2], by = raw[q * 2 + 1] - raw[i * 2 + 1];
    if (ax * by - ay * bx !== 0) pts.push([raw[i * 2], raw[i * 2 + 1]]);
  }
  return pts;
}

function segDist2(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx, y = a[1] + t * dy;
  return (p[0] - x) ** 2 + (p[1] - y) ** 2;
}

function rdpOpen(P, eps) {
  const n = P.length;
  if (n < 3) return P.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const e2 = eps * eps;
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(P[i], P[a], P[b]);
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    if (mi >= 0 && md > e2) {
      keep[mi] = 1;
      stack.push([a, mi], [mi, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(P[i]);
  return out;
}

function rdpClosed(P, eps) {
  const n = P.length;
  if (n <= 4) return P;
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) {
    const d = (P[i][0] - P[0][0]) ** 2 + (P[i][1] - P[0][1]) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = rdpOpen(P.slice(0, far + 1), eps);
  const b = rdpOpen(P.slice(far).concat([P[0]]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

export function smoothPolygon(raw, eps) {
  const corners = dedupeCollinear(raw);
  if (corners.length < 3) return [];
  return rdpClosed(corners, eps);
}

export function polygonToLoop(P, cornerDeg = 55) {
  const n = P.length;
  if (n < 3) return null;
  const corner = new Array(n);
  const tan = new Array(n);
  const cosT = Math.cos((cornerDeg * Math.PI) / 180);
  for (let i = 0; i < n; i++) {
    const p = P[(i + n - 1) % n], c = P[i], q = P[(i + 1) % n];
    const ax = c[0] - p[0], ay = c[1] - p[1];
    const bx = q[0] - c[0], by = q[1] - c[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const cos = la && lb ? (ax * bx + ay * by) / (la * lb) : 1;
    corner[i] = cos < cosT;
    const tx = q[0] - p[0], ty = q[1] - p[1];
    const tl = Math.hypot(tx, ty) || 1;
    tan[i] = [tx / tl, ty / tl];
  }
  const segs = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = P[i], b = P[j];
    if (corner[i] && corner[j]) {
      segs.push({ t: 'L', x: b[0], y: b[1] });
      continue;
    }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const c1 = corner[i]
      ? [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3]
      : [a[0] + (tan[i][0] * len) / 3, a[1] + (tan[i][1] * len) / 3];
    const c2 = corner[j]
      ? [b[0] - (b[0] - a[0]) / 3, b[1] - (b[1] - a[1]) / 3]
      : [b[0] - (tan[j][0] * len) / 3, b[1] - (tan[j][1] * len) / 3];
    segs.push({ t: 'C', x1: c1[0], y1: c1[1], x2: c2[0], y2: c2[1], x: b[0], y: b[1] });
  }
  return { sx: P[0][0], sy: P[0][1], segs };
}

export function rectLoop(x0, y0, x1, y1) {
  return {
    sx: x0,
    sy: y0,
    segs: [
      { t: 'L', x: x1, y: y0 },
      { t: 'L', x: x1, y: y1 },
      { t: 'L', x: x0, y: y1 },
      { t: 'L', x: x0, y: y0 }
    ]
  };
}

export function flattenLoop(loop) {
  const out = [loop.sx, loop.sy];
  let cx = loop.sx, cy = loop.sy;
  for (const s of loop.segs) {
    if (s.t === 'L') {
      out.push(s.x, s.y);
    } else {
      const len = Math.hypot(s.x1 - cx, s.y1 - cy) + Math.hypot(s.x2 - s.x1, s.y2 - s.y1) + Math.hypot(s.x - s.x2, s.y - s.y2);
      const steps = Math.max(2, Math.min(24, Math.ceil(len / 3)));
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, u = 1 - t;
        const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        out.push(a * cx + b * s.x1 + c * s.x2 + d * s.x, a * cy + b * s.y1 + c * s.y2 + d * s.y);
      }
    }
    cx = s.x;
    cy = s.y;
  }
  return out;
}

export function polyBBox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    if (poly[i] < x0) x0 = poly[i];
    if (poly[i] > x1) x1 = poly[i];
    if (poly[i + 1] < y0) y0 = poly[i + 1];
    if (poly[i + 1] > y1) y1 = poly[i + 1];
  }
  return { x0, y0, x1, y1 };
}
