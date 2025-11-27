# inject.js 重构指南

## 📋 重构目标

将 2089 行的 `inject.js` 拆分成多个模块，提高代码可维护性、可测试性和可读性。

## 📁 模块结构

```
src/
├── inject.js                    # 主入口（重构后）
└── modules/
    ├── logger.js               # 日志工具 ✅ 已创建
    ├── proxy.js                # HTTP 代理拦截 ✅ 已创建
    ├── zoom.js                 # 页面缩放 ✅ 已创建
    ├── window.js               # 多窗口支持 ✅ 已创建
    ├── utils/
    │   ├── dom.js              # DOM 工具函数 ✅ 已创建
    │   └── storage.js          # 存储工具 ✅ 已创建
    └── tabs/
        ├── manager.js          # 标签页管理器（主入口）✅ 已创建
        ├── ui.js               # UI 创建和样式 ✅ 已创建
        ├── operations.js       # 标签操作（创建、关闭、切换等）⏳ 待创建
        ├── events.js           # 事件处理（键盘、拖动等）⏳ 待创建
        └── search.js           # 标签搜索功能 ⏳ 待创建
```

## 🔧 已完成模块

### 1. logger.js
- **功能**: 统一的日志管理
- **导出**: `initLogger()`
- **大小**: ~30 行

### 2. utils/dom.js
- **功能**: DOM 相关工具函数
- **导出**: `isInIframe()`, `isMac()`, `getModifierKey()`, `createStyleTag()`
- **大小**: ~40 行

### 3. utils/storage.js
- **功能**: 存储序列化（用于跨窗口传递）
- **导出**: `serializeStorage()`
- **大小**: ~30 行

### 4. proxy.js
- **功能**: 拦截并代理 `fetch` 和 `XMLHttpRequest`
- **导出**: `initProxy(log, invoke)`
- **大小**: ~300 行
- **职责**:
  - 拦截 `/base_api/` 请求
  - 处理 FormData 和文件上传
  - 添加安全头

### 5. zoom.js
- **功能**: 页面缩放控制
- **导出**: `initZoom(log)`
- **大小**: ~180 行
- **职责**:
  - 键盘快捷键（Cmd/Ctrl +/-/0）
  - 滚轮缩放
  - 缩放提示 UI
  - iframe 缩放支持

### 6. window.js
- **功能**: 多窗口支持
- **导出**: `initWindow(log, invoke)`
- **大小**: ~120 行
- **职责**:
  - 创建新窗口
  - 复制登录状态
  - 窗口标题同步

### 7. tabs/ui.js
- **功能**: 标签页 UI 创建和布局
- **导出**: `createTabBar()`, `updateTabWidths()`, `TAB_CONFIG`
- **大小**: ~180 行
- **职责**:
  - 创建标签栏 DOM
  - 创建样式
  - 动态调整标签宽度

### 8. tabs/manager.js
- **功能**: 标签页管理器（主入口）
- **导出**: `initTabs(log, invoke)`
- **大小**: ~50 行
- **职责**:
  - 初始化标签系统
  - 协调各子模块
  - 暴露 API

## 🚧 待完成模块

### tabs/operations.js
**职责**: 标签的 CRUD 操作

**需要提取的函数**（从原 inject.js 行 1133-1500）:
- `createTab(url, isInitial)`
- `closeTab(tabId)`
- `switchTab(tabId)` / `activateTab(tabId)`
- `duplicateTab(tabId)`
- `refreshTab(tabId)`
- `reorderTabs(draggedId, targetId)`
- `closeTabsToLeft(tabId)`
- `closeTabsToRight(tabId)`
- `closeOtherTabs(tabId)`
- `openTabInNewWindow(tabId)`
- `createTabElement(id, title)` - 创建标签DOM元素
- `setupIframeProxy(iframe)` - 设置 iframe 代理
- `updateMainWindowTitle()` - 更新主窗口标题

**估计大小**: ~400 行

### tabs/events.js
**职责**: 键盘快捷键和拖拽事件

**需要提取的逻辑**（从原 inject.js 行 1500-1700）:
- 键盘事件监听:
  - `Cmd+T`: 新建标签
  - `Cmd+W`: 关闭标签
  - `Cmd+1~9`: 切换标签
  - `Cmd+Shift+A`: 搜索标签
- 拖拽事件:
  - `dragstart`, `dragend`, `dragover`, `dragleave`, `drop`
- 右键菜单事件:
  - `showTabContextMenu(tabId, x, y)`
  - 菜单点击外部关闭逻辑

**估计大小**: ~250 行

### tabs/search.js
**职责**: 标签搜索功能

**需要提取的函数**（从原 inject.js 行 1900-2000）:
- `showTabSearch()` - 显示搜索对话框
- `filterTabs(query)` - 过滤标签
- `renderSearchResults(results)` - 渲染结果
- 搜索框 UI 样式
- 键盘导航（上下键、Enter、Esc）

