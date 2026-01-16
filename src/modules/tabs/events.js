/**
 * 标签页事件模块 - 键盘快捷键、拖拽、右键菜单、鼠标手势
 */

import { createTab, closeTab, activateTab, refreshTab, hardRefreshTab, duplicateTab, openTabInNewWindow, closeTabsToLeft, closeTabsToRight, closeOtherTabs, reorderTabs, getTabCurrentUrl, switchToNextTab, switchToPrevTab } from './operations.js';
import { setupSimpleDrag } from './drag-simple.js';
import { isMac, isLinux, isWindows } from '../utils/dom.js';

// 初始化事件监听
export function initTabEvents() {
  console.log('🔧 initTabEvents 开始执行...');
  console.log('🔧 window.tauriTabs:', window.tauriTabs);
  
  setupKeyboardShortcuts();
  console.log('✅ setupKeyboardShortcuts 完成');
  
  // 使用简单的鼠标拖动系统
  setupSimpleDrag(window.tauriTabs.log);
  console.log('✅ setupSimpleDrag 完成');
  
  // 设置鼠标手势
  setupMouseGestures();
  console.log('✅ setupMouseGestures 完成');
  
  // 设置水平滚轮切换标签（所有平台）
  setupHorizontalWheelNavigation();
  console.log('✅ setupHorizontalWheelNavigation 完成');
  
  window.tauriTabs.showContextMenu = showTabContextMenu;
  console.log('✅ showContextMenu 设置完成');
  
  // 暴露页面搜索功能（供 iframe 调用）
  window.tauriTabs.showPageSearch = showPageSearch;
  console.log('✅ showPageSearch 设置完成');
  
  // 添加上下文菜单样式和手势指示器样式
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
      
      /* 鼠标手势指示器 */
      .tauri-gesture-indicator {
        position: fixed;
        background: rgba(0, 102, 204, 0.9);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 24px;
        z-index: 99999999;
        pointer-events: none;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        transition: opacity 0.2s;
      }
    `;
    document.head.appendChild(contextMenuStyle);
  }
}

// 键盘快捷键
function setupKeyboardShortcuts() {
  if (window.self !== window.top) return;
  
  document.addEventListener('keydown', (e) => {
    const isMacOS = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCtrlOrCmd = isMacOS ? e.metaKey : e.ctrlKey;
    
    // Ctrl+F / Cmd+F: 页面内搜索（在当前 iframe 中触发浏览器搜索）
    if (isCtrlOrCmd && e.key === 'f') {
      e.preventDefault();
      e.stopPropagation();
      showPageSearch();
      return;
    }
    
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
    
    // Cmd+Shift+R: 强制刷新（清除缓存）
    else if (e.key === 'R' && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (window.tauriTabs.activeTabId) {
        hardRefreshTab(window.tauriTabs.activeTabId);
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
    { text: '🧹 强制刷新（清除缓存）', action: () => hardRefreshTab(tabId) },
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

// 设置鼠标手势
function setupMouseGestures() {
  const log = window.tauriTabs.log;
  
  // 手势状态 - 追踪最近的鼠标移动
  const gestureState = {
    recentMoves: [],     // 存储最近的鼠标位置
    maxMoves: 50,        // 增加记录点数
    recentWindow: 250,   // 只看最近250ms内的移动（缩短时间窗口）
    contextMenuPos: null,
    indicator: null
  };
  
  const GESTURE_THRESHOLD = 50;      // 触发手势的最小滑动距离（像素），提高到80
  const MIN_VELOCITY = 0.3;          // 最小速度（像素/毫秒），确保是连续滑动
  
  log('🎯 设置鼠标手势监听（基于 contextmenu 事件）');
  
  // 创建手势指示器
  function createGestureIndicator() {
    if (gestureState.indicator) return gestureState.indicator;
    
    const indicator = document.createElement('div');
    indicator.className = 'tauri-gesture-indicator';
    indicator.style.opacity = '0';
    indicator.style.display = 'none';
    document.body.appendChild(indicator);
    gestureState.indicator = indicator;
    return indicator;
  }
  
  // 显示手势指示器
  function showGestureIndicator(direction, x, y) {
    const indicator = createGestureIndicator();
    indicator.textContent = direction === 'left' ? '⬅️' : '➡️';
    indicator.style.left = `${x + 20}px`;
    indicator.style.top = `${y - 20}px`;
    indicator.style.display = 'block';
    indicator.style.opacity = '1';
  }
  
  // 隐藏手势指示器
  function hideGestureIndicator() {
    if (gestureState.indicator) {
      gestureState.indicator.style.opacity = '0';
      setTimeout(() => {
        if (gestureState.indicator) {
          gestureState.indicator.style.display = 'none';
        }
      }, 200);
    }
  }
  
  // 更新指示器位置
  function updateGestureIndicator(x, y) {
    if (gestureState.indicator && gestureState.indicator.style.display !== 'none') {
      gestureState.indicator.style.left = `${x + 20}px`;
      gestureState.indicator.style.top = `${y - 20}px`;
    }
  }
  
  // 不在主文档监听 mousemove，只在 iframe 内部监听
  
  // 分析手势：检查最近的鼠标移动轨迹
  function analyzeGesture(contextX, contextY) {
    const now = Date.now();
    
    // 只看最近很短时间内的移动（contextmenu 触发前的移动）
    const recentMoves = gestureState.recentMoves.filter(m => now - m.time < gestureState.recentWindow);
    
    if (recentMoves.length < 3) {
      log(`📊 手势分析: 记录点太少 (${recentMoves.length}), 不是手势`);
      return null; // 没有足够的移动数据
    }
    
    // 获取最早和最近的位置
    const firstMove = recentMoves[0];
    const lastMove = recentMoves[recentMoves.length - 1];
    
    const deltaX = lastMove.x - firstMove.x;
    const deltaY = lastMove.y - firstMove.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const timeDelta = lastMove.time - firstMove.time;
    
    // 计算平均速度
    const velocity = timeDelta > 0 ? distance / timeDelta : 0;
    
    log(`📊 手势分析: 移动=${distance.toFixed(1)}px, deltaX=${deltaX.toFixed(1)}px, 时间=${timeDelta}ms, 速度=${velocity.toFixed(2)}px/ms, 点数=${recentMoves.length}`);
    
    // 检查是否为有效手势：
    // 1. 距离足够长
    // 2. 主要是水平方向
    // 3. 速度足够快（确保是连续滑动）
    if (distance > GESTURE_THRESHOLD && 
        Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && 
        velocity > MIN_VELOCITY) {
      // 水平手势
      const direction = deltaX > 0 ? 'right' : 'left';
      log(`✅ 识别到${direction === 'right' ? '右' : '左'}滑手势`);
      return direction;
    }
    
    log(`❌ 不是有效手势: distance=${distance.toFixed(1)}<${GESTURE_THRESHOLD} or velocity=${velocity.toFixed(2)}<${MIN_VELOCITY}`);
    return null;
  }
  
  
  // 右键菜单事件 - 核心手势检测逻辑（仅用于 iframe 内部）
  function handleContextMenu(e) {
    log(`📋 iframe contextmenu 事件触发，位置: (${e.clientX}, ${e.clientY})`);
    
    // 分析手势
    const gestureDirection = analyzeGesture(e.clientX, e.clientY);
    
    if (gestureDirection) {
      // 检测到手势，阻止右键菜单并执行手势动作
      e.preventDefault();
      e.stopPropagation();
      log('🚫 阻止右键菜单显示（检测到手势滑动）');
      
      // 根据操作系统调整手势方向
      // Mac/Linux: 右滑=上一个，左滑=下一个（符合自然滚动习惯）
      // Windows: 右滑=下一个，左滑=上一个（符合传统鼠标习惯）
      const useNaturalScroll = isMac() || isLinux();
      
      if (gestureDirection === 'right') {
        if (useNaturalScroll) {
          log('✅ 触发右滑手势（自然滚动），切换到上一个标签（左边）');
          switchToPrevTab();
        } else {
          log('✅ 触发右滑手势（Windows），切换到下一个标签（右边）');
          switchToNextTab();
        }
      } else if (gestureDirection === 'left') {
        if (useNaturalScroll) {
          log('✅ 触发左滑手势（自然滚动），切换到下一个标签（右边）');
          switchToNextTab();
        } else {
          log('✅ 触发左滑手势（Windows），切换到上一个标签（左边）');
          switchToPrevTab();
        }
      }
      
      // 清空移动记录
      gestureState.recentMoves = [];
      return;
    }
    
    // 没有手势，显示默认的右键菜单
    log('📋 无手势，显示默认右键菜单');
    
    // 清空移动记录
    gestureState.recentMoves = [];
  }
  
  // 不在主文档监听 contextmenu，只在 iframe 内部监听
  
  // 暴露到全局，让 iframe 也能使用
  window.tauriTabs.setupGestureInIframe = (iframeDoc) => {
    if (!iframeDoc) return;
    
    try {
      // 在 iframe 内部追踪鼠标移动
      iframeDoc.addEventListener('mousemove', (e) => {
        const now = Date.now();
        gestureState.recentMoves.push({
          x: e.clientX,
          y: e.clientY,
          time: now
        });
        
        // 保留数量限制
        if (gestureState.recentMoves.length > gestureState.maxMoves) {
          gestureState.recentMoves.shift();
        }
        
        // 清理过期记录（保留1秒内的，但判断时只用最近250ms的）
        gestureState.recentMoves = gestureState.recentMoves.filter(m => now - m.time < 1000);
      }, { passive: true });
      
      // 在 iframe 内部监听 contextmenu
      iframeDoc.addEventListener('contextmenu', handleContextMenu, { capture: true, passive: false });
      
      log('✅ iframe 手势监听器已安装');
    } catch (err) {
      log(`⚠️ 无法在 iframe 内安装手势监听器: ${err.message}`);
    }
  };
  
  log('✅ 鼠标手势已启用（基于轨迹分析）');
}

// 设置水平滚轮切换标签（修复问题2）
function setupHorizontalWheelNavigation() {
  const log = window.tauriTabs.log;
  
  // 在标签栏区域监听水平滚轮
  const tabBar = document.getElementById('tauri-tab-bar');
  if (!tabBar) {
    log('⚠️ 标签栏未找到，延迟设置水平滚轮');
    setTimeout(setupHorizontalWheelNavigation, 100);
    return;
  }
  
  // 防抖变量
  let lastWheelTime = 0;
  const WHEEL_DEBOUNCE = 150; // 150ms 防抖
  
  tabBar.addEventListener('wheel', (e) => {
    // 检查是否为水平滚动（触控板双指左右滑动会产生 deltaX）
    const isHorizontalScroll = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    
    if (!isHorizontalScroll) return;
    if (Math.abs(e.deltaX) < 10) return; // 忽略微小滑动
    
    const now = Date.now();
    if (now - lastWheelTime < WHEEL_DEBOUNCE) return;
    lastWheelTime = now;
    
    e.preventDefault();
    
    // 根据滑动方向切换标签
    // 右滑（deltaX > 0）= 下一个标签，左滑（deltaX < 0）= 上一个标签
    if (e.deltaX > 0) {
      log('➡️ 水平滚轮向右，切换到下一个标签');
      switchToNextTab();
    } else {
      log('⬅️ 水平滚轮向左，切换到上一个标签');
      switchToPrevTab();
    }
  }, { passive: false });
  
  log('✅ 水平滚轮标签切换已启用');
}

// 页面内搜索功能 - DOM 高亮方案
// 所有匹配项都高亮，点击页面时自动清除并重新搜索
let pageSearchOverlay = null;

function showPageSearch() {
  const log = window.tauriTabs.log;
  log('🔍 打开页面搜索（覆盖层方案）');
  
  // 获取选中的文本（优先从 iframe 获取）
  let selectedText = '';
  try {
    const activeTab = window.tauriTabs.tabs.find(t => t.id === window.tauriTabs.activeTabId);
    if (activeTab && activeTab.iframe) {
      const iframeWindow = activeTab.iframe.contentWindow;
      if (iframeWindow && iframeWindow.getSelection) {
        selectedText = iframeWindow.getSelection().toString().trim();
      }
    }
    if (!selectedText && window.getSelection) {
      selectedText = window.getSelection().toString().trim();
    }
  } catch (err) {
    log(`⚠️ 获取选中文本失败: ${err.message}`);
  }
  
  // 如果已经存在搜索框，则聚焦并填入选中文本
  if (pageSearchOverlay) {
    const input = pageSearchOverlay.querySelector('.tauri-page-search-input');
    if (input) {
      if (selectedText) {
        input.value = selectedText;
        input.dispatchEvent(new Event('input'));
      }
      input.focus();
      input.select();
    }
    return;
  }
  
  addPageSearchStyles();
  
  pageSearchOverlay = document.createElement('div');
  pageSearchOverlay.className = 'tauri-page-search-bar';
  
  pageSearchOverlay.innerHTML = `
    <div class="tauri-page-search-container">
      <input type="text" class="tauri-page-search-input" placeholder="在页面中查找..." autofocus>
      <span class="tauri-page-search-count">0/0</span>
      <button class="tauri-page-search-btn tauri-page-search-prev" title="上一个 (Shift+Enter)">▲</button>
      <button class="tauri-page-search-btn tauri-page-search-next" title="下一个 (Enter)">▼</button>
      <button class="tauri-page-search-btn tauri-page-search-close" title="关闭 (Esc)">✕</button>
    </div>
  `;
  
  document.body.appendChild(pageSearchOverlay);
  
  const input = pageSearchOverlay.querySelector('.tauri-page-search-input');
  const countDisplay = pageSearchOverlay.querySelector('.tauri-page-search-count');
  const prevBtn = pageSearchOverlay.querySelector('.tauri-page-search-prev');
  const nextBtn = pageSearchOverlay.querySelector('.tauri-page-search-next');
  const closeBtn = pageSearchOverlay.querySelector('.tauri-page-search-close');
  
  // 搜索状态
  let matchRects = [];  // 存储匹配项的位置信息 {rects: DOMRect[], node, index, length}
  let highlightElements = [];  // 存储覆盖层中的高亮元素
  let currentIndex = -1;
  let lastQuery = '';
  let highlightOverlay = null;  // 高亮覆盖层
  let scrollHandler = null;
  let resizeHandler = null;
  let mutationObserver = null;  // DOM 变化观察器
  let mutationTimeout = null;   // 防抖定时器
  
  // 获取当前活动的 iframe
  function getActiveIframe() {
    const activeTab = window.tauriTabs.tabs.find(t => t.id === window.tauriTabs.activeTabId);
    return activeTab ? activeTab.iframe : null;
  }
  
  // 创建高亮覆盖层
  function createHighlightOverlay() {
    if (highlightOverlay) return highlightOverlay;
    
    const iframe = getActiveIframe();
    if (!iframe) return null;
    
    highlightOverlay = document.createElement('div');
    highlightOverlay.className = 'tauri-highlight-overlay';
    highlightOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999999;
      overflow: hidden;
    `;
    
    // 将覆盖层放在 iframe 的父容器中
    const iframeParent = iframe.parentElement;
    if (iframeParent) {
      iframeParent.style.position = 'relative';
      iframeParent.appendChild(highlightOverlay);
    }
    
    return highlightOverlay;
  }
  
  // 清除覆盖层中的高亮
  function clearHighlights() {
    highlightElements.forEach(el => el.remove());
    highlightElements = [];
    matchRects = [];
  }
  
  // 移除覆盖层
  function removeHighlightOverlay() {
    if (highlightOverlay) {
      highlightOverlay.remove();
      highlightOverlay = null;
    }
  }
  
  // 获取 iframe 内元素相对于 iframe 视口的位置
  function getRectsRelativeToIframe(range, iframeDoc) {
    const rects = range.getClientRects();
    return Array.from(rects).map(rect => ({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    }));
  }
  
  // 更新高亮位置（当滚动时调用）
  function updateHighlightPositions() {
    const iframe = getActiveIframe();
    if (!iframe || !highlightOverlay) return;
    
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const iframeWin = iframe.contentWindow;
      const scrollX = iframeWin.scrollX || iframeWin.pageXOffset || 0;
      const scrollY = iframeWin.scrollY || iframeWin.pageYOffset || 0;
      
      // 清除现有高亮元素
      highlightElements.forEach(el => el.remove());
      highlightElements = [];
      
      // 重新计算每个匹配项的位置
      matchRects.forEach((match, matchIndex) => {
        try {
          // 检查节点是否还存在
          if (!match.node || !match.node.parentNode || !iframeDoc.contains(match.node)) {
            return;
          }
          
          const range = iframeDoc.createRange();
          range.setStart(match.node, match.index);
          range.setEnd(match.node, match.index + match.length);
          
          const rects = range.getClientRects();
          
          Array.from(rects).forEach(rect => {
            if (rect.width === 0 || rect.height === 0) return;
            
            const highlight = document.createElement('div');
            highlight.className = 'tauri-overlay-highlight';
            if (matchIndex === currentIndex) {
              highlight.classList.add('current');
            }
            highlight.style.cssText = `
              position: absolute;
              left: ${rect.left}px;
              top: ${rect.top}px;
              width: ${rect.width}px;
              height: ${rect.height}px;
              background-color: ${matchIndex === currentIndex ? 'rgba(255, 150, 50, 0.5)' : 'rgba(255, 255, 0, 0.4)'};
              border-radius: 2px;
              pointer-events: none;
              ${matchIndex === currentIndex ? 'box-shadow: 0 0 4px rgba(255, 150, 50, 0.8);' : ''}
            `;
            highlight.dataset.matchIndex = matchIndex;
            highlightOverlay.appendChild(highlight);
            highlightElements.push(highlight);
          });
        } catch (e) {
          // 忽略单个元素的错误
        }
      });
    } catch (err) {
      log(`⚠️ 更新高亮位置失败: ${err.message}`);
    }
  }
  
  // 执行搜索（不修改 DOM）
  function searchAndHighlight(query) {
    // 先清除旧的高亮
    clearHighlights();
    currentIndex = -1;
    
    if (!query.trim()) {
      updateCount();
      return;
    }
    
    lastQuery = query;
    const iframe = getActiveIframe();
    if (!iframe) return;
    
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const iframeWin = iframe.contentWindow;
      const queryLower = query.toLowerCase();
      
      // 创建覆盖层
      createHighlightOverlay();
      
      // 收集所有匹配的文本节点和位置
      const walker = iframeDoc.createTreeWalker(
        iframeDoc.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let node;
      while (node = walker.nextNode()) {
        // 跳过脚本和样式标签内的文本
        const parent = node.parentElement;
        if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.tagName === 'NOSCRIPT')) {
          continue;
        }
        
        // 跳过隐藏元素
        if (parent && parent.offsetParent === null && parent.tagName !== 'BODY') {
          continue;
        }
        
        const text = node.textContent;
        const textLower = text.toLowerCase();
        let index = 0;
        
        while ((index = textLower.indexOf(queryLower, index)) !== -1) {
          matchRects.push({
            node,
            index,
            length: query.length
          });
          index += query.length;
        }
      }
      
      log(`🔍 找到 ${matchRects.length} 个匹配（覆盖层方案）`);
      
      // 如果有匹配，设置当前索引
      if (matchRects.length > 0) {
        currentIndex = 0;
      }
      
      // 绘制高亮
      updateHighlightPositions();
      
      // 设置滚动监听器
      setupScrollListener();
      
      // 设置 DOM 变化监听器
      setupMutationObserver();
      
      updateCount();
      
    } catch (err) {
      log(`⚠️ 搜索失败: ${err.message}`);
    }
  }
  
  // 设置滚动监听器
  function setupScrollListener() {
    const iframe = getActiveIframe();
    if (!iframe) return;
    
    try {
      const iframeWin = iframe.contentWindow;
      
      // 移除旧的监听器
      if (scrollHandler) {
        iframeWin.removeEventListener('scroll', scrollHandler, true);
      }
      if (resizeHandler) {
        iframeWin.removeEventListener('resize', resizeHandler);
      }
      
      // 使用 requestAnimationFrame 优化滚动性能
      let ticking = false;
      scrollHandler = () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            updateHighlightPositions();
            ticking = false;
          });
          ticking = true;
        }
      };
      
      resizeHandler = () => {
        updateHighlightPositions();
      };
      
      iframeWin.addEventListener('scroll', scrollHandler, true);
      iframeWin.addEventListener('resize', resizeHandler);
      
      // 也监听 iframe 内部的滚动容器
      const iframeDoc = iframe.contentDocument || iframeWin.document;
      iframeDoc.addEventListener('scroll', scrollHandler, true);
      
    } catch (err) {
      log(`⚠️ 设置滚动监听器失败: ${err.message}`);
    }
  }
  
  // 移除滚动监听器
  function removeScrollListener() {
    const iframe = getActiveIframe();
    if (!iframe) return;
    
    try {
      const iframeWin = iframe.contentWindow;
      const iframeDoc = iframe.contentDocument || iframeWin.document;
      
      if (scrollHandler) {
        iframeWin.removeEventListener('scroll', scrollHandler, true);
        iframeDoc.removeEventListener('scroll', scrollHandler, true);
        scrollHandler = null;
      }
      if (resizeHandler) {
        iframeWin.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }
    } catch (e) {}
  }
  
  // 设置 DOM 变化监听器（检测翻页等操作）
  function setupMutationObserver() {
    const iframe = getActiveIframe();
    if (!iframe) return;
    
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      
      // 移除旧的观察器
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      
      mutationObserver = new MutationObserver((mutations) => {
        // 使用防抖，避免频繁触发
        if (mutationTimeout) {
          clearTimeout(mutationTimeout);
        }
        
        mutationTimeout = setTimeout(() => {
          // 检查是否有实质性的 DOM 变化（排除我们自己的覆盖层）
          const hasSignificantChange = mutations.some(mutation => {
            // 忽略我们自己的覆盖层变化
            if (mutation.target.closest && mutation.target.closest('.tauri-highlight-overlay')) {
              return false;
            }
            // 检查是否有节点添加/删除
            if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
              return true;
            }
            // 检查文本内容变化
            if (mutation.type === 'characterData') {
              return true;
            }
            return false;
          });
          
          if (hasSignificantChange) {
            log('🔄 检测到页面 DOM 变化，清除高亮');
            clearHighlights();
            updateCount();
          }
        }, 100);  // 100ms 防抖
      });
      
      // 监听整个 body 的变化
      mutationObserver.observe(iframeDoc.body, {
        childList: true,      // 监听子节点变化
        subtree: true,        // 监听所有后代节点
        characterData: true,  // 监听文本内容变化
      });
      
      log('✅ 已设置 DOM 变化监听器');
    } catch (err) {
      log(`⚠️ 设置 DOM 变化监听器失败: ${err.message}`);
    }
  }
  
  // 移除 DOM 变化监听器
  function removeMutationObserver() {
    if (mutationTimeout) {
      clearTimeout(mutationTimeout);
      mutationTimeout = null;
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
  }
  
  // 滚动到当前高亮
  function scrollToCurrentHighlight() {
    if (currentIndex < 0 || currentIndex >= matchRects.length) return;
    
    const iframe = getActiveIframe();
    if (!iframe) return;
    
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const match = matchRects[currentIndex];
      
      if (!match.node || !match.node.parentNode) return;
      
      const range = iframeDoc.createRange();
      range.setStart(match.node, match.index);
      range.setEnd(match.node, match.index + match.length);
      
      const rect = range.getBoundingClientRect();
      const iframeWin = iframe.contentWindow;
      
      // 计算需要滚动到的位置（使匹配项在视口中心）
      const viewportHeight = iframeWin.innerHeight;
      const scrollY = iframeWin.scrollY || iframeWin.pageYOffset || 0;
      const targetY = scrollY + rect.top - viewportHeight / 2 + rect.height / 2;
      
      iframeWin.scrollTo({
        top: Math.max(0, targetY),
        behavior: 'smooth'
      });
      
      // 滚动后更新高亮位置
      setTimeout(updateHighlightPositions, 300);
    } catch (err) {
      log(`⚠️ 滚动到高亮失败: ${err.message}`);
    }
  }
  
  // 更新计数显示
  function updateCount() {
    if (matchRects.length === 0) {
      countDisplay.textContent = '0/0';
      countDisplay.style.color = '#999';
    } else {
      countDisplay.textContent = `${currentIndex + 1}/${matchRects.length}`;
      countDisplay.style.color = '#fff';
    }
  }
  
  // 检查匹配项是否还有效
  function checkMatchesValid() {
    if (matchRects.length === 0) return false;
    
    const iframe = getActiveIframe();
    if (!iframe) return false;
    
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      // 检查第一个匹配项的节点是否还在 DOM 中
      const firstMatch = matchRects[0];
      return firstMatch.node && firstMatch.node.parentNode && iframeDoc.contains(firstMatch.node);
    } catch (e) {
      return false;
    }
  }
  
  // 下一个匹配
  function nextMatch() {
    if (!lastQuery) return;
    
    // 检查匹配是否还有效，无效则重新搜索
    if (!checkMatchesValid()) {
      log('🔄 页面已变化，重新搜索...');
      searchAndHighlight(lastQuery);
      return;
    }
    
    if (matchRects.length === 0) return;
    currentIndex = (currentIndex + 1) % matchRects.length;
    updateHighlightPositions();
    scrollToCurrentHighlight();
    updateCount();
  }
  
  // 上一个匹配
  function prevMatch() {
    if (!lastQuery) return;
    
    // 检查匹配是否还有效，无效则重新搜索
    if (!checkMatchesValid()) {
      log('🔄 页面已变化，重新搜索...');
      searchAndHighlight(lastQuery);
      return;
    }
    
    if (matchRects.length === 0) return;
    currentIndex = (currentIndex - 1 + matchRects.length) % matchRects.length;
    updateHighlightPositions();
    scrollToCurrentHighlight();
    updateCount();
  }
  
  // 关闭搜索
  function closeSearch() {
    // 移除滚动监听器
    removeScrollListener();
    
    // 移除 DOM 变化监听器
    removeMutationObserver();
    
    // 清除高亮
    clearHighlights();
    
    // 移除覆盖层
    removeHighlightOverlay();
    
    // 移除搜索框
    if (pageSearchOverlay) {
      pageSearchOverlay.remove();
      pageSearchOverlay = null;
    }
    log('🔍 关闭页面搜索');
  }
  
  // 事件绑定
  let searchTimeout;
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchAndHighlight(input.value);
    }, 200);
  });
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        prevMatch();
      } else {
        nextMatch();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    }
  });
  
  prevBtn.addEventListener('click', prevMatch);
  nextBtn.addEventListener('click', nextMatch);
  closeBtn.addEventListener('click', closeSearch);
  
  // 聚焦输入框，如果有选中文本则填入并搜索
  setTimeout(() => {
    if (selectedText) {
      input.value = selectedText;
      searchAndHighlight(selectedText);
    }
    input.focus();
    if (selectedText) {
      input.select();
    }
  }, 50);
}

