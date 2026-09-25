import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('все модули приложения есть в офлайн-кеше service worker', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const missing = walk(join(root, 'js'))
    .map((p) => relative(root, p))
    .filter((p) => !sw.includes(`'${p}'`));
  assert.deepEqual(missing, []);
});

test('иконки из манифеста существуют', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(statSync(join(root, icon.src)).size > 0, icon.src);
});
