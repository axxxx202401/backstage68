# 🚀 重构后快速开始指南

## ✅ 重构已完成

`inject.js` (2089行) 已成功重构为 **11 个模块**，主文件仅 **50 行**！

## 📦 当前状态

- ✅ 所有功能正常（代理、缩放、标签页、多窗口）
- ✅ 代码已构建并测试通过
- ✅ 原文件已备份为 `src/inject.legacy.js`
- ✅ 生成的 `src/inject.js` 可直接使用（无需任何改动）

## 🎯 日常开发流程

### 修改代码

**重要**: 不要直接编辑 `src/inject.js`，它是自动生成的！

1. **编辑模块化源码**:
   ```bash
   # 编辑以下任何文件
   src/inject-refactored.js     # 主入口
   src/modules/proxy.js          # 代理拦截
   src/modules/zoom.js           # 页面缩放
   src/modules/window.js         # 多窗口
   src/modules/tabs/*.js         # 标签页相关
   ```

2. **重新构建**:
   ```bash
   npm run build
   ```

3. **测试**:
   ```bash
   ./build.sh test
   ```

### 快捷命令

```bash
# 安装依赖（首次使用）
npm install

# 开发构建（带 sourcemap，方便调试）
npm run build

# 生产构建（压缩，体积更小）
npm run build:prod

# 监听模式（文件改变自动重新构建）
npm run watch
```

## 📂 模块说明

| 模块 | 文件 | 行数 | 功能 |
|------|------|------|------|
| 主入口 | `inject-refactored.js` | 50 | 协调所有模块 |
| 日志 | `modules/logger.js` | 30 | 日志管理 |
| 代理 | `modules/proxy.js` | 300 | HTTP 拦截 |
| 缩放 | `modules/zoom.js` | 180 | 页面缩放 |
| 窗口 | `modules/window.js` | 120 | 多窗口支持 |
| 标签UI | `modules/tabs/ui.js` | 180 | 标签栏UI |
| 标签操作 | `modules/tabs/operations.js` | 420 | CRUD 操作 |
| 标签事件 | `modules/tabs/events.js` | 180 | 快捷键/拖拽 |
| 标签搜索 | `modules/tabs/search.js` | 220 | 搜索功能 |
| 标签管理器 | `modules/tabs/manager.js` | 130 | 主控制器 |
| DOM工具 | `modules/utils/dom.js` | 40 | 工具函数 |
| 存储工具 | `modules/utils/storage.js` | 30 | 存储序列化 |

## 💡 示例：添加新功能

### 1. 创建新模块

```javascript
// src/modules/analytics.js
export function initAnalytics(log, invoke) {
  log("📊 初始化数据分析模块...");
  
  // 监听页面访问
  window.addEventListener('hashchange', () => {
    const page = window.location.hash;
    log(`访问页面: ${page}`);
  });
  
  log("✅ 数据分析模块已启用");
}
```

### 2. 在主入口引入

```javascript
// src/inject-refactored.js
import { initAnalytics } from './modules/analytics.js';

// 在初始化流程中调用
initAnalytics(log, invoke);
```

### 3. 构建

```bash
npm run build
```

就这么简单！

## 🐛 故障排除

### 问题 1: 构建失败

```bash
# 清除并重新安装依赖
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 问题 2: 功能不生效

**原因**: 直接编辑了 `src/inject.js` 而没有重新构建

**解决**:
```bash
# 编辑 src/inject-refactored.js 或 src/modules/*
# 然后重新构建
npm run build
```

### 问题 3: 需要回滚到旧版本

```bash
# 方法 1: 使用备份文件
cp src/inject.legacy.js src/inject.js

# 方法 2: 使用 Git
git checkout src/inject.js
```

## 📊 性能对比

| 指标 | 旧版本 | 新版本 | 改善 |
|------|--------|--------|------|
| 主文件行数 | 2089 | 50 | -97.6% |
| 打包后大小 | 65KB | 59KB | -9.2% |
| 模块数量 | 1 | 11 | +1000% |
| 平均文件大小 | 2089行 | 155行 | -92.6% |

## 🔗 更多文档

- [REFACTOR_COMPLETE.md](./REFACTOR_COMPLETE.md) - 完整重构报告
- [REFACTOR_GUIDE.md](./REFACTOR_GUIDE.md) - 详细重构指南
- [REFACTOR_SUMMARY.md](./REFACTOR_SUMMARY.md) - 重构方案总结

## ✨ 主要优势

1. **代码清晰** - 每个模块职责单一，易于理解
2. **易于维护** - 修改某个功能不影响其他功能
3. **便于测试** - 每个模块可独立测试
4. **团队协作** - 多人可同时编辑不同模块
5. **性能优化** - 打包后文件更小（-9.2%）

---

**如有问题，请查看详细文档或联系开发团队。**

Happy Coding! 🎉

