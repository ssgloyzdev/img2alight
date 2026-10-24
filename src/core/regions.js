export function despeckle(labels, w, h, minArea) {
  const n = w * h;
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const sizes = [];
  const starts = [];
  const labs = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1) continue;
    const lab = labels[s];
    const cid = sizes.length;
    let sp = 0;
    let size = 0;
    stack[sp++] = s;
    comp[s] = cid;
    while (sp > 0) {
      const p = stack[--sp];
      size++;
      const x = p % w;
      if (x > 0 && comp[p - 1] === -1 && labels[p - 1] === lab) {
        comp[p - 1] = cid;
        stack[sp++] = p - 1;
      }
      if (x < w - 1 && comp[p + 1] === -1 && labels[p + 1] === lab) {
        comp[p + 1] = cid;
        stack[sp++] = p + 1;
      }
      if (p >= w && comp[p - w] === -1 && labels[p - w] === lab) {
        comp[p - w] = cid;
        stack[sp++] = p - w;
      }
      if (p < n - w && comp[p + w] === -1 && labels[p + w] === lab) {
        comp[p + w] = cid;
        stack[sp++] = p + w;
      }
    }
    sizes.push(size);
    starts.push(s);
    labs.push(lab);
  }
  const order = [];
  for (let c = 0; c < sizes.length; c++) if (labs[c] >= 0 && sizes[c] < minArea) order.push(c);
  order.sort((a, b) => sizes[a] - sizes[b]);
  let merged = 0;
  for (const cid of order) {
    const lab = labs[cid];
    const pixels = [];
    let sp = 0;
    stack[sp++] = starts[cid];
    const seen = new Set([starts[cid]]);
    while (sp > 0) {
      const p = stack[--sp];
      pixels.push(p);
      const x = p % w;
      const nbs = [];
      if (x > 0) nbs.push(p - 1);
      if (x < w - 1) nbs.push(p + 1);
      if (p >= w) nbs.push(p - w);
      if (p < n - w) nbs.push(p + w);
      for (const q of nbs) {
        if (comp[q] === cid && !seen.has(q)) {
          seen.add(q);
          stack[sp++] = q;
        }
      }
    }
    const counts = new Map();
    for (const p of pixels) {
      const x = p % w;
      const nbs = [];
      if (x > 0) nbs.push(p - 1);
      if (x < w - 1) nbs.push(p + 1);
      if (p >= w) nbs.push(p - w);
      if (p < n - w) nbs.push(p + w);
      for (const q of nbs) {
        const l = labels[q];
        if (l >= 0 && l !== lab) counts.set(l, (counts.get(l) || 0) + 1);
      }
    }
    let best = -1, bc = 0;
    for (const [l, c] of counts) {
      if (c > bc) {
        bc = c;
        best = l;
      }
    }
    if (best >= 0) {
      for (const p of pixels) labels[p] = best;
      merged++;
    }
  }
  return merged;
}

export function labelStats(labels, w, h, k) {
  const area = new Int32Array(k);
  const x0 = new Int32Array(k).fill(w);
  const y0 = new Int32Array(k).fill(h);
  const x1 = new Int32Array(k).fill(-1);
  const y1 = new Int32Array(k).fill(-1);
  let opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x];
      if (l < 0) continue;
      opaque++;
      area[l]++;
      if (x < x0[l]) x0[l] = x;
      if (x > x1[l]) x1[l] = x;
      if (y < y0[l]) y0[l] = y;
      if (y > y1[l]) y1[l] = y;
    }
  }
  return { area, x0, y0, x1, y1, opaque };
}
