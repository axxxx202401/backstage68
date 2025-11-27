use crate::crypto::{encrypt_signature, generate_signature_data};
use crate::fingerprint::get_device_fingerprint;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

// 编译时判断是否启用日志（使用字节比较避免 const 限制）
#[cfg(debug_assertions)]
const ENABLE_LOGS: bool = true;

#[cfg(not(debug_assertions))]
const ENABLE_LOGS: bool = {
    match option_env!("TAURI_ENABLE_LOGS") {
        Some(val) => matches!(val.as_bytes(), b"true"),
        None => false,
    }
};

// 日志宏
macro_rules! log {
    ($($arg:tt)*) => {
        if ENABLE_LOGS {
            println!($($arg)*);
        }
    };
}

pub struct AppState {
    pub client: reqwest::Client,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FormDataFile {
    pub field_name: String,
    pub file_name: String,
    pub content_type: String,
    pub data: String, // base64 encoded
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyRequest {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>, // Text body for JSON/text requests
    pub form_data: Option<Vec<(String, String)>>, // 表单字段：[(key, value), ...]
    pub files: Option<Vec<FormDataFile>>, // 文件数据
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    // 用于开发调试：记录完整的请求信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub debug_info: Option<ProxyDebugInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyDebugInfo {
    pub request_method: String,
    pub request_url: String,
    pub request_headers: HashMap<String, String>,
    pub request_body: Option<String>,
    pub response_status: u16,
    pub response_headers: HashMap<String, String>,
}

#[tauri::command]
pub async fn proxy_request(
    request: ProxyRequest,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<ProxyResponse, String> {
    // 过滤掉 Tauri 内部请求
    if request.url.contains("ipc://") || request.url.contains("tauri://") {
        return Err("Internal IPC request, skipping".to_string());
    }

    log!("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    log!("🔄 [PROXY REQUEST]");
    log!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    log!("📍 URL: {} {}", request.method, request.url);

    let app_state = state.lock().await;
    let client = &app_state.client;

    let method = request
        .method
        .parse::<reqwest::Method>()
        .map_err(|e| e.to_string())?;

    // 1. Build the request
    let mut req_builder = client.request(method, &request.url);

    // 2. Copy headers (skip restricted ones if necessary, but usually fine)
    log!("📤 原始请求头:");
    for (k, v) in &request.headers {
        // 跳过 Tauri 内部头
        if k.starts_with("tauri-") {
            continue;
        }
        log!("   {} : {}", k, v);
        req_builder = req_builder.header(k, v);
    }

    // 3. Add CUSTOM VERIFICATION HEADERS here
    // 生成时间戳
    let timestamp = chrono::Utc::now().to_rfc3339();

    // 获取设备指纹
    let device_fingerprint = get_device_fingerprint();

    // 生成签名数据：timestamp|fingerprint|url_hash
    let signature_data = generate_signature_data(&timestamp, &device_fingerprint, &request.url);

    log!("\n🔐 安全验证信息:");
    log!("   ⏰ Timestamp: {}", timestamp);
    log!("   🖥️  Device Fingerprint: {}", device_fingerprint);
    log!("   📝 Signature Data: {}", signature_data);

    // 使用 RSA 公钥加密签名（服务端用私钥解密验证）
    let encrypted_signature = encrypt_signature(&signature_data)
        .map_err(|e| format!("Failed to encrypt signature: {}", e))?;

    log!("   🔒 Encrypted Signature: {}", encrypted_signature);

    // 添加加密后的验证头
    req_builder = req_builder.header("X-Client-Signature", &encrypted_signature);
    req_builder = req_builder.header("X-Timestamp", &timestamp);
    req_builder = req_builder.header("X-Device-Fingerprint", &device_fingerprint);

    log!("\n✅ 已添加验证头:");
    log!("   X-Client-Signature: {}", encrypted_signature);
    log!("   X-Timestamp: {}", timestamp);
    log!("   X-Device-Fingerprint: {}", device_fingerprint);

    // 4. Set body (优先处理 multipart，其次是普通 body)
    if let Some(files) = &request.files {
        // 文件上传请求，使用 multipart/form-data
        log!("\n📦 文件上传请求，构建 multipart/form-data");
        log!("   文件数量: {}", files.len());

        let mut form = reqwest::multipart::Form::new();

        // 添加普通表单字段
        if let Some(form_data) = &request.form_data {
            for (key, value) in form_data {
                log!("   表单字段: {} = {}", key, value);
                form = form.text(key.clone(), value.clone());
            }
        }

        // 添加文件
        for file in files {
            log!("   文件: {} ({})", file.file_name, file.content_type);

            // 解码 base64 文件数据
            let file_bytes = base64::engine::general_purpose::STANDARD
                .decode(&file.data)
                .map_err(|e| format!("Failed to decode file: {}", e))?;

            log!("   文件大小: {} bytes", file_bytes.len());

            // 创建文件部分
            let part = reqwest::multipart::Part::bytes(file_bytes)
                .file_name(file.file_name.clone())
                .mime_str(&file.content_type)
                .map_err(|e| format!("Invalid content type: {}", e))?;

            form = form.part(file.field_name.clone(), part);
        }

        req_builder = req_builder.multipart(form);
    } else if let Some(body) = &request.body {
        // 普通请求体（JSON、文本等）
        log!("\n📦 请求体: {} bytes", body.len());
        req_builder = req_builder.body(body.clone());
    }

    // 5. Send request
    log!("\n🚀 发送请求到后端...");
    let resp = req_builder.send().await.map_err(|e| {
        log!("❌ 请求失败: {}", e);
        e.to_string()
    })?;

    // 6. Process response
    let status = resp.status().as_u16();
    log!("📥 响应状态: {}", status);

    let headers: HashMap<String, String> = resp
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let body = resp.text().await.map_err(|e| e.to_string())?;

    if status == 403 {
        log!("⚠️  收到 403 Forbidden 响应！");
        log!(
            "📄 响应内容: {}",
            if body.len() > 200 {
                &body[..200]
            } else {
                &body
            }
        );
    } else {
        log!("✅ 请求成功!");
    }

    log!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // 在开发模式下，返回调试信息
    let debug_info = if ENABLE_LOGS {
        // 收集所有请求头（包括安全头）
        let mut all_request_headers = request.headers.clone();
        all_request_headers.insert("X-Client-Signature".to_string(), encrypted_signature.clone());
        all_request_headers.insert("X-Timestamp".to_string(), timestamp.clone());
        all_request_headers.insert("X-Device-Fingerprint".to_string(), device_fingerprint.clone());
        
        Some(ProxyDebugInfo {
            request_method: request.method.clone(),
            request_url: request.url.clone(),
            request_headers: all_request_headers,
            request_body: request.body.clone(),
            response_status: status,
            response_headers: headers.clone(),
        })
    } else {
        None
    };

    Ok(ProxyResponse {
        status,
        headers,
        body,
        debug_info,
    })
}
