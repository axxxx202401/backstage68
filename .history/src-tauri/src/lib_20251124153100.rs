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
            
            // Iterate over windows (usually just 'main')
            for window in app.webview_windows().values() {
                // 1. 先注入拦截脚本
                match window.eval(&script) {
                    Ok(_) => println!("JS injection successful"),
                    Err(e) => eprintln!("JS injection failed: {}", e),
                }
                
                // 2. 等待脚本注入完成
                std::thread::sleep(std::time::Duration::from_millis(200));
                
                // 3. 然后才加载远程 URL
                if let Err(e) = window.eval("window.location.href = 'http://test-otc.68chat.co/';") {
                    eprintln!("Failed to navigate: {}", e);
                }
                
                // 4. 开发模式下自动打开开发者工具
                #[cfg(debug_assertions)]
                {
                    window.open_devtools();
                }
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![proxy::proxy_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
