/**
 * 标签页搜索模块
 */

import { activateTab } from './operations.js';

// 显示标签搜索对话框
export function showTabSearch() {
  const log = window.tauriTabs.log;
  log('🔍 打开标签搜索');
  
  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'tauri-tab-search-overlay';
  
  // 创建对话框
  const dialog = document.createElement('div');
  dialog.className = 'tauri-tab-search-dialog';
  
  // 搜索输入框
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tauri-tab-search-input';
  input.placeholder = '搜索标签标题';
  
  // 结果容器
  const results = document.createElement('div');
  results.className = 'tauri-tab-search-results';
  
  dialog.appendChild(input);
  dialog.appendChild(results);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  let selectedIndex = 0;
  
  // 渲染搜索结果
  function renderResults(query = '') {
    const tabs = window.tauriTabs.tabs;
    const filtered = query.trim() === '' ? tabs : tabs.filter(tab => {
      const title = (tab.title || '').toLowerCase();
      const q = query.toLowerCase();
      return title.includes(q); // 只搜索标题
    });
    
    results.innerHTML = '';
    
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tauri-tab-search-empty';
      empty.textContent = '没有找到匹配的标签';
      results.appendChild(empty);
      return;
    }
    
    filtered.forEach((tab, index) => {
      const item = document.createElement('div');
      item.className = 'tauri-tab-search-item';
      if (index === selectedIndex) {
        item.classList.add('selected');
      }
      
      const icon = document.createElement('div');
      icon.className = 'tauri-tab-search-item-icon';
      icon.textContent = '📄';
      
      const content = document.createElement('div');
      content.className = 'tauri-tab-search-item-content';
      
      const titleEl = document.createElement('div');
      titleEl.className = 'tauri-tab-search-item-title';
      titleEl.textContent = tab.title || 'Untitled';
      
      content.appendChild(titleEl);
      item.appendChild(icon);
      item.appendChild(content);
      
      item.addEventListener('click', () => {
        activateTab(tab.id);
        closeSearch();
      });
      
      results.appendChild(item);
    });
    
    selectedIndex = Math.min(selectedIndex, filtered.length - 1);
  }
  
  // 关闭搜索
  function closeSearch() {
    overlay.remove();
    log('🔍 关闭标签搜索');
  }
  
  // 输入事件
  input.addEventListener('input', () => {
    selectedIndex = 0;
    renderResults(input.value);
  });
  
  // 键盘事件
  input.addEventListener('keydown', (e) => {
    const items = results.querySelectorAll('.tauri-tab-search-item');
    
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      renderResults(input.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderResults(input.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].click();
      }
    }
  });
  
  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeSearch();
    }
  });
  
  // 初始渲染
  renderResults();
  
  // 自动聚焦
  setTimeout(() => input.focus(), 100);
}

// 添加搜索样式
const searchStyle = document.createElement('style');
searchStyle.textContent = `
  .tauri-tab-search-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.7);
    z-index: 10000000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 100px;
    animation: overlayFadeIn 0.2s ease-out;
  }
  @keyframes overlayFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .tauri-tab-search-dialog {
    background: #2c2c2c;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.8);
    border: 1px solid #444;
    width: 600px;
    max-width: 90vw;
    max-height: 500px;
    display: flex;
    flex-direction: column;
    animation: dialogSlideIn 0.3s ease-out;
    overflow: hidden;
  }
  @keyframes dialogSlideIn {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .tauri-tab-search-input {
    width: 100%;
    padding: 16px 20px;
    background: #1e1e1e;
    border: none;
    border-bottom: 1px solid #444;
    color: #e0e0e0;
    font-size: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    outline: none;
    border-radius: 12px 12px 0 0;
    box-sizing: border-box;
  }
  .tauri-tab-search-input:focus {
    background: #252525;
    border-bottom-color: #0066cc;
  }
  .tauri-tab-search-input::placeholder {
    color: #888;
  }
  .tauri-tab-search-results {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    min-height: 100px;
  }
  .tauri-tab-search-results::-webkit-scrollbar {
    width: 8px;
  }
  .tauri-tab-search-results::-webkit-scrollbar-track {
    background: #2c2c2c;
  }
  .tauri-tab-search-results::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 4px;
  }
  .tauri-tab-search-results::-webkit-scrollbar-thumb:hover {
    background: #666;
  }
  .tauri-tab-search-item {
    padding: 12px 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: background 0.15s;
  }
  .tauri-tab-search-item:hover {
    background: rgba(255,255,255,0.1);
  }
  .tauri-tab-search-item.selected {
    background: rgba(0,102,204,0.3);
  }
  .tauri-tab-search-item-icon {
    font-size: 20px;
    flex-shrink: 0;
  }
  .tauri-tab-search-item-content {
    flex: 1;
    min-width: 0;
  }
  .tauri-tab-search-item-title {
    color: #e0e0e0;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tauri-tab-search-empty {
    padding: 40px 20px;
    text-align: center;
    color: #888;
    font-size: 14px;
  }
`;
document.head.appendChild(searchStyle);

