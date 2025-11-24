use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::fingerprint::get_device_fingerprint;
use crate::crypto::{encrypt_signature, generate_signature_data};

pub struct AppState {
    pub client: reqwest::Client,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyRequest {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>, // Text body or base64 for binary? Simplified to string/json for now.
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
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

    println!("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("🔄 [PROXY REQUEST]");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("📍 URL: {} {}", request.method, request.url);
    
    let app_state = state.lock().await;
    let client = &app_state.client;

    let method = request.method.parse::<reqwest::Method>().map_err(|e| e.to_string())?;
    
    // 1. Build the request
    let mut req_builder = client.request(method, &request.url);

    // 2. Copy headers (skip restricted ones if necessary, but usually fine)
    println!("📤 原始请求头:");
    for (k, v) in &request.headers {
        // 跳过 Tauri 内部头
        if k.starts_with("tauri-") {
            continue;
        }
        println!("   {} : {}", k, v);
        req_builder = req_builder.header(k, v);
    }

    // 3. Add CUSTOM VERIFICATION HEADERS here
    // 生成时间戳
    let timestamp = chrono::Utc::now().to_rfc3339();
    
    // 获取设备指纹
    let device_fingerprint = get_device_fingerprint();
    
    // 生成签名数据：timestamp|fingerprint|url_hash
    let signature_data = generate_signature_data(&timestamp, &device_fingerprint, &request.url);
    
    println!("\n🔐 安全验证信息:");
    println!("   ⏰ Timestamp: {}", timestamp);
    println!("   🖥️  Device Fingerprint: {}", device_fingerprint);
    println!("   📝 Signature Data: {}", signature_data);
    
    // 使用 RSA 公钥加密签名（服务端用私钥解密验证）
    let encrypted_signature = encrypt_signature(&signature_data)
        .map_err(|e| format!("Failed to encrypt signature: {}", e))?;
    
    println!("   🔒 Encrypted Signature: {}", encrypted_signature);
    
    // 添加加密后的验证头
    req_builder = req_builder.header("X-Client-Signature", &encrypted_signature);
    req_builder = req_builder.header("X-Timestamp", &timestamp);
    req_builder = req_builder.header("X-Device-Fingerprint", &device_fingerprint);

    println!("\n✅ 已添加验证头:");
    println!("   X-Client-Signature: {}", encrypted_signature);
    println!("   X-Timestamp: {}", timestamp);
    println!("   X-Device-Fingerprint: {}", device_fingerprint);

    // 4. Set body
    if let Some(body) = &request.body {
        println!("\n📦 请求体: {} bytes", body.len());
        req_builder = req_builder.body(body.clone());
    }

    // 5. Send request
    println!("\n🚀 发送请求到后端...");
    let resp = req_builder.send().await.map_err(|e| {
        println!("❌ 请求失败: {}", e);
        e.to_string()
    })?;

    // 6. Process response
    let status = resp.status().as_u16();
    println!("📥 响应状态: {}", status);
    
    let headers = resp.headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    
    let body = resp.text().await.map_err(|e| e.to_string())?;

    if status == 403 {
        println!("⚠️  收到 403 Forbidden 响应！");
        println!("📄 响应内容: {}", if body.len() > 200 { &body[..200] } else { &body });
    } else {
        println!("✅ 请求成功!");
    }
    
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    Ok(ProxyResponse {
        status,
        headers,
        body,
    })
}

