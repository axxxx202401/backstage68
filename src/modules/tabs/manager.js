/**
 * 标签页管理模块
 */

import { createTabBar, updateTabWidths, TAB_CONFIG } from './ui.js';
import { createTab, closeTab, activateTab, duplicateTab, reorderTabs } from './operations.js';
import { initTabEvents } from './events.js';
import { showTabSearch } from './search.js';

export function initTabs(log, invoke) {
  // 检查是否在 iframe 内部
  if (window.self !== window.top) {
    log("⚠️  在 iframe 内，跳过标签页初始化");
    return;
  }
  
  // 检查是否已经初始化过
  if (window.__TAURI_TABS_INITIALIZED__) {
    log("⚠️  标签页系统已初始化，跳过");
    return;
  }
  
  // 等待 DOM 加载完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initTabs(log, invoke));
    return;
  }
  
  log("🏷️ 初始化标签页模块...");
  
  // 标记已初始化
  window.__TAURI_TABS_INITIALIZED__ = true;
  
  // 获取环境名称
  let envName = 'Backstage68';
  (async function() {
    try {
      const envInfo = await invoke('get_env_info');
      const match = envInfo.match(/当前环境: (.+?) \(/);
      if (match) {
        envName = match[1];
      }
    } catch (err) {
      // 使用默认值
    }
  })();

  // 创建标签管理器
  window.tauriTabs = {
    tabs: [],
    activeTabId: null,
    nextId: 0,
    currentZoom: 1.0,
    envName,
    log,
    invoke
  };

  // 创建标签栏
  const { tabBar, tabsContainer, controlsContainer } = createTabBar();
  
  // 添加新建按钮
  const newTabBtn = document.createElement('div');
  newTabBtn.className = 'tauri-new-tab';
  newTabBtn.innerHTML = '+';
  newTabBtn.title = '新建标签 (Cmd+T)';
  newTabBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const activeTab = window.tauriTabs.tabs.find(t => t.id === window.tauriTabs.activeTabId);
    const currentUrl = activeTab ? activeTab.url : window.location.href;
    createTab(currentUrl);
  };
  tabsContainer.appendChild(newTabBtn);
  
  // 添加搜索按钮
  const searchBtn = document.createElement('div');
  searchBtn.className = 'tauri-search-tab';
  searchBtn.innerHTML = '🔍';
  searchBtn.title = '搜索标签 (Cmd+Shift+A)';
  searchBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showTabSearch();
  };
  controlsContainer.appendChild(searchBtn);

  // 初始化事件监听
  initTabEvents();

  // 创建首个标签
  const initialUrl = window.location.href;
  createTab(initialUrl);
  
  // 隐藏原始 body 内容
  Array.from(document.body.children).forEach(child => {
    if (child.id !== 'tauri-tab-bar' && 
        !child.classList.contains('tauri-iframe-container') &&
        !child.id?.includes('zoom')) {
      child.style.display = 'none';
    }
  });

  // 窗口大小变化时更新标签宽度
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      updateTabWidths();
      log('🔄 窗口大小变化，重新计算标签宽度');
    }, 200);
  });

  // 暴露 API
  window.tauriTabs.createTab = createTab;
  window.tauriTabs.closeTab = closeTab;
  window.tauriTabs.activateTab = activateTab;
  window.tauriTabs.duplicateTab = duplicateTab;
  window.tauriTabs.reorderTabs = reorderTabs;
  window.tauriTabs.showSearch = showTabSearch;
  window.tauriTabs.updateTabWidths = updateTabWidths;

  log("✅ 标签页模块已启用");
  console.log("🎉 标签页功能已启用:");
  console.log("  ╔════════════════════════════════════╗");
  console.log("  ║  快捷键                            ║");
  console.log("  ╠════════════════════════════════════╣");
  console.log("  ║  Cmd+T          新建标签           ║");
  console.log("  ║  Cmd+W          关闭当前标签       ║");
  console.log("  ║  Cmd+Shift+A    搜索标签           ║");
  console.log("  ║  Cmd+Shift+N    新窗口（多窗口）   ║");
  console.log("  ║  Cmd+1~9        切换到第 N 个标签  ║");
  console.log("  ╠════════════════════════════════════╣");
  console.log("  ║  鼠标操作                          ║");
  console.log("  ╠════════════════════════════════════╣");
  console.log("  ║  拖动标签        重新排序          ║");
  console.log("  ║  右键标签        显示菜单          ║");
  console.log("  ║  点击 🔍        搜索标签           ║");
  console.log("  ║  点击 +          新建标签          ║");
  console.log("  ╚════════════════════════════════════╝");
  console.log(`  最多支持 ${TAB_CONFIG.maxTabs} 个标签，动态宽度，拖动排序，搜索功能`);
}

