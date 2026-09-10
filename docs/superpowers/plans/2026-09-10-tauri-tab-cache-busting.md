# Tauri Tab Cache Busting Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让初始标签、新建标签、复制标签和系统新窗口都使用新的 `_t` 时间戳，并移除注入脚本不可加载的外部 source map。

**Architecture:** 新增独立的 URL 工具模块，提供可确定性测试的时间戳替换函数和同一窗口内单调递增的实时函数。标签创建入口统一转换 URL；Rust 系统窗口逻辑保持不变；Rollup 停止生成外部 source map。

**Tech Stack:** JavaScript ES Modules、Node.js `assert`、Rollup、Rust、Tauri 2

---

### Task 1: 可测试的标签 URL 缓存失效工具

**Files:**
- Create: `/Volumes/TRANSCEND/works/objects/github/backstage68/src/modules/utils/url.js`
- Create: `/Volumes/TRANSCEND/works/objects/github/backstage68/tests/cache-busting-url.test.js`

- [ ] **Step 1: 编写失败测试**

创建 `/Volumes/TRANSCEND/works/objects/github/backstage68/tests/cache-busting-url.test.js`：

```javascript
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
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68
node /Volumes/TRANSCEND/works/objects/github/backstage68/tests/cache-busting-url.test.js
```

Expected: FAIL，提示找不到 `/Volumes/TRANSCEND/works/objects/github/backstage68/src/modules/utils/url.js`。

- [ ] **Step 3: 实现最小 URL 工具**

创建 `/Volumes/TRANSCEND/works/objects/github/backstage68/src/modules/utils/url.js`：

```javascript
let lastCacheBustTimestamp = 0;

function parseHttpUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function withCacheBustingTimestamp(rawUrl, timestamp) {
  const url = parseHttpUrl(rawUrl);
  if (!url) return rawUrl;

  url.searchParams.set('_t', String(timestamp));
  return url.toString();
}

export function freshCacheBustedUrl(rawUrl, now = Date.now) {
  const url = parseHttpUrl(rawUrl);
  if (!url) return rawUrl;

  const currentTimestamp = Math.trunc(now());
  const timestamp = Math.max(currentTimestamp, lastCacheBustTimestamp + 1);
  lastCacheBustTimestamp = timestamp;
  url.searchParams.set('_t', String(timestamp));
  return url.toString();
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run:

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68
node /Volumes/TRANSCEND/works/objects/github/backstage68/tests/cache-busting-url.test.js
```

Expected: 输出 `cache-busting URL tests passed`，退出码为 0。

### Task 2: 接入统一标签创建入口

**Files:**
- Modify: `/Volumes/TRANSCEND/works/objects/github/backstage68/src/modules/tabs/operations.js:5-6`
- Modify: `/Volumes/TRANSCEND/works/objects/github/backstage68/src/modules/tabs/operations.js:280-310`

- [ ] **Step 1: 导入 URL 工具**

在 `/Volumes/TRANSCEND/works/objects/github/backstage68/src/modules/tabs/operations.js` 顶部增加：

```javascript
import { freshCacheBustedUrl } from '../utils/url.js';
```

- [ ] **Step 2: 在 `createTab` 中转换并记录实际 URL**

在生成标签 ID 后加入转换，并让 iframe 与标签数据使用转换后的 URL：

```javascript
const id = 'tab-' + (++window.tauriTabs.nextId);
const title = '加载中...';
const targetUrl = freshCacheBustedUrl(url);

log(`📑 创建新标签: ${id}, 实际 URL: ${targetUrl}`);

const tabElement = createTabElement(id, title, {
  onClose: closeTab,
  onSwitch: activateTab,
  onContextMenu: window.tauriTabs.showContextMenu || (() => {})
});

const iframe = createIframe(targetUrl, log);

const tabData = {
  id,
  url: targetUrl,
  title,
  element: tabElement,
  iframe
};
```

- [ ] **Step 3: 构建注入脚本验证模块接入**

Run:

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68
npm run build
```

Expected: Rollup 成功生成 `/Volumes/TRANSCEND/works/objects/github/backstage68/src/inject.js`，无模块解析错误。

### Task 3: 移除外部 source map

**Files:**
- Modify: `/Volumes/TRANSCEND/works/objects/github/backstage68/rollup.config.js:17`

- [ ] **Step 1: 验证当前构建会产生 source map 引用**

Run:

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68
npm run build
rg 'sourceMappingURL=inject.js.map' /Volumes/TRANSCEND/works/objects/github/backstage68/src/inject.js
```

Expected: 找到 `//# sourceMappingURL=inject.js.map`，证明当前控制台错误来源。

- [ ] **Step 2: 禁用注入脚本 source map**

将 Rollup 输出配置改为：

```javascript
sourcemap: false,
```

- [ ] **Step 3: 重新构建并确认引用消失**

Run:

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68
npm run build
if rg -q 'sourceMappingURL=' /Volumes/TRANSCEND/works/objects/github/backstage68/src/inject.js; then exit 1; fi
```

Expected: 退出码为 0，生成的 `/Volumes/TRANSCEND/works/objects/github/backstage68/src/inject.js` 不含 `sourceMappingURL`。

### Task 4: 完整验证

**Files:**
- Verify: `/Volumes/TRANSCEND/works/objects/github/backstage68/src/modules/utils/url.js`
- Verify: `/Volumes/TRANSCEND/works/objects/github/backstage68/src/modules/tabs/operations.js`
- Verify: `/Volumes/TRANSCEND/works/objects/github/backstage68/rollup.config.js`
- Verify: `/Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri/src/lib.rs`

- [ ] **Step 1: 运行 JavaScript 测试与构建**

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68
node /Volumes/TRANSCEND/works/objects/github/backstage68/tests/cache-busting-url.test.js
npm run build
```

Expected: URL 测试与 Rollup 构建通过。

- [ ] **Step 2: 运行 Rust 回归验证**

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri
cargo test
cargo check
```

Expected: 现有 9 个 Rust 测试全部通过，编译检查退出码为 0。

- [ ] **Step 3: 检查最终差异**

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68
git diff --check
git status --short
```

Expected: 无空白错误；只包含 URL 工具、测试、标签入口和 Rollup 配置变更。

- [ ] **Step 4: 提交实现**

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68
git add src/modules/utils/url.js tests/cache-busting-url.test.js src/modules/tabs/operations.js rollup.config.js
git commit -m "fix: refresh cache key for new tabs"
```
