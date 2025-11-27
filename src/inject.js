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

  // 检查是否在 iframe 内部
  const isInIframe = window.self !== window.top;
  
  // 如果在 iframe 内，不初始化代理，让父窗口处理
  if (isInIframe) {
    log("⚠️  检测到在 iframe 内，跳过代理初始化，使用父窗口代理");
    // 不 return，继续执行后面的代码（窗口标题同步等）
    
    // 但是我们需要一个假的 invoke 函数，避免后续代码报错
    const invoke = async (...args) => {
      throw new Error("在 iframe 内不应该直接调用 invoke");
    };
  }
  
  // 在顶层窗口，初始化 Tauri API
  let invoke;
  if (!isInIframe) {
    if (!window.__TAURI__ || !window.__TAURI__.core || !window.__TAURI__.core.invoke) {
      console.error("❌ Tauri API not available! Proxy will not work.");
      return;
    }
    invoke = window.__TAURI__.core.invoke;
    log("✅ Tauri API ready, proxy enabled");
  }

  // 只在顶层窗口安装代理拦截器
  if (!isInIframe) {
    
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
    // 支持 FormData、String、JSON 等多种格式
    let body = null;
    let formData = null;
    let files = null;
    
    if (init && init.body) {
      if (typeof init.body === 'string') {
        body = init.body;
      } else if (init.body instanceof FormData) {
        // 处理 FormData：提取字段和文件
        log("📦 检测到 FormData，开始解析...");
        
        formData = [];
        files = [];
        
        // 遍历 FormData
        for (const [key, value] of init.body.entries()) {
          if (value instanceof File) {
            // 文件：转为 base64
            log(`   文件字段: ${key} = ${value.name} (${value.type}, ${value.size} bytes)`);
            
            // 读取文件为 base64（使用 Promise）
            const reader = new FileReader();
            const filePromise = new Promise((resolve) => {
              reader.onload = () => {
                const base64 = reader.result.split(',')[1]; // 去掉 data:xxx;base64, 前缀
                const fileObj = {
                  field_name: key,
                  file_name: value.name,
                  content_type: value.type || 'application/octet-stream',
                  data: base64
                };
                files.push(fileObj);
                log(`   ✅ 文件读取完成: ${key}, base64 长度: ${base64.length}`);
                resolve();
              };
              reader.onerror = () => {
                console.error(`   ❌ 文件读取失败: ${key}`);
                resolve();
              };
            });
            reader.readAsDataURL(value);
            await filePromise; // 等待文件读取完成
            
          } else {
            // 普通字段
            log(`   表单字段: ${key} = ${value}`);
            formData.push([key, value.toString()]);
          }
        }
        
        log(`✅ FormData 解析完成: ${formData.length} 个字段, ${files.length} 个文件`);
        
        // 移除 Content-Type，让 Rust 自动设置 multipart boundary
        delete headers['Content-Type'];
        delete headers['content-type'];
        
      } else {
        // 其他类型尝试 JSON 序列化
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
      body: body,
      form_data: formData,
      files: files.length > 0 ? files : null
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
    
    // 处理 FormData（文件上传）- 走代理
    const self = this;
    let reqData;
    
    if (data instanceof FormData) {
      log("📦 [XHR] 检测到 FormData，转换后走代理");
      
      // 异步处理 FormData
      (async () => {
        try {
          const formDataArray = [];
          const filesArray = [];
          
          // 遍历 FormData，提取字段和文件
          for (const [key, value] of data.entries()) {
            if (value instanceof File) {
              // 文件：读取为 base64
              log(`   文件字段: ${key} = ${value.name} (${value.size} bytes)`);
              
              const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result.split(',')[1]; // 去掉 data:xxx;base64, 前缀
                  resolve(result);
                };
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(value);
              });
              
              filesArray.push({
                field_name: key,
                file_name: value.name,
                content_type: value.type || 'application/octet-stream',
                data: base64
              });
              
              log(`   ✅ 文件读取完成: ${key}, base64 长度: ${base64.length}`);
              
            } else {
              // 普通字段
              log(`   表单字段: ${key} = ${value}`);
              formDataArray.push([key, value.toString()]);
            }
          }
          
          log(`✅ FormData 解析完成: ${formDataArray.length} 个字段, ${filesArray.length} 个文件`);
          
          // 构建请求数据
          reqData = {
            method: self.method,
            url: url,
            headers: self.headers,
            body: null,
            form_data: formDataArray.length > 0 ? formDataArray : null,
            files: filesArray.length > 0 ? filesArray : null
          };
          
          // 移除 Content-Type，让 Rust 自动设置
          delete reqData.headers['Content-Type'];
          delete reqData.headers['content-type'];
          
          // 调用 Rust 代理
          log("🚀 [XHR] 通过代理发送 FormData...");
          const response = await invoke('proxy_request', { request: reqData });
          
          // 设置响应
          self.status = response.status;
          self.statusText = response.status === 200 ? "OK" : "";
          self.responseText = response.body;
          self.response = response.body;
          self.readyState = 4;
          self.responseHeaders = response.headers;
          
          if (self.onreadystatechange) self.onreadystatechange();
          if (self.onload) self.onload();
          
        } catch (err) {
          console.error("XHR FormData Proxy Error:", err);
          if (self.onerror) self.onerror(err);
        }
      })();
      
      return;
    }
    
    // 普通请求走代理
    reqData = {
      method: this.method,
      url: url,
      headers: this.headers,
      body: data ? data.toString() : null
    };
    
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
  
  } // 结束 if (!isInIframe) 代理安装块

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

  // 应用缩放（作用于当前激活的标签或当前页面）
  async function applyZoom(zoom) {
    try {
      currentZoom = zoom;
      // 同步到全局状态
      if (window.tauriTabs) {
        window.tauriTabs.currentZoom = zoom;
      }
      showZoomIndicator(zoom);
      
      // 如果在顶层窗口且标签页系统已初始化，缩放当前激活的 iframe
      if (window.self === window.top && window.tauriTabs && window.tauriTabs.activeTabId) {
        const activeTab = window.tauriTabs.tabs.find(t => t.id === window.tauriTabs.activeTabId);
        if (activeTab && activeTab.iframe) {
          try {
            const iframeDoc = activeTab.iframe.contentDocument || activeTab.iframe.contentWindow.document;
            if (iframeDoc && iframeDoc.body) {
              iframeDoc.body.style.zoom = zoom;
              log(`🔍 iframe 缩放: ${Math.round(zoom * 100)}%`);
              return; // 成功，直接返回
            }
          } catch (e) {
            log(`⚠️  无法直接访问 iframe，尝试其他方式: ${e.message}`);
          }
        }
      }
      
      // 如果在 iframe 内部，或者无法访问 iframe，直接缩放当前页面
      if (document.body) {
        document.body.style.zoom = zoom;
        log(`🔍 页面缩放: ${Math.round(zoom * 100)}%`);
      }
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
      
      // 如果在 iframe 内，通知父窗口执行缩放
      if (window.self !== window.top) {
        try {
          if (window.parent.tauriZoom && window.parent.tauriZoom.zoomIn) {
            await window.parent.tauriZoom.zoomIn();
          }
        } catch (err) {
          log("⚠️  无法调用父窗口缩放:", err);
        }
      } else {
        await zoomIn();
      }
    }
    // Ctrl/Cmd + Minus (缩小)
    else if (ctrlKey && e.key === '-') {
      e.preventDefault();
      
      // 如果在 iframe 内，通知父窗口执行缩放
      if (window.self !== window.top) {
        try {
          if (window.parent.tauriZoom && window.parent.tauriZoom.zoomOut) {
            await window.parent.tauriZoom.zoomOut();
          }
        } catch (err) {
          log("⚠️  无法调用父窗口缩放:", err);
        }
      } else {
        await zoomOut();
      }
    }
    // Ctrl/Cmd + 0 (重置)
    else if (ctrlKey && e.key === '0') {
      e.preventDefault();
      
      // 如果在 iframe 内，通知父窗口执行缩放
      if (window.self !== window.top) {
        try {
          if (window.parent.tauriZoom && window.parent.tauriZoom.reset) {
            await window.parent.tauriZoom.reset();
          }
        } catch (err) {
          log("⚠️  无法调用父窗口缩放:", err);
        }
      } else {
        await zoomReset();
      }
    }
  });

  // 监听鼠标滚轮缩放 (Ctrl/Cmd + Wheel)
  document.addEventListener('wheel', async (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

    if (ctrlKey) {
      e.preventDefault();
      
      // 如果在 iframe 内，通知父窗口执行缩放
      if (window.self !== window.top) {
        try {
          if (e.deltaY < 0) {
            if (window.parent.tauriZoom && window.parent.tauriZoom.zoomIn) {
              await window.parent.tauriZoom.zoomIn();
            }
          } else {
            if (window.parent.tauriZoom && window.parent.tauriZoom.zoomOut) {
              await window.parent.tauriZoom.zoomOut();
            }
          }
        } catch (err) {
          log("⚠️  无法调用父窗口缩放:", err);
        }
      } else {
        if (e.deltaY < 0) {
          await zoomIn();
        } else {
          await zoomOut();
        }
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


  // ======================================
  // 窗口标题同步（跟随页面标题变化）
  // ======================================
  
  // 获取环境名称（异步）
  let envName = 'Backstage68';
  
  // 异步获取环境名称
  (async function initEnvName() {
    try {
      const envInfo = await invoke('get_env_info');
      // envInfo 格式: "当前环境: 测试环境 (test_key)"
      const match = envInfo.match(/当前环境: (.+?) \(/);
      if (match) {
        envName = match[1]; // 提取 "测试环境"
        console.log('✅ 环境名称:', envName);
      }
    } catch (err) {
      console.log('⚠️ 无法获取环境名称，使用默认值');
    }
  })();
  
  // 更新窗口标题的函数
  async function updateWindowTitle() {
    try {
      const pageTitle = document.title || '未命名页面';
      const newTitle = `${pageTitle} - ${envName}`;
      
      console.log('📝 尝试更新窗口标题:', newTitle);
      
      // 使用 Tauri 命令设置窗口标题
      await invoke('set_window_title', { title: newTitle });
      
      log(`✅ 窗口标题已更新: ${newTitle}`);
    } catch (err) {
      console.error('❌ Failed to update window title:', err);
    }
  }
  
  // 监听 document.title 变化
  const titleObserver = new MutationObserver(() => {
    console.log('🔔 检测到标题变化:', document.title);
    updateWindowTitle();
  });
  
  // 开始监听 <title> 标签
  const titleElement = document.querySelector('title');
  if (titleElement) {
    titleObserver.observe(titleElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
    console.log('👀 开始监听页面标题变化');
    log('👀 开始监听页面标题变化');
  }
  
  // 初始化时更新一次标题
  if (document.readyState === 'complete') {
    setTimeout(updateWindowTitle, 500);
  } else {
    window.addEventListener('load', () => {
      setTimeout(updateWindowTitle, 500);
    });
  }
  
  // 路由变化时也更新标题（适配 SPA）
  let lastUrl = window.location.href;
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log('🔄 路由变化，等待标题更新...');
      setTimeout(updateWindowTitle, 300); // 延迟等待前端更新标题
    }
  }, 500);

  // 添加全局提示
  console.log('🪟 多窗口功能已启用:');
  console.log('  - Cmd+N: 复制当前页面到新窗口');
  console.log('  - Cmd+点击: 复制当前页面到新窗口');
  console.log('  - 窗口标题: 自动跟随页面标题变化');
  console.log('  - 控制台调用: window.tauriOpenNewWindow(url)');
  
  log("🪟 多窗口功能已启用（含标题同步）");

  // ======================================
  // 标签页功能（Browser-like Tabs）
  // ======================================
  
  // 配置
  const TAB_CONFIG = {
    maxTabs: 20,
    tabBarHeight: 40,
    enableCloseButton: true
  };
  
  // 标签页管理器（全局）
  window.tauriTabs = {
    tabs: [],
    activeTabId: null,
    tabCounter: 0,
    currentZoom: 1.0 // 添加缩放状态
  };
  
  // 创建标签栏容器
  function createTabBar() {
    const tabBar = document.createElement('div');
    tabBar.id = 'tauri-tab-bar';
    tabBar.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: ${TAB_CONFIG.tabBarHeight}px;
      background: linear-gradient(180deg, #3a3a3a 0%, #2c2c2c 100%);
      display: flex;
      align-items: center;
      padding: 0;
      z-index: 999999;
      user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    
    // 创建标签容器（不滚动，标签自动缩小以适应窗口）
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tauri-tabs-container';
    tabsContainer.style.cssText = `
      flex: 1;
      display: flex;
      align-items: center;
      padding: 0 8px;
      overflow: hidden;
      gap: 4px;
    `;
    
    // 创建控制按钮容器（固定在右侧）
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'tauri-tab-controls-fixed';
    controlsContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 8px;
      flex-shrink: 0;
      background: linear-gradient(90deg, rgba(42, 42, 42, 0.8) 0%, #2c2c2c 20%);
    `;
    
    tabBar.appendChild(tabsContainer);
    tabBar.appendChild(controlsContainer);
    
    // 新建按钮（放在标签容器内）
    const newTabBtn = document.createElement('div');
    newTabBtn.className = 'tauri-new-tab';
    newTabBtn.innerHTML = '+';
    newTabBtn.title = '新建标签 (Cmd+T)';
    newTabBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      log('➕ 点击新建标签按钮');
      const activeTab = window.tauriTabs.tabs.find(t => t.id === window.tauriTabs.activeTabId);
      const currentUrl = activeTab ? activeTab.url : window.location.href;
      createTab(currentUrl);
    };
    tabsContainer.appendChild(newTabBtn);
    
    // 搜索按钮（固定在右侧控制容器）
    const searchBtn = document.createElement('div');
    searchBtn.className = 'tauri-search-tab';
    searchBtn.innerHTML = '🔍';
    searchBtn.title = '搜索标签 (Cmd+Shift+A)';
    searchBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTabSearch();
    };
    controlsContainer.appendChild(searchBtn);
    
    // 隐藏滚动条但保持可滚动
    const style = document.createElement('style');
    style.textContent = `
      .tauri-tabs-container::-webkit-scrollbar { display: none; }
      .tauri-tab {
        min-width: 40px;
        max-width: 200px;
        width: 200px;
        height: 30px;
        background: rgba(255,255,255,0.05);
        border-radius: 6px 6px 0 0;
        display: flex;
        align-items: center;
        padding: 0 8px;
        cursor: pointer;
        transition: background 0.2s, width 0.3s ease;
        flex-shrink: 1;
        position: relative;
      }
      .tauri-tab:hover {
        background: rgba(255,255,255,0.1);
      }
      .tauri-tab.active {
        background: rgba(255,255,255,0.15);
        box-shadow: 0 -2px 0 0 #0066cc inset;
      }
      .tauri-tab-title {
        flex: 1;
        color: #e0e0e0;
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tauri-tab.active .tauri-tab-title {
        color: #ffffff;
      }
      .tauri-tab-close {
        margin-left: 8px;
        color: #999;
        font-size: 18px;
        line-height: 1;
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
        flex-shrink: 0;
      }
      .tauri-tab-close:hover {
        background: rgba(255,255,255,0.2);
        color: #fff;
      }
      .tauri-tab-controls-fixed {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
      .tauri-new-tab {
        min-width: 32px;
        width: 32px;
        height: 30px;
        background: rgba(255,255,255,0.05);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.2s;
        color: #e0e0e0;
        flex-shrink: 0;
        font-size: 20px;
      }
      .tauri-new-tab:hover {
        background: rgba(255,255,255,0.15);
      }
      .tauri-search-tab {
        min-width: 32px;
        width: 32px;
        height: 30px;
        background: rgba(255,255,255,0.05);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.2s;
        color: #e0e0e0;
        flex-shrink: 0;
        font-size: 18px;
      }
      .tauri-search-tab:hover {
        background: rgba(255,255,255,0.15);
      }
      .tauri-iframe-container {
        position: fixed;
        top: ${TAB_CONFIG.tabBarHeight}px;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: calc(100vh - ${TAB_CONFIG.tabBarHeight}px);
      }
      .tauri-tab-iframe {
        width: 100%;
        height: 100%;
        border: none;
        display: none;
      }
      .tauri-tab-iframe.active {
        display: block;
      }
      .tauri-tab.dragging {
        opacity: 0.5;
        cursor: grabbing;
      }
      .tauri-tab.drag-over {
        background: rgba(255,255,255,0.25);
        border-left: 2px solid #0066cc;
      }
      .tauri-tab-context-menu {
        animation: menuFadeIn 0.15s ease-out;
      }
      @keyframes menuFadeIn {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      /* 搜索对话框 */
      .tauri-tab-search-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        z-index: 10000000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 100px;
        animation: overlayFadeIn 0.2s ease-out;
      }
      @keyframes overlayFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .tauri-tab-search-dialog {
        background: #2c2c2c;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.8);
        border: 1px solid #444;
        width: 600px;
        max-width: 90vw;
        max-height: 500px;
        display: flex;
        flex-direction: column;
        animation: dialogSlideIn 0.3s ease-out;
        overflow: hidden;
      }
      @keyframes dialogSlideIn {
        from {
          opacity: 0;
          transform: translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .tauri-tab-search-input {
        width: 100%;
        padding: 16px 20px;
        background: #1e1e1e;
        border: none;
        border-bottom: 1px solid #444;
        color: #e0e0e0;
        font-size: 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        outline: none;
        border-radius: 12px 12px 0 0;
        box-sizing: border-box;
      }
      .tauri-tab-search-input:focus {
        background: #252525;
        border-bottom-color: #0066cc;
      }
      .tauri-tab-search-input::placeholder {
        color: #888;
      }
      .tauri-tab-search-results {
        flex: 1;
        overflow-y: auto;
        padding: 8px 0;
        min-height: 100px;
      }
      .tauri-tab-search-results::-webkit-scrollbar {
        width: 8px;
      }
      .tauri-tab-search-results::-webkit-scrollbar-track {
        background: #2c2c2c;
      }
      .tauri-tab-search-results::-webkit-scrollbar-thumb {
        background: #555;
        border-radius: 4px;
      }
      .tauri-tab-search-results::-webkit-scrollbar-thumb:hover {
        background: #666;
      }
      .tauri-tab-search-item {
        padding: 12px 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 12px;
        transition: background 0.15s;
      }
      .tauri-tab-search-item:hover {
        background: rgba(255,255,255,0.1);
      }
      .tauri-tab-search-item.selected {
        background: rgba(0,102,204,0.3);
      }
      .tauri-tab-search-item-icon {
        font-size: 20px;
        flex-shrink: 0;
      }
      .tauri-tab-search-item-content {
        flex: 1;
        min-width: 0;
      }
      .tauri-tab-search-item-title {
        color: #e0e0e0;
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tauri-tab-search-item-url {
        color: #888;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 2px;
      }
      .tauri-tab-search-empty {
        padding: 40px 20px;
        text-align: center;
        color: #888;
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(tabBar);
    
    return tabBar;
  }
  
  // 创建标签按钮
  function createTabElement(id, title) {
    const tab = document.createElement('div');
    tab.className = 'tauri-tab';
    tab.dataset.tabId = id;
    tab.setAttribute('draggable', 'true'); // 允许拖动（使用 setAttribute 更明确）
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'tauri-tab-title';
    titleSpan.textContent = title || '新标签页';
    tab.appendChild(titleSpan);
    
    if (TAB_CONFIG.enableCloseButton) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'tauri-tab-close';
      closeBtn.innerHTML = '×';
      closeBtn.title = '关闭标签 (Cmd+W)';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(id);
      });
      tab.appendChild(closeBtn);
    }
    
    tab.addEventListener('click', () => switchTab(id));
    
    // 右键菜单
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTabContextMenu(id, e.clientX, e.clientY);
    });
    
    // 拖动事件
    tab.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      tab.style.opacity = '0.5';
      tab.classList.add('dragging');
      log(`🖱️ 开始拖动标签: ${id}`);
    });
    
    tab.addEventListener('dragend', (e) => {
      tab.style.opacity = '1';
      tab.classList.remove('dragging');
      // 移除所有 dragover 高亮
      document.querySelectorAll('.tauri-tab.drag-over').forEach(t => {
        t.classList.remove('drag-over');
      });
      log(`🖱️ 结束拖动标签: ${id}`);
    });
    
    tab.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // 添加视觉反馈
      if (!tab.classList.contains('dragging')) {
        tab.classList.add('drag-over');
      }
    });
    
    tab.addEventListener('dragleave', (e) => {
      tab.classList.remove('drag-over');
    });
    
    tab.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      tab.classList.remove('drag-over');
      
      const draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId && draggedId !== id) {
        log(`📍 放置标签: ${draggedId} -> ${id}`);
        reorderTabs(draggedId, id);
      }
    });
    
    return tab;
  }
  
  // 显示标签右键菜单
  function showTabContextMenu(tabId, x, y) {
    // 移除旧菜单
    const oldMenu = document.querySelector('.tauri-tab-context-menu');
    if (oldMenu) oldMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'tauri-tab-context-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      background: rgba(30, 30, 30, 0.95);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      padding: 6px;
      z-index: 9999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      min-width: 180px;
      color: white;
    `;
    
    const menuItems = [
      { text: '🔄 刷新', action: () => refreshTab(tabId) },
      { text: '📋 复制标签', action: () => duplicateTab(tabId) },
      { text: '🪟 在新窗口打开', action: () => openTabInNewWindow(tabId) },
      { divider: true },
      { text: '❌ 关闭', action: () => closeTab(tabId) },
      { text: '⬅️ 关闭左侧标签', action: () => closeTabsToLeft(tabId) },
      { text: '➡️ 关闭右侧标签', action: () => closeTabsToRight(tabId) },
      { text: '🗑️ 关闭其他标签', action: () => closeOtherTabs(tabId) }
    ];
    
    menuItems.forEach(item => {
      if (item.divider) {
        const divider = document.createElement('div');
        divider.style.cssText = `
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
          margin: 4px 0;
        `;
        menu.appendChild(divider);
      } else {
        const menuItem = document.createElement('div');
        menuItem.textContent = item.text;
        menuItem.style.cssText = `
          padding: 8px 12px;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.15s;
        `;
        menuItem.addEventListener('mouseenter', () => {
          menuItem.style.background = 'rgba(255, 255, 255, 0.1)';
        });
        menuItem.addEventListener('mouseleave', () => {
          menuItem.style.background = 'transparent';
        });
        menuItem.addEventListener('click', () => {
          item.action();
          menu.remove();
        });
        menu.appendChild(menuItem);
      }
    });
    
    document.body.appendChild(menu);
    
    // 点击其他地方关闭菜单（包括 iframe 内部）
    setTimeout(() => {
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          // 移除所有监听器
          document.removeEventListener('click', closeMenu, true);
          document.removeEventListener('contextmenu', closeMenu, true);
          
          // 移除所有 iframe 的监听器
          window.tauriTabs.tabs.forEach(tab => {
            try {
              const iframeDoc = tab.iframe.contentDocument;
              if (iframeDoc) {
                iframeDoc.removeEventListener('click', closeMenu, true);
                iframeDoc.removeEventListener('contextmenu', closeMenu, true);
              }
            } catch (err) {
              // 忽略跨域错误
            }
          });
        }
      };
      
      // 在顶层 document 添加监听器
      document.addEventListener('click', closeMenu, true);
      document.addEventListener('contextmenu', closeMenu, true);
      
      // 在所有 iframe 的 document 添加监听器
      window.tauriTabs.tabs.forEach(tab => {
        try {
          const iframeDoc = tab.iframe.contentDocument;
          if (iframeDoc) {
            iframeDoc.addEventListener('click', closeMenu, true);
            iframeDoc.addEventListener('contextmenu', closeMenu, true);
          }
        } catch (err) {
          // 忽略跨域错误
        }
      });
    }, 100); // 延迟稍微久一点，确保当前右键事件已处理完
  }
  
  // 更新标签宽度（根据标签数量和窗口大小动态调整，确保所有标签和+按钮可见）
  function updateTabWidths() {
    const tabsContainer = document.querySelector('.tauri-tabs-container');
    const controlsContainer = document.querySelector('.tauri-tab-controls-fixed');
    if (!tabsContainer || !controlsContainer) return;
    
    const tabs = window.tauriTabs.tabs;
    const tabCount = tabs.length;
    
    if (tabCount === 0) return;
    
    // 计算可用宽度（Chrome 风格：所有标签和+按钮都要可见）
    const controlsWidth = controlsContainer.offsetWidth || 50; // 搜索按钮区域宽度
    const newTabBtnWidth = 36; // + 按钮固定宽度
    const containerPadding = 16; // 标签容器的 padding (左右各8px)
    const gapTotal = 4 * (tabCount + 1); // 所有间距（标签间 + 按钮前）
    const totalWidth = window.innerWidth;
    
    // 可用宽度 = 总宽度 - 搜索按钮区 - + 按钮 - padding - 所有间距
    const availableWidth = totalWidth - controlsWidth - newTabBtnWidth - containerPadding - gapTotal;
    
    // 计算每个标签的宽度：最小 40px（极限），最大 200px
    // Chrome 会一直缩小标签直到 40px 左右
    let tabWidth = Math.floor(availableWidth / tabCount);
    tabWidth = Math.max(40, Math.min(200, tabWidth));
    
    tabs.forEach(tab => {
      tab.element.style.width = `${tabWidth}px`;
      tab.element.style.minWidth = '40px'; // 确保最小宽度
      tab.element.style.maxWidth = '200px'; // 确保最大宽度
    });
    
    log(`📏 更新标签宽度: ${tabWidth}px (标签: ${tabCount}, 可用: ${availableWidth}px, 窗口: ${totalWidth}px)`);
  }
  
  // 重新排序标签
  function reorderTabs(draggedId, targetId) {
    const tabs = window.tauriTabs.tabs;
    const draggedIndex = tabs.findIndex(t => t.id === draggedId);
    const targetIndex = tabs.findIndex(t => t.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;
    
    log(`🔄 标签重新排序: ${draggedId} (索引 ${draggedIndex}) 移动到 ${targetId} (索引 ${targetIndex})`);
    
    // 移动数组中的位置
    const [draggedTab] = tabs.splice(draggedIndex, 1);
    tabs.splice(targetIndex, 0, draggedTab);
    
    // 更新 DOM
    const tabsContainer = document.querySelector('.tauri-tabs-container');
    const newTabBtn = tabsContainer.querySelector('.tauri-new-tab');
    
    // 清空标签容器（保留新建按钮）
    Array.from(tabsContainer.children).forEach(child => {
      if (!child.classList.contains('tauri-new-tab')) {
        child.remove();
      }
    });
    
    // 按新顺序添加标签（插入到 + 按钮之前）
    tabs.forEach(tab => {
      tabsContainer.insertBefore(tab.element, newTabBtn);
    });
    
    // 更新标签宽度
    updateTabWidths();
    
    log(`✅ 标签重新排序完成`);
  }
  
  // 刷新标签
  function refreshTab(tabId) {
    const tab = window.tauriTabs.tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    log(`🔄 刷新标签: ${tabId}`);
    tab.iframe.src = tab.iframe.src; // 重新加载
  }
  
  // 复制标签
  function duplicateTab(tabId) {
    const tab = window.tauriTabs.tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    const tabs = window.tauriTabs.tabs;
    
    if (tabs.length >= TAB_CONFIG.maxTabs) {
      alert(`最多只能打开 ${TAB_CONFIG.maxTabs} 个标签`);
      return;
    }
    
    log(`📋 复制标签: ${tabId}, URL: ${tab.url}`);
    
    // 尝试获取当前 iframe 的实际 URL（可能因为 SPA 路由变化）
    let currentUrl = tab.url;
    try {
      const iframeWindow = tab.iframe.contentWindow;
      if (iframeWindow && iframeWindow.location && iframeWindow.location.href) {
        currentUrl = iframeWindow.location.href;
        log(`   使用 iframe 当前 URL: ${currentUrl}`);
      }
    } catch (err) {
      log(`   无法获取 iframe 当前 URL，使用原始 URL: ${tab.url}`);
    }
    
    // 创建新标签，使用当前 URL
    createTab(currentUrl);
  }
  
  // 在新窗口打开标签
  async function openTabInNewWindow(tabId) {
    const tab = window.tauriTabs.tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    log(`🪟 在新窗口打开: ${tab.url}`);
    try {
      await invoke('create_new_window', { 
        currentUrl: tab.url,
        storageData: null // 新窗口会自动复制 localStorage
      });
    } catch (err) {
      console.error('Failed to open new window:', err);
    }
  }
  
  // 关闭左侧标签
  function closeTabsToLeft(tabId) {
    const tabs = window.tauriTabs.tabs;
    const index = tabs.findIndex(t => t.id === tabId);
    
    if (index <= 0) return;
    
    log(`⬅️ 关闭左侧 ${index} 个标签`);
    
    // 从右往左关闭，避免索引变化
    for (let i = index - 1; i >= 0; i--) {
      closeTab(tabs[i].id);
    }
  }
  
  // 关闭右侧标签
  function closeTabsToRight(tabId) {
    const tabs = window.tauriTabs.tabs;
    const index = tabs.findIndex(t => t.id === tabId);
    
    if (index === -1 || index === tabs.length - 1) return;
    
    const count = tabs.length - index - 1;
    log(`➡️ 关闭右侧 ${count} 个标签`);
    
    // 从右往左关闭
    for (let i = tabs.length - 1; i > index; i--) {
      closeTab(tabs[i].id);
    }
  }
  
  // 关闭其他标签
  function closeOtherTabs(tabId) {
    const tabs = window.tauriTabs.tabs;
    const tabsToClose = tabs.filter(t => t.id !== tabId);
    
    log(`🗑️ 关闭其他 ${tabsToClose.length} 个标签`);
    
    tabsToClose.forEach(tab => closeTab(tab.id));
  }
  
  // 创建 iframe
  function createIframe(url) {
    const container = document.querySelector('.tauri-iframe-container') || createIframeContainer();
    
    const iframe = document.createElement('iframe');
    iframe.className = 'tauri-tab-iframe';
    iframe.src = url;
    
    container.appendChild(iframe);
    
    // iframe 加载完成后，设置代理和事件监听
    iframe.addEventListener('load', () => {
      try {
        const iframeWindow = iframe.contentWindow;
        const iframeDoc = iframe.contentDocument;
        
        if (iframeWindow && iframeDoc && window.self === window.top) {
          // 1. 用父窗口的代理替换 iframe 的 fetch 和 XHR
          iframeWindow.fetch = window.fetch;
          iframeWindow.XMLHttpRequest = window.XMLHttpRequest;
          log(`✅ iframe 已继承父窗口的代理`);
          
          // 2. 在 iframe 内部添加键盘事件监听器，转发到父窗口处理
          iframeDoc.addEventListener('keydown', (e) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
            
            if (!isCtrlOrCmd) return;
            
            // 缩放快捷键
            if (e.key === '+' || e.key === '=') {
              e.preventDefault();
              if (window.tauriZoom && window.tauriZoom.zoomIn) {
                window.tauriZoom.zoomIn();
              }
            } else if (e.key === '-') {
              e.preventDefault();
              if (window.tauriZoom && window.tauriZoom.zoomOut) {
                window.tauriZoom.zoomOut();
              }
            } else if (e.key === '0') {
              e.preventDefault();
              if (window.tauriZoom && window.tauriZoom.reset) {
                window.tauriZoom.reset();
              }
            }
            
            // 标签页快捷键（需要检查是否已初始化）
            if (window.tauriTabs && window.tauriTabs.tabs) {
              if (e.key === 't') {
                e.preventDefault();
                const activeTab = window.tauriTabs.tabs.find(t => t.id === window.tauriTabs.activeTabId);
                const currentUrl = activeTab ? activeTab.url : window.location.href;
                if (typeof createTab === 'function') {
                  createTab(currentUrl);
                }
              } else if (e.key === 'w' && window.tauriTabs.tabs.length > 1) {
                e.preventDefault();
                if (window.tauriTabs.activeTabId && typeof closeTab === 'function') {
                  closeTab(window.tauriTabs.activeTabId);
                }
              } else if (e.key >= '1' && e.key <= '9') {
                e.preventDefault();
                const index = parseInt(e.key) - 1;
                if (index < window.tauriTabs.tabs.length && typeof switchTab === 'function') {
                  switchTab(window.tauriTabs.tabs[index].id);
                }
              }
            }
          }, true); // 使用 capture 阶段
          
          // 3. 鼠标滚轮缩放
          iframeDoc.addEventListener('wheel', (e) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
            
            if (isCtrlOrCmd) {
              e.preventDefault();
              if (e.deltaY < 0) {
                if (window.tauriZoom && window.tauriZoom.zoomIn) {
                  window.tauriZoom.zoomIn();
                }
              } else {
                if (window.tauriZoom && window.tauriZoom.zoomOut) {
                  window.tauriZoom.zoomOut();
                }
              }
            }
          }, { passive: false, capture: true });
          
          log(`✅ iframe 事件监听器已安装`);
        }
      } catch (err) {
        log(`⚠️  无法设置 iframe: ${err.message}`);
      }
    });
    
    return iframe;
  }
  
  // 创建 iframe 容器
  function createIframeContainer() {
    const container = document.createElement('div');
    container.className = 'tauri-iframe-container';
    document.body.appendChild(container);
    return container;
  }
  
  // 创建新标签
  function createTab(url) {
    const tabs = window.tauriTabs.tabs;
    
    if (tabs.length >= TAB_CONFIG.maxTabs) {
      alert(`最多只能打开 ${TAB_CONFIG.maxTabs} 个标签`);
      return;
    }
    
    const id = 'tab-' + (++window.tauriTabs.tabCounter);
    const title = '加载中...';
    
    log(`📑 创建新标签: ${id}, URL: ${url}`);
    
    const tabElement = createTabElement(id, title);
    const iframe = createIframe(url);
    
    const tabsContainer = document.querySelector('.tauri-tabs-container');
    const newTabBtn = tabsContainer.querySelector('.tauri-new-tab');
    // 插入到 + 按钮之前
    tabsContainer.insertBefore(tabElement, newTabBtn);
    
    const tabData = {
      id,
      url,
      title,
      element: tabElement,
      iframe
    };
    
    tabs.push(tabData);
    
    // 监听 iframe 加载完成，更新标题并应用缩放
    iframe.addEventListener('load', () => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const newTitle = iframeDoc.title || url;
        updateTabTitle(id, newTitle);
        
        log(`📄 iframe 加载完成，标题: ${newTitle}`);
        
        // 监听 iframe 内标题的变化（SPA 应用会动态改变标题）
        const titleElement = iframeDoc.querySelector('title');
        if (titleElement) {
          const observer = new MutationObserver(() => {
            const updatedTitle = iframeDoc.title;
            if (updatedTitle && updatedTitle !== tabData.title) {
              log(`📝 检测到标题变化: ${updatedTitle}`);
              updateTabTitle(id, updatedTitle);
            }
          });
          observer.observe(titleElement, { 
            subtree: true, 
            characterData: true, 
            childList: true 
          });
          
          // 保存 observer 以便后续清理
          tabData.titleObserver = observer;
        }
        
        // 定期检查标题（兜底方案）
        const titleCheckInterval = setInterval(() => {
          try {
            const currentTitle = iframeDoc.title;
            if (currentTitle && currentTitle !== tabData.title) {
              log(`🔄 定期检查发现标题变化: ${currentTitle}`);
              updateTabTitle(id, currentTitle);
            }
          } catch (err) {
            // iframe 可能已被销毁
            clearInterval(titleCheckInterval);
          }
        }, 1000);
        
        // 保存 interval 以便后续清理
        tabData.titleCheckInterval = titleCheckInterval;
        
        // 应用当前缩放级别
        const zoomLevel = window.tauriTabs.currentZoom || currentZoom || 1.0;
        if (zoomLevel !== 1.0 && iframeDoc.body) {
          iframeDoc.body.style.zoom = zoomLevel;
          log(`🔍 应用缩放 ${Math.round(zoomLevel * 100)}% 到新标签`);
        }
      } catch (e) {
        // 跨域无法访问，使用 URL
        updateTabTitle(id, url);
        log(`⚠️  无法访问 iframe 内容 (可能跨域)`);
      }
    });
    
    switchTab(id);
    
    // 更新所有标签宽度
    updateTabWidths();
    
    return id;
  }
  
  // 切换标签
  function switchTab(id) {
    const tabs = window.tauriTabs.tabs;
    const tab = tabs.find(t => t.id === id);
    
    if (!tab) return;
    
    log(`🔄 切换到标签: ${id}`);
    
    tabs.forEach(t => {
      if (t.id === id) {
        t.element.classList.add('active');
        t.iframe.classList.add('active');
      } else {
        t.element.classList.remove('active');
        t.iframe.classList.remove('active');
      }
    });
    
    window.tauriTabs.activeTabId = id;
    
    // 更新窗口标题
    if (tab.title) {
      updateMainWindowTitle(tab.title);
    }
    
    // 应用当前缩放级别到新激活的 iframe
    const zoomLevel = window.tauriTabs.currentZoom || currentZoom || 1.0;
    if (zoomLevel !== 1.0) {
      setTimeout(() => {
        try {
          const iframeDoc = tab.iframe.contentDocument || tab.iframe.contentWindow.document;
          if (iframeDoc && iframeDoc.body) {
            iframeDoc.body.style.zoom = zoomLevel;
            log(`🔍 切换标签后应用缩放: ${Math.round(zoomLevel * 100)}%`);
          }
        } catch (e) {
          log(`⚠️  无法应用缩放到 iframe: ${e.message}`);
        }
      }, 100); // 延迟一点，确保 iframe 已加载
    }
  }
  
  // 关闭标签
  function closeTab(id) {
    const tabs = window.tauriTabs.tabs;
    const index = tabs.findIndex(t => t.id === id);
    
    if (index === -1) return;
    
    // 如果是最后一个标签，不允许关闭
    if (tabs.length === 1) {
      log('⚠️  不能关闭最后一个标签');
      return;
    }
    
    log(`❌ 关闭标签: ${id}`);
    
    const tab = tabs[index];
    
    // 清理观察器和定时器
    if (tab.titleObserver) {
      tab.titleObserver.disconnect();
    }
    if (tab.titleCheckInterval) {
      clearInterval(tab.titleCheckInterval);
    }
    
    tab.element.remove();
    tab.iframe.remove();
    tabs.splice(index, 1);
    
    // 如果关闭的是当前标签，切换到相邻标签
    if (id === window.tauriTabs.activeTabId) {
      const newIndex = Math.min(index, tabs.length - 1);
      switchTab(tabs[newIndex].id);
    }
    
    // 更新所有标签宽度
    updateTabWidths();
  }
  
  // 显示标签搜索对话框
  function showTabSearch() {
    log('🔍 打开标签搜索');
    
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'tauri-tab-search-overlay';
    
    // 创建对话框
    const dialog = document.createElement('div');
    dialog.className = 'tauri-tab-search-dialog';
    
    // 搜索输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tauri-tab-search-input';
    input.placeholder = '搜索标签标题';
    
    // 结果容器
    const results = document.createElement('div');
    results.className = 'tauri-tab-search-results';
    
    dialog.appendChild(input);
    dialog.appendChild(results);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    let selectedIndex = 0;
    
    // 渲染搜索结果
    function renderResults(query = '') {
      const tabs = window.tauriTabs.tabs;
      const filtered = query.trim() === '' ? tabs : tabs.filter(tab => {
        const title = (tab.title || '').toLowerCase();
        const q = query.toLowerCase();
        return title.includes(q); // 只搜索标题
      });
      
      results.innerHTML = '';
      
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'tauri-tab-search-empty';
        empty.textContent = '没有找到匹配的标签';
        results.appendChild(empty);
        return;
      }
      
      filtered.forEach((tab, index) => {
        const item = document.createElement('div');
        item.className = 'tauri-tab-search-item';
        if (index === selectedIndex) {
          item.classList.add('selected');
        }
        
        const icon = document.createElement('div');
        icon.className = 'tauri-tab-search-item-icon';
        icon.textContent = '📄';
        
        const content = document.createElement('div');
        content.className = 'tauri-tab-search-item-content';
        
        const titleEl = document.createElement('div');
        titleEl.className = 'tauri-tab-search-item-title';
        titleEl.textContent = tab.title || 'Untitled';
        
        content.appendChild(titleEl);
        // 不显示 URL
        
        item.appendChild(icon);
        item.appendChild(content);
        
        item.addEventListener('click', () => {
          switchTab(tab.id);
          closeSearch();
        });
        
        results.appendChild(item);
      });
      
      selectedIndex = Math.min(selectedIndex, filtered.length - 1);
    }
    
    // 关闭搜索
    function closeSearch() {
      overlay.remove();
      log('🔍 关闭标签搜索');
    }
    
    // 输入事件
    input.addEventListener('input', () => {
      selectedIndex = 0;
      renderResults(input.value);
    });
    
    // 键盘事件
    input.addEventListener('keydown', (e) => {
      const items = results.querySelectorAll('.tauri-tab-search-item');
      
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        renderResults(input.value);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderResults(input.value);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedIndex]) {
          items[selectedIndex].click();
        }
      }
    });
    
    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeSearch();
      }
    });
    
    // 初始渲染
    renderResults();
    
    // 自动聚焦
    setTimeout(() => input.focus(), 100);
  }
  
  // 更新标签标题
  function updateTabTitle(id, title) {
    const tab = window.tauriTabs.tabs.find(t => t.id === id);
    if (!tab) {
      log(`⚠️  updateTabTitle: 找不到标签 ${id}`);
      return;
    }
    
    // 避免重复更新
    if (tab.title === title) return;
    
    tab.title = title;
    const titleSpan = tab.element.querySelector('.tauri-tab-title');
    if (titleSpan) {
      titleSpan.textContent = title;
      titleSpan.title = title; // 悬停显示完整标题
      log(`✅ 标签标题已更新: ${id} -> ${title}`);
    } else {
      log(`⚠️  找不到标题元素: ${id}`);
    }
    
    // 如果是当前激活标签，更新窗口标题
    if (id === window.tauriTabs.activeTabId) {
      updateMainWindowTitle(title);
    }
  }
  
  // 更新主窗口标题
  async function updateMainWindowTitle(title) {
    try {
      await invoke('set_window_title', { title: `${title} - 测试环境` });
    } catch (err) {
      console.error('Failed to update window title:', err);
    }
  }
  
  // 键盘快捷键（仅在顶层窗口监听）
  if (window.self === window.top) {
    document.addEventListener('keydown', (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
      
      if (!isCtrlOrCmd) return;
      
      // 检查标签页系统是否已初始化
      if (!window.tauriTabs || !window.tauriTabs.tabs) return;
      
      // Cmd+T: 新建标签
      if (e.key === 't') {
        e.preventDefault();
        e.stopPropagation();
        // 获取当前激活标签的 URL
        const activeTab = window.tauriTabs.tabs.find(t => t.id === window.tauriTabs.activeTabId);
        const currentUrl = activeTab ? activeTab.url : window.location.href;
        createTab(currentUrl);
      }
      
      // Cmd+W: 关闭当前标签（但不关闭应用）
      if (e.key === 'w') {
        // 如果只剩一个标签，不处理（让系统默认行为：什么都不做）
        if (window.tauriTabs.tabs.length > 1 && window.tauriTabs.activeTabId) {
          e.preventDefault();
          e.stopPropagation();
          closeTab(window.tauriTabs.activeTabId);
        }
        // 如果只有一个标签，不阻止默认行为，也不关闭标签
      }
      
      // Cmd+Shift+N: 新窗口（保留多窗口功能）
      if (e.key === 'N' && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const activeTab = window.tauriTabs.tabs.find(t => t.id === window.tauriTabs.activeTabId);
        const currentUrl = activeTab ? activeTab.url : window.location.href;
        window.tauriOpenNewWindow(currentUrl);
      }
      
      // Cmd+Shift+A: 搜索标签
      if (e.key === 'A' && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        showTabSearch();
      }
      
      // Cmd+数字键: 快速切换标签 (1-9)
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(e.key) - 1;
        const tabs = window.tauriTabs.tabs;
        if (index < tabs.length) {
          switchTab(tabs[index].id);
        }
      }
    }, true); // 使用 capture 阶段，优先捕获
  }
  
  // 初始化标签页系统
  function initTabSystem() {
    // 检查是否在 iframe 内部
    if (window.self !== window.top) {
      log("⚠️  检测到在 iframe 内部，跳过标签页系统初始化");
      return;
    }
    
    // 检查是否已经初始化过
    if (window.__TAURI_TABS_INITIALIZED__) {
      log("⚠️  标签页系统已初始化，跳过");
      return;
    }
    
    // 等待 DOM 加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTabSystem);
      return;
    }
    
    log("📑 初始化标签页系统...");
    
    // 标记已初始化
    window.__TAURI_TABS_INITIALIZED__ = true;
    
    // 创建标签栏
    createTabBar();
    
    // 创建第一个标签，显示当前页面
    const currentUrl = window.location.href;
    const firstTabId = createTab(currentUrl);
    
    // 隐藏原始 body 内容（除了我们创建的标签栏和 iframe 容器）
    // 但保留 zoom indicator 等功能性元素
    Array.from(document.body.children).forEach(child => {
      if (child.id !== 'tauri-tab-bar' && 
          !child.classList.contains('tauri-iframe-container') &&
          !child.id?.includes('zoom')) { // 保留缩放指示器
        child.style.display = 'none';
      }
    });
    
    // 监听窗口大小变化，动态调整标签宽度
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        updateTabWidths();
        log('🔄 窗口大小变化，重新计算标签宽度');
      }, 200); // 防抖：延迟 200ms 执行
    });
    
    log("✅ 标签页系统初始化完成");
    console.log("🎉 标签页功能已启用:");
    console.log("  ╔════════════════════════════════════╗");
    console.log("  ║  快捷键                            ║");
    console.log("  ╠════════════════════════════════════╣");
    console.log("  ║  Cmd+T          新建标签           ║");
    console.log("  ║  Cmd+W          关闭当前标签       ║");
    console.log("  ║  Cmd+Shift+A    搜索标签           ║");
    console.log("  ║  Cmd+Shift+N    新窗口（多窗口）   ║");
    console.log("  ║  Cmd+1~9        切换到第 N 个标签  ║");
    console.log("  ╠════════════════════════════════════╣");
    console.log("  ║  鼠标操作                          ║");
    console.log("  ╠════════════════════════════════════╣");
    console.log("  ║  拖动标签        重新排序          ║");
    console.log("  ║  右键标签        显示菜单          ║");
    console.log("  ║  点击 🔍        搜索标签           ║");
    console.log("  ║  点击 +          新建标签          ║");
    console.log("  ╚════════════════════════════════════╝");
    console.log("  最多支持 20 个标签，动态宽度，拖动排序，搜索功能");
  }
  
  // 启动标签页系统（仅在顶层窗口）
  initTabSystem();

})();

