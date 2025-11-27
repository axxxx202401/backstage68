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
 * 获取修饰键（Mac: metaKey, Windows: ctrlKey）
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

