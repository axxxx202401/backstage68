/**
 * 标签页操作模块 - CRUD 操作
 */

import { TAB_CONFIG, updateTabWidths } from './ui.js';
import { applyLinuxFixesToIframe } from '../linux-fixes.js';

// 创建标签 DOM 元素
export function createTabElement(id, title, callbacks) {
  const { onClose, onSwitch, onContextMenu } = callbacks;
  
  const tab = document.createElement('div');
  tab.className = 'tauri-tab';
  tab.dataset.tabId = id;
  
  const titleSpan = document.createElement('span');
  titleSpan.className = 'tauri-tab-title';
  titleSpan.textContent = title || '新标签页';
  tab.appendChild(titleSpan);
  
  if (TAB_CONFIG.enableCloseButton) {
    const closeBtn = document.createElement('span');
    closeBtn.className = 'tauri-tab-close';
    closeBtn.innerHTML = '×';
    closeBtn.title = '关闭标签 (Cmd+W)';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClose(id);
    });
    tab.appendChild(closeBtn);
  }
  
  // 改为 mousedown 事件，点击立即切换（不等松手）
  tab.addEventListener('mousedown', (e) => {
    // 只响应左键，且不在拖拽状态
    if (e.button === 0) {
      // 短暂延迟，如果开始拖拽就不切换
      setTimeout(() => {
        if (!window.__sortableDragging) {
          onSwitch(id);
        }
      }, 10);
    }
  });
  
  // 绑定右键菜单
  tab.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) {
      onContextMenu(id, e.clientX, e.clientY);
    }
  });
  
  // 标记 tab 的 id
  tab.dataset.tabId = id;
  
  // 不再需要 HTML5 drag 事件监听器，改用鼠标事件
  
  return tab;
}

// 创建 iframe 容器
export function createIframeContainer() {
  const container = document.createElement('div');
  container.className = 'tauri-iframe-container';
  document.body.appendChild(container);
  return container;
}

// 创建 iframe
function inheritIframeProxy(iframe, log) {
  const MAX_ATTEMPTS = 5;
  let attempt = 0;

  function applyProxy() {
    attempt++;
    try {
      const iframeWindow = iframe.contentWindow;
      if (!iframeWindow) {
        throw new Error('contentWindow 不可用');
      }
      iframeWindow.fetch = window.fetch;
      iframeWindow.XMLHttpRequest = window.XMLHttpRequest;
      log(`✅ iframe 已继承父窗口的代理 (第 ${attempt} 次尝试)`);
      return true;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        log(`⏳ iframe 代理未就绪，准备重试 (${attempt}/${MAX_ATTEMPTS})`);
        setTimeout(applyProxy, 100 * attempt);
      } else {
        log(`⚠️  无法设置 iframe 代理: ${err.message}`);
      }
      return false;
    }
  }

  applyProxy();
}

export function createIframe(url, log) {
  const container = document.querySelector('.tauri-iframe-container') || createIframeContainer();
  
  const iframe = document.createElement('iframe');
  iframe.className = 'tauri-tab-iframe';
  iframe.src = url;
  
  container.appendChild(iframe);
  
  // 设置 iframe 事件的函数
  const setupIframeEventsWrapper = () => {
    try {
      const iframeDoc = iframe.contentDocument;
      if (iframeDoc && window.self === window.top) {
        // 在 iframe 内部添加键盘事件监听器
        setupIframeEvents(iframeDoc, log);
        
        // 在 iframe 内部添加手势监听器
        if (window.tauriTabs && window.tauriTabs.setupGestureInIframe) {
          window.tauriTabs.setupGestureInIframe(iframeDoc);
        }
        
        // 在 iframe 内应用 Linux 修复（双击选中、边框样式等）
        applyLinuxFixesToIframe(iframeDoc, log);
      }
    } catch (err) {
      log(`⚠️  处理 iframe 事件失败: ${err.message}`);
    }
  };
  
  // iframe 加载完成后，设置代理和事件监听
  iframe.addEventListener('load', () => {
    inheritIframeProxy(iframe, log);
    setupIframeEventsWrapper();
    log(`✅ iframe 事件监听器已安装`);
  });
  
  // 定期检查并重新绑定事件（应对 SPA 内部路由变化）
  // 每 2 秒检查一次，确保事件监听器仍然有效
  const checkInterval = setInterval(() => {
    try {
      // 检查 iframe 是否还在 DOM 中
      if (!iframe.isConnected) {
        clearInterval(checkInterval);
        return;
      }
      
      const iframeDoc = iframe.contentDocument;
      if (iframeDoc && !iframeDoc.__tauriEventsSetup) {
        log('🔄 检测到 iframe document 变化，重新绑定事件');
        setupIframeEventsWrapper();
      }
    } catch (err) {
      // 跨域错误，忽略
    }
  }, 2000);
  
  // 保存 interval ID 以便清理
  iframe.__checkInterval = checkInterval;
  
  return iframe;
}

