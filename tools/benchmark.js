import { writeFileSync, mkdirSync } from 'node:fs';
import { vectorize } from '../src/core/vectorize.js';
import { rasterize } from '../src/core/raster.js';
import { compare } from '../src/core/metrics.js';
import { buildProject, validateProject } from '../src/export/format.js';
import { CATEGORIES } from './synth.js';

mkdirSync('examples', { recursive: true });
const rows = [];
for (const detail of ['low', 'medium', 'high']) {
  for (const [name, make] of Object.entries(CATEGORIES)) {
    const img = make();
    const t0 = Date.now();
    const res = await vectorize(img, { detail });
    const recon = rasterize(res.layers, res.width, res.height);
    const m = compare(img, recon);
    const { xml, shapeCount } = buildProject(res.layers, { width: res.width, height: res.height, title: name });
    const v = validateProject(xml);
    rows.push({
      kategori: name,
      detail,
      ssim: +m.ssim.toFixed(4),
      mae: +m.mae.toFixed(4),
      deltaE: +m.deltaE.toFixed(2),
      edgeF1: +m.edgeF1.toFixed(3),
      iou: +m.silhouetteIoU.toFixed(3),
      layer: res.layers.length,
      shape: shapeCount,
      xmlKB: +(xml.length / 1024).toFixed(1),
      ms: Date.now() - t0,
      valid: v.ok
    });
    if (detail === 'medium') writeFileSync('examples/' + name + '.xml', xml);
  }
}
console.table(rows);
writeFileSync('examples/benchmark.json', JSON.stringify(rows, null, 2));
