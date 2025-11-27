/**
 * 存储工具模块
 */

/**
 * 序列化存储数据（用于跨窗口传递）
 */
export function serializeStorage() {
  const data = {
    localStorage: {},
    sessionStorage: {}
  };
  
  // 复制 localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    data.localStorage[key] = localStorage.getItem(key);
  }
  
  // 复制 sessionStorage
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    data.sessionStorage[key] = sessionStorage.getItem(key);
  }
  
  return data;
}