// 设置 iframe 内部事件
function setupIframeEvents(iframeDoc, log) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  // 标记已绑定，避免重复绑定
  if (iframeDoc.__tauriEventsSetup) {
    log('⚠️ iframe 事件已绑定，跳过');
    return;
  }
  iframeDoc.__tauriEventsSetup = true;
  
  // 键盘事件处理函数
  const handleKeydown = (e) => {
    const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    
    if (!isCtrlOrCmd) return;
    
    // Ctrl+F / Cmd+F: 页面搜索（优先级最高）
    if (e.key === 'f') {
      e.preventDefault();
      e.stopPropagation();
      // 调用父窗口的搜索功能
      if (window.tauriTabs && window.tauriTabs.showPageSearch) {
        window.tauriTabs.showPageSearch();
      }
      return;
    }
    
    // Cmd+Shift+R: 强制刷新（清除缓存）- 放在最前面优先处理
    if ((e.key === 'R' || e.key === 'r') && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      log('🔄 检测到 Cmd+Shift+R 快捷键');
      if (window.tauriTabs && window.tauriTabs.activeTabId && window.tauriTabs.hardRefreshTab) {
        window.tauriTabs.hardRefreshTab(window.tauriTabs.activeTabId);
      }
      return;
    }
    
    // 缩放快捷键
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      if (window.tauriZoom && window.tauriZoom.zoomIn) {
        window.tauriZoom.zoomIn();
      }
    } else if (e.key === '-') {
      e.preventDefault();
      if (window.tauriZoom && window.tauriZoom.zoomOut) {
        window.tauriZoom.zoomOut();
      }
    } else if (e.key === '0') {
      e.preventDefault();
      if (window.tauriZoom && window.tauriZoom.reset) {
        window.tauriZoom.reset();
      }
    }
    
    // 标签页快捷键
    if (window.tauriTabs && window.tauriTabs.tabs) {
      if (e.key === 't') {
        e.preventDefault();
        const activeTab = window.tauriTabs.tabs.find(t => t.id === window.tauriTabs.activeTabId);
        const currentUrl = activeTab ? activeTab.url : window.location.href;
        if (window.tauriTabs.createTab) {
          window.tauriTabs.createTab(currentUrl);
        }
      } else if (e.key === 'w' && window.tauriTabs.tabs.length > 1) {
        e.preventDefault();
        if (window.tauriTabs.activeTabId && window.tauriTabs.closeTab) {
          window.tauriTabs.closeTab(window.tauriTabs.activeTabId);
        }
      } else if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < window.tauriTabs.tabs.length && window.tauriTabs.activateTab) {
          window.tauriTabs.activateTab(window.tauriTabs.tabs[index].id);
        }
      }
    }
  };
  
  // 在 document 和 window 两个级别都监听，确保捕获
  iframeDoc.addEventListener('keydown', handleKeydown, true);
  
  // 也在 contentWindow 上监听（某些 SPA 可能在 window 级别拦截）
  try {
    const iframeWindow = iframeDoc.defaultView;
    if (iframeWindow && !iframeWindow.__tauriKeydownSetup) {
      iframeWindow.__tauriKeydownSetup = true;
      iframeWindow.addEventListener('keydown', handleKeydown, true);
      log('✅ iframe window 键盘事件已绑定');
    }
  } catch (err) {
    log(`⚠️ 无法在 iframe window 绑定事件: ${err.message}`);
  }
  
  // 鼠标滚轮缩放
  iframeDoc.addEventListener('wheel', (e) => {
    const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    
    if (isCtrlOrCmd) {
      e.preventDefault();
      if (e.deltaY < 0) {
        if (window.tauriZoom && window.tauriZoom.zoomIn) {
          window.tauriZoom.zoomIn();
        }
      } else {
        if (window.tauriZoom && window.tauriZoom.zoomOut) {
          window.tauriZoom.zoomOut();
        }
      }
    }
  }, { passive: false, capture: true });
}

