import { readFileSync, readdirSync } from 'node:fs';
import { parse, childrenOf } from '../src/export/xml.js';
import { validateProject } from '../src/export/format.js';

const dir = process.argv[2] || '/mnt/user-data/uploads';
for (const f of readdirSync(dir).filter((x) => x.endsWith('.xml'))) {
  const text = readFileSync(dir + '/' + f, 'utf8');
  const root = parse(text);
  const tags = {};
  const attrs = {};
  const walk = (n) => {
    if (!n || typeof n !== 'object' || !n.attrs) return;
    tags[n.tag] = (tags[n.tag] || 0) + 1;
    for (const k of Object.keys(n.attrs)) attrs[n.tag + '@' + k] = 1;
    for (const c of n.children) walk(c);
  };
  walk(root);
  const v = validateProject(text);
  console.log(f);
  console.log('  scene:', root.attrs.width + 'x' + root.attrs.height, 'fps', root.attrs.fps, 'totalTime', root.attrs.totalTime);
  console.log('  tag:', JSON.stringify(tags));
  console.log('  atribut:', Object.keys(attrs).sort().join(' '));
  console.log('  layer:', childrenOf(root).length, 'valid:', v.ok, v.errors.slice(0, 3).join('; '));
}
