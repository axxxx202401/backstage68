/**
 * 下载辅助模块
 * 
 * 修复 Linux 下下载目录问题
 */

import { isLinux } from './utils/dom.js';

let downloadDir = null;
let osType = null;

/**
 * 初始化下载模块
 */
export async function initDownload(log, invoke) {
  log('📥 初始化下载模块...');

  try {
    // 获取操作系统类型
    osType = await invoke('get_os_type');
    log(`📍 操作系统: ${osType}`);

    // 获取下载目录
    downloadDir = await invoke('get_download_dir');
    log(`📂 下载目录: ${downloadDir}`);

    // 暴露到全局供其他模块使用
    window.tauriDownload = {
      getDownloadDir: () => downloadDir,
      getOsType: () => osType,
      isLinux: () => osType === 'linux',
      openDownloadDir
    };

    // 如果是 Linux，显示下载目录提示
    if (osType === 'linux') {
      log(`🐧 Linux 系统下载目录: ${downloadDir}`);
      // 可以在这里添加用户提示
    }

    log('✅ 下载模块初始化完成');
  } catch (err) {
    log(`⚠️ 下载模块初始化失败: ${err}`);
    console.error('下载模块初始化失败:', err);
  }
}

/**
 * 打开下载目录（调用系统文件管理器）
 */
async function openDownloadDir() {
  if (!downloadDir) {
    console.error('下载目录未初始化');
    return;
  }

  try {
    // 使用 Tauri shell API 打开目录
    if (window.__TAURI__ && window.__TAURI__.shell) {
      await window.__TAURI__.shell.open(downloadDir);
    } else {
      console.warn('Tauri shell API 不可用');
    }
  } catch (err) {
    console.error('打开下载目录失败:', err);
  }
}

/**
 * 获取下载目录路径
 */
export function getDownloadDir() {
  return downloadDir;
}

/**
 * 获取操作系统类型
 */
export function getOsType() {
  return osType;
}

