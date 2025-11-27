/**
 * 日志工具模块
 */

export function initLogger() {
  const ENABLE_LOGS = window.__TAURI_ENABLE_LOGS__ || false;
  
  const log = (...args) => {
    if (ENABLE_LOGS) {
      console.log(...args);
    }
  };
  
  log.info = (...args) => {
    if (ENABLE_LOGS) {
      console.info(...args);
    }
  };
  
  log.warn = (...args) => {
    if (ENABLE_LOGS) {
      console.warn(...args);
    }
  };
  
  log.error = (...args) => {
    console.error(...args); // 错误始终输出
  };
  
  return log;
}

