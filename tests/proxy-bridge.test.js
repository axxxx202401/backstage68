import assert from 'node:assert/strict';
import {
  createFrameProxyInvoke,
  initMainFrameProxyBridge
} from '../src/modules/proxy-bridge.js';

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const group = listeners.get(type) || new Set();
      group.add(listener);
      listeners.set(type, group);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event) {
      for (const listener of listeners.get(type) || []) {
        listener(event);
      }
    }
  };
}

function createMessageChannel() {
  const port1 = {
    onmessage: null,
    postMessage(data) {
      port2.onmessage?.({ data });
    },
    close() {}
  };
  const port2 = {
    onmessage: null,
    postMessage(data) {
      port1.onmessage?.({ data });
    },
    close() {}
  };
  return { port1, port2 };
}

const parentEvents = createEventTarget();
const parentWindow = {
  ...parentEvents,
  location: { origin: 'https://stage-otc.68chat.co' },
  postMessage(data, _targetOrigin, ports) {
    parentWindow.dispatch('message', {
      data,
      origin: 'null',
      source: null,
      ports
    });
  }
};
const childWindow = {
  top: parentWindow
};

let receivedCommand;
let receivedArguments;
initMainFrameProxyBridge(() => {}, async (command, args) => {
  receivedCommand = command;
  receivedArguments = args;
  return { status: 200, headers: {}, body: '{"ok":true}', is_binary: false };
}, parentWindow);

const frameInvoke = createFrameProxyInvoke(
  () => {},
  childWindow,
  1000,
  createMessageChannel
);
const request = {
  method: 'POST',
  url: 'https://stage-otc.68chat.co/base_api/loginCheck',
  headers: {},
  body: null
};
const response = await frameInvoke('proxy_request', { request });

assert.equal(receivedCommand, 'proxy_request');
assert.deepEqual(receivedArguments, { request });
assert.equal(response.status, 200);

await assert.rejects(
  frameInvoke('proxy_request', {
    request: { ...request, url: 'https://evil.example/base_api/loginCheck' }
  }),
  /拒绝代理非当前站点/
);

const nestedWindow = {
  top: parentWindow
};

const nestedInvoke = createFrameProxyInvoke(
  () => {},
  nestedWindow,
  1000,
  createMessageChannel
);
const nestedResponse = await nestedInvoke('proxy_request', { request });
assert.equal(nestedResponse.status, 200);

console.log('proxy bridge tests passed');
