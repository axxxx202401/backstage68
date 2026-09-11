/**
 * 标签拖拽排序 - 使用 Sortable.js + Animate.css
 * 纯第三方库实现，无自定义动画
 */

import Sortable from 'sortablejs';
import { getAccessibleIframeContext } from '../utils/iframe.js';

export function setupSimpleDrag(log) {
  // 动态加载 Animate.css
  if (!document.querySelector('link[href*="animate.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css';
    document.head.appendChild(link);
  }
  let sortableInstance = null;
  
  // 拖拽状态
  let dragState = {
    draggedTabId: null,
    isDraggedOut: false,
    isDragging: false,
    mouseMoveHandler: null,
    loggedDragOut: false
  };
  
  // 暴露拖拽状态，让 mousedown 事件检查
  window.__sortableDragging = false;

  // 不再需要动态导入 getTabCurrentUrl，直接从 iframe 获取 URL

  // 初始化 Sortable
  function attachListeners() {
    const container = document.querySelector('.tauri-tabs-container');
    if (!container) {
      setTimeout(attachListeners, 100);
      return;
    }

    // 清理旧实例
    if (sortableInstance) {
      sortableInstance.destroy();
    }

    // 创建 Sortable 实例 - 优化配置
    sortableInstance = Sortable.create(container, {
      animation: 350,                    // 更长的动画时间，更明显
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // 弹性缓动
      delay: 0,                          // 不延迟，点击就能拖
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen', 
      dragClass: 'sortable-drag',
      forceFallback: true,
      fallbackClass: 'sortable-fallback',
      fallbackOnBody: true,
      fallbackTolerance: 3,              // 移动3px就开始拖拽
      swapThreshold: 0.65,
      direction: 'horizontal',
      draggable: '.tauri-tab',
      filter: '.tauri-tab-close',
      preventOnFilter: false,
      
      // 只响应左键拖拽，避免干扰右键
      onChoose: function(evt) {
        // 如果是右键，阻止 Sortable 处理
        if (evt.originalEvent && evt.originalEvent.button !== 0) {
          this.option("disabled", true);
          setTimeout(() => {
            this.option("disabled", false);
          }, 100);
          return false;
        }
      },

      // 拖拽开始
      onStart: function(evt) {
        const tab = evt.item;
        dragState.draggedTabId = tab.dataset.tabId;
        dragState.isDraggedOut = false;
        dragState.isDragging = true;
        
        // 使用 Animate.css 的 tada 动画（更明显）
        tab.classList.add('animate__animated', 'animate__tada', 'animate__faster');
        
        // 添加拖拽开始的视觉反馈
        tab.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        
        log(`🖱️ 开始拖动标签: ${dragState.draggedTabId}`);
        
        // 监听全局鼠标移动来检测拖出窗口
        const checkDragOut = (e) => {
          const rect = container.getBoundingClientRect();
          const threshold = 100; // 拖出阈值
          const mouseX = e.clientX;
          const mouseY = e.clientY;
          
          // 检测是否拖出标签栏区域
          const isOut = mouseX < rect.left - threshold || 
                        mouseX > rect.right + threshold || 
                        mouseY < rect.top - threshold || 
                        mouseY > rect.bottom + threshold;
          
          dragState.isDraggedOut = isOut;
          
          // 视觉反馈
          if (isOut) {
            tab.style.opacity = '0.5';
            tab.style.filter = 'hue-rotate(90deg)';
            if (!dragState.loggedDragOut) {
              log(`🪟 检测到拖出窗口: x=${mouseX}, y=${mouseY}`);
              console.log('🪟 拖出窗口区域！');
              dragState.loggedDragOut = true;
            }
          } else {
            tab.style.opacity = '';
            tab.style.filter = '';
            dragState.loggedDragOut = false;
          }
        };
        
        document.addEventListener('mousemove', checkDragOut);
        dragState.mouseMoveHandler = checkDragOut;
      },

      // onMove 事件在 Sortable 内部移动时触发，我们改用全局 mousemove
      onMove: function(evt) {
        return true; // 允许移动
      },

      // 拖拽结束
      onEnd: async function(evt) {
        const tab = evt.item;
        const oldIndex = evt.oldIndex;
        const newIndex = evt.newIndex;
        const draggedTabId = dragState.draggedTabId;
        
        // 清除动画类
        tab.classList.remove('animate__animated', 'animate__pulse', 'animate__faster');

        // 如果拖出窗口
        if (dragState.isDraggedOut) {
          log(`🪟 检测到拖出窗口，创建新窗口...`);
          console.log('🪟 拖出窗口，准备创建新窗口');
          
          try {
            const tabData = window.tauriTabs.tabs.find(t => t.id === draggedTabId);
            log(`📋 找到标签数据: ${tabData ? tabData.id : 'null'}`);
            
            if (tabData && window.tauriOpenNewWindow) {
              // 获取当前 URL
              let currentUrl = tabData.url || window.location.href;
              
              // 尝试从 iframe 获取实际 URL
              try {
                const iframeWindow = getAccessibleIframeContext(tabData.iframe)?.window;
                if (iframeWindow) {
                  const iframeUrl = iframeWindow.location.href;
                  if (iframeUrl && iframeUrl !== 'about:blank') {
                    currentUrl = iframeUrl;
                  }
                }
              } catch (e) {
                // 跨域时无法获取，使用原始 URL
                log(`⚠️ 无法获取 iframe URL (跨域): ${e.message}`);
              }
              
              log(`🌐 准备打开 URL: ${currentUrl}`);
              await window.tauriOpenNewWindow(currentUrl);
              log(`✅ 新窗口已创建`);

              // 关闭原标签
              if (window.tauriTabs.tabs.length > 1) {
                const { closeTab } = await import('./operations.js');
                log(`🗑️ 关闭原标签: ${draggedTabId}`);
                closeTab(draggedTabId);
              }
            } else {
              log(`❌ 缺少必要数据: tabData=${!!tabData}, tauriOpenNewWindow=${!!window.tauriOpenNewWindow}`);
            }
          } catch (err) {
            console.error('创建新窗口失败:', err);
            log(`❌ 创建新窗口失败: ${err.message}`);
          }
          
          return;
        }

        // 位置改变，同步 tabs 数组顺序
        if (oldIndex !== newIndex) {
          // 使用 Animate.css 的 rubberBand 动画（更有弹性感）
          tab.classList.add('animate__animated', 'animate__rubberBand');
          setTimeout(() => {
            tab.classList.remove('animate__animated', 'animate__rubberBand');
          }, 1000);
          
          // 根据当前 DOM 顺序重新排列 tabs 数组
          const tabs = window.tauriTabs.tabs;
          const newOrder = [];
          
          // 遍历 DOM 中的所有标签，按顺序找到对应的 tab 对象
          Array.from(container.querySelectorAll('.tauri-tab')).forEach(tabElement => {
            const tabId = tabElement.dataset.tabId;
            const tabObj = tabs.find(t => t.id === tabId);
            if (tabObj) {
              newOrder.push(tabObj);
            }
          });
          
          // 更新数组顺序
          window.tauriTabs.tabs.length = 0;
          window.tauriTabs.tabs.push(...newOrder);
          
          log(`📋 标签数组已同步，新顺序: ${newOrder.map(t => t.id).join(', ')}`);
        }

        // 移除全局鼠标移动监听
        if (dragState.mouseMoveHandler) {
          document.removeEventListener('mousemove', dragState.mouseMoveHandler);
          dragState.mouseMoveHandler = null;
        }
        
        // 恢复样式
        if (tab) {
          tab.style.opacity = '';
          tab.style.filter = '';
        }
        
        dragState.draggedTabId = null;
        dragState.isDraggedOut = false;
        dragState.loggedDragOut = false;
        
        // 延迟重置拖拽状态，避免触发点击
        setTimeout(() => {
          dragState.isDragging = false;
          window.__sortableDragging = false;
        }, 50);
      }
    });

    console.log('✅ Sortable.js + Animate.css 拖动系统已启用');
    log('✅ 标签拖拽系统已启用（Sortable.js + Animate.css）');
  }

  // 增强的拖拽样式 - 更明显的视觉反馈
  const style = document.createElement('style');
  style.textContent = `
    /* Sortable.js 拖拽样式 - 增强版 */
    .sortable-ghost {
      opacity: 0.5 !important;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15)) !important;
      border: 3px dashed rgba(59, 130, 246, 0.5) !important;
      border-radius: 8px !important;
      transform: scale(0.98) !important;
      box-shadow: inset 0 0 30px rgba(59, 130, 246, 0.2) !important;
    }
    
    .sortable-chosen {
      cursor: grabbing !important;
      transform: scale(1.03) !important;
      transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
    }
    
    .sortable-drag {
      opacity: 0 !important;
    }
    
    .sortable-fallback {
      cursor: grabbing !important;
      opacity: 0.95 !important;
      box-shadow: 
        0 20px 60px rgba(0, 0, 0, 0.3),
        0 0 0 2px rgba(59, 130, 246, 0.5),
        0 0 30px rgba(59, 130, 246, 0.4) !important;
      transform: scale(1.1) rotate(-5deg) translateY(-8px) !important;
      filter: brightness(1.2) saturate(1.2) !important;
      border-radius: 8px !important;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
    }
    
    /* 标签基础样式 */
    .tauri-tab {
      cursor: grab;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      will-change: transform;
      user-select: none !important;           /* 禁止选中文本 */
      -webkit-user-select: none !important;   /* Safari */
      -moz-user-select: none !important;      /* Firefox */
      -ms-user-select: none !important;       /* IE/Edge */
    }
    
    .tauri-tab * {
      user-select: none !important;           /* 禁止选中标签内所有元素的文本 */
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
    }
    
    .tauri-tab:hover {
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    
    .tauri-tab:active {
      cursor: grabbing;
    }
  `;
  document.head.appendChild(style);

  // 初始化
  attachListeners();

  // 暴露 API
  window.tauriSortable = {
    reinit: attachListeners,
    destroy: () => {
      if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
      }
    }
  };
}
