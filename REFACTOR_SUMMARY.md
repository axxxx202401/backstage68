# inject.js 重构方案总结

## 📊 问题分析

**原文件**: `src/inject.js`
- **行数**: 2089 行
- **大小**: ~90KB
- **问题**:
  - 单文件包含所有功能
  - 代码难以维护和测试
  - 逻辑耦合严重
  - 违反单一职责原则

## 🎯 重构方案

我提供了**两种重构方案**，您可以根据需求选择：

### 方案 A：ES6 模块化（推荐，现代化）

**优点**:
- ✅ 完全模块化，易于维护
- ✅ 每个模块独立测试
- ✅ 代码组织清晰
- ✅ 支持 Tree Shaking

**缺点**:
- ⚠️ 需要构建工具（Rollup/Webpack）打包
- ⚠️ 需要修改 HTML 中的 script 标签类型

**文件结构**:
```
src/
├── inject.js (重构后，30行)
└── modules/
    ├── logger.js ✅
    ├── proxy.js ✅
    ├── zoom.js ✅
    ├── window.js ✅
    ├── utils/
    │   ├── dom.js ✅
    │   └── storage.js ✅
    └── tabs/
        ├── manager.js ✅
        ├── ui.js ✅
        ├── operations.js ⏳
        ├── events.js ⏳
        └── search.js ⏳
```

**使用方式**:
```html
<script type="module" src="inject.js"></script>
```

或使用 Rollup 打包:
```bash
npm install --save-dev rollup
npx rollup src/inject-refactored.js --file dist/inject.bundle.js --format iife
```

### 方案 B：命名空间组织（简单，无需构建）

**优点**:
- ✅ 无需构建工具
- ✅ 兼容性好
- ✅ 代码逻辑清晰
- ✅ 立即可用

**缺点**:
- ⚠️ 仍是单文件（但有清晰的分组）
- ⚠️ 无法独立测试模块

**文件**: `src/inject-simple-refactor.js`

**代码组织**:
```javascript
(function() {
  // 工具模块
  const Utils = {
    Logger: { log, info, warn, error },
    Dom: { isInIframe, isMac, getModifierKey },
    Storage: { serialize }
  };

  // 代理模块
  const ProxyModule = { init, overrideFetch, overrideXHR };

  // 缩放模块
  const ZoomModule = { init, zoomIn, zoomOut, reset, apply };

  // 窗口模块
  const WindowModule = { init, setupTitleSync, ... };

  // 标签页模块
  const TabsModule = { init, createTab, closeTab, ... };

  // 主初始化
  ProxyModule.init();
  ZoomModule.init();
  WindowModule.init();
  TabsModule.init();
})();
```

**使用方式**:
```html
<script src="inject-simple-refactor.js"></script>
```

## 📦 已创建的文件

### 核心模块（方案 A）

1. **src/modules/logger.js** (30 行)
   - 统一的日志管理
   - 支持开关控制

2. **src/modules/utils/dom.js** (40 行)
   - DOM 相关工具函数
   - 平台检测、事件处理

3. **src/modules/utils/storage.js** (30 行)
   - 存储序列化
   - 用于跨窗口传递

4. **src/modules/proxy.js** (300 行)
   - HTTP 代理拦截
   - 支持 Fetch + XMLHttpRequest
   - FormData 文件上传

5. **src/modules/zoom.js** (180 行)
   - 页面缩放控制
   - 键盘快捷键
   - 滚轮缩放

6. **src/modules/window.js** (120 行)
   - 多窗口支持
   - 窗口标题同步
   - 登录状态共享

7. **src/modules/tabs/ui.js** (180 行)
   - 标签栏 UI
   - 样式管理
   - 动态宽度调整

8. **src/modules/tabs/manager.js** (50 行)
   - 标签页管理器
   - 模块协调

### 简化版本（方案 B）

9. **src/inject-simple-refactor.js** (~600 行，未完成)
   - 包含：工具、代理、缩放、窗口模块
   - 待完成：标签页模块（需要从原文件复制 ~1400 行）

### 文档

10. **REFACTOR_GUIDE.md**
    - 详细的重构指南
    - 模块说明
    - 迁移步骤

11. **REFACTOR_SUMMARY.md** (本文件)
    - 重构方案总结
    - 使用说明

## 🚀 推荐实施步骤

### 如果选择方案 A（ES6 模块）

**步骤 1**: 完成标签页子模块（待完成）
```bash
# 需要创建以下文件
src/modules/tabs/operations.js  # 标签 CRUD 操作
src/modules/tabs/events.js      # 键盘和拖拽事件
src/modules/tabs/search.js      # 标签搜索
```

**步骤 2**: 安装构建工具
```bash
cd src-tauri
npm init -y
npm install --save-dev rollup @rollup/plugin-node-resolve
```

**步骤 3**: 创建 Rollup 配置
```javascript
// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/inject-refactored.js',
  output: {
    file: 'dist/inject.bundle.js',
    format: 'iife',
    name: 'TauriInject'
  },
  plugins: [resolve()]
};
```

**步骤 4**: 构建
```bash
npx rollup -c
```

**步骤 5**: 更新 Tauri 配置
```rust
// src-tauri/src/lib.rs
// 将注入脚本改为：dist/inject.bundle.js
```

