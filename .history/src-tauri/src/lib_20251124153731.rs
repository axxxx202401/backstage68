use tauri::{Builder, Manager};
use std::sync::Arc;
use tokio::sync::Mutex;

mod proxy;
mod fingerprint;
mod crypto;

use proxy::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 TauriApp/1.0")
        .build()
        .expect("Failed to create reqwest client");

    let app_state = Arc::new(Mutex::new(AppState { client }));
    let inject_script = include_str!("../../src/inject.js");

    Builder::default()
        .manage(app_state)
        .setup(move |app| {
            // 在页面加载时注入脚本
            for (label, window) in app.webview_windows() {
                println!("✓ Found window: {}", label);
                
                // 监听页面加载完成事件后注入脚本
                let script = inject_script.to_string();
                window.on_page_load(move |_window, _payload| {
                    println!("→ Page loaded, injecting script");
                    _window.eval(&script).ok();
                });
                
                // 首次也要注入
                std::thread::sleep(std::time::Duration::from_millis(500));
                window.eval(&inject_script).ok();
                
                #[cfg(debug_assertions)]
                {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    window.open_devtools();
                }
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![proxy::proxy_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
