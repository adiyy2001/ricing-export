import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { parseBlockers, phaseVerdict, scopeProblems, usageVerdict } from './queue.mjs';

const created = [];
after(() => created.forEach((path) => rmSync(path, { recursive: true, force: true })));

const FAKE_CLAUDE = `#!/usr/bin/env node
const { appendFileSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { dirname } = require('node:path');
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_CALLS, JSON.stringify(args) + '\\n');
const steps = JSON.parse(readFileSync(process.env.FAKE_PLAN, 'utf8'));
const calls = readFileSync(process.env.FAKE_CALLS, 'utf8').trim().split('\\n').length;
const step = steps[Math.min(calls - 1, steps.length - 1)];
for (const [path, text] of Object.entries(step.write ?? {})) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1', apiKeySource: step.apiKeySource ?? 'none' }));
console.log(JSON.stringify({ type: 'result', subtype: step.subtype ?? 'success', result: step.result ?? 'finished', session_id: 's1' }));
`;

const FIXTURE_CONFIG = `export const RULEBOOK = 'waves/rulebook.md';
export const IMPLEMENTER = 'wave-implementer';
export const REVIEWER = 'wave-reviewer';
export const REVIEW_SOURCES = ['docs/requirements.md'];
export const PROTECTED = ['factory/**', 'waves/**'];
export const DEPENDENCY_FILES = ['backend/pom.xml'];
export const PRODUCTION_CODE = /^backend\\/src\\/main\\/java\\//;
export const TEST_FILE = /(?:Test|IT)\\.java$|\\.(?:spec|test)\\.(?:ts|mjs)$/;
export const SCANNED_ROOTS = ['backend/'];
export const SKIPPED = /node_modules/;
export const IMMUTABLE = /db\\/migration\\//;
`;

function lane({ plan, items, gate = 'exit 0', usage = 10, state = null, branch = 'build/test' }) {
  const dir = mkdtempSync(join(tmpdir(), 'factory-run-'));
  created.push(dir);
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, 'waves/t'), { recursive: true });
  cpSync(import.meta.dirname, join(repo, 'factory'), { recursive: true });
  writeFileSync(join(repo, 'factory/config.mjs'), FIXTURE_CONFIG);
  writeFileSync(join(repo, 'waves/t/queue.json'), JSON.stringify({ wave: 't', branch, items }));
  writeFileSync(join(repo, '.gitignore'), 'logs/\n');
  const run = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  run('init', '-q', '-b', branch);
  run('config', 'user.email', 'factory@example.invalid');
  run('config', 'user.name', 'factory');
  run('add', '-A');
  run('commit', '-qm', 'start');
  const fake = join(dir, 'claude.cjs');
  writeFileSync(fake, FAKE_CLAUDE);
  chmodSync(fake, 0o755);
  const gatePath = join(dir, 'gate.sh');
  writeFileSync(gatePath, `#!/usr/bin/env bash\n${gate}\n`);
  chmodSync(gatePath, 0o755);
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
  writeFileSync(join(dir, 'usage.json'), JSON.stringify({ at: Date.now() / 1000, lane_account: 'a', rate_limits: { seven_day: { used_percentage: usage } } }));
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state ?? {}));
  const env = { ...process.env, FACTORY_CLAUDE: fake, FACTORY_GATE_CMD: gatePath, FACTORY_USAGE_FILE: join(dir, 'usage.json'), FACTORY_PHASE_FILE: join(dir, 'state.json'), FACTORY_LOG_DIR: join(repo, 'logs'), FAKE_CALLS: join(dir, 'calls'), FAKE_PLAN: join(dir, 'plan.json') };
  writeFileSync(env.FAKE_CALLS, '');
  return {
    repo,
    dir,
    conduct: (...flags) => spawnSync(process.execPath, ['factory/run.mjs', '--queue', 'waves/t/queue.json', ...flags], { cwd: repo, env, encoding: 'utf8' }),
    calls: () => readFileSync(env.FAKE_CALLS, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)),
    done: (id) => existsSync(join(repo, 'waves/t/done', `${id}.md`)),
    blocked: (id) => (existsSync(join(repo, 'waves/t/blocked', `${id}.md`)) ? readFileSync(join(repo, 'waves/t/blocked', `${id}.md`), 'utf8') : null),
    log: () => execFileSync('git', ['log', '--format=%s'], { cwd: repo, encoding: 'utf8' }),
    status: () => execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(),
  };
}

const ITEM = { id: 'A', title: 'first', agent: 'wave-implementer', files: ['src/**'] };
const OFFLINE = '--no-remote';

