(function() {
  console.log("Tauri Proxy Injection Started");

  // Access Tauri invoke function (Tauri v2)
  const invoke = window.__TAURI__.core.invoke;

  // --- Override window.fetch ---
  const originalFetch = window.fetch;
  
  window.fetch = async function(input, init) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔄 [Tauri Proxy] Intercepted Fetch:", input);

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

    console.log("📤 Request Data:", reqData.method, reqData.url);
    console.log("📋 Headers:", Object.keys(headers).length, "headers");

    try {
      // Call Rust Proxy
      console.log("🚀 Calling Rust proxy_request...");
      const response = await invoke('proxy_request', { request: reqData });
      
      console.log("📥 Response Status:", response.status);
      if (response.status === 403) {
        console.error("⚠️ 403 Forbidden! 后端拒绝请求");
        console.log("响应内容:", response.body.substring(0, 200));
      } else {
        console.log("✅ Request successful");
      }
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      
      // Construct Response object
      return new Response(response.body, {
        status: response.status,
        statusText: response.status === 200 ? 'OK' : 'Error', // simplified
        headers: new Headers(response.headers)
      });
      
    } catch (err) {
      console.error("❌ Proxy Request Failed:", err);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
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
  console.log("Tauri Proxy Injection Completed");

})();

