/**
 * HTTP 代理拦截模块 (Fetch + XMLHttpRequest)
 */

export function initProxy(log, invoke) {
  log("🚀 初始化代理模块...");
  
  // --- Override window.fetch ---
  const originalFetch = window.fetch;
  
  window.fetch = async function(input, init) {
    let url = input;
    if (input instanceof Request) {
      url = input.url;
      if (!init) {
        init = {
          method: input.method,
          headers: input.headers,
          body: input.body
        };
      }
    }
    
    if (url.startsWith('/')) {
      url = window.location.origin + url;
    }

    if (url.includes('ipc://localhost') || url.includes('tauri://')) {
      return originalFetch.apply(this, arguments);
    }

    if (!url.includes('/base_api/')) {
      return originalFetch.apply(this, arguments);
    }

    log("🔄 [Fetch] Intercepted:", url);

    let headers = {};
    if (init && init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => headers[k] = v);
      } else {
        headers = init.headers;
      }
    }

    let body = null;
    let formData = null;
    let files = null;
    
    if (init && init.body) {
      if (typeof init.body === 'string') {
        body = init.body;
      } else if (init.body instanceof FormData) {
        log("📦 检测到 FormData");
        formData = [];
        files = [];
        
        for (const [key, value] of init.body.entries()) {
          if (value instanceof File) {
            const reader = new FileReader();
            const filePromise = new Promise((resolve) => {
              reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                files.push({
                  field_name: key,
                  file_name: value.name,
                  content_type: value.type || 'application/octet-stream',
                  data: base64
                });
                resolve();
              };
              reader.onerror = () => resolve();
            });
            reader.readAsDataURL(value);
            await filePromise;
          } else {
            formData.push([key, value.toString()]);
          }
        }
        
        delete headers['Content-Type'];
        delete headers['content-type'];
      } else {
        try {
          body = JSON.stringify(init.body);
        } catch(e) {
          log.warn("Could not stringify body", e);
        }
      }
    }

    const reqData = {
      method: (init && init.method) ? init.method.toUpperCase() : 'GET',
      url: url.toString(),
      headers: headers,
      body: body,
      form_data: formData,
      files: files && files.length > 0 ? files : null
    };

    try {
      const response = await invoke('proxy_request', { request: reqData });
      
      if (response.status === 403) {
        log.error("⚠️ 403 Forbidden!");
      }
      
      return new Response(response.body, {
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
    
    if (data instanceof FormData) {
      (async () => {
        try {
          const formDataArray = [];
          const filesArray = [];
          
          for (const [key, value] of data.entries()) {
            if (value instanceof File) {
              const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
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
          
          self.status = response.status;
          self.statusText = response.status === 200 ? "OK" : "";
          self.responseText = response.body;
          self.response = response.body;
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
        self.status = response.status;
        self.statusText = response.status === 200 ? "OK" : "";
        self.responseText = response.body;
        self.response = response.body;
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