**估计大小**: ~200 行

## 📦 重构后的主文件

**inject.js（新版本）**:

```javascript
import { initLogger } from './modules/logger.js';
import { isInIframe } from './modules/utils/dom.js';
import { initProxy } from './modules/proxy.js';
import { initZoom } from './modules/zoom.js';
import { initWindow } from './modules/window.js';
import { initTabs } from './modules/tabs/manager.js';

(function() {
  const log = initLogger();
  
  if (isInIframe()) {
    log("在 iframe 内，跳过初始化");
    return;
  }

  if (!window.__TAURI__?.core?.invoke) {
    console.error("Tauri API 不可用");
    return;
  }

  const invoke = window.__TAURI__.core.invoke;

  // 初始化所有模块
  initProxy(log, invoke);
  initZoom(log);
  initWindow(log, invoke);
  initTabs(log, invoke);

  log("✅ 初始化完成");
})();
```

**大小**: ~30 行（从 2089 行减少到 30 行！）

## 🎯 重构优势

### 1. **可维护性** ↑
- 每个模块职责单一
- 代码结构清晰
- 易于定位问题

### 2. **可测试性** ↑
- 每个模块可独立测试
- 依赖注入（log, invoke）
- 易于 mock

### 3. **可读性** ↑
- 文件更小，更易理解
- 模块命名语义化
- 逻辑分层清晰

### 4. **可扩展性** ↑
- 新功能独立模块
- 不影响现有代码
- 易于插拔

### 5. **性能** ≈
- 使用 ES6 模块（静态分析）
- 打包工具可 tree-shaking
- 运行时无额外开销

## 🔄 迁移步骤

### 阶段 1: 基础模块（已完成 ✅）
1. ✅ 创建 `logger.js`
2. ✅ 创建 `utils/dom.js`
3. ✅ 创建 `utils/storage.js`
4. ✅ 创建 `proxy.js`
5. ✅ 创建 `zoom.js`
6. ✅ 创建 `window.js`
7. ✅ 创建 `tabs/ui.js`
8. ✅ 创建 `tabs/manager.js`

### 阶段 2: 标签页子模块（待完成 ⏳）
9. ⏳ 创建 `tabs/operations.js`
10. ⏳ 创建 `tabs/events.js`
11. ⏳ 创建 `tabs/search.js`

### 阶段 3: 集成和测试（待完成 ⏳）
12. ⏳ 更新 `inject.js` 使用新模块
13. ⏳ 配置构建工具（Rollup/Webpack）打包
14. ⏳ 端到端测试
15. ⏳ 备份旧文件 `inject.js` → `inject.legacy.js`
16. ⏳ 部署新版本

## ⚠️ 注意事项

### 1. **ES6 模块支持**
Tauri WebView 支持 ES6 模块，但需要在 HTML 中使用:
```html
<script type="module" src="inject.js"></script>
```

如果不支持，可使用 Rollup/Webpack 打包成单文件。

### 2. **全局状态管理**
- `window.tauriTabs` - 标签页全局状态
- `window.tauriZoom` - 缩放全局状态
- `window.tauriOpenNewWindow` - 新窗口函数

这些需要在各模块间共享。

### 3. **iframe 通信**
iframe 内的代码需要访问父窗口的代理和缩放函数，确保通过 `window.parent` 正确引用。

### 4. **事件监听器清理**
标签关闭时需要清理 MutationObserver、事件监听器等，避免内存泄漏。

## 📊 代码量统计

| 模块 | 原始行数 | 重构后行数 | 减少比例 |
|------|---------|-----------|---------|
| 主文件 | 2089 | 30 | -98.6% |
| logger | - | 30 | +30 |
| utils/dom | - | 40 | +40 |
| utils/storage | - | 30 | +30 |
| proxy | ~400 | 300 | -25% |
| zoom | ~200 | 180 | -10% |
| window | ~150 | 120 | -20% |
| tabs/ui | ~180 | 180 | 0% |
| tabs/manager | - | 50 | +50 |
| tabs/operations | ~450 | 400 (估计) | -11% |
| tabs/events | ~280 | 250 (估计) | -11% |
| tabs/search | ~220 | 200 (估计) | -9% |
| **总计** | **2089** | **1810 (估计)** | **-13.4%** |

## 🚀 下一步

1. 完成 `tabs/operations.js` - 从原文件提取标签操作函数
2. 完成 `tabs/events.js` - 从原文件提取事件处理逻辑
3. 完成 `tabs/search.js` - 从原文件提取搜索功能
4. 更新 `tabs/manager.js` 引入这些子模块
5. 配置打包工具
6. 端到端测试
7. 部署

## 📚 参考资料

- [JavaScript 模块化设计](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [单一职责原则（SRP）](https://en.wikipedia.org/wiki/Single-responsibility_principle)
- [Tauri WebView 文档](https://tauri.app/v1/api/js/)

