import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rustSource = await readFile(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8'
);
const proxySource = await readFile(
  new URL('../src/modules/proxy.js', import.meta.url),
  'utf8'
);
const injectSource = await readFile(
  new URL('../src/inject-refactored.js', import.meta.url),
  'utf8'
);
const bridgeSource = await readFile(
  new URL('../src/modules/proxy-bridge.js', import.meta.url),
  'utf8'
);

assert.equal(
  (rustSource.match(/\.initialization_script_for_all_frames\(/g) || []).length,
  3,
  'main, command-created, and reopened windows must inject into all frames'
);
assert.equal(
  (rustSource.match(/\.initialization_script\(/g) || []).length,
  0,
  'main-frame-only injection leaves Linux iframe requests unproxied'
);

assert.match(
  proxySource,
  /url\.includes\('\/base_api'\)/,
  'every URL containing /base_api must use the Rust proxy'
);
assert.doesNotMatch(
  proxySource,
  /url\.includes\('\/base_api\/'\)/,
  'proxy matching must not require a trailing slash'
);
const iframeBranch = injectSource
  .split('// 检查 Tauri API')[0]
  .split('if (isIframe)')[1] || '';
assert.match(
  iframeBranch,
  /createFrameProxyInvoke\(log\)[\s\S]*initProxy\(log, invoke\)/,
  'every iframe must install a top-window proxy bridge before its own proxy'
);
assert.doesNotMatch(
  iframeBranch,
  /initMainFrameProxyBridge/,
  'only top-level windows should receive proxy requests'
);
assert.doesNotMatch(
  iframeBranch,
  /tauriInvoke\s*\|\|/,
  'iframes must not try the blocked Tauri custom IPC protocol before using the bridge'
);
assert.match(bridgeSource, /targetWindow\.top\.postMessage\(/);
assert.match(bridgeSource, /event\.ports\??\.\[0\]/);
assert.doesNotMatch(bridgeSource, /event\.source/);

console.log('base_api proxy invariants passed');
