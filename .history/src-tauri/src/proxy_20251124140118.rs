use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::fingerprint::get_device_fingerprint;

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
    let app_state = state.lock().await;
    let client = &app_state.client;

    let method = request.method.parse::<reqwest::Method>().map_err(|e| e.to_string())?;
    
    // 1. Build the request
    let mut req_builder = client.request(method, &request.url);

    // 2. Copy headers (skip restricted ones if necessary, but usually fine)
    for (k, v) in request.headers {
        req_builder = req_builder.header(k, v);
    }

    // 3. Add CUSTOM VERIFICATION HEADERS here
    // TODO: Add actual encryption/signature logic
    req_builder = req_builder.header("X-Client-Verify", "tauri-secure-client-v1");
    req_builder = req_builder.header("X-Timestamp", chrono::Utc::now().to_rfc3339());

    // 4. Set body
    if let Some(body) = request.body {
        req_builder = req_builder.body(body);
    }

    // 5. Send request
    let resp = req_builder.send().await.map_err(|e| e.to_string())?;

    // 6. Process response
    let status = resp.status().as_u16();
    let headers = resp.headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    
    let body = resp.text().await.map_err(|e| e.to_string())?;

    Ok(ProxyResponse {
        status,
        headers,
        body,
    })
}

