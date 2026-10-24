import test from 'node:test';
import assert from 'node:assert/strict';
import { el, serialize, parse } from '../src/export/xml.js';
import { makeZip, crc32 } from '../src/export/zip.js';

test('serialize lalu parse mengembalikan struktur sama', () => {
  const root = el('scene', { a: '1', b: 'x&y<"z"' }, [el('shape', { id: '5' }, [el('path', { d: 'M 0 0Z' })])]);
  const back = parse(serialize(root));
  assert.equal(back.tag, 'scene');
  assert.equal(back.attrs.b, 'x&y<"z"');
  assert.equal(back.children[0].children[0].attrs.d, 'M 0 0Z');
});

test('nama tag tidak valid ditolak', () => {
  assert.throws(() => serialize(el('bad tag')));
  assert.throws(() => serialize(el('ok', { 'bad attr': '1' })));
});

test('parser menolak XML rusak', () => {
  assert.throws(() => parse('<a><b></a>'));
  assert.throws(() => parse('<a x="1" x="2" />'));
  assert.throws(() => parse('<a>'));
  assert.throws(() => parse('<a /><b />'));
});

test('zip menghasilkan header dan crc benar', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const z = makeZip([{ name: 'a.txt', data: 'halo' }]);
  assert.equal(z[0], 0x50);
  assert.equal(z[1], 0x4b);
  assert.equal(z.length > 40, true);
});
