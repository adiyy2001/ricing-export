import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const wavesDir = join(root, 'waves');
const waves = readdirSync(wavesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(wavesDir, entry.name, 'queue.json')))
  .map((entry) => ({ name: entry.name, queue: JSON.parse(readFileSync(join(wavesDir, entry.name, 'queue.json'), 'utf8')) }));

test('every dependency points at an existing item', () => {
  const ids = new Set(waves.flatMap(({ name, queue }) => queue.items.map((item) => `${name}:${item.id}`)));
  const broken = waves.flatMap(({ name, queue }) =>
    queue.items.flatMap((item) =>
      (item.dependsOn ?? []).map((reference) => (reference.includes(':') ? reference : `${name}:${reference}`)).filter((reference) => !ids.has(reference)),
    ),
  );
  assert.deepEqual(broken, []);
});

test('every source document exists unless it starts with an environment variable', () => {
  const missing = waves.flatMap(({ queue }) =>
    queue.items.flatMap((item) => (item.sources ?? []).map((source) => source.split(' ')[0]).filter((source) => !source.startsWith('$') && !existsSync(join(root, source)))),
  );
  assert.deepEqual(missing, []);
});
