/**
 * 简单的拖动排序实现 - 使用鼠标事件而非 HTML5 drag API
 */

export function setupSimpleDrag(log, invoke) {
  let dragState = {
    isDragging: false,
    draggedTab: null,
    draggedTabId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    ghost: null,
    placeholder: null,
    shiftPressed: false
  };

  // 导入需要的函数
  let reorderTabs, serializeStorage;

  // 动态导入
  import('./operations.js').then(module => {
    reorderTabs = module.reorderTabs;
  });
  
  import('../utils/storage.js').then(module => {
    serializeStorage = module.serializeStorage;
  });

  // 创建幽灵元素
  function createGhost(tab) {
    const ghost = tab.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.8';
    ghost.style.zIndex = '9999999';
    ghost.style.transform = 'rotate(-3deg)';
    ghost.classList.add('dragging-ghost');
    document.body.appendChild(ghost);
    return ghost;
  }

  // 创建占位符
  function createPlaceholder(tab) {
    const placeholder = document.createElement('div');
    placeholder.className = 'tauri-tab-placeholder';
    placeholder.style.width = tab.offsetWidth + 'px';
    placeholder.style.height = tab.offsetHeight + 'px';
    placeholder.style.background = 'rgba(0, 102, 204, 0.2)';
    placeholder.style.border = '2px dashed #0066cc';
    placeholder.style.borderRadius = '6px';
    return placeholder;
  }

  // 获取拖动位置
  function updateGhostPosition(e) {
    if (dragState.ghost) {
      dragState.currentX = e.clientX;
      dragState.currentY = e.clientY;
      dragState.ghost.style.left = (e.clientX - dragState.offsetX) + 'px';
      dragState.ghost.style.top = (e.clientY - dragState.offsetY) + 'px';
    }
  }

  // 找到鼠标下的标签
  function getTabUnderMouse(x, y) {
    const tabs = Array.from(document.querySelectorAll('.tauri-tab'));
    for (const tab of tabs) {
      if (tab === dragState.draggedTab) continue;
      const rect = tab.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return tab;
      }
    }
    return null;
  }

  // 鼠标按下
  function onMouseDown(e) {
    // 只响应左键
    if (e.button !== 0) return;
    
    // 如果点击的是关闭按钮，不处理
    if (e.target.classList.contains('tauri-tab-close')) return;

    const tab = e.target.closest('.tauri-tab');
    if (!tab) return;

    console.log('🖱️ mousedown on tab:', tab.dataset.tabId);

    dragState.draggedTab = tab;
    dragState.draggedTabId = tab.dataset.tabId;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.shiftPressed = e.shiftKey;

    // 计算偏移量
    const rect = tab.getBoundingClientRect();
    dragState.offsetX = e.clientX - rect.left;
    dragState.offsetY = e.clientY - rect.top;

    // 添加全局监听
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    e.preventDefault();
  }

  // 鼠标移动
  function onMouseMove(e) {
    if (!dragState.draggedTab) return;

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;

    // 移动超过5px才开始拖动
    if (!dragState.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      dragState.isDragging = true;
      console.log('✅ 开始拖动:', dragState.draggedTabId);

      // 创建幽灵元素
      dragState.ghost = createGhost(dragState.draggedTab);
      
      // 创建占位符
      dragState.placeholder = createPlaceholder(dragState.draggedTab);
      dragState.draggedTab.parentNode.insertBefore(dragState.placeholder, dragState.draggedTab);
      
      // 隐藏原始标签
      dragState.draggedTab.style.opacity = '0';

      log(`🖱️ 开始拖动标签: ${dragState.draggedTabId}`);
    }

    if (dragState.isDragging) {
      updateGhostPosition(e);

      // 检查是否拖出窗口
      const isOutside = e.clientX < 0 || e.clientX > window.innerWidth ||
                       e.clientY < 0 || e.clientY > window.innerHeight;

      if (isOutside) {
        dragState.ghost?.classList.add('tear-off-ready');
      } else {
        dragState.ghost?.classList.remove('tear-off-ready');

        // 查找目标标签
        const targetTab = getTabUnderMouse(e.clientX, e.clientY);
        if (targetTab && targetTab !== dragState.draggedTab) {
          console.log('📍 移动到标签上:', targetTab.dataset.tabId);
          
          // 移动占位符
          const targetRect = targetTab.getBoundingClientRect();
          const placeholderRect = dragState.placeholder.getBoundingClientRect();
          
          if (e.clientX < targetRect.left + targetRect.width / 2) {
            // 插入到目标前面
            targetTab.parentNode.insertBefore(dragState.placeholder, targetTab);
          } else {
            // 插入到目标后面
            targetTab.parentNode.insertBefore(dragState.placeholder, targetTab.nextSibling);
          }
        }
      }
    }

    e.preventDefault();
  }

  // 鼠标松开
  async function onMouseUp(e) {
    console.log('🖱️ mouseup, isDragging:', dragState.isDragging);

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    if (dragState.isDragging) {
      // 检查是否拖出窗口
      const isOutside = e.clientX < -50 || e.clientX > window.innerWidth + 50 ||
                       e.clientY < -50 || e.clientY > window.innerHeight + 50;

      if (isOutside || dragState.shiftPressed) {
        console.log('🪟 拖出窗口，创建新窗口');
        log(`🪟 拖出窗口！创建新窗口...`);
        
        // 创建新窗口
        if (invoke && serializeStorage) {
          try {
            const tab = window.tauriTabs.tabs.find(t => t.id === dragState.draggedTabId);
            if (tab) {
              let currentUrl = tab.url;
              try {
                currentUrl = tab.iframe.contentWindow.location.href;
              } catch (err) {}
              
              const storageData = serializeStorage();
              await invoke('create_new_window', {
                currentUrl: currentUrl,
                storageData: JSON.stringify(storageData)
              });

              // 关闭原标签
              if (window.tauriTabs.tabs.length > 1) {
                const { closeTab } = await import('./operations.js');
                closeTab(dragState.draggedTabId);
              }
            }
          } catch (err) {
            console.error('创建新窗口失败:', err);
          }
        }
      } else {
        // 执行排序
        const placeholder = dragState.placeholder;
        if (placeholder && placeholder.nextSibling) {
          const nextTab = placeholder.nextSibling;
          if (nextTab.classList && nextTab.classList.contains('tauri-tab')) {
            const targetId = nextTab.dataset.tabId;
            console.log('✅ 执行排序:', dragState.draggedTabId, '->', targetId);
            if (reorderTabs && targetId !== dragState.draggedTabId) {
              reorderTabs(dragState.draggedTabId, targetId);
            }
          }
        } else if (placeholder && placeholder.previousSibling) {
          const prevTab = placeholder.previousSibling;
          if (prevTab.classList && prevTab.classList.contains('tauri-tab')) {
            const targetId = prevTab.dataset.tabId;
            console.log('✅ 执行排序:', dragState.draggedTabId, '->', targetId);
            if (reorderTabs && targetId !== dragState.draggedTabId) {
              reorderTabs(dragState.draggedTabId, targetId);
            }
          }
        }
      }

      // 清理
      dragState.ghost?.remove();
      dragState.placeholder?.remove();
      if (dragState.draggedTab) {
        dragState.draggedTab.style.opacity = '';
      }
    }

    // 重置状态
    dragState.isDragging = false;
    dragState.draggedTab = null;
    dragState.draggedTabId = null;
    dragState.ghost = null;
    dragState.placeholder = null;
  }

  // 监听 Shift 键
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
      dragState.shiftPressed = true;
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      dragState.shiftPressed = false;
    }
  });

  // 在标签容器上添加监听
  function attachListeners() {
    const container = document.querySelector('.tauri-tabs-container');
    if (container) {
      container.addEventListener('mousedown', onMouseDown);
      console.log('✅ 简单拖动系统已启用');
      log('✅ 简单拖动系统已启用');
    } else {
      setTimeout(attachListeners, 100);
    }
  }

  attachListeners();
}

