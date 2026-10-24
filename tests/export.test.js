import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildProject, validateProject, validatePathD, fmt, FORMAT } from '../src/export/format.js';
import { parse, childrenOf } from '../src/export/xml.js';
import { vectorize } from '../src/core/vectorize.js';
import { rasterize } from '../src/core/raster.js';
import { compare } from '../src/core/metrics.js';
import { CATEGORIES, makeImage } from '../tools/synth.js';

const REF_DIR = process.env.REF_DIR || '/mnt/user-data/uploads';

test('format angka meniru gaya referensi', () => {
  assert.equal(fmt(-320), '-320.0');
  assert.equal(fmt(29.8097821), '29.81');
  assert.equal(fmt(-0.0001), '0.0');
  assert.throws(() => fmt(NaN));
});

test('validasi path', () => {
  assert.deepEqual(validatePathD('M 0.0 0.0L 1.0 1.0C 1 1, 2 2, 3 3Z'), []);
  assert.ok(validatePathD('L 1 1Z').length > 0);
  assert.ok(validatePathD('M 0 0L 1Z').length > 0);
  assert.ok(validatePathD('M 0 0L 1 1').length > 0);
  assert.ok(validatePathD('M 0 0L a bZ').length > 0);
});

test('file referensi asli lolos validator', { skip: !readdirSafe(REF_DIR).length }, () => {
  for (const f of readdirSafe(REF_DIR)) {
    const v = validateProject(readFileSync(REF_DIR + '/' + f, 'utf8'));
    assert.deepEqual(v.errors, [], f);
    assert.equal(v.shapeCount, 60);
  }
});

function readdirSafe(d) {
  try {
    return readdirSync(d).filter((f) => f.endsWith('.xml'));
  } catch {
    return [];
  }
}

async function project(name, detail = 'medium') {
  const img = CATEGORIES[name]();
  const res = await vectorize(img, { detail });
  const out = buildProject(res.layers, { width: res.width, height: res.height, title: name, baseId: 3900000000 });
  return { img, res, ...out };
}

test('semua kategori menghasilkan XML valid dengan id unik berurutan', async () => {
  for (const name of Object.keys(CATEGORIES)) {
    const { xml, shapeCount } = await project(name);
    const v = validateProject(xml);
    assert.deepEqual(v.errors, [], name);
    assert.equal(v.shapeCount, shapeCount);
    const root = parse(xml);
    const ids = childrenOf(root).map((n) => Number(n.attrs.id));
    for (let i = 1; i < ids.length; i++) assert.equal(ids[i], ids[i - 1] + 1);
  }
});

test('atribut scene sesuai template referensi', async () => {
  const { xml } = await project('logo');
  const a = parse(xml).attrs;
  for (const k of ['precompose', 'bgcolor', 'totalTime', 'fps', 'amver', 'ffver', 'am', 'amplatform', 'retime', 'retimeAdaptFPS']) {
    assert.equal(a[k], String(FORMAT.scene[k]), k);
  }
  assert.equal(a.width, a.exportWidth);
});

test('round trip: parse XML lalu bandingkan geometri dengan model', async () => {
  const { xml, res } = await project('potret-ilustrasi-sintetis', 'high');
  const root = parse(xml);
  const shapes = childrenOf(root, 'shape');
  const expected = res.layers.flatMap((l) => l.shapes.map(() => l));
  assert.equal(shapes.length, expected.length);
  shapes.forEach((s, i) => {
    const fill = childrenOf(s, 'fillColor')[0].attrs.value;
    const rgb = expected[i].rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
    assert.equal(fill, '#ff' + rgb);
  });
});

test('rekonstruksi mendekati gambar asli untuk gambar flat', async () => {
  const { img, res } = await project('ilustrasi-flat', 'high');
  const m = compare(img, rasterize(res.layers, res.width, res.height));
  assert.ok(m.ssim > 0.98, 'ssim ' + m.ssim);
  assert.ok(m.mae < 0.01, 'mae ' + m.mae);
});

test('PNG transparan mempertahankan siluet dan tanpa layer latar', async () => {
  const { img, res, xml } = await project('png-transparan', 'high');
  assert.ok(res.layers.every((l) => l.kind !== 'background'));
  const m = compare(img, rasterize(res.layers, res.width, res.height));
  assert.ok(m.silhouetteIoU > 0.98);
  assert.ok(validateProject(xml).ok);
});