// 创建新标签
export function createTab(url) {
  const tabs = window.tauriTabs.tabs;
  const log = window.tauriTabs.log;
  
  if (tabs.length >= TAB_CONFIG.maxTabs) {
    alert(`最多只能打开 ${TAB_CONFIG.maxTabs} 个标签`);
    return;
  }
  
  const id = 'tab-' + (++window.tauriTabs.nextId);
  const title = '加载中...';
  
  log(`📑 创建新标签: ${id}, URL: ${url}`);
  
  const tabElement = createTabElement(id, title, {
    onClose: closeTab,
    onSwitch: activateTab,
    onContextMenu: window.tauriTabs.showContextMenu || (() => {})
  });
  
  const iframe = createIframe(url, log);
  
  const tabsContainer = document.querySelector('.tauri-tabs-container');
  const newTabBtn = tabsContainer.querySelector('.tauri-new-tab');
  tabsContainer.insertBefore(tabElement, newTabBtn);
  
  const tabData = {
    id,
    url,
    title,
    element: tabElement,
    iframe
  };
  
  tabs.push(tabData);
  
  // 监听 iframe 标题变化
  setupTitleObserver(iframe, id, tabData, log);
  
  activateTab(id);
  updateTabWidths();
  
  return id;
}

// 设置标题观察器
function setupTitleObserver(iframe, id, tabData, log) {
  iframe.addEventListener('load', () => {
    // 先清理旧的观察器和定时器，避免多个同时运行导致标题闪烁
    if (tabData.titleObserver) {
      tabData.titleObserver.disconnect();
      tabData.titleObserver = null;
    }
    if (tabData.titleCheckInterval) {
      clearInterval(tabData.titleCheckInterval);
      tabData.titleCheckInterval = null;
    }
    
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const newTitle = iframeDoc.title || tabData.url;
      updateTabTitle(id, newTitle);
      
      log(`📄 iframe 加载完成，标题: ${newTitle}`);
      
      // 监听标题变化
      const titleElement = iframeDoc.querySelector('title');
      if (titleElement) {
        const observer = new MutationObserver(() => {
          const updatedTitle = iframeDoc.title;
          if (updatedTitle && updatedTitle !== tabData.title) {
            updateTabTitle(id, updatedTitle);
          }
        });
        observer.observe(titleElement, { 
          subtree: true, 
          characterData: true, 
          childList: true 
        });
        tabData.titleObserver = observer;
      }
      
      // 移除定期检查（MutationObserver 已经足够，减少不必要的更新）
    } catch (e) {
      updateTabTitle(id, tabData.url);
      log(`⚠️  无法访问 iframe 内容 (可能跨域)`);
    }
  });
}

// 激活标签
export function activateTab(id) {
  const tabs = window.tauriTabs.tabs;
  const tab = tabs.find(t => t.id === id);
  const log = window.tauriTabs.log;
  
  if (!tab) return;
  
  log(`🔄 切换到标签: ${id}`);
  
  tabs.forEach(t => {
    if (t.id === id) {
      t.element.classList.add('active');
      t.iframe.classList.add('active');
    } else {
      t.element.classList.remove('active');
      t.iframe.classList.remove('active');
    }
  });
  
  window.tauriTabs.activeTabId = id;
  
  // 更新窗口标题
  if (tab.title) {
    updateMainWindowTitle(tab.title);
  }
}

// 关闭标签
export function closeTab(id) {
  const tabs = window.tauriTabs.tabs;
  const log = window.tauriTabs.log;
  const index = tabs.findIndex(t => t.id === id);
  
  if (index === -1) return;
  
  if (tabs.length === 1) {
    log('⚠️  不能关闭最后一个标签');
    return;
  }
  
  log(`❌ 关闭标签: ${id}`);
  
  const tab = tabs[index];
  
  // 清理观察器和定时器
  if (tab.titleObserver) {
    tab.titleObserver.disconnect();
  }
  if (tab.titleCheckInterval) {
    clearInterval(tab.titleCheckInterval);
  }
  // 清理 iframe 事件检查定时器
  if (tab.iframe && tab.iframe.__checkInterval) {
    clearInterval(tab.iframe.__checkInterval);
  }
  
  tab.element.remove();
  tab.iframe.remove();
  tabs.splice(index, 1);
  
  // 切换到相邻标签
  if (id === window.tauriTabs.activeTabId) {
    const newIndex = Math.min(index, tabs.length - 1);
    activateTab(tabs[newIndex].id);
  }
  
  updateTabWidths();
}

