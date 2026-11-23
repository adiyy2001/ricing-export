import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { IMMUTABLE, SCANNED_ROOTS, SKIPPED, TEST_FILE } from './config.mjs';

const root = join(import.meta.dirname, '..');

export const FORBIDDEN_DASHES = /[\u2014\u2013]/;
export const DISABLED_TEST = /@[\w.]*Disabled\w*\b|\b(?:it|test|describe)\.(?:skip|only|todo)\b|\b(?:xit|fit|xdescribe|fdescribe|xtest)\s*\(/;
const TEST_CASE = /@(?:Test|ParameterizedTest|RepeatedTest)\b|\b(?:it|test)(?:\.each\([^)]*\))?\s*\(/g;
const LINE_AND_BLOCK = new Set(['.java', '.ts', '.mjs', '.js']);
const BLOCK_ONLY = new Set(['.css']);
const HASH = new Set(['.sh', '.yaml', '.yml', '.properties']);

export function hasComment(path, text) {
  const extension = extname(path);
  if (extension === '.html') {
    return /<!--/.test(text.replace(/<script[\s\S]*?<\/script>/g, ''));
  }
  if (extension === '.sql') {
    return /(^|\s)--/.test(text.replace(/'(?:[^']|'')*'/g, "''")) || text.includes('/*');
  }
  if (HASH.has(extension)) {
    return text.split('\n').some((line, index) => {
      const trimmed = line.trimStart();
      return trimmed.startsWith('#') && !(index === 0 && trimmed.startsWith('#!'));
    });
  }
  if (BLOCK_ONLY.has(extension)) {
    return text.includes('/*');
  }
  if (LINE_AND_BLOCK.has(extension)) {
    return codeHasComment(text);
  }
  return false;
}

function codeHasComment(text) {
  let index = 0;
  let previous = '';
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' || char === "'" || char === '`') {
      index = skipString(text, index, char);
      previous = char;
      continue;
    }
    if (char === '/' && next === '/') return true;
    if (char === '/' && next === '*') return true;
    if (char === '/' && /[(,=:[!&|?{};\n]/.test(previous)) {
      index = skipRegex(text, index);
      previous = '/';
      continue;
    }
    if (!/\s/.test(char)) previous = char;
    else if (char === '\n' && previous === '') previous = '\n';
    index += 1;
  }
  return false;
}

function skipString(text, start, quote) {
  if (quote === '"' && text.startsWith('"""', start)) {
    const end = text.indexOf('"""', start + 3);
    return end === -1 ? text.length : end + 3;
  }
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === quote) return index + 1;
    if (text[index] === '\n' && quote !== '`') return index + 1;
    index += 1;
  }
  return index;
}

function skipRegex(text, start) {
  let index = start + 1;
  let inClass = false;
  while (index < text.length && text[index] !== '\n') {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === '[') inClass = true;
    if (text[index] === ']') inClass = false;
    if (text[index] === '/' && !inClass) return index + 1;
    index += 1;
  }
  return index;
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function changedFiles(startSha) {
  const tracked = git('diff', '--name-only', '--diff-filter=d', startSha).split('\n');
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked])].filter(Boolean);
}

function scanned(path) {
  return SCANNED_ROOTS.some((prefix) => path.startsWith(prefix)) && !SKIPPED.test(path);
}

export function styleProblems(startSha, files = changedFiles(startSha), read = (path) => readFileSync(join(root, path), 'utf8')) {
  const problems = [];
  for (const path of files.filter(scanned)) {
    const text = read(path);
    if (hasComment(path, text)) problems.push(`${path}: comment`);
    if (FORBIDDEN_DASHES.test(text)) problems.push(`${path}: em or en dash`);
  }
  return problems;
}

export function countTestCases(text) {
  return (text.match(TEST_CASE) ?? []).length;
}

function headText(startSha, path) {
  try {
    return git('show', `${startSha}:${path}`);
  } catch {
    return '';
  }
}

export function immutableProblems(startSha) {
  const changed = git('diff', '--name-status', startSha).split('\n').filter(Boolean);
  return changed
    .map((line) => line.split('\t'))
    .filter(([status, path]) => status !== 'A' && IMMUTABLE.test(path))
    .map(([, path]) => `${path}: existing file under an immutable path changed`);
}

export function testProblems(startSha) {
  const problems = [...immutableProblems(startSha)];
  const deleted = git('diff', '--name-only', '--diff-filter=D', startSha).split('\n').filter(Boolean);
  for (const path of deleted.filter((file) => TEST_FILE.test(file))) {
    if (countTestCases(headText(startSha, path)) > 0) problems.push(`${path}: deleted test file`);
  }
  for (const path of changedFiles(startSha).filter((file) => TEST_FILE.test(file))) {
    const full = join(root, path);
    if (!existsSync(full)) continue;
    const before = headText(startSha, path);
    const after = readFileSync(full, 'utf8');
    if (countTestCases(after) < countTestCases(before)) problems.push(`${path}: fewer test cases than at ${startSha}`);
    if (DISABLED_TEST.test(after) && !DISABLED_TEST.test(before)) problems.push(`${path}: disabled or focused test`);
  }
  return problems;
}

if (import.meta.main) {
  const [command, startSha = 'HEAD'] = process.argv.slice(2);
  const problems = command === 'style' ? styleProblems(startSha) : command === 'tests' ? testProblems(startSha) : [`unknown command ${command}`];
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`${command}: clean`);
}
