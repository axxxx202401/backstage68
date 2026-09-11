const REQUEST_TYPE = 'backstage68:base-api-proxy-request';
const RESPONSE_TYPE = 'backstage68:base-api-proxy-response';

let requestCounter = 0;

function sendResponse(source, id, result, error) {
  if (!source || typeof source.postMessage !== 'function') return;
  source.postMessage({
    type: RESPONSE_TYPE,
    id,
    result,
    error
  }, '*');
}

export function initMainFrameProxyBridge(log, invoke, targetWindow = window) {
  targetWindow.addEventListener('message', async (event) => {
    const message = event.data;
    if (!message || message.type !== REQUEST_TYPE || !message.id) return;

    const request = message.request;
    try {
      if (!request?.url || !String(request.url).includes('/base_api')) {
        throw new Error('只允许代理包含 /base_api 的请求');
      }

      const requestUrl = new URL(request.url, targetWindow.location.origin);
      if (requestUrl.origin !== targetWindow.location.origin) {
        throw new Error('拒绝代理非当前站点的 /base_api 请求');
      }

      const result = await invoke('proxy_request', { request });
      sendResponse(event.source, message.id, result, null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log(`❌ iframe 代理桥失败: ${reason}`);
      sendResponse(event.source, message.id, null, reason);
    }
  });
}

export function createFrameProxyInvoke(log, targetWindow = window, timeoutMs = 30000) {
  return function invoke(command, args) {
    if (command !== 'proxy_request') {
      return Promise.reject(new Error(`iframe 不允许调用命令: ${command}`));
    }

    const id = `${Date.now()}-${++requestCounter}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        targetWindow.removeEventListener('message', handleResponse);
        reject(new Error('iframe 代理请求超时'));
      }, timeoutMs);

      function handleResponse(event) {
        const message = event.data;
        if (!message || message.type !== RESPONSE_TYPE || message.id !== id) return;

        clearTimeout(timer);
        targetWindow.removeEventListener('message', handleResponse);
        if (message.error) {
          reject(new Error(message.error));
        } else {
          resolve(message.result);
        }
      }

      targetWindow.addEventListener('message', handleResponse);
      log(`🔄 iframe 通过主窗口代理: ${args?.request?.url || ''}`);
      targetWindow.parent.postMessage({
        type: REQUEST_TYPE,
        id,
        request: args?.request
      }, '*');
    });
  };
}
