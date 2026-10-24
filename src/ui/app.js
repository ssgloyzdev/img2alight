import { vectorize, toHex, hexToRgb } from '../core/vectorize.js';
import { fitSize, removeBackground } from '../core/preprocess.js';
import { rasterize } from '../core/raster.js';
import { compare } from '../core/metrics.js';
import { buildProject, validateProject, FORMAT } from '../export/format.js';
import { makeZip } from '../export/zip.js';

const $ = (id) => document.getElementById(id);
const state = {
  name: 'gambar',
  source: null,
  img: null,
  result: null,
  solo: null,
  view: 'orig',
  busy: false,
  timer: 0,
  xml: '',
  validation: null,
  metrics: null
};

const DETAIL_HINT = {
  low: 'Cepat dan ringan: bentuk kecil disederhanakan.',
  medium: 'Seimbang antara fidelitas dan ukuran file.',
  high: 'Lebih setia, jumlah layer dan ukuran XML naik tajam.',
  ultra: 'Peringatan: bisa menghasilkan ribuan layer dan file besar; editor dan perangkat bisa lambat.'
};

function setStatus(text, progress) {
  $('statusText').textContent = text;
  if (progress !== undefined) {
    const p = Math.round(progress * 100);
    $('fill').style.width = p + '%';
    $('bar').setAttribute('aria-valuenow', String(p));
  }
}

function fmtNum(v, d = 4) {
  return Number.isFinite(v) ? v.toFixed(d) : '-';
}

function baseName(file) {
  const n = file.name.replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 60);
  return n || 'gambar';
}

async function loadFile(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
    setStatus('Format tidak didukung. Gunakan PNG, JPG, atau WebP.', 0);
    return;
  }
  setStatus('Memuat gambar', 0.05);
  try {
    const bmp = await createImageBitmap(file);
    state.source = bmp;
    state.name = baseName(file);
    $('projectName').textContent = file.name;
    state.result = null;
    state.solo = null;
    prepare();
    $('convert').disabled = false;
    setStatus('Gambar dimuat. Tekan Konversi.', 0);
  } catch (e) {
    setStatus('Gagal membaca gambar: ' + e.message, 0);
  }
}

function prepare() {
  const bmp = state.source;
  if (!bmp) return;
  const maxDim = Math.max(64, Math.min(2048, Number($('maxDim').value) || 720));
  const { width, height } = fitSize(bmp.width, bmp.height, maxDim);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, width, height);
  const d = ctx.getImageData(0, 0, width, height);
  let img = { width, height, data: new Uint8ClampedArray(d.data) };
  if ($('removeBg').checked) {
    const r = removeBackground(img, Number($('bgTol').value));
    img = { width, height, data: r.data };
  }
  state.img = img;
  drawImage($('canvasA'), img);
  $('canvasB').width = width;
  $('canvasB').height = height;
  $('canvasB').getContext('2d').clearRect(0, 0, width, height);
  $('viewport').classList.add('has-image');
  $('dims').textContent = width + ' x ' + height + ' px';
}

function drawImage(canvas, img) {
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
}

async function convert() {
  if (!state.img || state.busy) return;
  state.busy = true;
  document.body.classList.add('busy');
  $('convert').disabled = true;
  try {
    prepare();
    const detail = $('detail').value;
    const t0 = performance.now();
    const res = await vectorize(state.img, { detail, overlap: $('overlap').checked }, async (p, msg) => {
      setStatus(msg, p);
      await new Promise((r) => setTimeout(r, 0));
    });
    state.result = res;
    state.solo = null;
    setStatus('Selesai dalam ' + ((performance.now() - t0) / 1000).toFixed(1) + ' dtk', 1);
    refresh(true);
    selectView('side');
  } catch (e) {
    setStatus('Konversi gagal: ' + e.message, 0);
  } finally {
    state.busy = false;
    document.body.classList.remove('busy');
    $('convert').disabled = false;
  }
}

function renderRecon() {
  const r = state.result;
  if (!r) return null;
  const data = rasterize(r.layers, r.width, r.height, state.solo);
  const c = $('canvasB');
  c.width = r.width;
  c.height = r.height;
  c.getContext('2d').putImageData(new ImageData(data, r.width, r.height), 0, 0);
  return data;
}

function refresh(immediateMetrics) {
  renderRecon();
  renderLayers();
  clearTimeout(state.timer);
  state.timer = setTimeout(updateMetricsAndXml, immediateMetrics ? 0 : 250);
}

