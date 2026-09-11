import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src-tauri/capabilities/', import.meta.url);
const defaultCapability = JSON.parse(
  await readFile(new URL('default.json', root), 'utf8')
);
const webviewCapability = JSON.parse(
  await readFile(new URL('system/webview.json', root), 'utf8')
);

const expectedWindows = ['main', 'window-*', 'reopen-*'];
const expectedRemoteUrls = [
  'https://test-otc.68chat.co/**',
  'https://stage-otc.68chat.co/**',
  'https://b12e88-gg-ooxx.8cmanage.com/**'
];

assert.deepEqual(defaultCapability.windows, expectedWindows);
assert.deepEqual(defaultCapability.remote?.urls, expectedRemoteUrls);
assert.deepEqual(webviewCapability.windows, expectedWindows);
assert.deepEqual(
  webviewCapability.permissions[0].allow.map(({ url }) => url),
  [...expectedRemoteUrls, 'tauri://**']
);

console.log('dynamic window capability tests passed');
