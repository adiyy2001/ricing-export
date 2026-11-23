import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEPENDENCY_FILES, PRODUCTION_CODE, PROTECTED, TEST_FILE } from './config.mjs';

export function globToRegex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*\*\/?|\*/g, (token) => (token === '*' ? '[^/]*' : token === '**/' ? '(?:.*/)?' : '.*'));
  return new RegExp(`^${pattern}$`);
}

export function matchesAny(path, globs) {
  return globs.some((glob) => globToRegex(glob).test(path));
}

export function loadQueue(queuePath) {
  const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
  return { ...queue, dir: dirname(queuePath) };
}

function doneMarker(queue, reference, wavesRoot) {
  const [wave, id] = reference.includes(':') ? reference.split(':') : [null, reference];
  return wave ? join(wavesRoot, wave, 'done', `${id}.md`) : join(queue.dir, 'done', `${id}.md`);
}

export function itemState(queue, item, wavesRoot = dirname(queue.dir)) {
  if (existsSync(join(queue.dir, 'done', `${item.id}.md`))) return 'done';
  if (existsSync(join(queue.dir, 'blocked', `${item.id}.md`))) return 'blocked';
  const unmet = (item.dependsOn ?? []).filter((reference) => !existsSync(doneMarker(queue, reference, wavesRoot)));
  if (unmet.length > 0) return 'waiting';
  if (item.agent === 'owner' || item.agent === 'manual') return 'external';
  return 'ready';
}

export function nextItem(queue, wavesRoot) {
  return queue.items.find((item) => itemState(queue, item, wavesRoot) === 'ready') ?? null;
}

export function queueSummary(queue, wavesRoot) {
  const counts = { done: 0, blocked: 0, waiting: 0, external: 0, ready: 0 };
  for (const item of queue.items) counts[itemState(queue, item, wavesRoot)] += 1;
  return counts;
}

export function scopeProblems(item, changed, ownPaths = []) {
  const problems = [];
  const allowed = [...(item.files ?? []), ...ownPaths];
  for (const path of changed) {
    if (ownPaths.includes(path)) continue;
    if (DEPENDENCY_FILES.includes(path)) {
      if (!item.allowDependencies) problems.push(`${path}: dependency change without allowDependencies`);
      continue;
    }
    if (matchesAny(path, PROTECTED)) {
      if (!matchesAny(path, item.allowProtected ?? [])) problems.push(`${path}: protected file`);
      continue;
    }
    if (!matchesAny(path, allowed)) problems.push(`${path}: outside the item's files`);
  }
  return problems;
}

export function missingTests(item, changed, addedCases) {
  if (item.allowNoTests) return false;
  const touchesCode = changed.some((path) => PRODUCTION_CODE.test(path) && !TEST_FILE.test(path));
  return touchesCode && addedCases <= 0;
}

export function usageVerdict(snapshot, { limit = 95, maxAgeSeconds = 3600, now = Date.now() / 1000 } = {}) {
  if (!snapshot) return { ok: false, reason: 'no plan usage snapshot' };
  const used = snapshot.rate_limits?.seven_day?.used_percentage;
  if (typeof used !== 'number') return { ok: false, reason: 'plan usage snapshot without a weekly value' };
  if (now - snapshot.at > maxAgeSeconds) return { ok: false, reason: `plan usage snapshot older than ${maxAgeSeconds} s` };
  if (snapshot.overage_until) return { ok: false, reason: 'account is in overage, subscription only' };
  if (used >= limit) return { ok: false, reason: `weekly usage ${used}% at or above ${limit}%` };
  return { ok: true, reason: `weekly usage ${used}% on ${snapshot.lane_account ?? snapshot.account ?? 'unknown account'}` };
}

export function phaseVerdict(requires, state) {
  if (!requires) return { ok: true, reason: 'no phase requirement' };
  for (const [phase, status] of Object.entries(requires)) {
    const entry = state?.phases?.[phase] ?? state?.[phase];
    const current = typeof entry === 'object' ? entry?.status : entry;
    if (current !== status) return { ok: false, reason: `phase ${phase} is ${current ?? 'unknown'}, needs ${status}` };
  }
  return { ok: true, reason: 'phase requirement met' };
}

export function parseBlockers(text) {
  const line = text.trim().split('\n').reverse().find((candidate) => candidate.trim().startsWith('{'));
  if (!line) return null;
  try {
    const parsed = JSON.parse(line.trim());
    return Array.isArray(parsed.blockers) ? parsed.blockers : null;
  } catch {
    return null;
  }
}
