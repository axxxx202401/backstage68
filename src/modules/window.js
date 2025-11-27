/**
 * 多窗口支持模块
 */

import { serializeStorage } from './utils/storage.js';
import { getModifierKey } from './utils/dom.js';

export function initWindow(log, invoke) {
  log("🪟 初始化多窗口模块...");

  // 创建新窗口（打开当前页面，并复制登录状态）
  window.tauriOpenNewWindow = async function(url) {
    try {
      const targetUrl = url || window.location.href;
      log(`🪟 准备打开新窗口: ${targetUrl}`);
      
      const storageData = serializeStorage();
      
      const windowLabel = await invoke('create_new_window', { 
        currentUrl: targetUrl,
        storageData: JSON.stringify(storageData)
      });
      
      log(`✅ 新窗口已创建: ${windowLabel}`);
      return windowLabel;
    } catch (err) {
      console.error("❌ 创建窗口失败:", err);
      throw err;
    }
  };

  // 快捷键：Cmd/Ctrl+Shift+N 创建新窗口（打开当前页面）
  document.addEventListener('keydown', (e) => {
    if (getModifierKey(e) && e.shiftKey && e.key === 'n') {
      e.preventDefault();
      e.stopPropagation();
      log('🔥 Cmd+Shift+N 触发，打开新窗口');
      window.tauriOpenNewWindow();
    }
  }, true);

  // 窗口标题同步
  initWindowTitleSync(log, invoke);

  log("✅ 多窗口模块已启用");
}

// 窗口标题同步（跟随页面标题变化）
function initWindowTitleSync(log, invoke) {
  let envName = 'Backstage68';
  
  // 异步获取环境名称
  (async function() {
    try {
      const envInfo = await invoke('get_env_info');
      const match = envInfo.match(/当前环境: (.+?) \(/);
      if (match) {
        envName = match[1];
        log(`✅ 环境名称: ${envName}`);
      }
    } catch (err) {
      log('⚠️ 无法获取环境名称，使用默认值');
    }
  })();
  
  // 更新窗口标题的函数
  async function updateWindowTitle() {
    try {
      const pageTitle = document.title || '未命名页面';
      const newTitle = `${pageTitle} - ${envName}`;
      
      await invoke('set_window_title', { title: newTitle });
      log(`✅ 窗口标题已更新: ${newTitle}`);
    } catch (err) {
      console.error('❌ 更新窗口标题失败:', err);
    }
  }
  
  // 监听 document.title 变化
  const titleObserver = new MutationObserver(() => {
    log('🔔 检测到标题变化:', document.title);
    updateWindowTitle();
  });
  
  const titleElement = document.querySelector('title');
  if (titleElement) {
    titleObserver.observe(titleElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
    log('👀 开始监听页面标题变化');
  }
  
  // 初始化时更新一次标题
  if (document.readyState === 'complete') {
    setTimeout(updateWindowTitle, 500);
  } else {
    window.addEventListener('load', () => {
      setTimeout(updateWindowTitle, 500);
    });
  }
  
  // 路由变化时也更新标题（适配 SPA）
  let lastUrl = window.location.href;
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      log('🔄 路由变化，等待标题更新...');
      setTimeout(updateWindowTitle, 300);
    }
  }, 500);
}