// 页面搜索样式
let pageSearchStylesAdded = false;
function addPageSearchStyles() {
  if (pageSearchStylesAdded || !document.head) return;
  pageSearchStylesAdded = true;
  
  const style = document.createElement('style');
  style.textContent = `
    .tauri-page-search-bar {
      position: fixed;
      top: 45px;
      right: 10px;
      z-index: 10000001;
      animation: searchSlideIn 0.2s ease-out;
    }
    @keyframes searchSlideIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .tauri-page-search-container {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(40, 40, 40, 0.95);
      backdrop-filter: blur(10px);
      padding: 8px 12px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .tauri-page-search-input {
      width: 200px;
      padding: 6px 10px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.3);
      color: #fff;
      font-size: 13px;
      outline: none;
    }
    .tauri-page-search-input:focus {
      border-color: #0066cc;
      box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.3);
    }
    .tauri-page-search-input::placeholder {
      color: #888;
    }
    .tauri-page-search-count {
      color: #999;
      font-size: 12px;
      min-width: 40px;
      text-align: center;
    }
    .tauri-page-search-btn {
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      color: #ccc;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      transition: background 0.15s;
    }
    .tauri-page-search-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }
    .tauri-page-search-close {
      font-size: 14px;
    }
  `;
  document.head.appendChild(style);
}

