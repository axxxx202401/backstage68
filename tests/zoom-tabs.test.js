import assert from 'node:assert/strict';
import { applyContentZoom, contentZoomFactor, mapZoomedClientRect } from '../src/modules/zoom.js';

function createTab() {
  return {
    iframe: {
      style: {
        width: '',
        height: '',
        transform: '',
        transformOrigin: '',
        position: '',
        left: '',
        top: ''
      },
      dataset: {}
    }
  };
}

const tab = createTab();
applyContentZoom([tab], 0.8, true);
assert.equal(tab.iframe.style.width, '125%');
assert.equal(tab.iframe.style.height, '125%');
assert.equal(tab.iframe.style.transform, 'scale(0.8)');
assert.equal(tab.iframe.style.transformOrigin, '0 0');
assert.equal(tab.iframe.style.position, 'absolute');
assert.equal(tab.iframe.style.left, '0');
assert.equal(tab.iframe.style.top, '0');
assert.equal(contentZoomFactor(tab.iframe), 0.8);

const mapped = mapZoomedClientRect({ left: 200, top: 80, width: 80, height: 24 }, 0.8);
assert.ok(Math.abs(mapped.left - 160) < 0.001);
assert.ok(Math.abs(mapped.top - 64) < 0.001);
assert.ok(Math.abs(mapped.width - 64) < 0.001);
assert.ok(Math.abs(mapped.height - 19.2) < 0.001);

applyContentZoom([tab], 1, true);
assert.equal(tab.iframe.style.width, '');
assert.equal(tab.iframe.style.height, '');
assert.equal(tab.iframe.style.transform, '');
assert.equal(tab.iframe.style.transformOrigin, '');
assert.equal(tab.iframe.style.position, '');
assert.equal(contentZoomFactor(tab.iframe), 1);

const untouched = createTab();
untouched.iframe.style.width = '100%';
applyContentZoom([untouched], 0.8, false);
assert.equal(untouched.iframe.style.width, '');
assert.equal(untouched.iframe.style.transform, '');
assert.equal(untouched.iframe.style.position, '');

console.log('zoom tab reflow tests passed');
