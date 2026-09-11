const REQUEST_TYPE = 'backstage68:base-api-proxy-request';
const RESPONSE_TYPE = 'backstage68:base-api-proxy-response';

let requestCounter = 0;

function sendResponse(port, id, result, error) {
  if (!port || typeof port.postMessage !== 'function') return;
  port.postMessage({
    type: RESPONSE_TYPE,
    id,
    result,
    error
  });
}

export function initMainFrameProxyBridge(log, invoke, targetWindow = window) {
  targetWindow.addEventListener('message', async (event) => {
    const message = event.data;
    if (!message || message.type !== REQUEST_TYPE || !message.id) return;

    const replyPort = event.ports?.[0];
    if (!replyPort) {
      log('❌ iframe 代理桥缺少 MessagePort，拒绝请求');
      return;
    }

    const request = message.request;
    try {
      if (!request?.url || !String(request.url).includes('/base_api')) {
        throw new Error('只允许代理包含 /base_api 的请求');
      }

      const requestUrl = new URL(request.url, targetWindow.location.origin);
      if (requestUrl.origin !== targetWindow.location.origin) {
        throw new Error('拒绝代理非当前站点的 /base_api 请求');
      }

      log(`📨 顶层窗口收到 iframe 代理请求: ${request.url}`);
      const result = await invoke('proxy_request', { request });
      log(`📤 顶层窗口返回 iframe 代理响应: ${request.url}`);
      sendResponse(replyPort, message.id, result, null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log(`❌ iframe 代理桥失败: ${reason}`);
      sendResponse(replyPort, message.id, null, reason);
    }
  });
}

export function createFrameProxyInvoke(
  log,
  targetWindow = window,
  timeoutMs = 30000,
  createChannel = () => new MessageChannel()
) {
  return function invoke(command, args) {
    if (command !== 'proxy_request') {
      return Promise.reject(new Error(`iframe 不允许调用命令: ${command}`));
    }

    const id = `${Date.now()}-${++requestCounter}`;
    return new Promise((resolve, reject) => {
      const channel = createChannel();
      const timer = setTimeout(() => {
        channel.port1.close?.();
        reject(new Error('iframe 代理请求超时'));
      }, timeoutMs);

      function handleResponse(event) {
        const message = event.data;
        if (!message || message.type !== RESPONSE_TYPE || message.id !== id) return;

        clearTimeout(timer);
        channel.port1.close?.();
        if (message.error) {
          reject(new Error(message.error));
        } else {
          log(`✅ iframe 收到 Rust 代理响应: ${args?.request?.url || ''}`);
          resolve(message.result);
        }
      }

      channel.port1.onmessage = handleResponse;
      channel.port1.start?.();
      log(`🔄 iframe 通过主窗口代理: ${args?.request?.url || ''}`);
      try {
        targetWindow.top.postMessage({
          type: REQUEST_TYPE,
          id,
          request: args?.request
        }, '*', [channel.port2]);
      } catch (error) {
        clearTimeout(timer);
        channel.port1.close?.();
        reject(error);
      }
    });
  };
}
