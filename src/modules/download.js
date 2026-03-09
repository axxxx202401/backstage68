/**
 * 下载辅助模块
 * 
 * 功能：
 * 1. 下载目录检测（Linux 兼容）
 * 2. 下载进度 UI（监听 Rust 端流式下载事件）
 */

import { isLinux } from './utils/dom.js';

let downloadDir = null;
let osType = null;

// 下载进度 UI 状态
let progressContainer = null;
const activeDownloads = new Map();

/**
 * 初始化下载模块
 */
export async function initDownload(log, invoke) {
  log('📥 初始化下载模块...');

  try {
    osType = await invoke('get_os_type');
    log(`📍 操作系统: ${osType}`);

    downloadDir = await invoke('get_download_dir');
    log(`📂 下载目录: ${downloadDir}`);

    window.tauriDownload = {
      getDownloadDir: () => downloadDir,
      getOsType: () => osType,
      isLinux: () => osType === 'linux',
      openDownloadDir,
      // 供 linux-fixes.js 直接调用的 UI 控制函数
      showDownloadStarted(id, filename) {
        ensureProgressContainer();
        updateDownloadItem(id, filename, 0, 0, 0, 0, 'downloading');
      },
      showDownloadComplete(id, filename, savedPath, size) {
        ensureProgressContainer();
        updateDownloadItem(id, filename, size || 0, size || 0, 100, 0, 'complete', null, savedPath);
      },
      showDownloadError(id, filename, error) {
        ensureProgressContainer();
        updateDownloadItem(id, filename, 0, 0, 0, 0, 'error', error);
        setTimeout(() => removeDownloadItem(id), 8000);
      },
    };

    if (osType === 'linux') {
      log(`🐧 Linux 系统下载目录: ${downloadDir}`);
    }

    // 初始化下载进度监听
    initDownloadProgressListener(log);

    log('✅ 下载模块初始化完成');
  } catch (err) {
    log(`⚠️ 下载模块初始化失败: ${err}`);
    console.error('下载模块初始化失败:', err);
  }
}

/**
 * 监听 Rust 端下载事件，驱动实时进度 UI
 * 注意：外部 URL 模式下 window.__TAURI__.event 不存在，
 * 需要用底层 __TAURI_INTERNALS__ API 注册事件监听
 */
function initDownloadProgressListener(log) {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals || !internals.invoke || !internals.transformCallback) {
    log('⚠️ Tauri internals API 不可用，实时进度将不可用（基础反馈仍然可用）');
    return;
  }

  function tauriListen(eventName, handler) {
    const callbackId = internals.transformCallback((event) => {
      handler(event);
    });
    return internals.invoke('plugin:event|listen', {
      event: eventName,
      target: { kind: 'Any' },
      handler: callbackId,
    }).catch(err => {
      log(`⚠️ 注册事件 ${eventName} 失败: ${err}`);
    });
  }

  tauriListen('download-progress', (event) => {
    const { id, filename, downloaded, total_size, percent, speed_bps } = event.payload;
    ensureProgressContainer();
    updateDownloadItem(id, filename, downloaded, total_size, percent, speed_bps, 'downloading');
  });

  tauriListen('download-complete', (event) => {
    const { id, filename, path, size } = event.payload;
    ensureProgressContainer();
    updateDownloadItem(id, filename, size, size, 100, 0, 'complete', null, path);
    log(`📥 下载完成: ${path}`);
  });

  tauriListen('download-error', (event) => {
    const { id, filename, error } = event.payload;
    ensureProgressContainer();
    updateDownloadItem(id, filename, 0, 0, 0, 0, 'error', error);
    log(`❌ 下载失败: ${filename} - ${error}`);
    setTimeout(() => removeDownloadItem(id), 8000);
  });

  log('✅ 下载进度事件监听已启用');
}

// ── 进度 UI ──────────────────────────────────────