test('a finished item is committed with its done record', () => {
  const run = lane({ plan: [{ write: { 'src/a.txt': 'a' } }], items: [ITEM] });
  assert.equal(run.conduct(OFFLINE).status, 0);
  assert.equal(run.done('A'), true);
  assert.match(run.log(), /feat\(t\): first/);
  assert.equal(run.status(), '');
});

test('the session gets the subscription environment and the denied commands', () => {
  const run = lane({ plan: [{ write: { 'src/a.txt': 'a' } }], items: [ITEM] });
  run.conduct(OFFLINE);
  const args = run.calls()[0];
  assert.equal(args.includes('--strict-mcp-config'), true);
  assert.equal(args[args.indexOf('--agent') + 1], 'wave-implementer');
  assert.equal(args.includes('Bash(git push:*)'), true);
  assert.equal(args.includes('Bash(docker:*)'), true);
});

test('a gate failure resumes the same session with the failure and then passes', () => {
  const run = lane({ plan: [{ write: { 'src/a.txt': 'a' } }, { write: { 'src/fixed.txt': 'b' } }], items: [ITEM], gate: 'test -f src/fixed.txt || { echo FAIL marker; exit 1; }' });
  run.conduct(OFFLINE);
  const calls = run.calls();
  assert.equal(calls.length, 2);
  assert.equal(calls[1][calls[1].indexOf('--resume') + 1], 's1');
  assert.match(calls[1][1], /FAIL marker/);
  assert.equal(run.done('A'), true);
});

test('three gate failures block the item and keep the work in a commit', () => {
  const run = lane({ plan: [{ write: { 'src/a.txt': 'a' } }], items: [ITEM], gate: 'echo FAIL always; exit 1' });
  run.conduct(OFFLINE);
  assert.equal(run.calls().length, 3);
  assert.match(run.blocked('A'), /FAIL always/);
  assert.equal(run.done('A'), false);
  assert.match(run.log(), /unfinished work of A/);
});

test('a change outside the files blocks the item without passing the gate', () => {
  const run = lane({ plan: [{ write: { 'other/a.txt': 'a' } }], items: [ITEM] });
  run.conduct(OFFLINE);
  assert.match(run.blocked('A'), /other\/a\.txt: outside/);
});

test('a change to a protected file blocks even when the glob covers it', () => {
  const run = lane({ plan: [{ write: { 'factory/queue.mjs': 'x' } }], items: [{ ...ITEM, files: ['**'] }] });
  run.conduct(OFFLINE);
  assert.match(run.blocked('A'), /factory\/queue\.mjs: protected/);
});

test('a dependency change needs the item flag', () => {
  const blockedRun = lane({ plan: [{ write: { 'backend/pom.xml': '<a/>' } }], items: [{ ...ITEM, files: ['backend/**'] }] });
  blockedRun.conduct(OFFLINE);
  assert.match(blockedRun.blocked('A'), /allowDependencies/);
  const allowed = lane({ plan: [{ write: { 'backend/pom.xml': '<a/>' } }], items: [{ ...ITEM, files: ['backend/**'], allowDependencies: true }] });
  allowed.conduct(OFFLINE);
  assert.equal(allowed.done('A'), true);
});

test('production code without a new test case does not pass', () => {
  const run = lane({ plan: [{ write: { 'backend/src/main/java/A.java': 'class A {}' } }], items: [{ ...ITEM, files: ['backend/**'] }] });
  run.conduct(OFFLINE);
  assert.match(run.blocked('A'), /no new test case/);
  const covered = lane({ plan: [{ write: { 'backend/src/main/java/A.java': 'class A {}', 'backend/src/test/java/ATest.java': 'class ATest { @Test void a() {} }' } }], items: [{ ...ITEM, files: ['backend/**'] }] });
  covered.conduct(OFFLINE);
  assert.equal(covered.done('A'), true);
});

test('a final BLOCKED line becomes a blocked record', () => {
  const run = lane({ plan: [{ result: 'cannot\nBLOCKED: needs owner decision O-3' }], items: [ITEM] });
  run.conduct(OFFLINE);
  assert.match(run.blocked('A'), /needs owner decision O-3/);
  assert.equal(run.calls().length, 1);
});

test('usage at the limit starts no session', () => {
  const run = lane({ plan: [{ write: { 'src/a.txt': 'a' } }], items: [ITEM], usage: 95 });
  assert.equal(run.conduct(OFFLINE).status, 0);
  assert.equal(run.calls().length, 0);
  assert.equal(run.done('A'), false);
});

test('a phase requirement holds the item until the state file says so', () => {
  const held = lane({ plan: [{ write: { 'src/a.txt': 'a' } }], items: [{ ...ITEM, requires: { audits: 'done' } }], state: { phases: { audits: { status: 'pending' } } } });
  held.conduct(OFFLINE);
  assert.equal(held.calls().length, 0);
  const open = lane({ plan: [{ write: { 'src/a.txt': 'a' } }], items: [{ ...ITEM, requires: { audits: 'done' } }], state: { phases: { audits: { status: 'done' } } } });
  open.conduct(OFFLINE);
  assert.equal(open.done('A'), true);
});

