/**
 * 标签页操作模块 - CRUD 操作
 */

import { TAB_CONFIG, updateTabWidths } from './ui.js';

// 创建标签 DOM 元素
export function createTabElement(id, title, callbacks) {
  const { onClose, onSwitch, onContextMenu, onDragEvents } = callbacks;
  
  const tab = document.createElement('div');
  tab.className = 'tauri-tab';
  tab.dataset.tabId = id;
  tab.setAttribute('draggable', 'true');
  
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
  
  tab.addEventListener('click', () => onSwitch(id));
  tab.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(id, e.clientX, e.clientY);
  });
  
  // 拖动事件
  if (onDragEvents) {
    tab.addEventListener('dragstart', (e) => onDragEvents.dragStart(e, id, tab));
    tab.addEventListener('dragend', (e) => onDragEvents.dragEnd(e, id, tab));
    tab.addEventListener('dragover', (e) => onDragEvents.dragOver(e, tab));
    tab.addEventListener('dragleave', (e) => onDragEvents.dragLeave(e, tab));
    tab.addEventListener('drop', (e) => onDragEvents.drop(e, id, tab));
  }
  
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
export function createIframe(url, log) {
  const container = document.querySelector('.tauri-iframe-container') || createIframeContainer();
  
  const iframe = document.createElement('iframe');
  iframe.className = 'tauri-tab-iframe';
  iframe.src = url;
  
  container.appendChild(iframe);
  
  // iframe 加载完成后，设置代理和事件监听
  iframe.addEventListener('load', () => {
    try {
      const iframeWindow = iframe.contentWindow;
      const iframeDoc = iframe.contentDocument;
      
      if (iframeWindow && iframeDoc && window.self === window.top) {
        // 用父窗口的代理替换 iframe 的 fetch 和 XHR
        iframeWindow.fetch = window.fetch;
        iframeWindow.XMLHttpRequest = window.XMLHttpRequest;
        log(`✅ iframe 已继承父窗口的代理`);
        
        // 在 iframe 内部添加键盘事件监听器
        setupIframeEvents(iframeDoc, log);
        
        log(`✅ iframe 事件监听器已安装`);
      }
    } catch (err) {
      log(`⚠️  无法设置 iframe: ${err.message}`);
    }
  });
  
  return iframe;
}

// 设置 iframe 内部事件
function setupIframeEvents(iframeDoc, log) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  // 键盘事件
  iframeDoc.addEventListener('keydown', (e) => {
    const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    
    if (!isCtrlOrCmd) return;
    
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
  }, true);
  
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
    onContextMenu: window.tauriTabs.showContextMenu || (() => {}),
    onDragEvents: window.tauriTabs.dragEvents || null
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
            log(`📝 检测到标题变化: ${updatedTitle}`);
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
      
      // 定期检查标题（兜底）
      const titleCheckInterval = setInterval(() => {
        try {
          const currentTitle = iframeDoc.title;
          if (currentTitle && currentTitle !== tabData.title) {
            log(`🔄 定期检查发现标题变化: ${currentTitle}`);
            updateTabTitle(id, currentTitle);
          }
        } catch (err) {
          clearInterval(titleCheckInterval);
        }
      }, 1000);
      tabData.titleCheckInterval = titleCheckInterval;
      
      // 应用当前缩放
      const zoomLevel = window.tauriTabs.currentZoom || 1.0;
      if (zoomLevel !== 1.0 && iframeDoc.body) {
        iframeDoc.body.style.zoom = zoomLevel;
        log(`🔍 应用缩放 ${Math.round(zoomLevel * 100)}% 到新标签`);
      }
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
  
  // 应用缩放
  const zoomLevel = window.tauriTabs.currentZoom || 1.0;
  if (zoomLevel !== 1.0) {
    setTimeout(() => {
      try {
        const iframeDoc = tab.iframe.contentDocument || tab.iframe.contentWindow.document;
        if (iframeDoc && iframeDoc.body) {
          iframeDoc.body.style.zoom = zoomLevel;
          log(`🔍 切换标签后应用缩放: ${Math.round(zoomLevel * 100)}%`);
        }
      } catch (e) {
        log(`⚠️  无法应用缩放到 iframe: ${e.message}`);
      }
    }, 100);
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
  
  let currentUrl = tab.url;
  try {
    const iframeWindow = tab.iframe.contentWindow;
    if (iframeWindow && iframeWindow.location && iframeWindow.location.href) {
      currentUrl = iframeWindow.location.href;
      log(`   使用 iframe 当前 URL: ${currentUrl}`);
    }
  } catch (err) {
    log(`   无法获取 iframe 当前 URL，使用原始 URL: ${tab.url}`);
  }
  
  createTab(currentUrl);
}

// 在新窗口打开标签
export async function openTabInNewWindow(tabId) {
  const tab = window.tauriTabs.tabs.find(t => t.id === tabId);
  const log = window.tauriTabs.log;
  const invoke = window.tauriTabs.invoke;
  
  if (!tab) return;
  
  log(`🪟 在新窗口打开: ${tab.url}`);
  try {
    await invoke('create_new_window', { 
      currentUrl: tab.url,
      storageData: null
    });
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
  
  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;
  
  log(`🔄 标签重新排序: ${draggedId} (索引 ${draggedIndex}) 移动到 ${targetId} (索引 ${targetIndex})`);
  
  // 移动数组中的位置
  const [draggedTab] = tabs.splice(draggedIndex, 1);
  tabs.splice(targetIndex, 0, draggedTab);
  
  // 更新 DOM
  const tabsContainer = document.querySelector('.tauri-tabs-container');
  const newTabBtn = tabsContainer.querySelector('.tauri-new-tab');
  
  // 清空标签容器（保留新建按钮）
  Array.from(tabsContainer.children).forEach(child => {
    if (!child.classList.contains('tauri-new-tab')) {
      child.remove();
    }
  });
  
  // 按新顺序添加标签
  tabs.forEach(tab => {
    tabsContainer.insertBefore(tab.element, newTabBtn);
  });
  
  updateTabWidths();
  log(`✅ 标签重新排序完成`);
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

// 更新主窗口标题
async function updateMainWindowTitle(title) {
  try {
    const invoke = window.tauriTabs.invoke;
    await invoke('set_window_title', { title: `${title} - ${window.tauriTabs.envName || 'Backstage68'}` });
  } catch (err) {
    console.error('Failed to update window title:', err);
  }
}