test('lubang diekspor sebagai contour exclude', async () => {
  const { xml } = await project('png-transparan', 'high');
  assert.ok(xml.includes('exclude="true"'));
  assert.ok(validateProject(xml).ok);
});

test('validator menolak id duplikat', async () => {
  const { xml } = await project('logo');
  const ids = [...xml.matchAll(/ id="(\d+)"/g)].map((m) => m[1]);
  const bad = xml.replace(' id="' + ids[1] + '"', ' id="' + ids[0] + '"');
  const v = validateProject(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('duplikat')));
});

test('validator menolak struktur tidak didukung dan nilai rusak', async () => {
  const { xml } = await project('logo');
  assert.equal(validateProject(xml.replace('</scene>', '<video id="1" /></scene>')).ok, false);
  assert.equal(validateProject(xml.replace('#ff', '#zz')).ok, false);
  assert.equal(validateProject(xml.replace(/ d="M/, ' d="X')).ok, false);
  assert.equal(validateProject('bukan xml').ok, false);
  assert.equal(validateProject(xml.replace(/width="\d+"/, 'width="0"')).ok, false);
  assert.equal(validateProject(xml.replace(/endTime="\d+"/, 'endTime="0"')).ok, false);
});

test('layer tersembunyi tidak diekspor dan urutan terjaga', async () => {
  const img = CATEGORIES['ilustrasi-flat']();
  const res = await vectorize(img, { detail: 'medium' });
  res.layers[2].visible = false;
  const out = buildProject(res.layers, { width: res.width, height: res.height, baseId: 3900000000 });
  const labels = childrenOf(parse(out.xml), 'shape').map((s) => s.attrs.label);
  assert.ok(!labels.includes(res.layers[2].name));
  assert.equal(labels[0], 'Background');
});

test('input tidak valid: gambar kosong dan satu warna', async () => {
  const empty = makeImage(10, 10, () => [0, 0, 0, 0]);
  const r1 = await vectorize(empty, {});
  assert.equal(r1.layers.length, 0);
  const solid = makeImage(10, 10, () => [10, 20, 30]);
  const r2 = await vectorize(solid, {});
  assert.equal(r2.layers.length, 1);
  assert.equal(r2.layers[0].kind, 'background');
  const out = buildProject(r1.layers, { width: 10, height: 10 });
  assert.equal(validateProject(out.xml).shapeCount, 0);
});

test('batas bentuk maksimal dipatuhi dan hasil tetap valid', async () => {
  const img = CATEGORIES['lanskap-sintetis']();
  const res = await vectorize(img, { detail: 'high', maxShapes: 40 });
  const out = buildProject(res.layers, { width: res.width, height: res.height, baseId: 3900000000 });
  assert.ok(out.shapeCount <= 40, 'shape ' + out.shapeCount);
  assert.ok(validateProject(out.xml).ok);
  const m = compare(img, rasterize(res.layers, res.width, res.height));
  assert.ok(m.ssim > 0.5);
});

test('persegi menghasilkan garis lurus tanpa kurva', async () => {
  const { fitLoop } = await import('../src/core/fit.js');
  const loop = fitLoop([10, 10, 50, 10, 50, 40, 10, 40]);
  assert.ok(loop.segs.length <= 6);
  assert.ok(loop.segs.every((s) => s.t === 'L'));
});

test('lingkaran piksel menjadi sedikit kurva Bezier', async () => {
  const { fitLoop } = await import('../src/core/fit.js');
  const pts = [];
  const r = 30;
  const cells = new Set();
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) cells.add(x + ',' + y);
  const { traceMask } = await import('../src/core/trace.js');
  const mw = 2 * r + 1;
  const mask = new Uint8Array(mw * mw);
  for (let y = 0; y < mw; y++) for (let x = 0; x < mw; x++) if (cells.has(x - r + ',' + (y - r))) mask[y * mw + x] = 1;
  const loops = traceMask(mask, mw, mw, 0, 0);
  const loop = fitLoop(loops[0], { eps: 1, sigma: 1.5 });
  assert.ok(loop.segs.length < 30, 'segmen ' + loop.segs.length);
  assert.ok(loop.segs.some((s) => s.t === 'C'));
});
