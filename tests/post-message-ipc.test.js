import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(
  new URL('../src-tauri/src/post-message-ipc.js', import.meta.url),
  'utf8'
);
const rustSource = await readFile(
  new URL('../src-tauri/src/lib.rs', import.meta.url),
  'utf8'
);

assert.doesNotMatch(source, /\bfetch\s*\(/, 'IPC transport must never request ipc://');
assert.match(source, /window\.ipc\.postMessage\(/);
assert.match(
  rustSource,
  /\.invoke_system\(POST_MESSAGE_INVOKE_SYSTEM\)/,
  'Tauri Builder must install the postMessage-only invoke system'
);

const sent = [];
const context = {
  window: {
    __TAURI_INTERNALS__: {},
    ipc: {
      postMessage(message) {
        sent.push(message);
      }
    }
  },
  Map,
  Uint8Array,
  ArrayBuffer,
  JSON,
  Object
};

vm.runInNewContext(
  source.replaceAll('__INVOKE_KEY__', JSON.stringify('test-invoke-key')),
  context
);

context.window.__TAURI_INTERNALS__.postMessage({
  cmd: 'get_os_type',
  callback: 1,
  error: 2,
  payload: {},
  options: {}
});

assert.equal(sent.length, 1);
assert.deepEqual(
  JSON.parse(sent[0]),
  {
    cmd: 'get_os_type',
    callback: 1,
    error: 2,
    payload: {},
    options: { customProtocolIpcBlocked: true },
    __TAURI_INVOKE_KEY__: 'test-invoke-key'
  }
);

console.log('postMessage IPC transport tests passed');
