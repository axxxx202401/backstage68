/**
 * 页面缩放模块
 */

import { isMac, isLinux, getModifierKey } from './utils/dom.js';

const MIN_ZOOM = 0.25;   // 25%
const MAX_ZOOM = 5.0;    // 500%
const ZOOM_STEP = 0.05;  // 5%

// 缩放防抖时间（毫秒）- 根据标签数量动态调整
const BASE_ZOOM_DEBOUNCE = 50;
const LINUX_ZOOM_DEBOUNCE_MULTIPLIER = 3; // Linux 需要更长的防抖

export function initZoom(log) {
  log("🔍 初始化缩放模块...");
  
  let currentZoom = 1.0;
  let zoomIndicator = null;
  let zoomTimeout = null;
  let zoomDebounceTimer = null;
  let pendingZoom = null;
  let isZooming = false; // 防止重叠的缩放操作
  const isLinuxSystem = isLinux();
  
  if (isLinuxSystem) {
    log("🐧 Linux 系统检测到，启用缩放性能优化");
  }
  
  // 根据当前标签数量计算防抖时间
  function getDebounceTime() {
    const tabCount = window.tauriTabs?.tabs?.length || 1;
    let baseTime = BASE_ZOOM_DEBOUNCE;
    
    // 标签数量越多，防抖时间越长
    if (tabCount > 5) {
      baseTime += (tabCount - 5) * 20; // 每多一个标签增加 20ms
    }
    
    // Linux 系统需要更长的防抖时间
    if (isLinuxSystem) {
      baseTime *= LINUX_ZOOM_DEBOUNCE_MULTIPLIER;
    }
    
    return Math.min(baseTime, 500); // 最大 500ms
  }

  function createZoomIndicator() {
    if (!zoomIndicator) {
      zoomIndicator = document.createElement('div');
      zoomIndicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.6);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 24px;
        font-weight: bold;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 999999;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      `;
      document.body.appendChild(zoomIndicator);
    }
    return zoomIndicator;
  }

  function showZoomIndicator(zoom) {
    const indicator = createZoomIndicator();
    indicator.textContent = `${Math.round(zoom * 100)}%`;
    indicator.style.opacity = '1';

    if (zoomTimeout) {
      clearTimeout(zoomTimeout);
    }

    zoomTimeout = setTimeout(() => {
      indicator.style.opacity = '0';
    }, 1000);
  }

  // 实际执行缩放的函数
  async function doApplyZoom(zoom) {
    if (isZooming) {
      log('⏳ 缩放操作进行中，跳过');
      return;
    }
    
    isZooming = true;
    try {
      currentZoom = zoom;
      if (window.tauriTabs) {
        window.tauriTabs.currentZoom = zoom;
      }
      
      // 通过 Rust command 调用 Tauri 原生缩放（缩放整个窗口包括标签栏）
      if (window.__TAURI__ && window.__TAURI__.core) {
        await window.__TAURI__.core.invoke('set_zoom', { zoomLevel: zoom });
        log(`✅ 已应用 Tauri 原生缩放: ${Math.round(zoom * 100)}%`);
      } else {
        log.error("⚠️ Tauri API 不可用");
      }
    } catch (err) {
      log.error("缩放失败:", err);
      console.error("缩放失败:", err);
    } finally {
      isZooming = false;
    }
  }

  // 带防抖的缩放函数（优化多标签性能）
  async function applyZoom(zoom) {
    // 立即更新指示器显示
    showZoomIndicator(zoom);
    
    // 取消之前的等待中的缩放
    pendingZoom = zoom;
    
    if (zoomDebounceTimer) {
      clearTimeout(zoomDebounceTimer);
    }
    
    const debounceTime = getDebounceTime();
    
    zoomDebounceTimer = setTimeout(async () => {
      if (pendingZoom !== null) {
        await doApplyZoom(pendingZoom);
        pendingZoom = null;
      }
    }, debounceTime);
  }

  async function zoomIn() {
    const newZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
    currentZoom = newZoom; // 立即更新，避免连续操作时的延迟
    await applyZoom(newZoom);
  }

  async function zoomOut() {
    const newZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
    currentZoom = newZoom; // 立即更新，避免连续操作时的延迟
    await applyZoom(newZoom);
  }

  async function zoomReset() {
    currentZoom = 1.0;
    await applyZoom(1.0);
  }

  // 键盘快捷键
  document.addEventListener('keydown', async (e) => {
    const ctrlKey = getModifierKey(e);

    if (ctrlKey && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      if (window.self !== window.top && window.parent.tauriZoom) {
        await window.parent.tauriZoom.zoomIn();
      } else {
        await zoomIn();
      }
    } else if (ctrlKey && e.key === '-') {
      e.preventDefault();
      if (window.self !== window.top && window.parent.tauriZoom) {
        await window.parent.tauriZoom.zoomOut();
      } else {
        await zoomOut();
      }
    } else if (ctrlKey && e.key === '0') {
      e.preventDefault();
      if (window.self !== window.top && window.parent.tauriZoom) {
        await window.parent.tauriZoom.reset();
      } else {
        await zoomReset();
      }
    }
  });

  // 鼠标滚轮缩放
  document.addEventListener('wheel', async (e) => {
    const ctrlKey = getModifierKey(e);

    if (ctrlKey) {
      e.preventDefault();
      
      if (window.self !== window.top && window.parent.tauriZoom) {
        if (e.deltaY < 0) {
          await window.parent.tauriZoom.zoomIn();
        } else {
          await window.parent.tauriZoom.zoomOut();
        }
      } else {
        if (e.deltaY < 0) {
          await zoomIn();
        } else {
          await zoomOut();
        }
      }
    }
  }, { passive: false });

  // 暴露到全局
  window.tauriZoom = {
    zoomIn,
    zoomOut,
    reset: zoomReset,
    get: () => currentZoom,
    set: applyZoom
  };

  log("✅ 缩放模块已启用");
}

