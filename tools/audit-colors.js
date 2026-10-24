import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['index.html', 'css', 'src/ui'];
const ALLOWED = new Set(['#000000', '#ffffff']);
const NAMED = /\b(?:rgba?|hsla?|gradient)\s*\(|\b(?:red|green|blue|gray|grey|silver|orange|yellow|purple|pink|cyan|magenta|lime|navy|teal|maroon|olive)\b/gi;

function walk(p, out) {
  const s = statSync(p);
  if (s.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f), out);
  else if (['.html', '.css', '.js'].includes(extname(p))) out.push(p);
}

const files = [];
for (const r of ROOTS) walk(r, files);
const problems = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const h = m[0].toLowerCase();
    const full = h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h;
    if (!ALLOWED.has(full)) problems.push(f + ': warna ' + m[0]);
  }
  for (const m of text.matchAll(NAMED)) {
    const line = text.slice(0, m.index).split('\n').length;
    const ctx = text.split('\n')[line - 1];
    if (/color-scheme|canvas|\/\/|stroke|--/.test(ctx) && !/gradient|rgb|hsl/i.test(m[0])) continue;
    problems.push(f + ':' + line + ': ' + m[0]);
  }
  if (/opacity\s*:\s*0?\.\d/.test(text)) problems.push(f + ': opacity parsial');
  for (const m of text.matchAll(/filter\s*:\s*([^;]+);/g)) if (m[1].trim() !== 'invert(1)') problems.push(f + ': filter ' + m[1]);
}
console.log('file diperiksa:', files.length);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('audit warna lolos: hanya #000000 dan #FFFFFF');
