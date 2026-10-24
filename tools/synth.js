export function makeImage(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y, w, h);
      const o = (y * w + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  return { width: w, height: h, data };
}

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const CATEGORIES = {
  'potret-ilustrasi-sintetis': () =>
    makeImage(320, 400, (x, y) => {
      if (inEllipse(x, y, 110, 175, 22, 14) || inEllipse(x, y, 210, 175, 22, 14)) {
        if (inCircle(x, y, 114, 172, 6) || inCircle(x, y, 214, 172, 6)) return [20, 20, 40];
        return [250, 250, 255];
      }
      if (inEllipse(x, y, 160, 270, 28, 8)) return [200, 80, 90];
      if (inEllipse(x, y, 160, 200, 95, 125)) return [250, 215, 190];
      if (inEllipse(x, y, 160, 150, 125, 150) && y < 260) return [60, 40, 90];
      if (y > 340) return [180, 60, 80];
      return [150, 200, 235];
    }),
  'ilustrasi-flat': () =>
    makeImage(400, 300, (x, y) => {
      if (inCircle(x, y, 300, 80, 36)) return [250, 210, 60];
      if (y > 200) return [60, 160, 90];
      if (x > 80 && x < 200 && y > 120 && y <= 200) {
        if (x > 120 && x < 150 && y > 150) return [90, 60, 40];
        return [220, 120, 80];
      }
      if (y > 90 && y <= 120 && x > 70 && x < 210 && y > 210 - (x - 70) * 0.9 - 80) return [140, 50, 50];
      return [140, 200, 240];
    }),
  logo: () =>
    makeImage(300, 300, (x, y) => {
      const d = Math.hypot(x - 150, y - 150);
      if (d < 40) return [255, 255, 255];
      if (d < 110) return [20, 90, 200];
      if (d < 130) return [255, 255, 255];
      return [255, 255, 255];
    }),
  'lanskap-sintetis': () => {
    const r = rng(7);
    return makeImage(400, 260, (x, y) => {
      const n = (r() - 0.5) * 14;
      const ridge = 120 + Math.sin(x / 30) * 25 + Math.sin(x / 11) * 6;
      if (y > ridge + 60) return [40 + n, 110 + n, 50 + n];
      if (y > ridge) return [90 + n, 90 + n, 100 + n];
      const t = y / ridge;
      return [90 + t * 120 + n, 140 + t * 90 + n, 220 + t * 20 + n];
    });
  },
  'png-transparan': () =>
    makeImage(300, 300, (x, y) => {
      if (inCircle(x, y, 150, 150, 100)) {
        if (inCircle(x, y, 150, 150, 40)) return [0, 0, 0, 0];
        return [230, 80, 60, 255];
      }
      return [0, 0, 0, 0];
    }),
  'gradien-detail-halus': () =>
    makeImage(360, 280, (x, y) => {
      const g = [40 + (x / 360) * 190, 60 + (y / 280) * 120, 200 - (x / 360) * 120];
      if ((x + y) % 23 < 2) return [255, 255, 255];
      if (inCircle(x, y, 180, 140, 50) && !inCircle(x, y, 180, 140, 44)) return [20, 20, 20];
      return g;
    })
};
