/**
 * HTTP 代理拦截模块 (Fetch + XMLHttpRequest)
 */

const toString = Object.prototype.toString;

function isRequest(value) {
  if (!value) return false;
  if (typeof Request !== 'undefined' && value instanceof Request) return true;
  return toString.call(value) === '[object Request]';
}

function isHeaders(value) {
  if (!value) return false;
  if (typeof Headers !== 'undefined' && value instanceof Headers) return true;
  return toString.call(value) === '[object Headers]';
}

function isFormData(value) {
  if (!value) return false;
  if (typeof FormData !== 'undefined' && value instanceof FormData) return true;
  return toString.call(value) === '[object FormData]';
}

function isFile(value) {
  if (!value) return false;
  if (typeof File !== 'undefined' && value instanceof File) return true;
  return toString.call(value) === '[object File]';
}

function normalizeHeaders(source) {
  if (!source) return {};
  const headers = {};

  if (isHeaders(source)) {
    source.forEach((v, k) => headers[k] = v);
    return headers;
  }

  if (Array.isArray(source)) {
    source.forEach(([k, v]) => {
      if (k) headers[k] = v;
    });
    return headers;
  }

  return { ...source };
}

async function serializeFormData(formData) {
  const fields = [];
  const files = [];

  for (const [key, value] of formData.entries()) {
    if (isFile(value)) {
      const reader = new FileReader();
      const base64 = await new Promise((resolve) => {
        reader.onload = () => {
          const result = reader.result;
          const chunk = typeof result === 'string' ? result.split(',')[1] : '';
          resolve(chunk || '');
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(value);
      });

      files.push({
        field_name: key,
        file_name: value.name,
        content_type: value.type || 'application/octet-stream',
        data: base64
      });
    } else {
      fields.push([key, value?.toString() ?? '']);
    }
  }

  return { fields, files };
}

export function initProxy(log, invoke) {
  log("🚀 初始化代理模块...");
  
  // --- Override window.fetch ---
  const originalFetch = window.fetch;
  
  window.fetch = async function(input, init) {
    let url = input;
    let requestInit = init ? { ...init } : undefined;

    if (isRequest(input)) {
      url = input.url;
      if (!requestInit) {
        requestInit = {
          method: input.method,
          headers: input.headers,
          body: input.body
        };
      }
    }
    
    if (typeof url === 'string' && url.startsWith('/')) {
      url = window.location.origin + url;
    }

    if (typeof url !== 'string') {
      url = url?.toString?.() ?? '';
    }

    if (url.includes('ipc://localhost') || url.includes('tauri://')) {
      return originalFetch.apply(this, arguments);
    }

    if (!url.includes('/base_api/')) {
      return originalFetch.apply(this, arguments);
    }

    log("🔄 [Fetch] Intercepted:", url);

    let headers = requestInit ? normalizeHeaders(requestInit.headers) : {};
    let body = null;
    let formData = null;
    let files = null;
    
    if (requestInit && requestInit.body) {
      if (typeof requestInit.body === 'string') {
        body = requestInit.body;
      } else if (isFormData(requestInit.body)) {
        log("📦 检测到 FormData");
        const serialized = await serializeFormData(requestInit.body);
        formData = serialized.fields;
        files = serialized.files.length > 0 ? serialized.files : null;
        
        delete headers['Content-Type'];
        delete headers['content-type'];
      } else {
        try {
          body = JSON.stringify(requestInit.body);
        } catch(e) {
          log.warn("Could not stringify body", e);
        }
      }
    }

    const reqData = {
      method: (requestInit && requestInit.method) ? requestInit.method.toUpperCase() : 'GET',
      url: url.toString(),
      headers: headers,
      body: body,
      form_data: formData,
      files: files
    };

    try {
      const response = await invoke('proxy_request', { request: reqData });
      
      // 如果有调试信息，在控制台打印（类似 Network 面板）
      if (response.debug_info) {
        const debug = response.debug_info;
        console.groupCollapsed(
          `%c${debug.request_method} %c${debug.response_status} %c${debug.request_url}`,
          'color: #0066cc; font-weight: bold',
          debug.response_status >= 200 && debug.response_status < 300 ? 'color: #00cc00; font-weight: bold' : 'color: #cc0000; font-weight: bold',
          'color: #666'
        );
        console.log('📍 Request URL:', debug.request_url);
        console.log('🔧 Request Method:', debug.request_method);
        console.log('📤 Request Headers:', debug.request_headers);
        if (debug.request_body) {
          console.log('📦 Request Body:', JSON.parse(debug.request_body));
        }
        console.log('📊 Response Status:', debug.response_status);
        console.log('📥 Response Headers:', debug.response_headers);
        if (response.is_binary) {
          console.log('📦 Response Type: Binary (base64 encoded)');
        } else {
          console.log('📄 Response Body:', JSON.parse(response.body));
        }
        console.groupEnd();
      }
      
      if (response.status === 403) {
        log.error("⚠️ 403 Forbidden!");
      }
      
      // 处理响应体：如果是二进制，解码 base64
      let responseBody;
      if (response.is_binary) {
        // 二进制响应：解码 base64 -> Uint8Array
        log("📦 解码二进制响应");
        const binaryString = atob(response.body);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        responseBody = bytes;
      } else {
        // 文本响应：直接使用
        responseBody = response.body;
      }
      
      return new Response(responseBody, {
        status: response.status,
        statusText: response.status === 200 ? 'OK' : 'Error',
        headers: new Headers(response.headers)
      });
      
    } catch (err) {
      log.error("❌ Proxy Request Failed:", err);
      throw err;
    }
  };

  // --- Override XMLHttpRequest ---
  const OriginalXHR = window.XMLHttpRequest;
  
  function ProxyXHR() {
    this.headers = {};
    this.responseHeaders = {};
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
    this.readyState = 1;
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
    
    if (!url.includes('/base_api/')) {
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
    
    const self = this;
    
    if (isFormData(data)) {
      (async () => {
        try {
          const formDataArray = [];
          const filesArray = [];
          
          for (const [key, value] of data.entries()) {
            if (isFile(value)) {
              const reader = new FileReader();
              const base64 = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(value);
              });
              
              filesArray.push({
                field_name: key,
                file_name: value.name,
                content_type: value.type || 'application/octet-stream',
                data: base64
              });
            } else {
              formDataArray.push([key, value.toString()]);
            }
          }
          
          const reqData = {
            method: self.method,
            url: url,
            headers: self.headers,
            body: null,
            form_data: formDataArray.length > 0 ? formDataArray : null,
            files: filesArray.length > 0 ? filesArray : null
          };
          
          delete reqData.headers['Content-Type'];
          delete reqData.headers['content-type'];
          
          const response = await invoke('proxy_request', { request: reqData });
          
          // 打印调试信息
          if (response.debug_info) {
            const debug = response.debug_info;
            console.groupCollapsed(
              `%c${debug.request_method} %c${debug.response_status} %c${debug.request_url}`,
              'color: #0066cc; font-weight: bold',
              debug.response_status >= 200 && debug.response_status < 300 ? 'color: #00cc00; font-weight: bold' : 'color: #cc0000; font-weight: bold',
              'color: #666'
            );
            console.log('📍 Request URL:', debug.request_url);
            console.log('🔧 Request Method:', debug.request_method);
            console.log('📤 Request Headers:', debug.request_headers);
            if (debug.request_body) {
              console.log('📦 Request Body:', JSON.parse(debug.request_body));
            }
            console.log('📊 Response Status:', debug.response_status);
            console.log('📥 Response Headers:', debug.response_headers);
            if (response.is_binary) {
              console.log('📦 Response Type: Binary (base64 encoded)');
            } else {
              console.log('📄 Response Body:', JSON.parse(response.body));
            }
            console.groupEnd();
          }
          
          // 处理响应体
          let responseBody;
          if (response.is_binary) {
            // 二进制响应：解码 base64 -> ArrayBuffer
            const binaryString = atob(response.body);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            responseBody = bytes.buffer; // ArrayBuffer
          } else {
            // 文本响应
            responseBody = response.body;
          }
          
          self.status = response.status;
          self.statusText = response.status === 200 ? "OK" : "";
          self.responseText = response.is_binary ? "" : response.body; // 二进制时不设置 responseText
          self.response = responseBody;
          self.readyState = 4;
          self.responseHeaders = response.headers;
          
          if (self.onreadystatechange) self.onreadystatechange();
          if (self.onload) self.onload();
          
        } catch (err) {
          log.error("XHR FormData Error:", err);
          if (self.onerror) self.onerror(err);
        }
      })();
      return;
    }
    
    const reqData = {
      method: this.method,
      url: url,
      headers: this.headers,
      body: data ? data.toString() : null
    };
    
    invoke('proxy_request', { request: reqData })
      .then(response => {
        // 打印调试信息
        if (response.debug_info) {
          const debug = response.debug_info;
          console.groupCollapsed(
            `%c${debug.request_method} %c${debug.response_status} %c${debug.request_url}`,
            'color: #0066cc; font-weight: bold',
            debug.response_status >= 200 && debug.response_status < 300 ? 'color: #00cc00; font-weight: bold' : 'color: #cc0000; font-weight: bold',
            'color: #666'
          );
          console.log('📍 Request URL:', debug.request_url);
          console.log('🔧 Request Method:', debug.request_method);
          console.log('📤 Request Headers:', debug.request_headers);
          if (debug.request_body) {
            console.log('📦 Request Body:', JSON.parse(debug.request_body));
          }
          console.log('📊 Response Status:', debug.response_status);
          console.log('📥 Response Headers:', debug.response_headers);
          if (response.is_binary) {
            console.log('📦 Response Type: Binary (base64 encoded)');
          } else {
            console.log('📄 Response Body:', JSON.parse(response.body));
          }
          console.groupEnd();
        }
        
        // 处理响应体
        let responseBody;
        if (response.is_binary) {
          // 二进制响应：解码 base64 -> ArrayBuffer
          const binaryString = atob(response.body);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          responseBody = bytes.buffer;
        } else {
          // 文本响应
          responseBody = response.body;
        }
        
        self.status = response.status;
        self.statusText = response.status === 200 ? "OK" : "";
        self.responseText = response.is_binary ? "" : response.body;
        self.response = responseBody;
        self.readyState = 4;
        self.responseHeaders = response.headers;

        if (self.onreadystatechange) self.onreadystatechange();
        if (self.onload) self.onload();
      })
      .catch(err => {
        log.error("XHR Proxy Error", err);
        if (self.onerror) self.onerror(err);
      });
  };
  
  ProxyXHR.prototype.getAllResponseHeaders = function() {
    let res = "";
    for (const [k, v] of Object.entries(this.responseHeaders)) {
      res += `${k}: ${v}\r\n`;
    }
    return res;
  };
  
  ProxyXHR.prototype.getResponseHeader = function(name) {
    return this.responseHeaders[name] || null;
  };

  window.XMLHttpRequest = ProxyXHR;
  log("✅ 代理模块已启用");
}

