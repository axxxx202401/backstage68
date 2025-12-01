/**
 * 页面缩放模块
 */

import { isMac, getModifierKey } from './utils/dom.js';

const MIN_ZOOM = 0.25;   // 25%
const MAX_ZOOM = 5.0;    // 500%
const ZOOM_STEP = 0.05;  // 5%

export function initZoom(log) {
  log("🔍 初始化缩放模块...");
  
  let currentZoom = 1.0;
  let zoomIndicator = null;
  let zoomTimeout = null;

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

  async function applyZoom(zoom) {
    try {
      currentZoom = zoom;
      if (window.tauriTabs) {
        window.tauriTabs.currentZoom = zoom;
      }
      showZoomIndicator(zoom);
      
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
    }
  }

  async function zoomIn() {
    const newZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
    await applyZoom(newZoom);
  }

  async function zoomOut() {
    const newZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
    await applyZoom(newZoom);
  }

  async function zoomReset() {
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

