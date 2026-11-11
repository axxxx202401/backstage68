/**
 * 页面缩放模块
 */

import { isMac, getModifierKey } from './utils/dom.js';

const MIN_ZOOM = 0.25;   // 25%
const MAX_ZOOM = 5.0;    // 500%
const ZOOM_STEP = 0.05;  // 5%

// 窗口尺寸不变。按缩放系数放大 iframe 的布局尺寸，再 scale 缩回原窗口，页面就按新分辨率排满。
// iframe 用绝对定位，避免放大后的布局盒把外层容器撑出可滚动区域。
export function applyContentZoom(tabs, zoom, layoutZoom) {
  const factor = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const useLayout = Boolean(layoutZoom) && Math.abs(factor - 1) > 0.001;
  for (const tab of tabs || []) {
    const iframe = tab?.iframe;
    if (!iframe?.style) continue;
    if (!useLayout) {
      iframe.style.transform = '';
      iframe.style.transformOrigin = '';
      iframe.style.width = '';
      iframe.style.height = '';
      iframe.style.position = '';
      iframe.style.left = '';
      iframe.style.top = '';
      if (iframe.dataset) delete iframe.dataset.contentZoom;
      continue;
    }
    iframe.style.position = 'absolute';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.transformOrigin = '0 0';
    iframe.style.transform = `scale(${factor})`;
    iframe.style.width = `${100 / factor}%`;
    iframe.style.height = `${100 / factor}%`;
    if (iframe.dataset) iframe.dataset.contentZoom = String(factor);
  }
}

// iframe 内部的 client rect 在布局坐标系里，视觉位置要再乘上缩放系数。
export function contentZoomFactor(iframe) {
  const factor = Number(iframe?.dataset?.contentZoom);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

export function mapZoomedClientRect(rect, factor) {
  const scale = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return {
    left: rect.left * scale,
    top: rect.top * scale,
    width: rect.width * scale,
    height: rect.height * scale
  };
}

export function initZoom(log) {
  log("🔍 初始化缩放模块...");
  
  let currentZoom = 1.0;
  let zoomIndicator = null;
  let zoomTimeout = null;
  let isZooming = false; // 防止重叠的缩放操作
  let pendingZoom = null; // 等待执行的缩放值（防止堆积）
  let zoomTouched = false;

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

  // 获取非活动的 iframe 列表
  function getInactiveIframes() {
    if (!window.tauriTabs || !window.tauriTabs.tabs) return [];
    
    const activeId = window.tauriTabs.activeTabId;
    return window.tauriTabs.tabs
      .filter(t => t.id !== activeId && t.iframe)
      .map(t => t.iframe);
  }

  // 隐藏非活动 iframe（减少渲染负担）
  function hideInactiveIframes(iframes) {
    iframes.forEach(iframe => {
      iframe._originalVisibility = iframe.style.visibility;
      iframe.style.visibility = 'hidden';
    });
  }

  // 逐帧恢复非活动 iframe
  async function showInactiveIframesGradually(iframes) {
    for (const iframe of iframes) {
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          iframe.style.visibility = iframe._originalVisibility || '';
          delete iframe._originalVisibility;
          resolve();
        });
      });
    }
  }

  function resetOuterScroll() {
    const container = document.querySelector('.tauri-iframe-container');
    if (container && (container.scrollLeft || container.scrollTop)) {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    }
    const root = document.scrollingElement || document.documentElement;
    if (root && (root.scrollLeft || root.scrollTop)) {
      root.scrollLeft = 0;
      root.scrollTop = 0;
    }
  }

  function syncContentZoom() {
    if (!isMac()) return;
    applyContentZoom(window.tauriTabs?.tabs, currentZoom, true);
    if (Math.abs(currentZoom - 1) > 0.001) resetOuterScroll();
    window.dispatchEvent(new CustomEvent('tauri-content-zoom', { detail: currentZoom }));
  }

  // 执行缩放（优化版：隐藏非活动 iframe 减少渲染压力）
  async function applyZoom(zoom) {
    // 如果正在缩放，只保存最新值，不排队
    if (isZooming) {
      pendingZoom = zoom;
      return;
    }
    
    isZooming = true;
    zoomTouched = true;
    let targetZoom = zoom;
    
    try {
      while (true) {
        pendingZoom = null;
        
        currentZoom = targetZoom;
        if (window.tauriTabs) {
          window.tauriTabs.currentZoom = targetZoom;
        }
        showZoomIndicator(targetZoom);
        
        // 获取非活动 iframe
        const inactiveIframes = getInactiveIframes();
        
        // 隐藏非活动 iframe（减少渲染负担）
        if (inactiveIframes.length > 0) {
          hideInactiveIframes(inactiveIframes);
        }
        
        // 通过 Rust command 调用 Tauri 原生缩放
        if (window.__TAURI__ && window.__TAURI__.core) {
          await window.__TAURI__.core.invoke('set_zoom', { zoomLevel: targetZoom });
          syncContentZoom();
          log(`✅ 已应用缩放: ${Math.round(targetZoom * 100)}%`);
        } else {
          log.error("⚠️ Tauri API 不可用");
        }
        
        // 逐帧恢复非活动 iframe
        if (inactiveIframes.length > 0) {
          await showInactiveIframesGradually(inactiveIframes);
        }
        
        // 检查是否有新请求
        if (pendingZoom === null) {
          break; // 没有新请求，结束
        }
        targetZoom = pendingZoom; // 有新请求，继续执行
      }
    } catch (err) {
      log.error("缩放失败:", err);
    } finally {
      isZooming = false;
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

  function adoptZoom(zoom, { announce = false } = {}) {
    if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return;
    const next = Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
    const changed = next !== currentZoom;
    currentZoom = next;
    if (window.tauriTabs) {
      window.tauriTabs.currentZoom = currentZoom;
    }
    if (!changed && !announce) return;
    if (announce) showZoomIndicator(currentZoom);
    syncContentZoom();
  }

  const internals = window.__TAURI_INTERNALS__;
  if (internals?.invoke && internals?.transformCallback) {
    const callbackId = internals.transformCallback((event) => {
      if (isZooming) return;
      adoptZoom(event?.payload, { announce: true });
    });
    internals.invoke('plugin:event|listen', {
      event: 'zoom-changed',
      target: { kind: 'Any' },
      handler: callbackId
    }).catch((err) => {
      log(`⚠️ 注册缩放同步失败: ${err}`);
    });
  }

  // 缩放后 iframe 的布局盒比窗口大。点开头像菜单会把这个盒子滚进视口，页面就整体错位。
  const resetZoomScroll = () => {
    if (Math.abs(currentZoom - 1) <= 0.001) return;
    resetOuterScroll();
  };
  document.addEventListener('scroll', resetZoomScroll, true);

  if (window.__TAURI__?.core?.invoke) {
    window.__TAURI__.core.invoke('get_zoom').then((zoom) => {
      if (zoomTouched) return;
      adoptZoom(zoom);
    }).catch(() => {});
  }

  // 暴露到全局
  window.tauriZoom = {
    zoomIn,
    zoomOut,
    reset: zoomReset,
    get: () => currentZoom,
    set: applyZoom,
    sync: syncContentZoom
  };

  log("✅ 缩放模块已启用");
}

