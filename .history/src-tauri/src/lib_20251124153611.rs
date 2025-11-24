use tauri::{Builder, Manager};
use tauri::webview::WebviewWindowBuilder;
use std::sync::Arc;
use tokio::sync::Mutex;

mod proxy;
mod fingerprint;
mod crypto;

use proxy::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize Reqwest Client with Cookie Store
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 TauriApp/1.0")
        .build()
        .expect("Failed to create reqwest client");

    let app_state = Arc::new(Mutex::new(AppState { client }));

    // Read the injection script - 这将在每次页面加载时自动执行
    let inject_script = include_str!("../../src/inject.js");

    Builder::default()
        .manage(app_state)
        .setup(move |app| {
            // 删除默认窗口（如果存在）
            if let Some(window) = app.get_webview_window("main") {
                window.close().ok();
            }
            
            // 创建新窗口并设置 initialization_script
            let window = WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External("http://test-otc.68chat.co/".parse().unwrap()))
                .title("Backstage68")
                .inner_size(1200.0, 800.0)
                .initialization_script(inject_script) // 关键：每次页面加载都会执行
                .build()
                .expect("Failed to create window");
            
            println!("✓ Window created with initialization script");
            
            // 开发模式下自动打开开发者工具
            #[cfg(debug_assertions)]
            {
                std::thread::sleep(std::time::Duration::from_millis(1000));
                window.open_devtools();
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![proxy::proxy_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
