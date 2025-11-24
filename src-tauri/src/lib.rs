use tauri::{Builder, Manager, WebviewUrl, WebviewWindowBuilder};
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
    let inject_script = include_str!("../../src/inject.js").to_string();

    Builder::default()
        .manage(app_state)
        .setup(move |app| {
            println!("🚀 Creating window with initialization script...");
            
            // 创建窗口并设置 initialization_script（在页面加载前执行）
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("http://test-otc.68chat.co/".parse().unwrap())
            )
            .title("Backstage68")
            .inner_size(1200.0, 800.0)
            .resizable(true)
            .initialization_script(&inject_script)  // 关键：在每个页面加载前自动执行
            .build()
            .expect("Failed to create window");
            
            println!("✓ Window created with initialization script");
            
            #[cfg(debug_assertions)]
            {
                let w = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    println!("🔧 Opening devtools...");
                    w.open_devtools();
                });
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![proxy::proxy_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