function updateMetricsAndXml() {
  const r = state.result;
  if (!r) return;
  const data = rasterize(r.layers, r.width, r.height);
  state.metrics = compare(state.img, data);
  const m = state.metrics;
  const rows = [
    ['SSIM', fmtNum(m.ssim)],
    ['MAE', fmtNum(m.mae)],
    ['Selisih warna (dE76)', fmtNum(m.deltaE, 2)],
    ['Kemiripan tepi (F1)', fmtNum(m.edgeF1)],
    ['IoU siluet', fmtNum(m.silhouetteIoU)],
    ['Jumlah layer', String(r.layers.length)]
  ];
  const dl = $('metrics');
  dl.textContent = '';
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }
  const out = buildProject(r.layers, { width: r.width, height: r.height, title: state.name });
  state.xml = out.xml;
  state.validation = validateProject(out.xml);
  const v = state.validation;
  const kb = (new TextEncoder().encode(out.xml).length / 1024).toFixed(0);
  $('validation').textContent = 'Validasi struktur: ' + (v.ok ? 'lolos' : 'GAGAL (' + v.errors.length + ' galat)') + ' | ' + out.shapeCount + ' shape | ' + kb + ' KB';
  for (const id of ['dlXml', 'dlZip', 'dlPng', 'dlManifest', 'exportTop']) $(id).disabled = !v.ok || out.shapeCount === 0;
  renderCompat();
}

function renderCompat() {
  const box = $('compat');
  box.textContent = '';
  const p = document.createElement('p');
  p.className = 'note';
  p.textContent = 'Belum diuji di Alight Motion. Validasi di sini hanya memeriksa struktur terhadap 5 file referensi.';
  box.append(p);
  const h1 = document.createElement('p');
  h1.className = 'hint';
  h1.textContent = 'Terverifikasi dari referensi:';
  const u1 = document.createElement('ul');
  u1.className = 'compat-list';
  for (const t of FORMAT.verified) {
    const li = document.createElement('li');
    li.textContent = t;
    u1.append(li);
  }
  const h2 = document.createElement('p');
  h2.className = 'hint';
  h2.textContent = 'Tidak terverifikasi / tidak didukung:';
  const u2 = document.createElement('ul');
  u2.className = 'compat-list';
  for (const t of FORMAT.unverified) {
    const li = document.createElement('li');
    li.textContent = t;
    u2.append(li);
  }
  box.append(h1, u1, h2, u2);
  const v = state.validation;
  if (v && v.errors.length) {
    const e = document.createElement('p');
    e.className = 'note';
    e.textContent = 'Galat: ' + v.errors.slice(0, 5).join('; ');
    box.append(e);
  }
}

function btn(label, title, onClick, toggled) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn small' + (toggled ? ' toggled' : '');
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', onClick);
  return b;
}

function renderLayers() {
  const r = state.result;
  const list = $('layerList');
  list.textContent = '';
  $('layerCount').textContent = '(' + (r ? r.layers.length : 0) + ')';
  if (!r) return;
  const layers = r.layers;
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    const li = document.createElement('li');
    li.className = 'layer-item' + (state.solo === L.id ? ' solo' : '') + (L.visible ? '' : ' hidden-layer');

    const row1 = document.createElement('div');
    row1.className = 'layer-row';
    const vis = document.createElement('input');
    vis.type = 'checkbox';
    vis.checked = L.visible;
    vis.setAttribute('aria-label', 'Tampilkan ' + L.name);
    vis.addEventListener('change', () => {
      L.visible = vis.checked;
      refresh();
    });
    const name = document.createElement('input');
    name.type = 'text';
    name.value = L.name;
    name.className = 'layer-name';
    name.setAttribute('aria-label', 'Nama layer');
    name.addEventListener('change', () => {
      L.name = name.value.trim() || L.name;
      name.value = L.name;
      refresh();
    });
    const color = document.createElement('input');
    color.type = 'color';
    color.value = toHex(L.rgb);
    color.setAttribute('aria-label', 'Warna ' + L.name);
    color.addEventListener('input', () => {
      L.rgb = hexToRgb(color.value);
      L.color = color.value;
      renderRecon();
      clearTimeout(state.timer);
      state.timer = setTimeout(updateMetricsAndXml, 300);
    });
    row1.append(vis, name, color);

    const row2 = document.createElement('div');
    row2.className = 'layer-row';
    row2.append(
      btn('Naik', 'Naikkan layer', () => move(i, 1)),
      btn('Turun', 'Turunkan layer', () => move(i, -1)),
      btn('Solo', 'Pratinjau layer ini saja', () => {
        state.solo = state.solo === L.id ? null : L.id;
        refresh();
      }, state.solo === L.id),
      btn('Gabung', 'Gabungkan ke layer di bawahnya', () => mergeDown(i)),
      btn('Hapus', 'Hapus layer', () => remove(i))
    );

    const meta = document.createElement('div');
    meta.className = 'layer-meta';
    meta.textContent = L.shapes.length + ' bentuk | ' + toHex(L.rgb).toUpperCase();
    li.append(row1, row2, meta);
    list.append(li);
  }
}

