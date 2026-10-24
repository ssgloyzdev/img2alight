import { compositeOnBlack } from './preprocess.js';

const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function lab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function luma(data, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return out;
}

function ssim(a, b, w, h) {
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  const win = 8;
  let total = 0, count = 0;
  for (let y = 0; y + win <= h; y += win) {
    for (let x = 0; x + win <= w; x += win) {
      let ma = 0, mb = 0;
      for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) {
        ma += a[(y + j) * w + x + i];
        mb += b[(y + j) * w + x + i];
      }
      const N = win * win;
      ma /= N;
      mb /= N;
      let va = 0, vb = 0, cov = 0;
      for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) {
        const da = a[(y + j) * w + x + i] - ma, db = b[(y + j) * w + x + i] - mb;
        va += da * da;
        vb += db * db;
        cov += da * db;
      }
      va /= N - 1;
      vb /= N - 1;
      cov /= N - 1;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  }
  return count ? total / count : 1;
}

function edges(l, w, h, thr) {
  const e = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -l[i - w - 1] - 2 * l[i - 1] - l[i + w - 1] + l[i - w + 1] + 2 * l[i + 1] + l[i + w + 1];
      const gy = -l[i - w - 1] - 2 * l[i - w] - l[i - w + 1] + l[i + w - 1] + 2 * l[i + w] + l[i + w + 1];
      if (Math.hypot(gx, gy) > thr) e[i] = 1;
    }
  }
  return e;
}

function dilate(m, w, h) {
  const d = m.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    if (x > 0) d[y * w + x - 1] = 1;
    if (x < w - 1) d[y * w + x + 1] = 1;
    if (y > 0) d[(y - 1) * w + x] = 1;
    if (y < h - 1) d[(y + 1) * w + x] = 1;
  }
  return d;
}

export function compare(orig, recon) {
  const { width: w, height: h } = orig;
  const n = w * h;
  const A = compositeOnBlack(orig).data;
  const B = compositeOnBlack({ width: w, height: h, data: recon }).data;
  let abs = 0, de = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    abs += Math.abs(A[o] - B[o]) + Math.abs(A[o + 1] - B[o + 1]) + Math.abs(A[o + 2] - B[o + 2]);
    const la = lab(A[o], A[o + 1], A[o + 2]);
    const lb = lab(B[o], B[o + 1], B[o + 2]);
    de += Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
  }
  const la = luma(A, n), lb = luma(B, n);
  const ea = edges(la, w, h, 100), eb = edges(lb, w, h, 100);
  const da = dilate(ea, w, h), db = dilate(eb, w, h);
  let na = 0, nb = 0, hitB = 0, hitA = 0;
  for (let i = 0; i < n; i++) {
    if (ea[i]) {
      na++;
      if (db[i]) hitA++;
    }
    if (eb[i]) {
      nb++;
      if (da[i]) hitB++;
    }
  }
  const precision = nb ? hitB / nb : 1;
  const recall = na ? hitA / na : 1;
  const edgeF1 = na === 0 && nb === 0 ? 1 : precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  let inter = 0, uni = 0;
  for (let i = 0; i < n; i++) {
    const p = orig.data[i * 4 + 3] >= 128;
    const q = recon[i * 4 + 3] >= 128;
    if (p && q) inter++;
    if (p || q) uni++;
  }
  return {
    ssim: ssim(la, lb, w, h),
    mae: abs / (n * 3 * 255),
    deltaE: de / n,
    edgeF1,
    silhouetteIoU: uni ? inter / uni : 1
  };
}
