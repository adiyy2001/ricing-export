import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { IMPLEMENTER, REVIEWER, REVIEW_SOURCES, RULEBOOK, TEST_FILE } from './config.mjs';
import { countTestCases, DISABLED_TEST } from './guards.mjs';
import { itemState, loadQueue, missingTests, nextItem, parseBlockers, phaseVerdict, queueSummary, scopeProblems, usageVerdict } from './queue.mjs';

const LEAKED_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_EFFORT_LEVEL'];
const SESSION_ENV = {
  CLAUDE_CODE_DISABLE_CRON: '1',
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
  CLAUDE_CODE_DISABLE_MODEL_ACCESS_FALLBACK: '1',
  BASH_MAX_OUTPUT_LENGTH: '20000',
};
const TOOLS = 'Read,Edit,Write,Grep,Glob,Bash';
const REVIEW_TOOLS = 'Read,Grep,Glob,Bash';
const DENIED_BASH = ['git push', 'git stash', 'git reset --hard', 'git checkout --', 'git clean', 'git commit', 'ssh', 'scp', 'rsync', 'sudo', 'systemctl', 'pkill', 'rm -rf', 'docker'];
const DENIED = ['WebFetch', 'WebSearch', 'mcp__*', ...DENIED_BASH.map((command) => `Bash(${command}:*)`)];
const MAX_TURNS = 250;
const RESUME_TURNS = 60;
const GATE_ATTEMPTS = 3;
const REVIEW_ROUNDS = 2;

const { values: options } = parseArgs({
  options: {
    queue: { type: 'string' },
    remote: { type: 'string', default: 'hub' },
    trunk: { type: 'string', default: 'build/main' },
    loop: { type: 'boolean', default: false },
    status: { type: 'boolean', default: false },
    'no-remote': { type: 'boolean', default: false },
  },
});

const root = resolve(import.meta.dirname, '..');
const claude = process.env.FACTORY_CLAUDE ?? 'claude';
const gateCommand = process.env.FACTORY_GATE_CMD ?? join(root, 'scripts/gate.sh');
const usageFile = process.env.FACTORY_USAGE_FILE ?? join(homedir(), '.local/share/command-center/plan-limits.json');
const usageLimit = Number(process.env.FACTORY_USAGE_LIMIT ?? 95);
const usageMaxAge = Number(process.env.FACTORY_USAGE_MAX_AGE_SECONDS ?? 3600);
const phaseFile = process.env.FACTORY_PHASE_FILE ?? '';
const pollMs = Number(process.env.FACTORY_POLL_SECONDS ?? 300) * 1000;
const logDir = process.env.FACTORY_LOG_DIR ?? join(root, '.factory-logs');

function log(line) {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  mkdirSync(logDir, { recursive: true });
  appendFileSync(join(logDir, 'conductor.log'), `${stamped}\n`);
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

function tryGit(...args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function changedFiles(startSha) {
  const tracked = git('diff', '--name-only', startSha).split('\n');
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n');
  return [...new Set([...tracked, ...untracked])].filter(Boolean);
}

function addedTestCases(startSha, changed) {
  let added = 0;
  for (const path of changed.filter((file) => TEST_FILE.test(file))) {
    const full = join(root, path);
    const after = existsSync(full) ? readFileSync(full, 'utf8') : '';
    const before = tryGit('show', `${startSha}:${path}`).stdout ?? '';
    if (!DISABLED_TEST.test(after)) added += countTestCases(after) - countTestCases(before);
  }
  return added;
}

function sessionEnv() {
  const env = { ...process.env, ...SESSION_ENV };
  for (const name of LEAKED_ENV) delete env[name];
  return env;
}

function sessionArgs(item, prompt, sessionId, turns) {
  const reviewer = item.kind === 'review';
  const tools = reviewer ? REVIEW_TOOLS : TOOLS;
  return [
    '-p', prompt,
    '--agent', reviewer ? REVIEWER : item.agent,
    '--model', item.model ?? (reviewer ? 'opus' : 'sonnet'),
    '--effort', item.effort ?? (reviewer ? 'high' : 'medium'),
    '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--tools', tools,
    '--allowedTools', tools,
    '--disallowedTools', ...DENIED,
    '--max-turns', String(turns),
    '--strict-mcp-config',
    '--settings', JSON.stringify({ disableAllHooks: true }),
    ...(sessionId ? ['--resume', sessionId] : []),
  ];
}

function runSession(item, prompt, sessionId, turns = MAX_TURNS) {
  return new Promise((done) => {
    mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, `${item.id}.jsonl`);
    const child = spawn(claude, sessionArgs(item, prompt, sessionId, turns), { cwd: root, env: sessionEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    const outcome = { sessionId: sessionId ?? null, text: '', apiKey: false, isError: false, subtype: null, code: null };
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      appendFileSync(logPath, chunk);
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.session_id) outcome.sessionId = event.session_id;
        if (event.type === 'system' && event.subtype === 'init' && event.apiKeySource && event.apiKeySource !== 'none') {
          outcome.apiKey = true;
          child.kill('SIGTERM');
        }
        if (event.type === 'result') {
          outcome.text = event.result ?? '';
          outcome.isError = event.is_error === true;
          outcome.subtype = event.subtype;
        }
      }
    });
    child.stderr.on('data', (chunk) => appendFileSync(logPath, chunk));
    child.on('close', (code) => {
      outcome.code = code;
      done(outcome);
    });
  });
}