function move(i, dir) {
  const layers = state.result.layers;
  const j = i + dir;
  if (j < 0 || j >= layers.length) return;
  [layers[i], layers[j]] = [layers[j], layers[i]];
  refresh();
}

function mergeDown(i) {
  const layers = state.result.layers;
  if (i <= 0) {
    setStatus('Tidak ada layer di bawahnya untuk digabung.');
    return;
  }
  const target = layers[i - 1];
  target.shapes = target.shapes.concat(layers[i].shapes);
  if (target.kind === 'background') target.kind = 'region';
  layers.splice(i, 1);
  if (state.solo === layers[i]?.id) state.solo = null;
  refresh();
}

function remove(i) {
  const layers = state.result.layers;
  if (state.solo === layers[i].id) state.solo = null;
  layers.splice(i, 1);
  refresh();
}

function selectView(v) {
  state.view = v;
  $('viewport').dataset.view = v;
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.view === v;
    t.classList.toggle('selected', on);
    t.setAttribute('aria-selected', String(on));
  });
  $('overlayControl').hidden = v !== 'overlay';
}

function setClip() {
  $('viewport').style.setProperty('--clip', 100 - Number($('overlayRange').value) + '%');
}

function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function manifest() {
  const r = state.result;
  return JSON.stringify(
    {
      generator: 'Image2Alight',
      source: state.name,
      mode: 'vector',
      detail: $('detail').value,
      canvas: { width: r.width, height: r.height },
      metrics: state.metrics,
      validation: { ok: state.validation.ok, errors: state.validation.errors },
      notTestedInAlightMotion: true,
      unverified: FORMAT.unverified,
      layers: r.layers.map((L, i) => ({
        order: i,
        id: L.id,
        name: L.name,
        kind: L.kind,
        color: toHex(L.rgb),
        visible: L.visible,
        shapes: L.shapes.length
      }))
    },
    null,
    2
  );
}

function previewBlob() {
  return new Promise((res) => $('canvasB').toBlob(res, 'image/png'));
}

async function exportZip() {
  const solo = state.solo;
  state.solo = null;
  renderRecon();
  const png = new Uint8Array(await (await previewBlob()).arrayBuffer());
  state.solo = solo;
  renderRecon();
  const zip = makeZip([
    { name: state.name + '.xml', data: state.xml },
    { name: state.name + '_preview.png', data: png },
    { name: state.name + '_manifest.json', data: manifest() }
  ]);
  download(state.name + '_image2alight.zip', zip, 'application/zip');
}

async function exportPng() {
  const solo = state.solo;
  state.solo = null;
  renderRecon();
  const blob = await previewBlob();
  state.solo = solo;
  renderRecon();
  download(state.name + '_preview.png', blob, 'image/png');
}

function bind() {
  const drop = $('dropzone');
  $('fileInput').addEventListener('change', (e) => loadFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('drag');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
    })
  );
  drop.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
  $('detail').addEventListener('change', () => {
    $('detailHint').textContent = DETAIL_HINT[$('detail').value];
  });
  for (const id of ['maxDim', 'removeBg', 'bgTol']) {
    $(id).addEventListener('change', () => {
      if (state.source && !state.busy) {
        state.result = null;
        prepare();
        renderLayers();
        setStatus('Pengaturan berubah. Tekan Konversi.', 0);
      }
    });
  }
  $('convert').addEventListener('click', convert);
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => selectView(t.dataset.view)));
  $('overlayRange').addEventListener('input', setClip);
  const xmlDl = () => download(state.name + '.xml', state.xml, 'application/xml');
  $('dlXml').addEventListener('click', xmlDl);
  $('exportTop').addEventListener('click', xmlDl);
  $('dlZip').addEventListener('click', exportZip);
  $('dlPng').addEventListener('click', exportPng);
  $('dlManifest').addEventListener('click', () => download(state.name + '_manifest.json', manifest(), 'application/json'));
  const mq = window.matchMedia('(max-width: 900px)');
  const collapse = () => {
    document.querySelectorAll('details.panel').forEach((d, i) => {
      if (mq.matches && i > 1) d.removeAttribute('open');
      else if (!mq.matches) d.setAttribute('open', '');
    });
  };
  mq.addEventListener('change', collapse);
  collapse();
  setClip();
  renderCompat();
}

bind();
