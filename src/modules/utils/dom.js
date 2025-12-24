/**
 * DOM 工具模块
 */

/**
 * 检查是否在 iframe 内
 */
export function isInIframe() {
  return window.self !== window.top;
}

/**
 * 检查是否为 Mac
 */
export function isMac() {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

/**
 * 检查是否为 Linux
 */
export function isLinux() {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  return platform.indexOf('linux') >= 0 || userAgent.indexOf('linux') >= 0;
}

/**
 * 检查是否为 Windows
 */
export function isWindows() {
  return navigator.platform.toUpperCase().indexOf('WIN') >= 0;
}

/**
 * 获取当前操作系统
 */
export function getOS() {
  if (isMac()) return 'mac';
  if (isLinux()) return 'linux';
  if (isWindows()) return 'windows';
  return 'unknown';
}

/**
 * 获取修饰键（Mac: metaKey, Windows/Linux: ctrlKey）
 */
export function getModifierKey(event) {
  return isMac() ? event.metaKey : event.ctrlKey;
}

/**
 * 创建样式标签
 */
export function createStyleTag(cssText) {
  const style = document.createElement('style');
  style.textContent = cssText;
  document.head.appendChild(style);
  return style;
}

