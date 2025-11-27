/**
 * 标签页事件模块 - 键盘快捷键、拖拽、右键菜单
 */

import { createTab, closeTab, activateTab, refreshTab, duplicateTab, openTabInNewWindow, closeTabsToLeft, closeTabsToRight, closeOtherTabs, reorderTabs } from './operations.js';

// 初始化事件监听
export function initTabEvents() {
  setupKeyboardShortcuts();
  setupDragEvents();
  window.tauriTabs.showContextMenu = showTabContextMenu;
  
  // 添加上下文菜单样式
  if (document.head) {
    const contextMenuStyle = document.createElement('style');
    contextMenuStyle.textContent = `
      .tauri-tab-context-menu {
        animation: menuFadeIn 0.15s ease-out;
      }
      @keyframes menuFadeIn {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(contextMenuStyle);
  }
}

// 键盘快捷键
function setupKeyboardShortcuts() {
  if (window.self !== window.top) return;
  
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    
    if (!isCtrlOrCmd) return;
    if (!window.tauriTabs || !window.tauriTabs.tabs) return;
    
    // Cmd+T: 新建标签
    if (e.key === 't') {
      e.preventDefault();
      e.stopPropagation();
      const activeTab = window.tauriTabs.tabs.find(t => t.id === window.tauriTabs.activeTabId);
      const currentUrl = activeTab ? activeTab.url : window.location.href;
      createTab(currentUrl);
    }
    
    // Cmd+W: 关闭当前标签
    else if (e.key === 'w') {
      if (window.tauriTabs.tabs.length > 1 && window.tauriTabs.activeTabId) {
        e.preventDefault();
        e.stopPropagation();
        closeTab(window.tauriTabs.activeTabId);
      }
    }
    
    // Cmd+Shift+N: 新窗口
    else if (e.key === 'N' && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      const activeTab = window.tauriTabs.tabs.find(t => t.id === window.tauriTabs.activeTabId);
      const currentUrl = activeTab ? activeTab.url : window.location.href;
      if (window.tauriOpenNewWindow) {
        window.tauriOpenNewWindow(currentUrl);
      }
    }
    
    // Cmd+Shift+A: 搜索标签
    else if (e.key === 'A' && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (window.tauriTabs.showSearch) {
        window.tauriTabs.showSearch();
      }
    }
    
    // Cmd+数字键: 快速切换标签 (1-9)
    else if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(e.key) - 1;
      const tabs = window.tauriTabs.tabs;
      if (index < tabs.length) {
        activateTab(tabs[index].id);
      }
    }
  }, true);
}

// 拖拽事件
function setupDragEvents() {
  const log = window.tauriTabs.log;
  
  window.tauriTabs.dragEvents = {
    dragStart: (e, id, tab) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      tab.style.opacity = '0.5';
      tab.classList.add('dragging');
      log(`🖱️ 开始拖动标签: ${id}`);
    },
    
    dragEnd: (e, id, tab) => {
      tab.style.opacity = '1';
      tab.classList.remove('dragging');
      document.querySelectorAll('.tauri-tab.drag-over').forEach(t => {
        t.classList.remove('drag-over');
      });
      log(`🖱️ 结束拖动标签: ${id}`);
    },
    
    dragOver: (e, tab) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!tab.classList.contains('dragging')) {
        tab.classList.add('drag-over');
      }
    },
    
    dragLeave: (e, tab) => {
      tab.classList.remove('drag-over');
    },
    
    drop: (e, id, tab) => {
      e.preventDefault();
      e.stopPropagation();
      tab.classList.remove('drag-over');
      
      const draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId && draggedId !== id) {
        log(`📍 放置标签: ${draggedId} -> ${id}`);
        reorderTabs(draggedId, id);
      }
    }
  };
}

// 显示右键菜单
function showTabContextMenu(tabId, x, y) {
  // 移除旧菜单
  const oldMenu = document.querySelector('.tauri-tab-context-menu');
  if (oldMenu) oldMenu.remove();
  
  const menu = document.createElement('div');
  menu.className = 'tauri-tab-context-menu';
  menu.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    background: rgba(30, 30, 30, 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    padding: 6px;
    z-index: 9999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    min-width: 180px;
    color: white;
  `;
  
  const menuItems = [
    { text: '🔄 刷新', action: () => refreshTab(tabId) },
    { text: '📋 复制标签', action: () => duplicateTab(tabId) },
    { text: '🪟 在新窗口打开', action: () => openTabInNewWindow(tabId) },
    { divider: true },
    { text: '❌ 关闭', action: () => closeTab(tabId) },
    { text: '⬅️ 关闭左侧标签', action: () => closeTabsToLeft(tabId) },
    { text: '➡️ 关闭右侧标签', action: () => closeTabsToRight(tabId) },
    { text: '🗑️ 关闭其他标签', action: () => closeOtherTabs(tabId) }
  ];
  
  menuItems.forEach(item => {
    if (item.divider) {
      const divider = document.createElement('div');
      divider.style.cssText = `
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
        margin: 4px 0;
      `;
      menu.appendChild(divider);
    } else {
      const menuItem = document.createElement('div');
      menuItem.textContent = item.text;
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.15s;
      `;
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = 'rgba(255, 255, 255, 0.1)';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
      });
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
      });
      menu.appendChild(menuItem);
    }
  });
  
  document.body.appendChild(menu);
  
  // 点击其他地方关闭菜单
  setTimeout(() => {
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu, true);
        document.removeEventListener('contextmenu', closeMenu, true);
        
        // 移除所有 iframe 的监听器
        window.tauriTabs.tabs.forEach(tab => {
          try {
            const iframeDoc = tab.iframe.contentDocument;
            if (iframeDoc) {
              iframeDoc.removeEventListener('click', closeMenu, true);
              iframeDoc.removeEventListener('contextmenu', closeMenu, true);
            }
          } catch (err) {
            // 忽略跨域错误
          }
        });
      }
    };
    
    document.addEventListener('click', closeMenu, true);
    document.addEventListener('contextmenu', closeMenu, true);
    
    // 在所有 iframe 添加监听器
    window.tauriTabs.tabs.forEach(tab => {
      try {
        const iframeDoc = tab.iframe.contentDocument;
        if (iframeDoc) {
          iframeDoc.addEventListener('click', closeMenu, true);
          iframeDoc.addEventListener('contextmenu', closeMenu, true);
        }
      } catch (err) {
        // 忽略跨域错误
      }
    });
  }, 100);
}