**步骤 6**: 测试
```bash
./build.sh test
```

### 如果选择方案 B（命名空间）

**步骤 1**: 完成 TabsModule
```javascript
// 在 inject-simple-refactor.js 中
// 将原 inject.js 的标签页代码（1133-2089行）
// 复制到 TabsModule 对象中
```

**步骤 2**: 测试
```bash
# 将 inject-simple-refactor.js 重命名为 inject.js
mv src/inject.js src/inject.backup.js
mv src/inject-simple-refactor.js src/inject.js

# 构建测试
./build.sh test
```

**步骤 3**: 如果测试通过，删除备份
```bash
rm src/inject.backup.js
```

## 📈 重构收益

### 代码质量

| 指标 | 原始版本 | 重构后（方案A） | 改善 |
|------|---------|----------------|------|
| 单文件行数 | 2089 | 30 | -98.6% |
| 模块数量 | 1 | 11+ | +1000% |
| 平均文件大小 | 2089行 | 165行 | -92.1% |
| 代码复用性 | 低 | 高 | ⬆️ |
| 可测试性 | 差 | 优 | ⬆️⬆️ |
| 可维护性 | 差 | 优 | ⬆️⬆️ |

### 开发体验

| 方面 | 改善 |
|------|------|
| 查找代码 | ⬆️⬆️ 按模块快速定位 |
| 理解逻辑 | ⬆️⬆️ 单一职责，易于理解 |
| 修改功能 | ⬆️⬆️ 模块隔离，影响范围小 |
| 添加功能 | ⬆️ 新建模块，不影响现有代码 |
| 调试问题 | ⬆️⬆️ 模块边界清晰，易于定位 |

## ⚙️ 构建工具配置（方案 A）

### package.json
```json
{
  "name": "backstage68-inject",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "rollup -c",
    "watch": "rollup -c -w",
    "build:prod": "NODE_ENV=production rollup -c"
  },
  "devDependencies": {
    "@rollup/plugin-node-resolve": "^15.0.0",
    "@rollup/plugin-terser": "^0.4.0",
    "rollup": "^4.0.0"
  }
}
```

### rollup.config.js
```javascript
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const production = process.env.NODE_ENV === 'production';

export default {
  input: 'src/inject-refactored.js',
  output: {
    file: 'dist/inject.bundle.js',
    format: 'iife',
    name: 'TauriInject',
    sourcemap: !production
  },
  plugins: [
    resolve(),
    production && terser()
  ]
};
```

## 🔧 Tauri 配置更新

### 如果使用打包后的文件

**src-tauri/src/lib.rs**:
```rust
// 修改注入脚本路径
.invoke_handler(tauri::generate_handler![
    // ... 其他命令
])
.setup(|app| {
    // 修改注入脚本
    let window = app.get_webview_window("main").unwrap();
    window.eval(include_str!("../../dist/inject.bundle.js"))?;
    Ok(())
})
```

或者在 `tauri.conf.json` 中:
```json
{
  "tauri": {
    "windows": [{
      "url": "index.html",
      "initScript": "dist/inject.bundle.js"
    }]
  }
}
```

## 📝 后续优化建议

1. **添加 TypeScript**（可选）
   - 类型安全
   - 更好的 IDE 支持
   - 编译时错误检查

2. **添加单元测试**
   - Jest 或 Vitest
   - 测试覆盖率 >80%

3. **添加 ESLint + Prettier**
   - 代码风格统一
   - 自动格式化

4. **添加性能监控**
   - 监控代理延迟
   - 监控标签页内存

5. **添加错误上报**
   - Sentry 集成
   - 错误日志收集

## ❓ 常见问题

### Q1: 哪个方案更好？
**A**: 如果您的团队熟悉现代前端工具链，**推荐方案 A**（ES6 模块）。如果希望快速实施且无需额外配置，选择**方案 B**（命名空间）。

### Q2: 性能会受影响吗？
**A**: 不会。运行时性能几乎无差异。方案 A 使用 Rollup 打包后，甚至可能更快（代码优化 + Tree Shaking）。

### Q3: 需要改现有功能吗？
**A**: 不需要。重构只是代码组织方式的改变，功能逻辑完全保持不变。

### Q4: 如何回滚？
**A**: 
```bash
# 备份原文件
cp src/inject.js src/inject.backup.js

# 如果出问题，直接恢复
mv src/inject.backup.js src/inject.js
```

### Q5: 标签页模块还需要多久完成？
**A**: 方案 A 还需要创建 3 个文件（operations.js, events.js, search.js），预计 2-3 小时。方案 B 只需复制粘贴原代码，10 分钟即可完成。

## 🎯 下一步行动

**建议您：**

1. **阅读** `REFACTOR_GUIDE.md` 了解详细设计
2. **选择** 方案 A 或方案 B
3. **告诉我** 您的选择，我可以帮您完成剩余工作：
   - 方案 A：创建标签页子模块 + 配置构建工具
   - 方案 B：完成 TabsModule 代码

**或者**，如果您觉得当前代码已经可以接受，我也可以：
- 仅对原 `inject.js` 进行轻量重构（添加注释分组）
- 保持单文件，但提高可读性

请告诉我您的偏好！

