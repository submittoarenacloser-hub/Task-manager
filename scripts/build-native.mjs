// Собирает папку www/ для Android-версии: файлы приложения + Capacitor и плагины.
// Сборщика у проекта нет, поэтому готовые браузерные сборки плагинов подключаются
// обычными <script> перед модулем приложения (они задают глобальные объекты).

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'www');

const APP_FILES = ['index.html', 'css', 'js', 'icons', 'fonts'];
const VENDOR = {
  'capacitor.js': '@capacitor/core/dist/capacitor.js',
  'synapse.js': '@capacitor/synapse/dist/synapse.js',
  'app.js': '@capacitor/app/dist/plugin.js',
  'local-notifications.js': '@capacitor/local-notifications/dist/plugin.js',
  'filesystem.js': '@capacitor/filesystem/dist/plugin.js',
  'share.js': '@capacitor/share/dist/plugin.js',
};

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'vendor'), { recursive: true });

for (const item of APP_FILES) cpSync(join(root, item), join(out, item), { recursive: true });
for (const [name, src] of Object.entries(VENDOR)) cpSync(join(root, 'node_modules', src), join(out, 'vendor', name));
// Плагин файлов ждёт глобальный synapse, а браузерная сборка synapse называет его outsystemsSynapse.
writeFileSync(join(out, 'vendor', 'synapse.js'), `${readFileSync(join(out, 'vendor', 'synapse.js'), 'utf8')}\nwindow.synapse = window.outsystemsSynapse;\n`);

const entry = '<script type="module" src="js/app.js"></script>';
let html = readFileSync(join(out, 'index.html'), 'utf8');
if (!html.includes(entry)) throw new Error(`В index.html не найден ${entry}`);
const tags = Object.keys(VENDOR).map((name) => `<script src="vendor/${name}"></script>`);
html = html
  .replace(entry, [...tags, entry].join('\n    '))
  // манифест и иконки для установки из браузера в приложении не нужны
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');
writeFileSync(join(out, 'index.html'), html);

console.log(`www/ готова: ${APP_FILES.join(', ')} + ${Object.keys(VENDOR).length} файлов Capacitor`);
