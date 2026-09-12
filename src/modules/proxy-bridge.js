const REQUEST_TYPE = 'backstage68:base-api-proxy-request';
const RESPONSE_TYPE = 'backstage68:base-api-proxy-response';
const ACK_TYPE = 'backstage68:base-api-proxy-ack';

let requestCounter = 0;

function sendMessage(target, payload) {
  if (!target || typeof target.postMessage !== 'function') return false;
  target.postMessage(payload);
  return true;
}

function collectReplyTargets(event) {
  const targets = [];
  const replyPort = event.ports?.[0];
  if (replyPort && typeof replyPort.postMessage === 'function') {
    targets.push(['MessagePort', replyPort]);
  }
  if (event.source && typeof event.source.postMessage === 'function') {
    targets.push(['event.source', event.source]);
  }
  return targets;
}

function sendToTargets(targets, payload) {
  let sent = false;
  for (const [, target] of targets) {
    if (sendMessage(target, payload)) sent = true;
  }
  return sent;
}

export function initMainFrameProxyBridge(log, invoke, targetWindow = window) {
  targetWindow.addEventListener('message', async (event) => {
    const message = event.data;
    if (!message || message.type !== REQUEST_TYPE || !message.id) return;

    const url = message.request?.url || '-';
    const targets = collectReplyTargets(event);
    const replyVia = targets.map(([name]) => name).join(',') || '无';
    console.log(`[PROXY] 顶层收到请求 URL=${url} 回包通道=${replyVia}`);

    if (!targets.length) {
      console.error(`[PROXY] 顶层无法回包：event.ports 和 event.source 都为空 URL=${url}`);
      log('❌ iframe 代理桥无法回传响应：缺少 MessagePort 和 event.source');
      return;
    }

    sendToTargets(targets, { type: ACK_TYPE, id: message.id });

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
      console.log(`[PROXY] 顶层开始 invoke URL=${request.url}`);
      const result = await invoke('proxy_request', { request });
      const ip = result?.preferred_ip || result?.debug_info?.preferred_ip || '-';
      const ips = (result?.resolved_ips || result?.debug_info?.resolved_ips || []).join(' | ') || '-';
      const deviceIp = result?.device_ip || result?.debug_info?.device_ip || targetWindow.__TAURI_DEVICE_IP__ || '-';
      console.log(`[PROXY] ${request.method || ''} ${result?.status ?? ''} ${request.url}\n域名: ${result?.resolved_host || '-'}  设备IP: ${deviceIp}  连接IP: ${ip}  解析: ${ips}`);
      log(`📤 顶层窗口返回 iframe 代理响应: ${request.url}  IP: ${ip}`);
      sendToTargets(targets, {
        type: RESPONSE_TYPE,
        id: message.id,
        result,
        error: null
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[PROXY] 失败 ${request.url}\n${reason}`);
      log(`❌ iframe 代理桥失败: ${reason}`);
      sendToTargets(targets, {
        type: RESPONSE_TYPE,
        id: message.id,
        result: null,
        error: reason
      });
    }
  });
}

function getTopInvoke(targetWindow) {
  try {
    const invoke = targetWindow?.top?.__TAURI__?.core?.invoke;
    return typeof invoke === 'function' ? invoke : null;
  } catch {
    return null;
  }
}

function assertAllowedProxyRequest(args, targetWindow) {
  const url = args?.request?.url;
  if (!url || !String(url).includes('/base_api')) {
    throw new Error('只允许代理包含 /base_api 的请求');
  }
  const origin = targetWindow.location?.origin || targetWindow.top?.location?.origin;
  if (!origin) return;
  const requestUrl = new URL(url, origin);
  if (requestUrl.origin !== origin) {
    throw new Error('拒绝代理非当前站点的 /base_api 请求');
  }
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

    const url = args?.request?.url || '-';
    const topInvoke = getTopInvoke(targetWindow);
    if (topInvoke) {
      try {
        assertAllowedProxyRequest(args, targetWindow);
      } catch (error) {
        return Promise.reject(error);
      }
      const deviceIp = targetWindow.__TAURI_DEVICE_IP__ || targetWindow.top?.__TAURI_DEVICE_IP__ || '-';
      console.log(`[PROXY] iframe 直调顶层 invoke URL=${url} 设备IP=${deviceIp}`);
      return topInvoke(command, args).then((result) => {
        const ip = result?.preferred_ip || result?.debug_info?.preferred_ip || '-';
        const ips = (result?.resolved_ips || result?.debug_info?.resolved_ips || []).join(' | ') || '-';
        const resultDeviceIp = result?.device_ip || result?.debug_info?.device_ip || deviceIp;
        console.log(`[PROXY] ${result?.status ?? ''} ${url}\n域名: ${result?.resolved_host || '-'}  设备IP: ${resultDeviceIp}  连接IP: ${ip}  解析: ${ips}`);
        return result;
      }).catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[PROXY] ${reason}`);
        throw error;
      });
    }

    const id = `${Date.now()}-${++requestCounter}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      let gotAck = false;
      let sendVia = 'window.postMessage';
      let channel = null;
      try {
        channel = createChannel();
      } catch (error) {
        log(`⚠️ MessageChannel 不可用，改用 window.postMessage: ${error}`);
        console.warn(`[PROXY] MessageChannel 不可用: ${error}`);
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
          const deviceIp = message.result?.device_ip || message.result?.debug_info?.device_ip || targetWindow.__TAURI_DEVICE_IP__ || '-';
          console.log(
            `[PROXY] iframe 响应 ${url}  设备IP: ${deviceIp}  连接IP: ${ip || '-'}`
          );
          log(
            `✅ iframe 收到 Rust 代理响应: ${url}` +
            (ip ? `  IP: ${ip}` : '')
          );
          resolve(message.result);
        }
      }

      function handleIncoming(message) {
        if (!message || message.id !== id) return;
        if (message.type === ACK_TYPE) {
          gotAck = true;
          console.log(`[PROXY] iframe 收到顶层确认 URL=${url}`);
          return;
        }
        finish(message);
      }

      function handlePortResponse(event) {
        handleIncoming(event.data);
      }

      function handleWindowResponse(event) {
        handleIncoming(event.data);
      }

      const timer = setTimeout(() => {
        cleanup();
        const deviceIp = targetWindow.__TAURI_DEVICE_IP__ || targetWindow.top?.__TAURI_DEVICE_IP__ || '-';
        const reason = gotAck
          ? `iframe ${timeoutMs}ms 内没有收到结果 URL=${url} 设备IP=${deviceIp} 顶层已确认收到 发送方式=${sendVia}`
          : `iframe ${timeoutMs}ms 内没有收到结果 URL=${url} 设备IP=${deviceIp} 顶层未确认收到 发送方式=${sendVia}`;
        console.error(`[PROXY] ${reason}`);
        reject(new Error(reason));
      }, timeoutMs);

      if (channel?.port1) {
        channel.port1.onmessage = handlePortResponse;
        channel.port1.start?.();
      }
      targetWindow.addEventListener?.('message', handleWindowResponse);

      log(`🔄 iframe 通过主窗口代理: ${url}`);
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
            sendVia = 'MessagePort';
            console.log(`[PROXY] iframe 已发送 URL=${url} 发送方式=${sendVia}`);
            return;
          } catch (error) {
            log(`⚠️ MessagePort 传递失败，降级为 window.postMessage: ${error}`);
            console.warn(`[PROXY] MessagePort 传递失败，降级为 window.postMessage: ${error}`);
          }
        }
        sendVia = 'window.postMessage';
        topWindow.postMessage(payload, '*');
        console.log(`[PROXY] iframe 已发送 URL=${url} 发送方式=${sendVia}`);
      } catch (error) {
        cleanup();
        console.error(`[PROXY] iframe 发送失败 URL=${url} ${error}`);
        reject(error);
      }
    });
  };
}