// 刷新标签
export function refreshTab(tabId) {
  const tab = window.tauriTabs.tabs.find(t => t.id === tabId);
  if (!tab) return;
  
  window.tauriTabs.log(`🔄 刷新标签: ${tabId}`);
  tab.iframe.src = tab.iframe.src;
}

// 强制刷新标签（清除缓存）
export function hardRefreshTab(tabId) {
  const tab = window.tauriTabs.tabs.find(t => t.id === tabId);
  if (!tab) return;
  
  window.tauriTabs.log(`🔄 强制刷新标签（清除缓存）: ${tabId}`);
  
  // 获取当前 URL
  let currentUrl = tab.url;
  try {
    const iframeUrl = tab.iframe.contentWindow?.location?.href;
    if (iframeUrl && !iframeUrl.startsWith('about:')) {
      currentUrl = iframeUrl;
    }
  } catch (e) {
    // 跨域无法访问，使用原始 URL
  }
  
  window.tauriTabs.log(`   当前 URL: ${currentUrl}`);
  
  // 方法：先设为 about:blank 清空，再重新加载原 URL
  // 这样可以强制 WebView 重新请求资源
  const iframe = tab.iframe;
  
  // 保存原 URL
  const originalUrl = currentUrl;
  
  // 先清空
  iframe.src = 'about:blank';
  
  // 短暂延迟后重新加载原 URL
  setTimeout(() => {
    iframe.src = originalUrl;
    window.tauriTabs.log(`   重新加载: ${originalUrl}`);
  }, 50);
}

export function getTabCurrentUrl(tab, log) {
  if (!tab) {
    return window.location.href;
  }
  
  let currentUrl = tab.url || window.location.href;
  
  if (!tab.iframe) {
    return currentUrl;
  }
  
  try {
    const iframeWindow = tab.iframe.contentWindow;
    const href = iframeWindow?.location?.href;
    if (href) {
      if (log) {
        log(`   使用 iframe 当前 URL: ${href}`);
      }
      return href;
    }
  } catch (err) {
    if (log) {
      log(`   无法获取 iframe 当前 URL，使用原始 URL: ${currentUrl}`);
    }
  }
  
  return currentUrl;
}

// 复制标签
export function duplicateTab(tabId) {
  const tab = window.tauriTabs.tabs.find(t => t.id === tabId);
  const tabs = window.tauriTabs.tabs;
  const log = window.tauriTabs.log;
  
  if (!tab) return;
  
  if (tabs.length >= TAB_CONFIG.maxTabs) {
    alert(`最多只能打开 ${TAB_CONFIG.maxTabs} 个标签`);
    return;
  }
  
  log(`📋 复制标签: ${tabId}, URL: ${tab.url}`);
  
  const currentUrl = getTabCurrentUrl(tab, log);
  
  createTab(currentUrl);
}

// 在新窗口打开标签
export async function openTabInNewWindow(tabId) {
  const tab = window.tauriTabs.tabs.find(t => t.id === tabId);
  const log = window.tauriTabs.log;
  
  if (!tab) return;
  
  log(`🪟 在新窗口打开: ${tab.url}`);
  try {
    const currentUrl = getTabCurrentUrl(tab, log);

    if (window.tauriOpenNewWindow) {
      await window.tauriOpenNewWindow(currentUrl);
    } else {
      log('❌ 无法打开新窗口：tauriOpenNewWindow 未初始化');
    }
  } catch (err) {
    console.error('Failed to open new window:', err);
  }
}

// 关闭左侧标签
export function closeTabsToLeft(tabId) {
  const tabs = window.tauriTabs.tabs;
  const log = window.tauriTabs.log;
  const index = tabs.findIndex(t => t.id === tabId);
  
  if (index <= 0) return;
  
  log(`⬅️ 关闭左侧 ${index} 个标签`);
  
  for (let i = index - 1; i >= 0; i--) {
    closeTab(tabs[i].id);
  }
}

// 关闭右侧标签
export function closeTabsToRight(tabId) {
  const tabs = window.tauriTabs.tabs;
  const log = window.tauriTabs.log;
  const index = tabs.findIndex(t => t.id === tabId);
  
  if (index === -1 || index === tabs.length - 1) return;
  
  const count = tabs.length - index - 1;
  log(`➡️ 关闭右侧 ${count} 个标签`);
  
  for (let i = tabs.length - 1; i > index; i--) {
    closeTab(tabs[i].id);
  }
}

