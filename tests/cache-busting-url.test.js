import assert from 'node:assert/strict';
import {
  freshCacheBustedUrl,
  withCacheBustingTimestamp
} from '../src/modules/utils/url.js';

assert.equal(
  withCacheBustingTimestamp('https://example.com/path', 123),
  'https://example.com/path?_t=123'
);
assert.equal(
  withCacheBustingTimestamp('https://example.com/path?lang=zh&_t=old#section', 123),
  'https://example.com/path?lang=zh&_t=123#section'
);
assert.equal(
  withCacheBustingTimestamp('about:blank', 123),
  'about:blank'
);

const first = new URL(freshCacheBustedUrl('https://example.com/#/first', () => 1000));
const second = new URL(freshCacheBustedUrl('https://example.com/#/second', () => 1000));
assert.equal(first.searchParams.get('_t'), '1000');
assert.equal(second.searchParams.get('_t'), '1001');
assert.equal(first.hash, '#/first');
assert.equal(second.hash, '#/second');

console.log('cache-busting URL tests passed');
