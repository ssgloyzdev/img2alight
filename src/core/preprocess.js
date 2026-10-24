export function fitSize(w, h, maxDim) {
  const s = Math.min(1, maxDim / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

export function borderColor(img) {
  const { data, width: w, height: h } = img;
  const rs = [], gs = [], bs = [];
  const add = (x, y) => {
    const o = (y * w + x) * 4;
    if (data[o + 3] >= 128) {
      rs.push(data[o]);
      gs.push(data[o + 1]);
      bs.push(data[o + 2]);
    }
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    add(0, y);
    add(w - 1, y);
  }
  if (!rs.length) return null;
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

export function removeBackground(img, tolerance = 40) {
  const { width: w, height: h } = img;
  const data = new Uint8ClampedArray(img.data);
  const bc = borderColor(img);
  if (!bc) return { width: w, height: h, data, removed: 0 };
  const t2 = tolerance * tolerance;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const match = (p) => {
    const o = p * 4;
    if (data[o + 3] < 128) return true;
    return (data[o] - bc[0]) ** 2 + (data[o + 1] - bc[1]) ** 2 + (data[o + 2] - bc[2]) ** 2 <= t2;
  };
  const push = (p) => {
    if (!seen[p] && match(p)) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  let removed = 0;
  while (stack.length) {
    const p = stack.pop();
    data[p * 4 + 3] = 0;
    removed++;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * h - w) push(p + w);
  }
  return { width: w, height: h, data, removed };
}

export function compositeOnBlack(img) {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    out[i * 4] = data[i * 4] * a;
    out[i * 4 + 1] = data[i * 4 + 1] * a;
    out[i * 4 + 2] = data[i * 4 + 2] * a;
    out[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data: out };
}
