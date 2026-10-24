export function el(tag, attrs = {}, children = []) {
  return { tag, attrs, children };
}

export function escapeAttr(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;')
    .replace(/\t/g, '&#9;');
}

export function escapeText(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;

function writeNode(node, out) {
  if (typeof node === 'string') {
    out.push(escapeText(node));
    return;
  }
  if (!NAME_RE.test(node.tag)) throw new Error('Nama tag XML tidak valid: ' + node.tag);
  out.push('<' + node.tag);
  for (const k of Object.keys(node.attrs)) {
    if (!NAME_RE.test(k)) throw new Error('Nama atribut XML tidak valid: ' + k);
    out.push(' ' + k + '="' + escapeAttr(node.attrs[k]) + '"');
  }
  if (node.children.length === 0) {
    out.push(' />');
    return;
  }
  out.push('>');
  for (const c of node.children) writeNode(c, out);
  out.push('</' + node.tag + '>');
}

export function serialize(root, declaration = "<?xml version='1.0' encoding='UTF-8' ?>") {
  const out = [declaration];
  writeNode(root, out);
  return out.join('');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (m, g) => {
    if (g[0] === '#') {
      const code = g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[g];
  });
}

export function parse(text) {
  let i = 0;
  const n = text.length;
  const fail = (m) => {
    throw new Error('XML tidak valid pada posisi ' + i + ': ' + m);
  };
  const skipWs = () => {
    while (i < n && /\s/.test(text[i])) i++;
  };
  const readName = () => {
    const m = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(text.slice(i, i + 128));
    if (!m) fail('nama diharapkan');
    i += m[0].length;
    return m[0];
  };
  const skipProlog = () => {
    for (;;) {
      skipWs();
      if (text.startsWith('<?', i)) {
        const e = text.indexOf('?>', i);
        if (e < 0) fail('deklarasi tidak ditutup');
        i = e + 2;
      } else if (text.startsWith('<!--', i)) {
        const e = text.indexOf('-->', i);
        if (e < 0) fail('komentar tidak ditutup');
        i = e + 3;
      } else break;
    }
  };
  const readElement = () => {
    if (text[i] !== '<') fail('< diharapkan');
    i++;
    const tag = readName();
    const attrs = {};
    for (;;) {
      skipWs();
      if (text[i] === '/' || text[i] === '>') break;
      const k = readName();
      skipWs();
      if (text[i] !== '=') fail('= diharapkan');
      i++;
      skipWs();
      const q = text[i];
      if (q !== '"' && q !== "'") fail('kutip diharapkan');
      const e = text.indexOf(q, i + 1);
      if (e < 0) fail('nilai atribut tidak ditutup');
      if (Object.prototype.hasOwnProperty.call(attrs, k)) fail('atribut duplikat: ' + k);
      attrs[k] = decode(text.slice(i + 1, e));
      i = e + 1;
    }
    if (text[i] === '/') {
      if (text[i + 1] !== '>') fail('/> diharapkan');
      i += 2;
      return { tag, attrs, children: [] };
    }
    i++;
    const children = [];
    for (;;) {
      if (i >= n) fail('elemen ' + tag + ' tidak ditutup');
      if (text.startsWith('</', i)) {
        i += 2;
        const close = readName();
        if (close !== tag) fail('penutup ' + close + ' tidak cocok dengan ' + tag);
        skipWs();
        if (text[i] !== '>') fail('> diharapkan');
        i++;
        return { tag, attrs, children };
      }
      if (text.startsWith('<!--', i)) {
        const e = text.indexOf('-->', i);
        if (e < 0) fail('komentar tidak ditutup');
        i = e + 3;
      } else if (text[i] === '<') {
        children.push(readElement());
      } else {
        const e = text.indexOf('<', i);
        if (e < 0) fail('teks tidak ditutup');
        const t = decode(text.slice(i, e));
        if (t.trim() !== '') children.push(t);
        i = e;
      }
    }
  };
  skipProlog();
  const root = readElement();
  skipWs();
  if (i < n) fail('konten setelah elemen akar');
  return root;
}

export function childrenOf(node, tag) {
  return node.children.filter((c) => typeof c !== 'string' && (!tag || c.tag === tag));
}