function runGate(startSha) {
  const result = spawnSync(gateCommand, [], { cwd: root, env: { ...process.env, FACTORY_START_SHA: startSha }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function runChecks(item) {
  for (const command of item.checks ?? []) {
    const result = spawnSync('bash', ['-c', command], { cwd: root, env: process.env, encoding: 'utf8', timeout: 30 * 60_000 });
    if (result.status !== 0) return { ok: false, output: `check failed: ${command}\n${(result.stdout ?? '').slice(-3000)}${(result.stderr ?? '').slice(-2000)}` };
  }
  return { ok: true, output: '' };
}

function verify(item, startSha, ownPaths) {
  const changed = changedFiles(startSha);
  const scope = scopeProblems(item, changed, ownPaths);
  if (scope.length > 0) return { ok: false, output: `Scope violations:\n${scope.join('\n')}` };
  if (changed.length === 0 && !item.allowEmpty) return { ok: false, output: 'The item changed nothing.' };
  if (missingTests(item, changed, addedTestCases(startSha, changed))) return { ok: false, output: 'Production code changed and no new test case was added.' };
  const gate = runGate(startSha);
  if (!gate.ok) return gate;
  const checks = runChecks(item);
  return checks.ok ? { ok: true, output: gate.output } : checks;
}

function blockedText(reason) {
  const text = reason.trim();
  return text.length > 6000 ? `${text.slice(0, 2000)}\n...\n${text.slice(-3500)}` : text;
}

function block(queue, item, reason) {
  const directory = join(queue.dir, 'blocked');
  mkdirSync(directory, { recursive: true });
  const marker = join(directory, `${item.id}.md`);
  writeFileSync(marker, `# ${item.id} ${item.title}\n\n${blockedText(reason)}\n`);
  tryGit('add', '--', relative(root, marker));
  tryGit('commit', '-q', '-m', `chore(factory): block ${item.id}`, '--', relative(root, marker));
  log(`blocked ${item.id}`);
  publish(queue);
}

function publish(queue) {
  if (options['no-remote']) return;
  const push = tryGit('push', '-q', options.remote, `HEAD:refs/heads/${queue.branch}`);
  if (push.status !== 0) log(`push failed: ${push.stderr.trim().split('\n').pop()}`);
}

function mergeTrunk() {
  if (options['no-remote']) return { ok: true, moved: false };
  tryGit('fetch', '-q', options.remote);
  const before = git('rev-parse', 'HEAD');
  const merge = tryGit('merge', '-q', '--no-edit', `${options.remote}/${options.trunk}`);
  if (merge.status !== 0) {
    const output = merge.stdout + merge.stderr;
    tryGit('merge', '--abort');
    return { ok: false, moved: false, output };
  }
  return { ok: true, moved: git('rev-parse', 'HEAD') !== before };
}

function land() {
  if (options['no-remote']) return { ok: true };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const merged = mergeTrunk();
    if (!merged.ok) return { ok: false, output: `merge conflict with the trunk:\n${merged.output}` };
    if (merged.moved) {
      const gate = runGate(`${options.remote}/${options.trunk}`);
      if (!gate.ok) return { ok: false, output: `gate failed after merging the trunk:\n${gate.output}` };
    }
    const push = tryGit('push', '-q', options.remote, `HEAD:refs/heads/${options.trunk}`);
    if (push.status === 0) return { ok: true };
  }
  return { ok: false, output: 'could not land on the trunk after 5 attempts' };
}

function commitItem(queue, item, startSha, text, gateOutput) {
  const directory = join(queue.dir, 'done');
  mkdirSync(directory, { recursive: true });
  const marker = join(directory, `${item.id}.md`);
  writeFileSync(marker, `# ${item.id} ${item.title}\n\nStart: ${startSha}\n\n## Gate\n\n${gateOutput.trim()}\n\n## Session\n\n${text.trim()}\n`);
  git('add', '-A', '--', '.');
  git('commit', '-q', '-m', item.commit ?? `feat(${queue.wave}): ${item.title}`);
}

function itemPrompt(queue, item) {
  return [
    `Wave ${queue.wave}, item ${item.id}: ${item.title}.`,
    `Rulebook: ${RULEBOOK}. Read it first, it wins over your own taste.`,
    item.brief ? `Brief: ${item.brief}` : '',
    item.stories?.length ? `Stories: ${item.stories.join(', ')}.` : '',
    item.sources?.length ? `Sources: ${item.sources.join(', ')}.` : '',
    `Files you may change: ${(item.files ?? []).join(', ')}.`,
    'Do not commit, the conductor commits after the gate. If the item cannot be done inside those files or needs an owner decision, end your final message with a line starting with BLOCKED: and the reason.',
  ].filter(Boolean).join('\n');
}

function reviewPrompt(queue, item, base) {
  return [
    `Wave ${queue.wave}, review ${item.id}: ${item.title}.`,
    `Review the diff ${base}..HEAD with ${RULEBOOK}. ${item.brief ?? ''}`,
    `Sources of requirements: ${(item.sources ?? REVIEW_SOURCES).join(', ')}.`,
    'End with one line of JSON: {"blockers":[{"file":"...","line":1,"claim":"..."}]}. An empty list means nothing blocks.',
  ].join('\n');
}

async function waitForAllowance(item) {
  for (;;) {
    const usage = usageVerdict(readJson(usageFile), { limit: usageLimit, maxAgeSeconds: usageMaxAge });
    const phase = phaseVerdict(item.requires, phaseFile ? readJson(phaseFile) : null);
    if (usage.ok && phase.ok) {
      log(`preflight ${item.id}: ${usage.reason}; ${phase.reason}`);
      return true;
    }
    log(`waiting ${item.id}: ${usage.ok ? phase.reason : usage.reason}`);
    if (!options.loop) return false;
    await sleep(pollMs);
  }
}

async function runImplementation(queue, item, startSha, ownPaths) {
  let session = await runSession(item, itemPrompt(queue, item));
  for (let attempt = 0; attempt < GATE_ATTEMPTS; attempt += 1) {
    if (session.apiKey) return { fatal: 'session started with an API key, subscription only' };
    const marker = session.text.split('\n').find((line) => line.startsWith('BLOCKED:'));
    if (marker) return { blocked: marker };
    if (session.subtype === 'error_max_turns' && session.sessionId) {
      session = await runSession(item, `The turn limit was reached. Do not start over, finish item ${item.id}.`, session.sessionId, RESUME_TURNS);
      continue;
    }
    const verdict = verify(item, startSha, ownPaths);
    if (verdict.ok) return { ok: true, text: session.text, gate: verdict.output };
    log(`gate failed ${item.id}, attempt ${attempt + 1}`);
    if (attempt === GATE_ATTEMPTS - 1) return { blocked: `Gate failed ${GATE_ATTEMPTS} times:\n${verdict.output}` };
    session = await runSession(item, `The gate failed. Fix this without weakening any check, test or budget:\n${verdict.output.slice(-6000)}`, session.sessionId, RESUME_TURNS);
  }
  return { blocked: 'Session ended without a passing gate.' };
}

async function runReview(queue, item, startSha, ownPaths) {
  const base = item.reviewBase ?? startSha;
  for (let round = 0; round <= REVIEW_ROUNDS; round += 1) {
    const session = await runSession(item, reviewPrompt(queue, item, base));
    if (session.apiKey) return { fatal: 'session started with an API key, subscription only' };
    const blockers = parseBlockers(session.text);
    if (blockers === null) return { blocked: `The review returned no result:\n${session.text}` };
    if (blockers.length === 0) return { ok: true, text: session.text, gate: 'review only' };
    if (round === REVIEW_ROUNDS) return { blocked: `Review blockers remain:\n${JSON.stringify(blockers, null, 2)}` };
    log(`review ${item.id} round ${round + 1}: ${blockers.length} blockers, starting a fix session`);
    const fixItem = { ...item, kind: undefined, agent: IMPLEMENTER, model: 'sonnet', effort: 'medium', id: `${item.id}-fix${round + 1}`, brief: `Fix these review findings: ${JSON.stringify(blockers)}` };
    const fixed = await runImplementation(queue, fixItem, git('rev-parse', 'HEAD'), ownPaths);
    if (!fixed.ok) return fixed;
    git('add', '-A', '--', '.');
    git('commit', '-q', '-m', `fix(${queue.wave}): review findings of ${item.id}`);
  }
  return { blocked: 'Review did not finish.' };
}

async function runItem(queue, item) {
  const startSha = git('rev-parse', 'HEAD');
  const ownPaths = [relative(root, join(queue.dir, 'done', `${item.id}.md`))];
  log(`start ${item.id} ${item.title} at ${startSha.slice(0, 8)}`);
  const result = item.kind === 'review' ? await runReview(queue, item, startSha, ownPaths) : await runImplementation(queue, item, startSha, ownPaths);
  if (result.fatal) {
    log(`fatal ${item.id}: ${result.fatal}`);
    process.exit(2);
  }
  if (result.blocked) {
    tryGit('add', '-A', '--', '.');
    if (git('status', '--porcelain')) tryGit('commit', '-q', '-m', `chore(factory): unfinished work of ${item.id}`);
    block(queue, item, result.blocked);
    return;
  }
  commitItem(queue, item, startSha, result.text, result.gate);
  const landed = land();
  if (!landed.ok) {
    block(queue, item, landed.output);
    return;
  }
  publish(queue);
  log(`done ${item.id}`);
}

function prepareBranch(queue) {
  if (options['no-remote']) return;
  tryGit('fetch', '-q', options.remote);
  const current = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (current !== queue.branch) {
    const existing = tryGit('rev-parse', '--verify', '-q', `${options.remote}/${queue.branch}`).status === 0;
    git('checkout', '-q', '-B', queue.branch, existing ? `${options.remote}/${queue.branch}` : `${options.remote}/${options.trunk}`);
  }
}

async function main() {
  if (!options.queue) {
    console.error('usage: node factory/run.mjs --queue waves/<track>/queue.json [--loop] [--status] [--no-remote]');
    process.exit(64);
  }
  const queuePath = resolve(root, options.queue);
  const wavesRoot = dirname(dirname(queuePath));
  if (options.status) {
    console.log(JSON.stringify(queueSummary(loadQueue(queuePath), wavesRoot)));
    return;
  }
  prepareBranch(loadQueue(queuePath));
  for (;;) {
    const merged = mergeTrunk();
    if (!merged.ok) log(`trunk merge failed: ${merged.output}`);
    const queue = loadQueue(queuePath);
    const item = nextItem(queue, wavesRoot);
    if (!item) {
      log(`no ready item: ${JSON.stringify(queueSummary(queue, wavesRoot))}`);
      const crossWaveWait = queue.items.some((candidate) => itemState(queue, candidate, wavesRoot) === 'waiting' && (candidate.dependsOn ?? []).some((reference) => reference.includes(':')));
      if (!options.loop || !crossWaveWait) return;
      await sleep(pollMs);
      continue;
    }
    if (!(await waitForAllowance(item))) return;
    await runItem(queue, item);
    if (!options.loop) return;
  }
}

await main();
