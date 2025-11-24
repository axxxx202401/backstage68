use tauri::{Builder, Manager};
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

    // Read the injection script
    let inject_script = include_str!("../../src/inject.js");

    Builder::default()
        .manage(app_state)
        .setup(move |app| {
            let script = inject_script.to_string();
            
            // Get main window
            if let Some(window) = app.get_webview_window("main") {
                // 1. 先加载一个空白页（data URL），确保有 DOM 环境
                let blank_url = "data:text/html,<html><body></body></html>".parse().unwrap();
                let _ = window.navigate(blank_url);
                
                // 2. 等待空白页加载完成
                std::thread::sleep(std::time::Duration::from_millis(300));
                
                // 3. 注入拦截脚本
                match window.eval(&script) {
                    Ok(_) => println!("✓ JS injection successful"),
                    Err(e) => eprintln!("✗ JS injection failed: {}", e),
                }
                
                // 4. 等待脚本执行完成
                std::thread::sleep(std::time::Duration::from_millis(200));
                
                // 5. 使用 navigate 导航到目标 URL
                println!("→ Navigating to http://test-otc.68chat.co/");
                let target_url = "http://test-otc.68chat.co/".parse().unwrap();
                let _ = window.navigate(target_url);
                
                // 6. 开发模式下自动打开开发者工具
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
