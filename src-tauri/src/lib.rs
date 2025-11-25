use tauri::{Builder, WebviewUrl, WebviewWindowBuilder};
use std::sync::Arc;
use tokio::sync::Mutex;

mod proxy;
mod fingerprint;
mod crypto;

use proxy::AppState;

// 编译时注入的环境变量
const ENV_NAME: &str = env!("TAURI_ENV_NAME");
const ENV_URL: &str = env!("TAURI_ENV_URL");
const ENV_KEY: &str = env!("TAURI_ENV_KEY");

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

// 日志宏：根据 ENABLE_LOGS 条件编译
macro_rules! log {
    ($($arg:tt)*) => {
        if ENABLE_LOGS {
            println!($($arg)*);
        }
    };
}

// 编译时判断是否启用开发者工具
#[cfg(debug_assertions)]
const DEVTOOLS_ENABLED: bool = true;

#[cfg(not(debug_assertions))]
const DEVTOOLS_ENABLED: bool = true; // 强制在生产环境开启，用于调试

#[tauri::command]
fn get_env_info() -> Result<String, String> {
    Ok(format!("当前环境: {} ({})", ENV_NAME, ENV_KEY))
}

// 设置页面缩放（使用 CSS transform）
#[tauri::command]
async fn set_zoom(window: tauri::Window, zoom_level: f64) -> Result<(), String> {
    let script = format!(
        r#"
        (function() {{
            let body = document.body;
            if (!body) {{
                document.addEventListener('DOMContentLoaded', function() {{
                    document.body.style.transform = 'scale({})';
                    document.body.style.transformOrigin = 'top left';
                    document.body.style.width = '{}%';
                    document.body.style.height = '{}%';
                }});
            }} else {{
                body.style.transform = 'scale({})';
                body.style.transformOrigin = 'top left';
                body.style.width = '{}%';
                body.style.height = '{}%';
            }}
        }})();
        "#,
        zoom_level,
        100.0 / zoom_level,
        100.0 / zoom_level,
        zoom_level,
        100.0 / zoom_level,
        100.0 / zoom_level
    );
    
    // 获取窗口的主 webview 并执行脚本
    if let Some(webview) = window.webviews().first() {
        webview.eval(&script).map_err(|e| e.to_string())
    } else {
        Err("No webview found".to_string())
    }
}

// 获取当前缩放级别（从前端存储）
#[tauri::command]
async fn get_zoom() -> Result<f64, String> {
    // 缩放级别由前端 JavaScript 管理
    Ok(1.0)
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
    log!("🌍 Environment: {} ({})", ENV_NAME, ENV_KEY);
    log!("📍 URL: {}", ENV_URL);
    log!("🔧 DevTools: {}", if DEVTOOLS_ENABLED { "enabled" } else { "disabled" });

    Builder::default()
        .manage(app_state)
        .setup(move |app| {
            log!("🚀 Creating window...");
            
            // 准备注入脚本：将 inject.js 内容和目标 URL 变量合并
            let target_url = ENV_URL.to_string();
            let final_script = format!(
                "window.__TAURI_ENABLE_LOGS__ = {};\n{}", 
                ENABLE_LOGS,
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
            
            log!("✓ Window created");
            
            // 在 devtools 启用时自动打开
            if DEVTOOLS_ENABLED {
                #[cfg(feature = "devtools")]
                {
                    let w2 = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(3));
                        w2.open_devtools();
                        log!("✓ DevTools opened");
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
            set_zoom,
            get_zoom
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
