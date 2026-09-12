const REQUEST_TYPE = 'backstage68:base-api-proxy-request';
const RESPONSE_TYPE = 'backstage68:base-api-proxy-response';

let requestCounter = 0;

function sendResponse(target, id, result, error) {
  if (!target || typeof target.postMessage !== 'function') return false;
  target.postMessage({
    type: RESPONSE_TYPE,
    id,
    result,
    error
  });
  return true;
}

function resolveReplyTarget(event) {
  const replyPort = event.ports?.[0];
  if (replyPort && typeof replyPort.postMessage === 'function') {
    return replyPort;
  }
  if (event.source && typeof event.source.postMessage === 'function') {
    return event.source;
  }
  return null;
}

export function initMainFrameProxyBridge(log, invoke, targetWindow = window) {
  targetWindow.addEventListener('message', async (event) => {
    const message = event.data;
    if (!message || message.type !== REQUEST_TYPE || !message.id) return;

    const replyTarget = resolveReplyTarget(event);
    if (!replyTarget) {
      log('❌ iframe 代理桥无法回传响应：缺少 MessagePort 和 event.source');
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
      const ip = result?.preferred_ip || result?.debug_info?.preferred_ip || '-';
      const ips = (result?.resolved_ips || result?.debug_info?.resolved_ips || []).join(' | ') || '-';
      console.log(`[PROXY] ${request.method || ''} ${result?.status ?? ''} ${request.url}\n域名: ${result?.resolved_host || '-'}  连接IP: ${ip}  解析: ${ips}`);
      log(`📤 顶层窗口返回 iframe 代理响应: ${request.url}  IP: ${ip}`);
      sendResponse(replyTarget, message.id, result, null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[PROXY] 失败 ${request.url}\n${reason}`);
      log(`❌ iframe 代理桥失败: ${reason}`);
      sendResponse(replyTarget, message.id, null, reason);
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
      let settled = false;
      let channel = null;
      try {
        channel = createChannel();
      } catch (error) {
        log(`⚠️ MessageChannel 不可用，改用 window.postMessage: ${error}`);
      }

      function cleanup() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        channel?.port1?.close?.();
        targetWindow.removeEventListener?.('message', handleWindowResponse);
      }

      function finish(message) {
        if (settled || !message || message.type !== RESPONSE_TYPE || message.id !== id) {
          return;
        }
        cleanup();
        if (message.error) {
          reject(new Error(message.error));
        } else {
          const ip = message.result?.preferred_ip || message.result?.debug_info?.preferred_ip;
          console.log(
            `[PROXY] iframe 响应 ${args?.request?.url || ''}  连接IP: ${ip || '-'}`
          );
          log(
            `✅ iframe 收到 Rust 代理响应: ${args?.request?.url || ''}` +
            (ip ? `  IP: ${ip}` : '')
          );
          resolve(message.result);
        }
      }

      function handlePortResponse(event) {
        finish(event.data);
      }

      function handleWindowResponse(event) {
        finish(event.data);
      }

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('iframe 代理请求超时'));
      }, timeoutMs);

      if (channel?.port1) {
        channel.port1.onmessage = handlePortResponse;
        channel.port1.start?.();
      }
      targetWindow.addEventListener?.('message', handleWindowResponse);

      log(`🔄 iframe 通过主窗口代理: ${args?.request?.url || ''}`);
      const payload = {
        type: REQUEST_TYPE,
        id,
        request: args?.request
      };
      const topWindow = targetWindow.top || targetWindow.parent;

      try {
        if (channel?.port2) {
          try {
            topWindow.postMessage(payload, '*', [channel.port2]);
            return;
          } catch (error) {
            log(`⚠️ MessagePort 传递失败，降级为 window.postMessage: ${error}`);
          }
        }
        topWindow.postMessage(payload, '*');
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  };
}