function ensureProgressContainer() {
  if (progressContainer && document.body.contains(progressContainer)) return;

  progressContainer = document.createElement('div');
  progressContainer.id = 'tauri-download-progress';
  progressContainer.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 99999999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 340px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    pointer-events: auto;
  `;
  document.body.appendChild(progressContainer);
}

function updateDownloadItem(id, filename, downloaded, totalSize, percent, speedBps, status, errorMsg, savedPath) {
  let item = activeDownloads.get(id);

  if (!item) {
    item = createDownloadItemEl(id, filename);
    activeDownloads.set(id, item);
    progressContainer.appendChild(item.el);
    requestAnimationFrame(() => { item.el.style.opacity = '1'; item.el.style.transform = 'translateX(0)'; });
  }

  if (savedPath) item.savedPath = savedPath;

  const bar = item.el.querySelector('.dl-bar-fill');
  const info = item.el.querySelector('.dl-info');
  const nameEl = item.el.querySelector('.dl-name');
  const actions = item.el.querySelector('.dl-actions');

  const shortName = filename.length > 32 ? filename.slice(0, 14) + '...' + filename.slice(-14) : filename;
  nameEl.textContent = shortName;
  nameEl.title = filename;

  if (status === 'downloading') {
    bar.style.width = `${percent}%`;
    bar.style.backgroundColor = '#3b82f6';
    const totalText = totalSize > 0 ? ` / ${formatBytes(totalSize)}` : '';
    const speedText = speedBps > 0 ? `  ${formatBytes(speedBps)}/s` : '';
    info.textContent = `${percent}%${totalText}${speedText}`;
    info.style.display = '';
    actions.style.display = 'none';
  } else if (status === 'complete') {
    bar.style.width = '100%';
    bar.style.backgroundColor = '#22c55e';
    info.style.display = 'none';
    actions.style.display = 'flex';
    actions.innerHTML = '';
    actions.appendChild(makeActionBtn('打开文件', () => {
      const invoke = window.__TAURI__?.core?.invoke;
      if (invoke && item.savedPath) invoke('open_file', { path: item.savedPath }).catch(console.error);
    }));
    actions.appendChild(makeActionBtn('打开目录', () => {
      const invoke = window.__TAURI__?.core?.invoke;
      if (invoke && item.savedPath) invoke('open_file_folder', { path: item.savedPath }).catch(console.error);
    }));
    const sizeText = downloaded > 0 ? formatBytes(downloaded) : '完成';
    actions.appendChild(makeActionBtn(`✓ ${sizeText}`, null, true));
    // 30 秒后自动消失（给用户足够时间点击按钮）
    clearTimeout(item.dismissTimer);
    item.dismissTimer = setTimeout(() => removeDownloadItem(id), 30000);
  } else if (status === 'error') {
    bar.style.width = '100%';
    bar.style.backgroundColor = '#ef4444';
    info.textContent = `✗ ${errorMsg || '下载失败'}`;
    info.style.display = '';
    actions.style.display = 'none';
  }
}

const ACTION_BTN_STYLE = `
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1.4;
  border: none;
  transition: background .15s;
`;

function makeActionBtn(text, onClick, isLabel) {
  const btn = document.createElement(isLabel ? 'span' : 'button');
  if (isLabel) {
    btn.style.cssText = `font-size:11px;color:#94a3b8;margin-left:auto;`;
  } else {
    btn.style.cssText = ACTION_BTN_STYLE + `background:#334155;color:#e2e8f0;`;
    btn.addEventListener('mouseenter', () => { btn.style.background = '#475569'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#334155'; });
    btn.addEventListener('click', onClick);
  }
  btn.textContent = text;
  return btn;
}

function createDownloadItemEl(id, filename) {
  const el = document.createElement('div');
  el.style.cssText = `
    background: #1e293b;
    color: #e2e8f0;
    border-radius: 10px;
    padding: 10px 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,.3);
    opacity: 0;
    transform: translateX(40px);
    transition: opacity .25s ease, transform .25s ease;
    min-width: 280px;
  `;
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <span class="dl-name" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;" title="${filename}"></span>
      <span class="dl-close" style="cursor:pointer;margin-left:8px;opacity:.5;font-size:14px;line-height:1;" title="关闭">✕</span>
    </div>
    <div style="background:#334155;border-radius:4px;height:6px;overflow:hidden;margin-bottom:4px;">
      <div class="dl-bar-fill" style="height:100%;width:0%;border-radius:4px;transition:width .2s ease;background:#3b82f6;"></div>
    </div>
    <div class="dl-info" style="font-size:11px;color:#94a3b8;"></div>
    <div class="dl-actions" style="display:none;gap:6px;align-items:center;margin-top:2px;"></div>
  `;
  el.querySelector('.dl-close').addEventListener('click', () => removeDownloadItem(id));
  return { el, savedPath: null };
}

function removeDownloadItem(id) {
  const item = activeDownloads.get(id);
  if (!item) return;
  clearTimeout(item.dismissTimer);
  item.el.style.opacity = '0';
  item.el.style.transform = 'translateX(40px)';
  setTimeout(() => {
    item.el.remove();
    activeDownloads.delete(id);
    if (activeDownloads.size === 0 && progressContainer) {
      progressContainer.remove();
      progressContainer = null;
    }
  }, 300);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

// ── 原有功能 ─────────────────────────────────────

async function openDownloadDir() {
  if (!downloadDir) {
    console.error('下载目录未初始化');
    return;
  }
  try {
    if (window.__TAURI__ && window.__TAURI__.shell) {
      await window.__TAURI__.shell.open(downloadDir);
    } else {
      console.warn('Tauri shell API 不可用');
    }
  } catch (err) {
    console.error('打开下载目录失败:', err);
  }
}

export function getDownloadDir() {
  return downloadDir;
}

export function getOsType() {
  return osType;
}

