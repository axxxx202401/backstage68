import assert from 'node:assert/strict';
import { applyContentZoom } from '../src/modules/zoom.js';

function createTab() {
  return {
    iframe: {
      style: { width: '', height: '', transform: '', transformOrigin: '' }
    }
  };
}

const tab = createTab();
applyContentZoom([tab], 0.8, true);
assert.equal(tab.iframe.style.width, '125%');
assert.equal(tab.iframe.style.height, '125%');
assert.equal(tab.iframe.style.transform, 'scale(0.8)');
assert.equal(tab.iframe.style.transformOrigin, '0 0');

applyContentZoom([tab], 1, true);
assert.equal(tab.iframe.style.width, '');
assert.equal(tab.iframe.style.height, '');
assert.equal(tab.iframe.style.transform, '');
assert.equal(tab.iframe.style.transformOrigin, '');

const untouched = createTab();
untouched.iframe.style.width = '100%';
applyContentZoom([untouched], 0.8, false);
assert.equal(untouched.iframe.style.width, '');
assert.equal(untouched.iframe.style.transform, '');

console.log('zoom tab reflow tests passed');
