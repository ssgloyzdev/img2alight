import { dedupeCollinear } from './curves.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l] : [0, 0];
};

function bezierAt(b, t) {
  const u = 1 - t;
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  return [w0 * b[0][0] + w1 * b[1][0] + w2 * b[2][0] + w3 * b[3][0], w0 * b[0][1] + w1 * b[1][1] + w2 * b[2][1] + w3 * b[3][1]];
}

function bezierD1(b, t) {
  const u = 1 - t;
  return [
    3 * u * u * (b[1][0] - b[0][0]) + 6 * u * t * (b[2][0] - b[1][0]) + 3 * t * t * (b[3][0] - b[2][0]),
    3 * u * u * (b[1][1] - b[0][1]) + 6 * u * t * (b[2][1] - b[1][1]) + 3 * t * t * (b[3][1] - b[2][1])
  ];
}

function bezierD2(b, t) {
  const u = 1 - t;
  return [
    6 * u * (b[2][0] - 2 * b[1][0] + b[0][0]) + 6 * t * (b[3][0] - 2 * b[2][0] + b[1][0]),
    6 * u * (b[2][1] - 2 * b[1][1] + b[0][1]) + 6 * t * (b[3][1] - 2 * b[2][1] + b[1][1])
  ];
}

function chordParam(P, a, b) {
  const u = [0];
  for (let i = a + 1; i <= b; i++) u.push(u[u.length - 1] + len(sub(P[i], P[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

function generate(P, a, b, u, t1, t2) {
  const p0 = P[a], p3 = P[b];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i <= b - a; i++) {
    const t = u[i], s = 1 - t;
    const b0 = s * s * s, b1 = 3 * t * s * s, b2 = 3 * t * t * s, b3 = t * t * t;
    const a1 = mul(t1, b1), a2 = mul(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(P[a + i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let al = det ? (x0 * c11 - x1 * c01) / det : 0;
  let ar = det ? (c00 * x1 - c01 * x0) / det : 0;
  const seg = len(sub(p3, p0));
  if (al < 1e-6 * seg || ar < 1e-6 * seg) al = ar = seg / 3;
  return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3];
}

function maxError(P, a, b, bez, u) {
  let md = 0, mi = Math.floor((b - a + 1) / 2) + a;
  for (let i = 1; i < b - a; i++) {
    const d = sub(bezierAt(bez, u[i]), P[a + i]);
    const e = dot(d, d);
    if (e > md) {
      md = e;
      mi = a + i;
    }
  }
  return [md, mi];
}

function reparam(P, a, b, u, bez) {
  return u.map((t, i) => {
    const d = sub(bezierAt(bez, t), P[a + i]);
    const q1 = bezierD1(bez, t), q2 = bezierD2(bez, t);
    const den = dot(q1, q1) + dot(d, q2);
    return den ? Math.max(0, Math.min(1, t - dot(d, q1) / den)) : t;
  });
}

function fitCubic(P, a, b, t1, t2, err, out, depth = 0) {
  if (b - a === 1) {
    const d = len(sub(P[b], P[a])) / 3;
    out.push([P[a], add(P[a], mul(t1, d)), add(P[b], mul(t2, d)), P[b]]);
    return;
  }
  let u = chordParam(P, a, b);
  let bez = generate(P, a, b, u, t1, t2);
  let [e, split] = maxError(P, a, b, bez, u);
  const e2 = err * err;
  if (e < e2) {
    out.push(bez);
    return;
  }
  if (e < e2 * 16) {
    for (let k = 0; k < 4; k++) {
      u = reparam(P, a, b, u, bez);
      bez = generate(P, a, b, u, t1, t2);
      [e, split] = maxError(P, a, b, bez, u);
      if (e < e2) {
        out.push(bez);
        return;
      }
    }
  }
  if (depth > 24 || split <= a || split >= b) {
    out.push(bez);
    return;
  }
  const tc = unit(sub(P[split - 1], P[split + 1]));
  fitCubic(P, a, split, t1, tc, err, out, depth + 1);
  fitCubic(P, split, b, mul(tc, -1), t2, err, out, depth + 1);
}

function densify(V) {
  const D = [];
  const vidx = [];
  const n = V.length;
  for (let i = 0; i < n; i++) {
    const a = V[i], b = V[(i + 1) % n];
    const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    vidx.push(D.length);
    for (let s = 0; s < steps; s++) D.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]);
  }
  return { D, vidx };
}

function kernel(sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const w = [];
  for (let i = 0; i <= r; i++) w.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  return { r, w };
}

function smoothClosed(D, sigma) {
  const n = D.length;
  const { r, w } = kernel(sigma);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, sw = 0;
    for (let k = -r; k <= r; k++) {
      const p = D[(((i + k) % n) + n) % n];
      const ww = w[Math.abs(k)];
      sx += p[0] * ww;
      sy += p[1] * ww;
      sw += ww;
    }
    out[i] = [sx / sw, sy / sw];
  }
  return out;
}

function smoothOpen(Q, sigma) {
  const n = Q.length;
  const { r, w } = kernel(sigma);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const rad = Math.min(r, i, n - 1 - i);
    let sx = 0, sy = 0, sw = 0;
    for (let k = -rad; k <= rad; k++) {
      const p = Q[i + k];
      const ww = w[Math.abs(k)];
      sx += p[0] * ww;
      sy += p[1] * ww;
      sw += ww;
    }
    out[i] = [sx / sw, sy / sw];
  }
  return out;
}

function findCorners(S, vidx, cornerDeg) {
  const n = S.length;
  const k = 4;
  if (n < 3 * k) return [];
  const cosT = Math.cos((cornerDeg * Math.PI) / 180);
  const turn = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = sub(S[i], S[(i - k + n) % n]);
    const b = sub(S[(i + k) % n], S[i]);
    const la = len(a), lb = len(b);
    turn[i] = la && lb ? dot(a, b) / (la * lb) : 1;
  }
  const picks = [];
  for (let i = 0; i < n; i++) {
    if (turn[i] >= cosT) continue;
    let best = true;
    for (let d = -k; d <= k; d++) {
      const j = (i + d + n) % n;
      if (turn[j] < turn[i] || (turn[j] === turn[i] && d < 0)) {
        best = false;
        break;
      }
    }
    if (best) picks.push(i);
  }
  const snapped = new Set();
  for (const i of picks) {
    let bi = -1, bd = Infinity;
    for (const v of vidx) {
      const d = Math.min(Math.abs(v - i), n - Math.abs(v - i));
      if (d < bd) {
        bd = d;
        bi = v;
      }
    }
    if (bd <= 4) snapped.add(bi);
  }
  return [...snapped].sort((a, b) => a - b);
}

function toSegs(beziers) {
  const segs = [];
  for (const b of beziers) {
    const chord = sub(b[3], b[0]);
    const cl = len(chord);
    const dev = (p) => (cl > 1e-9 ? Math.abs(chord[0] * (p[1] - b[0][1]) - chord[1] * (p[0] - b[0][0])) / cl : len(sub(p, b[0])));
    if (dev(b[1]) < 0.2 && dev(b[2]) < 0.2) segs.push({ t: 'L', x: b[3][0], y: b[3][1] });
    else segs.push({ t: 'C', x1: b[1][0], y1: b[1][1], x2: b[2][0], y2: b[2][1], x: b[3][0], y: b[3][1] });
  }
  return segs;
}

export function fitLoop(raw, opts = {}) {
  const { eps = 1, sigma = 1.2, cornerDeg = 50 } = opts;
  const V = dedupeCollinear(raw);
  if (V.length < 3) return null;
  const { D, vidx } = densify(V);
  const n = D.length;
  if (n < 12) return null;
  const S = smoothClosed(D, Math.max(1.2, sigma));
  const corners = findCorners(S, vidx, cornerDeg);
  const beziers = [];
  if (corners.length === 0) {
    const Q = smoothClosed(D, sigma);
    const pts = Q.concat([Q[0]]);
    const t1 = unit(sub(Q[1], Q[n - 1]));
    fitCubic(pts, 0, n, t1, mul(t1, -1), eps, beziers);
    return { sx: Q[0][0], sy: Q[0][1], segs: toSegs(beziers) };
  }
  const startPt = D[corners[0]];
  for (let c = 0; c < corners.length; c++) {
    const ia = corners[c];
    const ib = corners[(c + 1) % corners.length];
    const seg = [];
    let i = ia;
    for (;;) {
      seg.push(D[i]);
      if (i === ib && seg.length > 1) break;
      i = (i + 1) % n;
      if (seg.length > n + 1) break;
    }
    if (corners.length === 1 && seg.length < 2) continue;
    const Q = seg.length > 2 ? smoothOpen(seg, sigma) : seg;
    const m = Q.length;
    if (m <= 2) {
      beziers.push([Q[0], Q[0], Q[m - 1], Q[m - 1]]);
      continue;
    }
    const k = Math.min(3, m - 1);
    const t1 = unit(sub(Q[k], Q[0]));
    const t2 = unit(sub(Q[m - 1 - k], Q[m - 1]));
    fitCubic(Q, 0, m - 1, t1, t2, eps, beziers);
  }
  if (!beziers.length) return null;
  return { sx: startPt[0], sy: startPt[1], segs: toSegs(beziers) };
}
