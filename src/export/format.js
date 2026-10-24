import { el, serialize, parse, childrenOf } from './xml.js';
import { polyBBox, flattenLoop } from '../core/curves.js';

export const FORMAT = {
  rootTag: 'scene',
  scene: {
    precompose: 'dynamicResolution',
    bgcolor: '#00000000',
    totalTime: 2015,
    fps: 60,
    amver: '1028425',
    ffver: '106',
    am: 'com.alightcreative.motion/5.0.273.1028425',
    amplatform: 'android',
    retime: 'freeze',
    retimeAdaptFPS: 'false'
  },
  shapeAttrs: ['id', 'label', 'startTime', 'endTime', 'fillType', 'mediaFillMode'],
  fillTypes: ['color', 'none'],
  verified: [
    'Elemen akar <scene> dengan atribut metadata (title, width, height, exportWidth, exportHeight, precompose, bgcolor, totalTime, fps, modifiedTime, amver, ffver, am, amplatform, retime, retimeAdaptFPS)',
    'Setiap layer adalah anak langsung <scene>: <shape> atau <text>, tanpa pembungkus track/group di sampel',
    'ID layer berupa bilangan bulat unik, berurutan naik dalam satu file',
    'Posisi layer: <transform><location value="x,y,0.000000"/></transform>, origin kiri-atas kanvas, y ke bawah',
    'Path bebas: <path d="M x y C x1 y1, x2 y2, x y L x y Z"/> dengan koordinat relatif terhadap titik location',
    'Lubang: <path> berisi <contour d=.../> pertama (luar) lalu <contour exclude="true" d=.../> untuk lubang',
    'Warna isi: <fillColor value="#aarrggbb"/>',
    'Waktu: startTime/endTime dalam milidetik, sama dengan totalTime pada semua sampel'
  ],
  unverified: [
    'Urutan z: diasumsikan layer pertama di file = paling bawah (sampel tidak membuktikan)',
    'Opasitas layer, gradien, dan stroke path bebas: tidak ada contoh di sampel, tidak diekspor',
    'Layer gambar/media raster: tidak ada contoh di sampel, Mode raster dan hybrid tidak tersedia',
    'Beberapa contour non-exclude dalam satu <path>: tidak ada contoh, setiap region luar diekspor sebagai shape sendiri',
    'Impor ke aplikasi Alight Motion belum diuji'
  ]
};

export function fmt(v) {
  if (!Number.isFinite(v)) throw new Error('Nilai bukan angka hingga: ' + v);
  let s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/0+$/, '');
  if (s.endsWith('.')) s += '0';
  if (s === '-0.0') s = '0.0';
  return s;
}

export function loopToD(loop, cx, cy) {
  const parts = ['M ' + fmt(loop.sx - cx) + ' ' + fmt(loop.sy - cy)];
  for (const s of loop.segs) {
    if (s.t === 'L') parts.push('L ' + fmt(s.x - cx) + ' ' + fmt(s.y - cy));
    else
      parts.push(
        'C ' + fmt(s.x1 - cx) + ' ' + fmt(s.y1 - cy) + ', ' + fmt(s.x2 - cx) + ' ' + fmt(s.y2 - cy) + ', ' + fmt(s.x - cx) + ' ' + fmt(s.y - cy)
      );
  }
  parts.push('Z');
  return parts.join('');
}

