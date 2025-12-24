/**
 * Tauri 注入脚本 - 重构版本
 * 
 * 模块化架构：
 * ├── logger.js - 日志工具
 * ├── utils/
 * │   ├── dom.js - DOM 工具函数
 * │   └── storage.js - 存储工具
 * ├── proxy.js - HTTP 代理拦截 (Fetch + XMLHttpRequest)
 * ├── zoom.js - 页面缩放控制
 * ├── window.js - 多窗口支持和标题同步
 * ├── linux-fixes.js - Linux 特定问题修复
 * └── tabs/
 *     ├── manager.js - 标签页管理器（主入口）
 *     ├── ui.js - 标签栏 UI 和样式
 *     ├── operations.js - 标签 CRUD 操作
 *     ├── events.js - 键盘快捷键和拖拽
 *     └── search.js - 标签搜索功能
 * 
 * 从 2089 行单文件重构为 12 个模块，平均每个模块 ~170 行
 */

import { initLogger } from './modules/logger.js';
import { isInIframe } from './modules/utils/dom.js';
import { initProxy } from './modules/proxy.js';
import { initZoom } from './modules/zoom.js';
import { initWindow } from './modules/window.js';
import { initTabs } from './modules/tabs/manager.js';
import { initLinuxFixes } from './modules/linux-fixes.js';
import { initDownload } from './modules/download.js';

(function() {
  const log = initLogger();
  log("🚀 Tauri 注入脚本启动（重构版）");

  const isIframe = isInIframe();

  // 检查 Tauri API
  if (!window.__TAURI__ || !window.__TAURI__.core || !window.__TAURI__.core.invoke) {
    console.error("❌ Tauri API 不可用！代理将无法工作");
    return;
  }

  const invoke = window.__TAURI__.core.invoke;
  log("✅ Tauri API 准备就绪");

  if (isIframe) {
    log("⚠️  当前处于 iframe，上线轻量模式：仅启用代理模块");
    try {
      initProxy(log, invoke);
      log("✅ iframe 代理模块已启用");
    } catch (err) {
      console.error("❌ iframe 代理模块初始化失败:", err);
    }
    return;
  }

  // 初始化各模块
  try {
    // 1. 代理拦截（拦截所有 /base_api/ 请求，添加安全头）
    initProxy(log, invoke);

    // 2. 页面缩放（Cmd +/-/0，滚轮缩放）
    initZoom(log);

    // 3. 多窗口支持（Cmd+Shift+N，共享登录状态）
    initWindow(log, invoke);

    // 4. 标签页系统（浏览器风格标签页，支持 20 个标签）
    initTabs(log, invoke);

    // 5. Linux 特定修复（双击选中、边框渲染等）
    initLinuxFixes(log);

    // 6. 下载目录检测（修复 Linux 下载目录问题）
    initDownload(log, invoke);

    log("🎉 所有模块初始化完成");
  } catch (err) {
    console.error("❌ 模块初始化失败:", err);
  }
})();

