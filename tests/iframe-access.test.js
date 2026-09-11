import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAccessibleIframeContext } from '../src/modules/utils/iframe.js';

const inaccessibleFrame = {
  contentDocument: null,
  get contentWindow() {
    throw new Error('contentWindow must not be accessed');
  }
};
assert.equal(getAccessibleIframeContext(inaccessibleFrame), null);

const iframeWindow = {};
const iframeDocument = { defaultView: iframeWindow };
assert.deepEqual(
  getAccessibleIframeContext({ contentDocument: iframeDocument }),
  { document: iframeDocument, window: iframeWindow }
);

const blockedFrame = {
  get contentDocument() {
    throw new DOMException('Sandbox access violation', 'SecurityError');
  }
};
assert.equal(getAccessibleIframeContext(blockedFrame), null);

for (const relativePath of [
  '../src/modules/tabs/operations.js',
  '../src/modules/tabs/events.js',
  '../src/modules/tabs/drag-simple.js'
]) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /\b(?:iframe|tab\.iframe|activeTab\.iframe|scrollIframe)\.content(?:Document|Window)/,
    `${relativePath} must use getAccessibleIframeContext instead of direct frame access`
  );
}

console.log('iframe access tests passed');