export function colorAttr(rgb) {
  return '#ff' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function shapeNode(id, label, totalTime, rgb, shape) {
  const bb = shape.bbox || polyBBox(flattenLoop(shape.outer));
  const cx = (bb.x0 + bb.x1) / 2;
  const cy = (bb.y0 + bb.y1) / 2;
  const pathNode = shape.holes.length
    ? el('path', {}, [
        el('contour', { d: loopToD(shape.outer, cx, cy) }),
        ...shape.holes.map((h) => el('contour', { exclude: 'true', d: loopToD(h, cx, cy) }))
      ])
    : el('path', { d: loopToD(shape.outer, cx, cy) });
  return el(
    'shape',
    {
      id: String(id),
      label,
      startTime: '0',
      endTime: String(totalTime),
      fillType: 'color',
      mediaFillMode: 'fill'
    },
    [
      el('transform', {}, [el('location', { value: cx.toFixed(6) + ',' + cy.toFixed(6) + ',0.000000' })]),
      el('fillColor', { value: colorAttr(rgb) }),
      pathNode
    ]
  );
}

export function buildProject(layers, opts) {
  const { width, height, title = 'Image2Alight', totalTime = FORMAT.scene.totalTime, fps = FORMAT.scene.fps } = opts;
  const baseId = opts.baseId ?? 3000000000 + Math.floor(Math.random() * 800000000);
  const modifiedTime = opts.modifiedTime ?? Date.now();
  const root = el(
    FORMAT.rootTag,
    {
      title,
      width: String(width),
      height: String(height),
      exportWidth: String(width),
      exportHeight: String(height),
      precompose: FORMAT.scene.precompose,
      bgcolor: FORMAT.scene.bgcolor,
      totalTime: String(totalTime),
      fps: String(fps),
      modifiedTime: String(modifiedTime),
      amver: FORMAT.scene.amver,
      ffver: FORMAT.scene.ffver,
      am: FORMAT.scene.am,
      amplatform: FORMAT.scene.amplatform,
      retime: FORMAT.scene.retime,
      retimeAdaptFPS: FORMAT.scene.retimeAdaptFPS
    },
    []
  );
  let id = baseId;
  let shapeCount = 0;
  for (const L of layers) {
    if (!L.visible) continue;
    L.shapes.forEach((s, i) => {
      const label = L.shapes.length > 1 ? L.name + ' ' + (i + 1) : L.name;
      root.children.push(shapeNode(id++, label, totalTime, L.rgb, s));
      shapeCount++;
    });
  }
  return { xml: serialize(root), shapeCount, notes: FORMAT.unverified.slice() };
}

const PATH_ARGS = { M: 2, L: 2, C: 6 };

export function validatePathD(d) {
  const errors = [];
  const re = /([MLCZ])([^MLCZ]*)/g;
  let m, first = true, closed = false, any = false;
  const rest = d.replace(re, '');
  if (rest.trim() !== '') errors.push('karakter tidak dikenal dalam path');
  while ((m = re.exec(d))) {
    any = true;
    const cmd = m[1];
    if (first && cmd !== 'M') errors.push('path harus diawali M');
    first = false;
    if (cmd === 'Z') {
      closed = true;
      continue;
    }
    const nums = m[2].split(/[\s,]+/).filter((t) => t !== '');
    if (nums.length !== PATH_ARGS[cmd]) errors.push('jumlah argumen ' + cmd + ' salah: ' + nums.length);
    for (const t of nums) if (!/^-?\d+(\.\d+)?(E-?\d+)?$/i.test(t) || !Number.isFinite(Number(t))) errors.push('angka tidak valid: ' + t);
  }
  if (!any) errors.push('path kosong');
  if (!closed) errors.push('path tidak ditutup dengan Z');
  return errors;
}

export function validateProject(xmlText) {
  const errors = [];
  const warnings = FORMAT.unverified.slice();
  let root;
  try {
    root = parse(xmlText);
  } catch (e) {
    return { ok: false, errors: [e.message], warnings, shapeCount: 0 };
  }
  if (root.tag !== FORMAT.rootTag) errors.push('elemen akar harus <scene>');
  const a = root.attrs;
  for (const k of ['title', 'width', 'height', 'exportWidth', 'exportHeight', 'precompose', 'bgcolor', 'totalTime', 'fps', 'amver', 'ffver', 'am', 'amplatform']) {
    if (a[k] === undefined || a[k] === '') errors.push('atribut scene hilang: ' + k);
  }
  const W = Number(a.width), H = Number(a.height), T = Number(a.totalTime), F = Number(a.fps);
  if (!(Number.isInteger(W) && W > 0)) errors.push('width tidak valid');
  if (!(Number.isInteger(H) && H > 0)) errors.push('height tidak valid');
  if (a.exportWidth !== a.width || a.exportHeight !== a.height) errors.push('exportWidth/exportHeight tidak sama dengan width/height');
  if (!(T > 0)) errors.push('totalTime tidak valid');
  if (!(F > 0)) errors.push('fps tidak valid');
  const ids = new Set();
  let shapeCount = 0;
  for (const node of childrenOf(root)) {
    if (node.tag !== 'shape' && node.tag !== 'text') {
      errors.push('elemen layer tidak dikenal: <' + node.tag + '>');
      continue;
    }
    const at = node.attrs;
    if (!/^\d+$/.test(at.id || '')) errors.push('id layer tidak valid: ' + at.id);
    else if (ids.has(at.id)) errors.push('id duplikat: ' + at.id);
    else ids.add(at.id);
    for (const k of FORMAT.shapeAttrs) if (k !== 'label' && at[k] === undefined) errors.push('atribut ' + k + ' hilang pada layer ' + at.id);
    const st = Number(at.startTime), et = Number(at.endTime);
    if (!(st >= 0) || !(et > st) || et > T) errors.push('rentang waktu tidak valid pada layer ' + at.id);
    if (node.tag !== 'shape') continue;
    shapeCount++;
    if (!FORMAT.fillTypes.includes(at.fillType)) errors.push('fillType tidak valid pada layer ' + at.id);
    const loc = childrenOf(childrenOf(node, 'transform')[0] || { children: [] }, 'location')[0];
    if (!loc || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(loc.attrs.value || '')) errors.push('location tidak valid pada layer ' + at.id);
    const fill = childrenOf(node, 'fillColor')[0];
    if (!fill || !/^#[0-9a-fA-F]{8}$/.test(fill.attrs.value || '')) errors.push('fillColor tidak valid pada layer ' + at.id);
    const path = childrenOf(node, 'path')[0];
    if (!path) {
      if (!at.s) errors.push('path hilang pada layer ' + at.id);
      continue;
    }
    const pathErrors = (d) => {
      for (const e of validatePathD(d)) {
        if (e.startsWith('path tidak ditutup')) warnings.push(e + ' (layer ' + at.id + ')');
        else errors.push(e + ' (layer ' + at.id + ')');
      }
    };
    if (path.attrs.d !== undefined) {
      pathErrors(path.attrs.d);
    } else {
      const cs = childrenOf(path, 'contour');
      if (!cs.length) errors.push('path tanpa contour pada layer ' + at.id);
      else if (cs[0].attrs.exclude === 'true') errors.push('contour pertama tidak boleh exclude pada layer ' + at.id);
      for (const c of cs) {
        if (c.attrs.d === undefined) errors.push('contour tanpa d pada layer ' + at.id);
        else pathErrors(c.attrs.d);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings, shapeCount };
}
