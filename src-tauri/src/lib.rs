use tauri::{Builder, WebviewUrl, WebviewWindowBuilder};
use std::sync::Arc;
use tokio::sync::Mutex;

mod proxy;
mod fingerprint;
mod crypto;
mod security;

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

// 设置页面缩放（使用 CSS zoom 属性，类似浏览器原生缩放）
#[tauri::command]
async fn set_zoom(window: tauri::Window, zoom_level: f64) -> Result<(), String> {
    let script = format!(
        r#"
        (function() {{
            // 使用 CSS zoom 属性，这样可以真正缩放页面，而不仅仅是视觉变化
            document.body.style.zoom = '{}';
        }})();
        "#,
        zoom_level
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

// 创建新窗口（用于支持多窗口）
// current_url: 当前页面的 URL（包括路由路径）
// storage_data: 序列化的 localStorage 和 sessionStorage 数据
#[tauri::command]
async fn create_new_window(
    app: tauri::AppHandle, 
    current_url: Option<String>,
    storage_data: Option<String>
) -> Result<String, String> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    
    // 生成唯一的窗口 ID
    static WINDOW_COUNTER: AtomicUsize = AtomicUsize::new(1);
    let window_id = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let window_label = format!("window-{}", window_id);
    
    log!("🪟 Creating new window: {}", window_label);
    
    // 使用传入的 URL（当前页面）或默认 URL
    let target_url = current_url.unwrap_or_else(|| ENV_URL.to_string());
    log!("   Target URL: {}", target_url);
    
    // 获取注入脚本
    let inject_script = include_str!("../../src/inject.js");
    
    // 构建初始化脚本：先恢复存储，再跳转到目标 URL
    let storage_restore_script = if let Some(data) = storage_data {
        format!(
            r#"
            (function() {{
                try {{
                    const storageData = JSON.parse('{}');
                    console.log('🔄 Restoring storage data:', storageData);
                    
                    // 恢复 localStorage
                    if (storageData.localStorage) {{
                        for (const [key, value] of Object.entries(storageData.localStorage)) {{
                            localStorage.setItem(key, value);
                        }}
                        console.log('✅ localStorage restored:', Object.keys(storageData.localStorage).length, 'items');
                    }}
                    
                    // 恢复 sessionStorage
                    if (storageData.sessionStorage) {{
                        for (const [key, value] of Object.entries(storageData.sessionStorage)) {{
                            sessionStorage.setItem(key, value);
                        }}
                        console.log('✅ sessionStorage restored:', Object.keys(storageData.sessionStorage).length, 'items');
                    }}
                    
                    // 存储恢复完成后，跳转到目标 URL
                    console.log('🔄 Navigating to:', '{}');
                    window.location.href = '{}';
                }} catch (err) {{
                    console.error('❌ Failed to restore storage:', err);
                    // 即使失败也跳转
                    window.location.href = '{}';
                }}
            }})();
            "#,
            data.replace('\\', "\\\\").replace('\'', "\\'"),
            target_url.replace('\'', "\\'"),
            target_url.replace('\'', "\\'"),
            target_url.replace('\'', "\\'")
        )
    } else {
        String::new()
    };
    
    let final_script = format!(
        "window.__TAURI_ENABLE_LOGS__ = {};\n{}\n{}", 
        ENABLE_LOGS,
        inject_script,
        storage_restore_script
    );
    
    // 新窗口先打开首页（用于恢复存储）
    let initial_url = ENV_URL.to_string();
    
    let _window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::External(initial_url.parse().map_err(|e| format!("Invalid URL: {}", e))?)
    )
    .title(format!("{} - 窗口 {}", ENV_NAME, window_id))
    .initialization_script(&final_script)
    .build()
    .map_err(|e| format!("Failed to create window: {}", e))?;
    
    Ok(window_label)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 🛡️ 启动时进行安全检查
    let security_score = security::calculate_security_score();
    log!("🛡️  Application Security Score: {}/100", security_score.score);
    log!("   - Debugger detected: {}", security_score.is_debugger);
    log!("   - VM detected: {}", security_score.is_vm);
    log!("   - Security level: {:?}", security_score.level());

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
            log!("🚀 Creating main window...");
            
            // 准备注入脚本：将 inject.js 内容和目标 URL 变量合并
            let target_url = ENV_URL.to_string();
            let final_script = format!(
                "window.__TAURI_ENABLE_LOGS__ = {};\n{}", 
                ENABLE_LOGS,
                inject_script
            );

            // 创建主窗口（使用固定 label "main"）
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
            get_zoom,
            create_new_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
