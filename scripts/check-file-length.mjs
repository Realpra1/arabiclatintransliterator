import {execFileSync} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const names = new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean));
const oversized = [];
let checked = 0, longest = {lines: 0};
for (const name of names) {
  const file = new URL('../' + name, import.meta.url);
  if (!existsSync(file)) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
  catch { continue; }
  const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  checked++;
  if (lines > longest.lines) longest = {name, lines};
  if (lines > 500) oversized.push({name, lines});
}
console.log(JSON.stringify({checked, longest, oversized}, null, 2));
if (oversized.length) process.exitCode = 1;
