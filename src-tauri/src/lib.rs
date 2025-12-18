use std::sync::Arc;
use tauri::{Builder, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::Mutex;

mod crypto;
mod fingerprint;
mod proxy;
mod security;

use proxy::AppState;

// 常量定义
const DEVTOOLS_OPEN_DELAY_SECS: u64 = 3;

/// 转义 JavaScript 字符串中的特殊字符
fn escape_js_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

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

fn env_name() -> String {
    option_env!("TAURI_ENV_NAME")
        .unwrap_or("Backstage68")
        .to_string()
}

fn env_url() -> String {
    option_env!("TAURI_ENV_URL")
        .unwrap_or("https://example.com")
        .to_string()
}

fn env_key() -> String {
    option_env!("TAURI_ENV_KEY")
        .unwrap_or("default")
        .to_string()
}

// 编译时判断是否启用开发者工具
#[cfg(debug_assertions)]
const DEVTOOLS_ENABLED: bool = true;

#[cfg(not(debug_assertions))]
const DEVTOOLS_ENABLED: bool = {
    match option_env!("TAURI_DEVTOOLS_ENABLED") {
        Some(val) => matches!(val.as_bytes(), b"true"),
        None => false,
    }
};

// 编译时判断是否自动打开开发者工具（默认 false）
#[cfg(debug_assertions)]
const DEVTOOLS_AUTO_OPEN: bool = true;

#[cfg(not(debug_assertions))]
const DEVTOOLS_AUTO_OPEN: bool = {
    match option_env!("TAURI_DEVTOOLS_AUTO_OPEN") {
        Some(val) => matches!(val.as_bytes(), b"true"),
        None => false,
    }
};

/// 获取当前环境信息
#[tauri::command]
fn get_env_info() -> Result<String, String> {
    Ok(format!("当前环境: {} ({})", env_name(), env_key()))
}

/// 设置页面缩放（使用 Tauri 2.0 WebView 原生缩放）
#[tauri::command]
async fn set_zoom(window: tauri::WebviewWindow, zoom_level: f64) -> Result<(), String> {
    // 使用 Tauri 2.0 的 WebView 原生缩放 API
    // 这会像浏览器原生缩放一样工作，不会有 fixed 元素定位问题
    window.set_zoom(zoom_level)
        .map_err(|e| format!("Failed to set zoom: {}", e))
}

/// 获取当前缩放级别（从前端存储）
#[tauri::command]
async fn get_zoom() -> Result<f64, String> {
    // 缩放级别由前端 JavaScript 管理
    Ok(1.0)
}

/// 设置窗口标题
#[tauri::command]
async fn set_window_title(window: tauri::Window, title: String) -> Result<(), String> {
    window.set_title(&title).map_err(|e| e.to_string())
}

/// 创建新窗口（用于支持多窗口）
///
/// # 参数
/// * `current_url` - 当前页面的 URL（包括路由路径）
/// * `storage_data` - 序列化的 localStorage 和 sessionStorage 数据
#[tauri::command]
async fn create_new_window(
    app: tauri::AppHandle,
    current_url: Option<String>,
    storage_data: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<String, String> {
    use std::sync::atomic::{AtomicUsize, Ordering};

    // 生成唯一的窗口 ID
    static WINDOW_COUNTER: AtomicUsize = AtomicUsize::new(1);
    let window_id = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let window_label = format!("window-{}", window_id);

    log!("🪟 Creating new window: {}", window_label);

    // 使用传入的 URL（当前页面）或默认 URL
    let target_url = current_url.unwrap_or_else(|| env_url());
    log!("   Target URL: {}", target_url);

    // 获取注入脚本
    let inject_script = include_str!("../../src/inject.js");

    // 构建初始化脚本：恢复存储（不跳转）
    let sanitized_storage = storage_data.and_then(|raw| match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(_) => Some(raw),
        Err(err) => {
            log!("⚠️  Invalid storage data, skipping restore: {}", err);
            None
        }
    });

    let storage_restore_script = if let Some(data) = sanitized_storage {
        let escaped_data = escape_js_string(&data);

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
                    
                    console.log('✅ Storage restoration complete');
                }} catch (err) {{
                    console.error('❌ Failed to restore storage:', err);
                }}
            }})();
            "#,
            escaped_data
        )
    } else {
        String::new()
    };

    let final_script = format!(
        "window.__TAURI_ENABLE_LOGS__ = {};\n{}\n{}",
        ENABLE_LOGS, inject_script, storage_restore_script
    );

    // 新窗口直接打开目标 URL（不是首页）
    let initial_url = target_url.clone();

    fn clamp_dimension(value: Option<f64>, default: f64) -> f64 {
        const MIN: f64 = 200.0;
        const MAX: f64 = 3000.0;
        value
            .filter(|v| v.is_finite())
            .map(|v| v.clamp(MIN, MAX))
            .unwrap_or(default)
    }

    let target_width = clamp_dimension(width, 1200.0);
    let target_height = clamp_dimension(height, 800.0);

    let _window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::External(
            initial_url
                .parse()
                .map_err(|e| format!("Invalid URL: {}", e))?,
        ),
    )
    .title(format!("{} - 窗口 {}", env_name(), window_id))
    .inner_size(target_width, target_height)
    .initialization_script(&final_script)
    .build()
    .map_err(|e| format!("Failed to create window: {}", e))?;

    Ok(window_label)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 🛡️ 启动时进行安全检查
    let security_score = security::calculate_security_score();
    log!(
        "🛡️  Application Security Score: {}/100",
        security_score.score
    );
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
    log!("🌍 Environment: {} ({})", env_name(), env_key());
    log!("📍 URL: {}", env_url());
    log!(
        "🔧 DevTools: {}",
        if DEVTOOLS_ENABLED {
            "enabled"
        } else {
            "disabled"
        }
    );

    Builder::default()
        .manage(app_state)
        .setup(move |app| {
            log!("🚀 Creating main window...");

            // 准备注入脚本：将 inject.js 内容和目标 URL 变量合并
            let target_url = env_url();
            let final_script = format!(
                "window.__TAURI_ENABLE_LOGS__ = {};\n{}",
                ENABLE_LOGS, inject_script
            );

            // 创建主窗口（使用固定 label "main"）
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(target_url.parse().unwrap()),
            )
            .title(format!("Backstage68 - {}", env_name()))
            .inner_size(1200.0, 800.0)
            .resizable(true)
            .initialization_script(&final_script)
            .build()
            .expect("Failed to create window");

            log!("✓ Window created");

            // 在 devtools 启用且设置为自动打开时才打开
            if DEVTOOLS_ENABLED && DEVTOOLS_AUTO_OPEN {
                #[cfg(feature = "devtools")]
                {
                    let w2 = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(
                            DEVTOOLS_OPEN_DELAY_SECS,
                        ));
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
            set_window_title,
            create_new_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS: 处理 Reopen 事件
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { has_visible_windows, .. } = event {
                if !has_visible_windows {
                    // 没有可见窗口时（双击应用图标启动）→ 创建新窗口
                    log!("🪟 No visible windows, creating new window...");
                    let _ = create_reopen_window(app);
                }
                // 有可见窗口时（点击 Dock）→ 不做任何事，让系统显示已有窗口
            }
        });
}

/// 创建 Reopen 窗口（用于 macOS 双击图标时）
fn create_reopen_window(app: &tauri::AppHandle) -> Result<(), String> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    
    static REOPEN_COUNTER: AtomicUsize = AtomicUsize::new(1);
    let window_id = REOPEN_COUNTER.fetch_add(1, Ordering::SeqCst);
    let window_label = format!("reopen-{}", window_id);
    
    let target_url = env_url();
    let inject_script = include_str!("../../src/inject.js");
    let final_script = format!(
        "window.__TAURI_ENABLE_LOGS__ = {};\n{}",
        ENABLE_LOGS, inject_script
    );
    
    WebviewWindowBuilder::new(
        app,
        &window_label,
        WebviewUrl::External(target_url.parse().map_err(|e| format!("Invalid URL: {}", e))?),
    )
    .title(format!("Backstage68 - {}", env_name()))
    .inner_size(1200.0, 800.0)
    .resizable(true)
    .initialization_script(&final_script)
    .build()
    .map_err(|e| format!("Failed to create window: {}", e))?;
    
    log!("✓ New window created: {}", window_label);
    Ok(())
}
