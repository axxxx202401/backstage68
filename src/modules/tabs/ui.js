/**
 * 标签页 UI 模块
 */

const TAB_CONFIG = {
  maxTabs: 20,
  tabBarHeight: 40,
  minTabWidth: 40,
  maxTabWidth: 200,
  defaultTabWidth: 200,
  enableCloseButton: true
};

// 创建标签栏
export function createTabBar() {
  const tabBar = document.createElement('div');
  tabBar.id = 'tauri-tab-bar';
  tabBar.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: ${TAB_CONFIG.tabBarHeight}px;
    background: linear-gradient(180deg, #3a3a3a 0%, #2c2c2c 100%);
    display: flex;
    align-items: center;
    padding: 0;
    z-index: 999999;
    user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;
  
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'tauri-tabs-container';
  tabsContainer.style.cssText = `
    flex: 1;
    display: flex;
    align-items: center;
    padding: 0 8px;
    overflow: hidden;
    gap: 4px;
  `;
  
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'tauri-tab-controls-fixed';
  controlsContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    flex-shrink: 0;
    background: linear-gradient(90deg, rgba(42, 42, 42, 0.8) 0%, #2c2c2c 20%);
  `;
  
  tabBar.appendChild(tabsContainer);
  tabBar.appendChild(controlsContainer);
  
  createStyles();
  document.body.appendChild(tabBar);
  
  return { tabBar, tabsContainer, controlsContainer };
}

// 创建样式
function createStyles() {
  if (!document.head) {
    console.warn('document.head 不可用，延迟创建样式');
    return;
  }
  const style = document.createElement('style');
  style.textContent = `
    .tauri-tabs-container::-webkit-scrollbar { display: none; }
    .tauri-tab {
      min-width: ${TAB_CONFIG.minTabWidth}px;
      max-width: ${TAB_CONFIG.maxTabWidth}px;
      width: ${TAB_CONFIG.defaultTabWidth}px;
      height: 30px;
      background: rgba(255,255,255,0.05);
      border-radius: 6px 6px 0 0;
      display: flex;
      align-items: center;
      padding: 0 8px;
      cursor: pointer;
      transition: background 0.2s, width 0.3s ease;
      flex-shrink: 1;
      position: relative;
    }
    .tauri-tab:hover { background: rgba(255,255,255,0.1); }
    .tauri-tab.active {
      background: rgba(255,255,255,0.15);
      box-shadow: 0 -2px 0 0 #0066cc inset;
    }
    .tauri-tab-title {
      flex: 1;
      color: #e0e0e0;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tauri-tab.active .tauri-tab-title { color: #ffffff; }
    .tauri-tab-close {
      margin-left: 8px;
      color: #999;
      font-size: 18px;
      line-height: 1;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .tauri-tab-close:hover {
      background: rgba(255,255,255,0.2);
      color: #fff;
    }
    .tauri-new-tab, .tauri-search-tab {
      min-width: 32px;
      width: 32px;
      height: 30px;
      background: rgba(255,255,255,0.05);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.2s;
      color: #e0e0e0;
      flex-shrink: 0;
    }
    .tauri-new-tab { font-size: 20px; }
    .tauri-search-tab { font-size: 18px; }
    .tauri-new-tab:hover, .tauri-search-tab:hover {
      background: rgba(255,255,255,0.15);
    }
    .tauri-iframe-container {
      position: fixed;
      top: ${TAB_CONFIG.tabBarHeight}px;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: calc(100vh - ${TAB_CONFIG.tabBarHeight}px);
    }
    .tauri-tab-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: none;
    }
    .tauri-tab-iframe.active { display: block; }
    .tauri-tab.dragging {
      opacity: 0.5;
      cursor: grabbing;
    }
    .tauri-tab.drag-over {
      background: rgba(255,255,255,0.25);
      border-left: 2px solid #0066cc;
    }
  `;
  document.head.appendChild(style);
}

// 更新标签宽度（自适应）
export function updateTabWidths() {
  const container = document.querySelector('.tauri-tabs-container');
  if (!container) return;
  
  const newTabBtn = container.querySelector('.tauri-new-tab');
  const tabs = Array.from(container.querySelectorAll('.tauri-tab'));
  
  if (tabs.length === 0) return;
  
  const containerWidth = container.clientWidth;
  const newTabBtnWidth = newTabBtn ? 36 : 0;
  const gap = 4;
  const padding = 16;
  
  const availableWidth = containerWidth - newTabBtnWidth - padding - (gap * tabs.length);
  const idealWidth = availableWidth / tabs.length;
  
  const finalWidth = Math.max(
    TAB_CONFIG.minTabWidth,
    Math.min(TAB_CONFIG.maxTabWidth, idealWidth)
  );
  
  tabs.forEach(tab => {
    tab.style.width = `${finalWidth}px`;
  });
}

export { TAB_CONFIG };