// 关闭其他标签
export function closeOtherTabs(tabId) {
  const tabs = window.tauriTabs.tabs;
  const log = window.tauriTabs.log;
  const tabsToClose = tabs.filter(t => t.id !== tabId);
  
  log(`🗑️ 关闭其他 ${tabsToClose.length} 个标签`);
  
  tabsToClose.forEach(tab => closeTab(tab.id));
}

// 重新排序标签
export function reorderTabs(draggedId, targetId) {
  const tabs = window.tauriTabs.tabs;
  const log = window.tauriTabs.log;
  const draggedIndex = tabs.findIndex(t => t.id === draggedId);
  const targetIndex = tabs.findIndex(t => t.id === targetId);
  
  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    log(`⚠️ 重新排序失败: draggedIndex=${draggedIndex}, targetIndex=${targetIndex}`);
    return;
  }
  
  log(`🔄 标签重新排序: ${draggedId} (索引 ${draggedIndex}) 移动到 ${targetId} (索引 ${targetIndex})`);
  
  // 移动数组中的位置
  const [draggedTab] = tabs.splice(draggedIndex, 1);
  tabs.splice(targetIndex, 0, draggedTab);
  
  // 更新 DOM
  const tabsContainer = document.querySelector('.tauri-tabs-container');
  const newTabBtn = tabsContainer.querySelector('.tauri-new-tab');
  
  if (!tabsContainer || !newTabBtn) {
    log('❌ 找不到标签容器或新建按钮');
    return;
  }
  
  // 只移除标签元素（不移除按钮和其他控件）
  Array.from(tabsContainer.querySelectorAll('.tauri-tab')).forEach(tabEl => {
    tabEl.remove();
  });
  
  // 按新顺序添加标签
  tabs.forEach(tab => {
    tabsContainer.insertBefore(tab.element, newTabBtn);
  });
  
  updateTabWidths();
  log(`✅ 标签重新排序完成，新顺序: ${tabs.map(t => t.id).join(', ')}`);
}

// 更新标签标题
export function updateTabTitle(id, title) {
  const tab = window.tauriTabs.tabs.find(t => t.id === id);
  const log = window.tauriTabs.log;
  
  if (!tab) {
    log(`⚠️  updateTabTitle: 找不到标签 ${id}`);
    return;
  }
  
  if (tab.title === title) return;
  
  tab.title = title;
  const titleSpan = tab.element.querySelector('.tauri-tab-title');
  if (titleSpan) {
    titleSpan.textContent = title;
    titleSpan.title = title;
    log(`✅ 标签标题已更新: ${id} -> ${title}`);
  } else {
    log(`⚠️  找不到标题元素: ${id}`);
  }
  
  if (id === window.tauriTabs.activeTabId) {
    updateMainWindowTitle(title);
  }
}

// 切换到下一个标签（向右）
export function switchToNextTab() {
  const tabs = window.tauriTabs.tabs;
  const currentId = window.tauriTabs.activeTabId;
  const log = window.tauriTabs.log;
  
  if (!currentId || tabs.length <= 1) return;
  
  const currentIndex = tabs.findIndex(t => t.id === currentId);
  if (currentIndex === -1) return;
  
  // 循环到下一个标签，如果是最后一个则回到第一个
  const nextIndex = (currentIndex + 1) % tabs.length;
  const nextTab = tabs[nextIndex];
  
  log(`➡️ 手势切换到下一个标签: ${nextTab.id}`);
  activateTab(nextTab.id);
}

// 切换到上一个标签（向左）
export function switchToPrevTab() {
  const tabs = window.tauriTabs.tabs;
  const currentId = window.tauriTabs.activeTabId;
  const log = window.tauriTabs.log;
  
  if (!currentId || tabs.length <= 1) return;
  
  const currentIndex = tabs.findIndex(t => t.id === currentId);
  if (currentIndex === -1) return;
  
  // 循环到上一个标签，如果是第一个则回到最后一个
  const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  const prevTab = tabs[prevIndex];
  
  log(`⬅️ 手势切换到上一个标签: ${prevTab.id}`);
  activateTab(prevTab.id);
}

// 更新主窗口标题
async function updateMainWindowTitle(title) {
  try {
    const invoke = window.tauriTabs.invoke;
    await invoke('set_window_title', { title: `${title} - ${window.tauriTabs.envName || 'Backstage68'}` });
  } catch (err) {
    console.error('Failed to update window title:', err);
  }
}