test('a session on an API key stops the conductor', () => {
  const run = lane({ plan: [{ apiKeySource: 'ANTHROPIC_API_KEY' }], items: [ITEM] });
  assert.equal(run.conduct(OFFLINE).status, 2);
  assert.equal(run.done('A'), false);
});

test('owner items and items waiting for them never start a session', () => {
  const run = lane({ plan: [{}], items: [{ id: 'O', title: 'owner gate', agent: 'owner' }, { ...ITEM, dependsOn: ['O'] }] });
  run.conduct(OFFLINE);
  assert.equal(run.calls().length, 0);
});

test('a dependency on another wave waits for its done record', () => {
  const run = lane({ plan: [{ write: { 'src/a.txt': 'a' } }], items: [{ ...ITEM, dependsOn: ['core:C1'] }] });
  run.conduct(OFFLINE);
  assert.equal(run.calls().length, 0);
  mkdirSync(join(run.repo, 'waves/core/done'), { recursive: true });
  writeFileSync(join(run.repo, 'waves/core/done/C1.md'), 'done');
  execFileSync('git', ['add', '-A'], { cwd: run.repo });
  execFileSync('git', ['commit', '-qm', 'core done'], { cwd: run.repo });
  run.conduct(OFFLINE);
  assert.equal(run.done('A'), true);
});

test('a review without blockers is done and with blockers starts a fix session', () => {
  const clean = lane({ plan: [{ result: 'fine\n{"blockers":[]}' }], items: [{ id: 'R', title: 'review', kind: 'review', files: ['src/**'] }] });
  clean.conduct(OFFLINE);
  assert.equal(clean.done('R'), true);
  const finding = '{"blockers":[{"file":"src/a.txt","line":1,"claim":"wrong"}]}';
  const fixed = lane({ plan: [{ result: finding }, { write: { 'src/a.txt': 'a' } }, { result: '{"blockers":[]}' }], items: [{ id: 'R', title: 'review', kind: 'review', files: ['src/**'] }] });
  fixed.conduct(OFFLINE);
  assert.equal(fixed.calls().length, 3);
  assert.match(fixed.log(), /review findings of R/);
  assert.equal(fixed.done('R'), true);
});

test('a finished item lands on the trunk of the shared remote', () => {
  const run = lane({ plan: [{ write: { 'src/a.txt': 'a' } }], items: [ITEM] });
  const hub = join(run.dir, 'hub.git');
  execFileSync('git', ['init', '-q', '--bare', hub]);
  execFileSync('git', ['remote', 'add', 'hub', hub], { cwd: run.repo });
  execFileSync('git', ['push', '-q', 'hub', 'HEAD:refs/heads/build/main'], { cwd: run.repo });
  assert.equal(run.conduct().status, 0);
  const trunk = execFileSync('git', ['--git-dir', hub, 'log', '--format=%s', 'build/main'], { encoding: 'utf8' });
  assert.match(trunk, /feat\(t\): first/);
  const track = execFileSync('git', ['--git-dir', hub, 'log', '--format=%s', 'build/test'], { encoding: 'utf8' });
  assert.match(track, /feat\(t\): first/);
});

test('the scope helper lets the done record through', () => {
  assert.deepEqual(scopeProblems({ files: [] }, ['waves/t/done/A.md'], ['waves/t/done/A.md']), []);
});

test('the usage verdict fails closed', () => {
  assert.equal(usageVerdict(null).ok, false);
  assert.equal(usageVerdict({ at: 0, rate_limits: { seven_day: { used_percentage: 1 } } }).ok, false);
  assert.equal(usageVerdict({ at: 1000, overage_until: 5, rate_limits: { seven_day: { used_percentage: 1 } } }, { now: 1000 }).ok, false);
  assert.equal(usageVerdict({ at: 1000, rate_limits: { seven_day: { used_percentage: 94 } } }, { now: 1000 }).ok, true);
});

test('the phase verdict reads the flat and the nested state', () => {
  assert.equal(phaseVerdict({ audits: 'done' }, { audits: 'done' }).ok, true);
  assert.equal(phaseVerdict({ audits: 'done' }, { phases: { audits: 'pending' } }).ok, false);
  assert.equal(phaseVerdict({ audits: 'done' }, null).ok, false);
});

test('blockers parse from the last JSON line', () => {
  assert.deepEqual(parseBlockers('text\n{"blockers":[]}'), []);
  assert.equal(parseBlockers('no result'), null);
});
