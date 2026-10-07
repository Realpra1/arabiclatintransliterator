// Read/write ordinary JSON or JSON split into ordered, relative data modules.
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const marker = '$jsonModules';
const version = 'arabiclatin/v1';
export const MAX_JSON_LINES = 500;
const targetLines = 450;
const filename = path => path instanceof URL ? fileURLToPath(path) : resolve(path);
const format = value => JSON.stringify(value, null, 2) + '\n';
const lines = text => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeName = name => String(name).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100) || 'value';

export function readJsonArtifact(path) {
  const entry = filename(path);
  const base = dirname(entry);
  const active = new Set();
  function expand(value) {
    if (Array.isArray(value)) return value.map(expand);
    if (!isObject(value)) return value;
    if (Object.hasOwn(value, marker)) {
      if (value[marker] !== version || !['array', 'object'].includes(value.kind) ||
          !Array.isArray(value.parts) || !value.parts.length) throw new Error(`Invalid JSON module reference in ${entry}`);
      const parts = value.parts.map(part => {
        if (typeof part !== 'string' || isAbsolute(part)) throw new Error(`Invalid JSON module path in ${entry}`);
        const file = resolve(base, part);
        const local = relative(base, file);
        if (local === '..' || local.startsWith('..' + sep)) throw new Error(`JSON module escapes its artifact directory: ${part}`);
        return read(file);
      });
      if (value.kind === 'array') {
        if (parts.some(part => !Array.isArray(part))) throw new Error(`Expected array modules in ${entry}`);
        return parts.flat();
      }
      if (parts.some(part => !isObject(part))) throw new Error(`Expected object modules in ${entry}`);
      const entries = parts.flatMap(Object.entries);
      if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error(`Duplicate object keys in ${entry}`);
      return Object.fromEntries(entries);
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, expand(child)]));
  }
  function read(file) {
    if (active.has(file)) throw new Error(`Circular JSON module reference: ${file}`);
    active.add(file);
    try { return expand(JSON.parse(readFileSync(file, 'utf8'))); }
    finally { active.delete(file); }
  }
  return read(entry);
}

export function writeJsonArtifact(path, value) {
  const entry = filename(path);
  const partsName = basename(entry, '.json') + '.parts';
  const files = new Map();
  function store(local, data) {
    const text = format(data);
    if (lines(text) > MAX_JSON_LINES) throw new Error(`JSON module exceeds ${MAX_JSON_LINES} lines: ${local}`);
    files.set(local, text);
    return local;
  }
  function pack(data, location) {
    if (!Array.isArray(data) && !isObject(data)) return data;
    if (Object.hasOwn(data, marker)) throw new Error(`Reserved JSON module key: ${marker}`);
    if (lines(format(data)) <= targetLines) return data;
    const array = Array.isArray(data);
    const entries = array ? data.map((item, i) => [String(i).padStart(5, '0'), item]) : Object.entries(data);
    const packed = entries.map(([key, child], i) => [key, pack(child, `${location}/${String(i).padStart(4, '0')}-${safeName(key)}`)]);
    const whole = array ? packed.map(([, child]) => child) : Object.fromEntries(packed);
    if (lines(format(whole)) <= targetLines) return whole;
    const groups = [];
    let chunk = [], group = '';
    const chunkValue = items => array ? items.map(([, child]) => child) : Object.fromEntries(items);
    for (let i = 0; i < packed.length; i++) {
      const original = entries[i][1];
      // Keep corpus groups/directions together, with numbered pages for large groups.
      const nextGroup = array && isObject(original) && original.group ? `${original.group}-${original.direction || ''}` : '';
      if (chunk.length && (nextGroup !== group || lines(format(chunkValue([...chunk, packed[i]]))) > targetLines)) {
        groups.push({items: chunk, group});
        chunk = [];
      }
      group = nextGroup;
      chunk.push(packed[i]);
    }
    if (chunk.length) groups.push({items: chunk, group});
    const parts = groups.map(({items, group}, i) => store(
      `${partsName}/${location}/part-${String(i + 1).padStart(4, '0')}${group ? '-' + safeName(group) : ''}.json`, chunkValue(items)));
    return {[marker]: version, kind: array ? 'array' : 'object', parts};
  }
  const encoded = pack(value, 'root');
  const main = format(encoded);
  if (lines(main) > MAX_JSON_LINES) throw new Error(`JSON index exceeds ${MAX_JSON_LINES} lines: ${entry}`);
  // Plan and validate all modules before replacing the generated directory.
  mkdirSync(dirname(entry), {recursive: true});
  rmSync(join(dirname(entry), partsName), {recursive: true, force: true});
  for (const [local, text] of files) {
    const target = join(dirname(entry), local);
    mkdirSync(dirname(target), {recursive: true});
    writeFileSync(target, text);
  }
  writeFileSync(entry, main);
  return {modules: files.size, entry};
}
