(function() {
  // 检查是否启用日志（由 Rust 注入）
  const ENABLE_LOGS = window.__TAURI_ENABLE_LOGS__ || false;
  
  // 日志函数
  const log = (...args) => {
    if (ENABLE_LOGS) {
      console.log(...args);
    }
  };
  
  log("🚀 Tauri Proxy Injection Started");

  // Access Tauri invoke function (Tauri v2)
  if (!window.__TAURI__ || !window.__TAURI__.core || !window.__TAURI__.core.invoke) {
    console.error("❌ Tauri API not available! Proxy will not work.");
    return;
  }
  
  const invoke = window.__TAURI__.core.invoke;
  log("✅ Tauri API ready, proxy enabled");

  // --- Override window.fetch ---
  const originalFetch = window.fetch;
  
  window.fetch = async function(input, init) {
    // Normalization of input
    let url = input;
    if (input instanceof Request) {
      url = input.url;
      if (!init) {
        init = {
          method: input.method,
          headers: input.headers,
          body: input.body // body reading is complex for Request object, simpler to assume URL string for now
        };
      }
    }
    
    // Resolve absolute URL
    // If url is relative, make it absolute based on current origin
    if (url.startsWith('/')) {
       url = window.location.origin + url;
    }

    // Skip Tauri internal IPC calls
    if (url.includes('ipc://localhost') || url.includes('tauri://')) {
      return originalFetch.apply(this, arguments);
    }

    // 只拦截 base_api 路径的请求（发往 Java 后端）
    if (!url.includes('/base_api/')) {
      // 其他请求直接放行（静态资源、前端路由等）
      return originalFetch.apply(this, arguments);
    }

    log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    log("🔄 [Tauri Proxy] Intercepted Fetch:", input);

    // Prepare headers
    let headers = {};
    if (init && init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => headers[k] = v);
      } else {
        headers = init.headers;
      }
    }

    // Prepare Body
    // Note: Handling FormData, Blob, etc. requires serialization (e.g. base64)
    // For this MVP, we handle string/JSON bodies.
    let body = null;
    if (init && init.body) {
      if (typeof init.body === 'string') {
        body = init.body;
      } else {
        // TODO: Handle other body types if needed
        try {
           body = JSON.stringify(init.body);
        } catch(e) {
           console.warn("Could not stringify body", e);
        }
      }
    }

    const reqData = {
      method: (init && init.method) ? init.method.toUpperCase() : 'GET',
      url: url.toString(),
      headers: headers,
      body: body
    };

    log("📤 Request Data:", reqData.method, reqData.url);
    log("📋 Headers:", Object.keys(headers).length, "headers");

    try {
      // Call Rust Proxy
      log("🚀 Calling Rust proxy_request...");
      const response = await invoke('proxy_request', { request: reqData });
      
      log("📥 Response Status:", response.status);
      if (response.status === 403) {
        console.error("⚠️ 403 Forbidden! 后端拒绝请求");
        log("响应内容:", response.body.substring(0, 200));
      } else {
        log("✅ Request successful");
      }
      log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      
      // Construct Response object
      return new Response(response.body, {
        status: response.status,
        statusText: response.status === 200 ? 'OK' : 'Error', // simplified
        headers: new Headers(response.headers)
      });
      
    } catch (err) {
      console.error("❌ Proxy Request Failed:", err);
      log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      throw err;
    }
  };

  // --- Override XMLHttpRequest ---
  // This is a partial mock. Full mock is complex. 
  // Many older sites (and jQuery) use XHR.
  
  const OriginalXHR = window.XMLHttpRequest;
  
  function ProxyXHR() {
    const xhr = new OriginalXHR();
    this.xhr = xhr; // keep ref to original if needed, but we want to bypass it completely usually
    
    this.headers = {};
    this.responseHeaders = {};
    
    // Events to emulate
    this.onreadystatechange = null;
    this.onload = null;
    this.onerror = null;
    this.status = 0;
    this.readyState = 0;
    this.responseText = "";
    this.response = "";
  }

  ProxyXHR.prototype.open = function(method, url, async, user, password) {
    this.method = method;
    this.url = url;
    this.readyState = 1; // OPENED
    if (this.onreadystatechange) this.onreadystatechange();
  };

  ProxyXHR.prototype.setRequestHeader = function(header, value) {
    this.headers[header] = value;
  };

  ProxyXHR.prototype.send = function(data) {
    let url = this.url;
    if (url.startsWith('/')) {
       url = window.location.origin + url;
    }
    
    // 只拦截 base_api 路径的请求
    if (!url.includes('/base_api/')) {
      // 使用原始 XHR 发送请求
      const originalXHR = new OriginalXHR();
      originalXHR.open(this.method, this.url, true);
      for (const [key, value] of Object.entries(this.headers)) {
        originalXHR.setRequestHeader(key, value);
      }
      originalXHR.onload = () => {
        this.status = originalXHR.status;
        this.responseText = originalXHR.responseText;
        this.response = originalXHR.response;
        this.readyState = 4;
        if (this.onreadystatechange) this.onreadystatechange();
        if (this.onload) this.onload();
      };
      originalXHR.onerror = (err) => {
        if (this.onerror) this.onerror(err);
      };
      originalXHR.send(data);
      return;
    }
    
    const reqData = {
      method: this.method,
      url: url,
      headers: this.headers,
      body: data ? data.toString() : null
    };

    const self = this;
    
    invoke('proxy_request', { request: reqData })
      .then(response => {
        self.status = response.status;
        self.statusText = response.status === 200 ? "OK" : "";
        self.responseText = response.body;
        self.response = response.body;
        self.readyState = 4; // DONE
        
        // Parse headers
        // response.headers is a map
        self.responseHeaders = response.headers;

        if (self.onreadystatechange) self.onreadystatechange();
        if (self.onload) self.onload();
      })
      .catch(err => {
        console.error("XHR Proxy Error", err);
        if (self.onerror) self.onerror(err);
      });
  };
  
  // Mock getAllResponseHeaders
  ProxyXHR.prototype.getAllResponseHeaders = function() {
      let res = "";
      for (const [k, v] of Object.entries(this.responseHeaders)) {
          res += `${k}: ${v}\r\n`;
      }
      return res;
  };
  
  // Mock getResponseHeader
  ProxyXHR.prototype.getResponseHeader = function(name) {
      return this.responseHeaders[name] || null;
  };

  // Replace global XHR
  window.XMLHttpRequest = ProxyXHR;
  log("✅ Tauri Proxy Injection Completed");

  // ======================================
  // 页面缩放功能
  // ======================================
  let currentZoom = 1.0;
  const MIN_ZOOM = 0.25;   // 25%
  const MAX_ZOOM = 5.0;    // 500%
  const ZOOM_STEP = 0.05;  // 5%

  // 创建缩放提示 UI
  let zoomIndicator = null;
  let zoomTimeout = null;

  function createZoomIndicator() {
    if (!zoomIndicator) {
      zoomIndicator = document.createElement('div');
      zoomIndicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.6);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 24px;
        font-weight: bold;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 999999;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      `;
      document.body.appendChild(zoomIndicator);
    }
    return zoomIndicator;
  }

  function showZoomIndicator(zoom) {
    const indicator = createZoomIndicator();
    indicator.textContent = `${Math.round(zoom * 100)}%`;
    indicator.style.opacity = '1';

    // 清除之前的定时器
    if (zoomTimeout) {
      clearTimeout(zoomTimeout);
    }

    // 1 秒后隐藏
    zoomTimeout = setTimeout(() => {
      indicator.style.opacity = '0';
    }, 1000);
  }

  // 应用缩放
  async function applyZoom(zoom) {
    try {
      await invoke('set_zoom', { zoomLevel: zoom });
      currentZoom = zoom;
      showZoomIndicator(zoom);
      log(`🔍 缩放: ${Math.round(zoom * 100)}%`);
    } catch (err) {
      console.error("缩放失败:", err);
    }
  }

  // 放大
  async function zoomIn() {
    const newZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
    await applyZoom(newZoom);
  }

  // 缩小
  async function zoomOut() {
    const newZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
    await applyZoom(newZoom);
  }

  // 重置缩放
  async function zoomReset() {
    await applyZoom(1.0);
  }

  // 监听键盘快捷键
  document.addEventListener('keydown', async (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl/Cmd + Plus/Equal (放大)
    if (ctrlKey && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      await zoomIn();
    }
    // Ctrl/Cmd + Minus (缩小)
    else if (ctrlKey && e.key === '-') {
      e.preventDefault();
      await zoomOut();
    }
    // Ctrl/Cmd + 0 (重置)
    else if (ctrlKey && e.key === '0') {
      e.preventDefault();
      await zoomReset();
    }
  });

  // 监听鼠标滚轮缩放 (Ctrl/Cmd + Wheel)
  document.addEventListener('wheel', async (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

    if (ctrlKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        await zoomIn();
      } else {
        await zoomOut();
      }
    }
  }, { passive: false });

  // 暴露到全局，方便调试
  window.tauriZoom = {
    zoomIn,
    zoomOut,
    reset: zoomReset,
    get: () => currentZoom,
    set: applyZoom
  };

  log("🔍 页面缩放功能已启用");

  // ======================================
  // 多窗口支持
  // ======================================
  
  // 序列化存储数据（用于跨窗口传递）
  function serializeStorage() {
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
    
    console.log('📦 Serialized storage:', data);
    return data;
  }
  
  // 创建新窗口（打开当前页面，并复制登录状态）
  window.tauriOpenNewWindow = async function(url) {
    try {
      // 如果没有传入 URL，使用当前页面的完整 URL
      const targetUrl = url || window.location.href;
      log(`🪟 准备打开新窗口: ${targetUrl}`);
      console.log('🪟 Current URL:', window.location.href);
      console.log('🪟 Target URL:', targetUrl);
      
      // 序列化当前窗口的存储数据
      const storageData = serializeStorage();
      
      // 创建新窗口（先打开首页，等待存储复制完成后再跳转）
      const windowLabel = await invoke('create_new_window', { 
        currentUrl: targetUrl,
        storageData: JSON.stringify(storageData)
      });
      
      log(`✅ 新窗口已创建: ${windowLabel}`);
      console.log('✅ Window created:', windowLabel);
      return windowLabel;
    } catch (err) {
      console.error("❌ 创建窗口失败:", err);
      log(`❌ Error: ${err}`);
      throw err;
    }
  };

  // 快捷键：Cmd+N 创建新窗口（打开当前页面）
  // 使用 capture 阶段确保优先捕获
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    
    if (isCtrlOrCmd && e.key === 'n') {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔥 Cmd+N triggered, current URL:', window.location.href);
      window.tauriOpenNewWindow(); // 打开当前页面
    }
  }, true); // 使用 capture 阶段

  // Cmd+点击 = 在新窗口打开当前页面（简化版，适配 Vue Router）
  // 因为前端使用 Vue Router，没有真正的 <a> 标签，所以 Cmd+点击任意地方都打开当前页面
  document.addEventListener('click', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    
    if (isCtrlOrCmd) {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔥 Cmd+Click detected, opening current page in new window');
      window.tauriOpenNewWindow(); // 打开当前页面
    }
  }, true);


  // 添加全局提示
  console.log('🪟 多窗口功能已启用:');
  console.log('  - Cmd+N: 复制当前页面到新窗口');
  console.log('  - Cmd+点击: 复制当前页面到新窗口');
  console.log('  - 控制台调用: window.tauriOpenNewWindow(url)');
  
  log("🪟 多窗口功能已启用");

})();

