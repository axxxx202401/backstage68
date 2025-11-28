/**
 * 标签页事件模块 - 键盘快捷键、拖拽、右键菜单
 */

import { createTab, closeTab, activateTab, refreshTab, duplicateTab, openTabInNewWindow, closeTabsToLeft, closeTabsToRight, closeOtherTabs, reorderTabs, getTabCurrentUrl } from './operations.js';
import { setupSimpleDrag } from './drag-simple.js';

// 初始化事件监听
export function initTabEvents() {
  console.log('🔧 initTabEvents 开始执行...');
  console.log('🔧 window.tauriTabs:', window.tauriTabs);
  
  setupKeyboardShortcuts();
  console.log('✅ setupKeyboardShortcuts 完成');
  
  // 使用简单的鼠标拖动系统
  setupSimpleDrag(window.tauriTabs.log);
  console.log('✅ setupSimpleDrag 完成');
  
  window.tauriTabs.showContextMenu = showTabContextMenu;
  console.log('✅ showContextMenu 设置完成');
  
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
  console.log('🚀 setupDragEvents 开始执行...');
  const log = window.tauriTabs.log;
  console.log('📋 log 函数:', typeof log);
  
  // 拖动状态追踪
  let dragState = {
    isDragging: false,
    draggedTabId: null,
    draggedTab: null,
    lastPosition: { x: 0, y: 0 },
    shiftKeyPressed: false,
    isOutsideWindow: false,
    previewWindow: null
  };
  
  // 创建拖出提示元素
  function createTearOffIndicator() {
    if (document.getElementById('tauri-tearoff-indicator')) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'tauri-tearoff-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 102, 204, 0.95);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      z-index: 99999999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      backdrop-filter: blur(10px);
    `;
    indicator.innerHTML = '🪟 释放以创建新窗口';
    document.body.appendChild(indicator);
  }
  
  // 显示/隐藏拖出提示
  function showTearOffIndicator(show) {
    const indicator = document.getElementById('tauri-tearoff-indicator');
    if (indicator) {
      indicator.style.opacity = show ? '1' : '0';
    }
  }
  
  // 创建浮动预览窗口
  function createFloatingPreview(tab) {
    if (dragState.previewWindow) return;
    
    const preview = document.createElement('div');
    preview.id = 'tauri-floating-preview';
    preview.style.cssText = `
      position: fixed;
      width: 300px;
      height: 200px;
      background: rgba(40, 40, 40, 0.95);
      border: 2px solid rgba(0, 102, 204, 0.8);
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
      z-index: 99999998;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      backdrop-filter: blur(20px);
      overflow: hidden;
    `;
    
    const title = tab.querySelector('.tauri-tab-title')?.textContent || '新窗口';
    preview.innerHTML = `
      <div style="padding: 16px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">🪟</div>
        <div style="color: white; font-size: 14px; font-weight: 500; text-align: center;">${title}</div>
        <div style="color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 8px;">新窗口</div>
      </div>
    `;
    
    document.body.appendChild(preview);
    dragState.previewWindow = preview;
    
    // 淡入效果
    setTimeout(() => {
      preview.style.opacity = '1';
    }, 50);
  }
  
  // 移除浮动预览
  function removeFloatingPreview() {
    if (dragState.previewWindow) {
      dragState.previewWindow.style.opacity = '0';
      setTimeout(() => {
        if (dragState.previewWindow) {
          dragState.previewWindow.remove();
          dragState.previewWindow = null;
        }
      }, 200);
    }
  }
  
  // 更新浮动预览位置
  function updateFloatingPreviewPosition(x, y) {
    if (dragState.previewWindow) {
      dragState.previewWindow.style.left = `${x + 20}px`;
      dragState.previewWindow.style.top = `${y + 20}px`;
    }
  }
  
  // 检测是否拖出窗口
  function checkIfOutsideWindow(x, y) {
    const THRESHOLD = 50; // 超出阈值（降低到50px，更容易触发）
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    const isOutside = 
      x < -THRESHOLD || 
      x > windowWidth + THRESHOLD || 
      y < -THRESHOLD || 
      y > windowHeight + THRESHOLD;
    
    if (isOutside !== dragState.isOutsideWindow) {
      dragState.isOutsideWindow = isOutside;
      
      if (isOutside) {
        log(`🌊 标签拖出窗口边界 (位置: ${x}, ${y}, 窗口: ${windowWidth}x${windowHeight})`);
        dragState.draggedTab?.classList.add('tear-off-ready');
        showTearOffIndicator(true);
        createFloatingPreview(dragState.draggedTab);
      } else {
        log('🔙 标签返回窗口内');
        dragState.draggedTab?.classList.remove('tear-off-ready');
        showTearOffIndicator(false);
        removeFloatingPreview();
      }
    }
  }
  
  // 全局拖动监听（用于追踪位置）
  document.addEventListener('drag', (e) => {
    if (!dragState.isDragging) return;
    
    // 更新位置（drag 事件中 clientX/Y 可能为 0，所以只在非0时更新）
    if (e.clientX !== 0 && e.clientY !== 0) {
      dragState.lastPosition = { x: e.clientX, y: e.clientY };
      checkIfOutsideWindow(e.clientX, e.clientY);
      updateFloatingPreviewPosition(e.clientX, e.clientY);
    }
  }, true);
  
  // 额外的 dragover 监听（确保位置追踪）
  document.addEventListener('dragover', (e) => {
    if (!dragState.isDragging) return;
    
    if (e.clientX !== 0 && e.clientY !== 0) {
      dragState.lastPosition = { x: e.clientX, y: e.clientY };
      checkIfOutsideWindow(e.clientX, e.clientY);
      updateFloatingPreviewPosition(e.clientX, e.clientY);
    }
  }, true);
  
  // 监听 Shift 键
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift' && dragState.isDragging) {
      dragState.shiftKeyPressed = true;
      dragState.draggedTab?.classList.add('force-tear-off');
      log('⌨️ Shift 键按下，强制拖出模式');
    }
  }, true);
  
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      dragState.shiftKeyPressed = false;
      dragState.draggedTab?.classList.remove('force-tear-off');
    }
  }, true);
  
  // 创建拖出提示
  createTearOffIndicator();
  
  // 在标签容器上添加全局 dragover（确保可以接收 drop）
  const setupContainerDragListeners = () => {
    const tabsContainer = document.querySelector('.tauri-tabs-container');
    console.log('🔍 setupContainerDragListeners - 查找容器:', tabsContainer ? '找到' : '未找到');
    
    if (tabsContainer) {
      tabsContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }, false);
      
      log('✅ 标签容器拖动监听已设置');
      console.log('✅ 标签容器拖动监听已设置');
    } else {
      // 容器还未创建，稍后重试
      console.log('⏳ 容器未找到，100ms 后重试...');
      setTimeout(setupContainerDragListeners, 100);
    }
  };
  setupContainerDragListeners();
  
  window.tauriTabs.dragEvents = {
    dragStart: (e, id, tab) => {
      console.log('🎯 dragStart 触发！', { id, tab, dragEvents: window.tauriTabs.dragEvents });
      
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      
      // 设置拖动图像（可选）
      try {
        const dragImage = tab.cloneNode(true);
        dragImage.style.opacity = '0.8';
        dragImage.style.transform = 'rotate(-3deg)';
        document.body.appendChild(dragImage);
        dragImage.style.position = 'absolute';
        dragImage.style.left = '-9999px';
        e.dataTransfer.setDragImage(dragImage, 0, 0);
        setTimeout(() => dragImage.remove(), 0);
      } catch (err) {
        // 忽略拖动图像错误
      }
      
      tab.style.opacity = '0.5';
      tab.classList.add('dragging');
      
      dragState.isDragging = true;
      dragState.draggedTabId = id;
      dragState.draggedTab = tab;
      dragState.lastPosition = { x: e.clientX, y: e.clientY };
      dragState.shiftKeyPressed = e.shiftKey;
      
      console.log('🖱️ 开始拖动标签:', id, 'Shift:', e.shiftKey);
      log(`🖱️ 开始拖动标签: ${id}, Shift: ${e.shiftKey}`);
    },
    
    dragEnd: async (e, id, tab) => {
      log(`🖱️ dragEnd 触发: ${id}, 位置: (${e.clientX}, ${e.clientY})`);
      log(`   最后记录位置: (${dragState.lastPosition.x}, ${dragState.lastPosition.y})`);
      log(`   isOutsideWindow: ${dragState.isOutsideWindow}, shiftKey: ${dragState.shiftKeyPressed}`);
      
      tab.style.opacity = '1';
      tab.classList.remove('dragging', 'tear-off-ready', 'force-tear-off');
      
      document.querySelectorAll('.tauri-tab.drag-over').forEach(t => {
        t.classList.remove('drag-over');
      });
      
      // 使用最后记录的位置（因为 dragend 的 clientX/Y 可能不准确）
      const finalX = e.clientX || dragState.lastPosition.x;
      const finalY = e.clientY || dragState.lastPosition.y;
      
      // 检查是否拖出窗口或按住 Shift
      const shouldTearOff = dragState.isOutsideWindow || dragState.shiftKeyPressed;
      
      if (shouldTearOff) {
        log(`🪟 拖出窗口！创建新窗口...`);
        showTearOffIndicator(false);
        
        // 添加飞出动画
        tab.style.transition = 'transform 0.3s ease-out, opacity 0.3s';
        tab.style.transform = 'scale(0.8) translateY(-20px)';
        tab.style.opacity = '0';
        
        await tearOffTab(id);
        
        // 动画结束后恢复
        setTimeout(() => {
          tab.style.transition = '';
          tab.style.transform = '';
          tab.style.opacity = '1';
        }, 300);
      } else {
        log(`🖱️ 结束拖动标签: ${id} (窗口内)`);
      }
      
      // 清理状态
      removeFloatingPreview();
      dragState.isDragging = false;
      dragState.draggedTabId = null;
      dragState.draggedTab = null;
      dragState.isOutsideWindow = false;
      dragState.shiftKeyPressed = false;
    },
    
    dragOver: (e, id, tab) => {
      console.log('📍 dragOver 触发！', { id, isDragging: dragState.isDragging, draggedId: dragState.draggedTabId });
      
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      
      // 窗口内排序：添加高亮
      if (!tab.classList.contains('dragging') && !dragState.isOutsideWindow) {
        tab.classList.add('drag-over');
      }
      
      // 调试日志
      if (dragState.isDragging && dragState.draggedTabId !== id) {
        // 只在拖到不同标签时输出一次
        if (!tab.dataset.dragOverLogged) {
          console.log(`📍 dragOver: 拖动 ${dragState.draggedTabId} 到 ${id} 上方`);
          log(`📍 dragOver: 拖动 ${dragState.draggedTabId} 到 ${id} 上方`);
          tab.dataset.dragOverLogged = 'true';
        }
      }
    },
    
    dragLeave: (e, id, tab) => {
      tab.classList.remove('drag-over');
      delete tab.dataset.dragOverLogged;
    },
    
    drop: (e, id, tab) => {
      log(`📍 drop 事件触发！目标: ${id}`);
      
      e.preventDefault();
      e.stopPropagation();
      tab.classList.remove('drag-over');
      delete tab.dataset.dragOverLogged;
      
      const draggedId = e.dataTransfer.getData('text/plain');
      log(`   draggedId=${draggedId}, targetId=${id}, isOutside=${dragState.isOutsideWindow}`);
      
      // 只有在窗口内才执行重新排序
      if (!dragState.isOutsideWindow && draggedId && draggedId !== id) {
        log(`✅ 执行重新排序: ${draggedId} -> ${id}`);
        try {
          reorderTabs(draggedId, id);
        } catch (err) {
          log(`❌ 重新排序失败: ${err.message}`);
          console.error(err);
        }
      } else {
        if (dragState.isOutsideWindow) {
          log(`   跳过排序：标签在窗口外`);
        } else if (!draggedId) {
          log(`   跳过排序：draggedId 为空`);
        } else if (draggedId === id) {
          log(`   跳过排序：拖到自己身上`);
        }
      }
    }
  };
  
  // 撕扯标签创建新窗口
  async function tearOffTab(tabId) {
    const tabs = window.tauriTabs.tabs;
    const tab = tabs.find(t => t.id === tabId);
    
    if (!tab) return;
    
    try {
      const currentUrl = getTabCurrentUrl(tab, log);
      
      log(`🚀 创建新窗口: ${currentUrl}`);
      
      if (window.tauriOpenNewWindow) {
        await window.tauriOpenNewWindow(currentUrl);
      } else {
        log('❌ 无法创建新窗口，tauriOpenNewWindow 未初始化');
        return;
      }
      
      // 如果不是最后一个标签，关闭当前标签
      if (tabs.length > 1) {
        closeTab(tabId);
        log(`✅ 已从当前窗口移除标签`);
      } else {
        log(`ℹ️ 保留最后一个标签`);
      }
    } catch (err) {
      console.error('❌ 创建新窗口失败:', err);
    }
  }
  
  console.log('✅ setupDragEvents 完成！dragEvents 已设置:', window.tauriTabs.dragEvents ? '成功' : '失败');
  console.log('   dragStart:', typeof window.tauriTabs.dragEvents?.dragStart);
  console.log('   dragOver:', typeof window.tauriTabs.dragEvents?.dragOver);
  console.log('   drop:', typeof window.tauriTabs.dragEvents?.drop);
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

