function collectSamples(img, maxSamples) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const step = Math.max(1, Math.floor(n / maxSamples));
  const out = [];
  for (let i = 0; i < n; i += step) {
    const o = i * 4;
    if (data[o + 3] >= 128) out.push(data[o], data[o + 1], data[o + 2]);
  }
  return Uint8Array.from(out);
}

function boxRange(S, idx) {
  let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0;
  for (let k = 0; k < idx.length; k++) {
    const o = idx[k] * 3;
    const r = S[o], g = S[o + 1], b = S[o + 2];
    if (r < r0) r0 = r;
    if (r > r1) r1 = r;
    if (g < g0) g0 = g;
    if (g > g1) g1 = g;
    if (b < b0) b0 = b;
    if (b > b1) b1 = b;
  }
  const dr = r1 - r0, dg = g1 - g0, db = b1 - b0;
  if (dr >= dg && dr >= db) return { ch: 0, range: dr };
  if (dg >= db) return { ch: 1, range: dg };
  return { ch: 2, range: db };
}

function medianCut(S, k) {
  const count = S.length / 3;
  let boxes = [Array.from({ length: count }, (_, i) => i)];
  while (boxes.length < k) {
    let best = -1, bestScore = 0, bestCh = 0;
    for (let b = 0; b < boxes.length; b++) {
      if (boxes[b].length < 2) continue;
      const r = boxRange(S, boxes[b]);
      const score = r.range * Math.sqrt(boxes[b].length);
      if (score > bestScore) {
        bestScore = score;
        best = b;
        bestCh = r.ch;
      }
    }
    if (best < 0 || bestScore === 0) break;
    const box = boxes[best];
    box.sort((a, b) => S[a * 3 + bestCh] - S[b * 3 + bestCh]);
    const mid = box.length >> 1;
    boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map((box) => {
    let r = 0, g = 0, b = 0;
    for (const i of box) {
      r += S[i * 3];
      g += S[i * 3 + 1];
      b += S[i * 3 + 2];
    }
    const c = box.length || 1;
    return [r / c, g / c, b / c];
  });
}

function kmeans(S, palette, iterations) {
  const count = S.length / 3;
  const k = palette.length;
  for (let it = 0; it < iterations; it++) {
    const sum = new Float64Array(k * 3);
    const num = new Int32Array(k);
    for (let i = 0; i < count; i++) {
      const r = S[i * 3], g = S[i * 3 + 1], b = S[i * 3 + 2];
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const p = palette[c];
        const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      sum[best * 3] += r;
      sum[best * 3 + 1] += g;
      sum[best * 3 + 2] += b;
      num[best]++;
    }
    for (let c = 0; c < k; c++) {
      if (num[c] > 0) palette[c] = [sum[c * 3] / num[c], sum[c * 3 + 1] / num[c], sum[c * 3 + 2] / num[c]];
    }
  }
  return palette;
}

export function quantize(img, k, iterations = 4) {
  const { data, width: w, height: h } = img;
  const S = collectSamples(img, 60000);
  const labels = new Int16Array(w * h).fill(-1);
  if (S.length === 0) return { labels, palette: [] };
  let palette = medianCut(S, k);
  palette = kmeans(S, palette, iterations);
  const cache = new Int16Array(1 << 18).fill(-2);
  const kk = palette.length;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (data[o + 3] < 128) continue;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let c = cache[key];
    if (c === -2) {
      let bd = Infinity;
      c = 0;
      for (let j = 0; j < kk; j++) {
        const p = palette[j];
        const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
        if (d < bd) {
          bd = d;
          c = j;
        }
      }
      cache[key] = c;
    }
    labels[i] = c;
  }
  return { labels, palette };
}
