use tauri::{Builder, WebviewUrl, WebviewWindowBuilder};
use std::sync::Arc;
use tokio::sync::Mutex;
use url::Url;

mod proxy;
mod fingerprint;
mod crypto;

use proxy::AppState;

// 编译时注入的环境变量
const ENV_NAME: &str = env!("TAURI_ENV_NAME");
const ENV_URL: &str = env!("TAURI_ENV_URL");
const ENV_KEY: &str = env!("TAURI_ENV_KEY");

// 编译时判断是否启用开发者工具
#[cfg(debug_assertions)]
const DEVTOOLS_ENABLED: bool = true;

#[cfg(not(debug_assertions))]
const DEVTOOLS_ENABLED: bool = true; // 强制在生产环境开启，用于调试

#[tauri::command]
fn get_env_info() -> Result<String, String> {
    Ok(format!("当前环境: {} ({})", ENV_NAME, ENV_KEY))
}

#[tauri::command]
async fn navigate_to_target(window: tauri::WebviewWindow) -> Result<(), String> {
    let target_url = std::env::var("TAURI_ENV_URL").unwrap_or_else(|_| ENV_URL.to_string());
    println!("🚀 Rust navigating to: {}", target_url);
    
    // 使用 Rust 原生 navigate 方法，这属于 Host 级导航，完全绕过网页端 CSP 限制
    let url = Url::parse(&target_url).map_err(|e| format!("Invalid URL: {}", e))?;
    window.navigate(url).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 TauriApp/1.0")
        .build()
        .expect("Failed to create reqwest client");

    let app_state = Arc::new(Mutex::new(AppState { client }));
    let inject_script = include_str!("../../src/inject.js").to_string();
    
    // 使用编译时注入的环境变量
    println!("🌍 Environment: {} ({})", ENV_NAME, ENV_KEY);
    println!("📍 URL: {}", ENV_URL);
    println!("🔧 DevTools: {}", if DEVTOOLS_ENABLED { "enabled" } else { "disabled" });

    Builder::default()
        .manage(app_state)
        .setup(move |app| {
            println!("🚀 Creating window...");
            
            // 准备注入脚本：将 inject.js 内容和目标 URL 变量合并
            let target_url = ENV_URL.to_string();
            let final_script = format!(
                "window.TARGET_URL = '{}';\n{}", 
                target_url,
                inject_script
            );

            // 创建窗口
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(target_url.parse().unwrap())
            )
            .title(format!("Backstage68 - {}", ENV_NAME))
            .inner_size(1200.0, 800.0)
            .resizable(true)
            .initialization_script(&final_script)
            .build()
            .expect("Failed to create window");
            
            println!("✓ Window created");
            
            // 在 devtools 启用时自动打开
            if DEVTOOLS_ENABLED {
                #[cfg(feature = "devtools")]
                {
                    let w2 = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(3));
                        w2.open_devtools();
                        println!("✓ DevTools opened");
                    });
                }
                // 如果 feature 没有开启，避免 unused variable 警告
                #[cfg(not(feature = "devtools"))]
                let _ = window; 
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            proxy::proxy_request,
            get_env_info,
            navigate_to_target
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
