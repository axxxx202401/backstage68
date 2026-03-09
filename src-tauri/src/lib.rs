use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Builder, Emitter, WebviewUrl, WebviewWindowBuilder};
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

/// 获取系统下载目录（修复 Linux 下载目录问题）
#[tauri::command]
fn get_download_dir() -> Result<String, String> {
    // 使用 dirs crate 获取下载目录
    if let Some(download_dir) = dirs::download_dir() {
        let path = download_dir.to_string_lossy().to_string();
        log!("📂 系统下载目录: {}", path);
        return Ok(path);
    }

    // 备用方案：尝试获取用户主目录下的 Downloads 或 下载
    if let Some(home_dir) = dirs::home_dir() {
        // 优先尝试 Downloads（英文）
        let downloads_en = home_dir.join("Downloads");
        if downloads_en.exists() {
            let path = downloads_en.to_string_lossy().to_string();
            log!("📂 找到下载目录 (Downloads): {}", path);
            return Ok(path);
        }

        // 尝试 下载（中文，Linux 中文系统）
        let downloads_zh = home_dir.join("下载");
        if downloads_zh.exists() {
            let path = downloads_zh.to_string_lossy().to_string();
            log!("📂 找到下载目录 (下载): {}", path);
            return Ok(path);
        }

        // 最后尝试创建 Downloads 目录
        if let Ok(()) = std::fs::create_dir_all(&downloads_en) {
            let path = downloads_en.to_string_lossy().to_string();
            log!("📂 已创建下载目录: {}", path);
            return Ok(path);
        }
    }

    Err("无法获取下载目录".to_string())
}

/// 获取操作系统类型
#[tauri::command]
fn get_os_type() -> String {
    #[cfg(target_os = "linux")]
    return "linux".to_string();

    #[cfg(target_os = "macos")]
    return "macos".to_string();

    #[cfg(target_os = "windows")]
    return "windows".to_string();

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    return "unknown".to_string();
}

/// 保存文件到下载目录（用于 Linux blob URL 下载问题）
#[tauri::command]
async fn save_file_to_downloads(filename: String, data: Vec<u8>) -> Result<String, String> {
    use std::fs;

    // 获取下载目录
    let download_dir = dirs::download_dir()
        .or_else(|| {
            dirs::home_dir().map(|h| {
                let downloads = h.join("Downloads");
                if downloads.exists() {
                    downloads
                } else {
                    let downloads_zh = h.join("下载");
                    if downloads_zh.exists() {
                        downloads_zh
                    } else {
                        downloads
                    }
                }
            })
        })
        .ok_or("无法获取下载目录")?;

    // 确保下载目录存在
    if !download_dir.exists() {
        fs::create_dir_all(&download_dir).map_err(|e| format!("创建下载目录失败: {}", e))?;
    }

    // 处理文件名冲突
    let mut file_path = download_dir.join(&filename);
    let mut counter = 1;
    
    while file_path.exists() {
        let stem = std::path::Path::new(&filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
        let ext = std::path::Path::new(&filename)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        
        let new_filename = if ext.is_empty() {
            format!("{} ({})", stem, counter)
        } else {
            format!("{} ({}).{}", stem, counter, ext)
        };
        
        file_path = download_dir.join(new_filename);
        counter += 1;
    }

    // 写入文件
    fs::write(&file_path, &data).map_err(|e| format!("保存文件失败: {}", e))?;

    let saved_path = file_path.to_string_lossy().to_string();
    log!("📥 文件已保存: {}", saved_path);
    
    Ok(saved_path)
}

// ── 流式下载（解决大文件卡死问题） ─────────────────────────────

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    id: String,
    filename: String,
    downloaded: u64,
    total_size: u64,
    percent: u8,
    speed_bps: f64,
}

#[derive(Clone, serde::Serialize)]
struct DownloadComplete {
    id: String,
    filename: String,
    path: String,
    size: u64,
}

#[derive(Clone, serde::Serialize)]
struct DownloadError {
    id: String,
    filename: String,
    error: String,
}

#[derive(Clone, serde::Serialize)]
struct DownloadResult {
    path: String,
    size: u64,
    id: String,
}

/// 流式下载文件到下载目录（替代 JS 端全量缓冲方案）
#[tauri::command]
async fn download_file(
    app: tauri::AppHandle,
    url: String,
    filename: Option<String>,
    headers: Option<HashMap<String, String>>,
    id: Option<String>,
) -> Result<DownloadResult, String> {
    use futures_util::StreamExt;
    use std::time::Instant;
    use tokio::io::AsyncWriteExt;

    let download_id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    log!("📥 [Download] 开始: {} (id={})", url, download_id);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 TauriApp/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.get(&url);
    if let Some(ref h) = headers {
        for (k, v) in h {
            req = req.header(k.as_str(), v.as_str());
        }
    }

    let resp = req.send().await.map_err(|e| {
        let msg = format!("请求失败: {}", e);
        let _ = app.emit("download-error", DownloadError {
            id: download_id.clone(),
            filename: filename.clone().unwrap_or_default(),
            error: msg.clone(),
        });
        msg
    })?;

    if !resp.status().is_success() {
        let msg = format!("HTTP {}", resp.status());
        let _ = app.emit("download-error", DownloadError {
            id: download_id.clone(),
            filename: filename.clone().unwrap_or_default(),
            error: msg.clone(),
        });
        return Err(msg);
    }

    let total_size = resp.content_length().unwrap_or(0);
    let final_filename = parse_download_filename(&resp, filename.as_deref(), &url);

    log!("📥 [Download] 文件名={}, 预估大小={} bytes", final_filename, total_size);

    // 发送初始进度（0%），让前端立即显示下载项
    let _ = app.emit("download-progress", DownloadProgress {
        id: download_id.clone(),
        filename: final_filename.clone(),
        downloaded: 0,
        total_size,
        percent: 0,
        speed_bps: 0.0,
    });

    let download_dir = get_download_dir_path()?;
    if !download_dir.exists() {
        std::fs::create_dir_all(&download_dir)
            .map_err(|e| format!("创建下载目录失败: {}", e))?;
    }
    let save_path = resolve_unique_path(&download_dir, &final_filename);

    let mut file = tokio::fs::File::create(&save_path)
        .await
        .map_err(|e| format!("创建文件失败: {}", e))?;

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let start_time = Instant::now();
    let mut last_emit = Instant::now();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("读取数据失败: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入文件失败: {}", e))?;
        downloaded += chunk.len() as u64;

        // 每 200ms 推送一次进度，避免事件风暴
        if last_emit.elapsed().as_millis() >= 200 {
            let percent = if total_size > 0 {
                ((downloaded as f64 / total_size as f64) * 100.0).min(100.0) as u8
            } else {
                0
            };
            let elapsed = start_time.elapsed().as_secs_f64();
            let speed = if elapsed > 0.0 { downloaded as f64 / elapsed } else { 0.0 };

            let _ = app.emit("download-progress", DownloadProgress {
                id: download_id.clone(),
                filename: final_filename.clone(),
                downloaded,
                total_size,
                percent,
                speed_bps: speed,
            });
            last_emit = Instant::now();
        }
    }

    file.flush().await.map_err(|e| format!("flush 失败: {}", e))?;

    let saved_path = save_path.to_string_lossy().to_string();
    log!("📥 [Download] ✅ 完成: {} ({} bytes)", saved_path, downloaded);

    let _ = app.emit("download-complete", DownloadComplete {
        id: download_id.clone(),
        filename: final_filename,
        path: saved_path.clone(),
        size: downloaded,
    });

    Ok(DownloadResult {
        path: saved_path,
        size: downloaded,
        id: download_id,
    })
}

/// 用系统默认程序打开文件
#[tauri::command]
async fn open_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    open::that(&path).map_err(|e| format!("打开文件失败: {}", e))
}

/// 用系统文件管理器打开文件所在目录（并选中该文件）
#[tauri::command]
async fn open_file_folder(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let dir = if p.is_dir() {
        p.to_path_buf()
    } else {
        p.parent()
            .map(|d| d.to_path_buf())
            .ok_or_else(|| format!("无法获取父目录: {}", path))?
    };
    if !dir.exists() {
        return Err(format!("目录不存在: {}", dir.display()));
    }
    open::that(dir.to_string_lossy().as_ref())
        .map_err(|e| format!("打开目录失败: {}", e))
}

fn get_download_dir_path() -> Result<std::path::PathBuf, String> {
    dirs::download_dir()
        .or_else(|| {
            dirs::home_dir().map(|h| {
                let en = h.join("Downloads");
                if en.exists() { return en; }
                let zh = h.join("下载");
                if zh.exists() { return zh; }
                en
            })
        })
        .ok_or_else(|| "无法获取下载目录".to_string())
}

fn resolve_unique_path(dir: &std::path::Path, filename: &str) -> std::path::PathBuf {
    let mut path = dir.join(filename);
    let mut counter = 1u32;
    while path.exists() {
        let stem = std::path::Path::new(filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
        let ext = std::path::Path::new(filename)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let new_name = if ext.is_empty() {
            format!("{} ({})", stem, counter)
        } else {
            format!("{} ({}).{}", stem, counter, ext)
        };
        path = dir.join(new_name);
        counter += 1;
    }
    path
}

fn parse_download_filename(resp: &reqwest::Response, hint: Option<&str>, url: &str) -> String {
    // 1. Content-Disposition
    if let Some(cd) = resp.headers().get("content-disposition") {
        if let Ok(cd_str) = cd.to_str() {
            if let Some(name) = extract_filename_from_cd(cd_str) {
                return name;
            }
        }
    }
    // 2. JS 端提供的 filename hint
    if let Some(h) = hint {
        if !h.is_empty() && h != "download" {
            return add_extension_if_needed(h, resp);
        }
    }
    // 3. 从 URL 路径提取
    if let Some(segment) = url.split('?').next().and_then(|u| u.split('/').last()) {
        if let Ok(decoded) = urlencoding::decode(segment) {
            let name = decoded.to_string();
            if !name.is_empty() && name != "/" {
                return add_extension_if_needed(&name, resp);
            }
        }
    }
    // 4. 兜底
    let ext = guess_extension_from_response(resp);
    format!("download{}", ext)
}

fn add_extension_if_needed(name: &str, resp: &reqwest::Response) -> String {
    let has_ext = std::path::Path::new(name)
        .extension()
        .map(|e| {
            let s = e.to_string_lossy();
            !s.is_empty() && s.len() <= 10
        })
        .unwrap_or(false);
    if has_ext {
        return name.to_string();
    }
    let ext = guess_extension_from_response(resp);
    format!("{}{}", name.trim_end_matches('.'), ext)
}

fn extract_filename_from_cd(cd: &str) -> Option<String> {
    // filename*= (RFC 5987)
    if let Some(pos) = cd.find("filename*=") {
        let rest = &cd[pos + 10..];
        let value = rest.split(';').next().unwrap_or("").trim();
        let encoded = value
            .strip_prefix("UTF-8''")
            .or_else(|| value.strip_prefix("utf-8''"));
        if let Some(encoded) = encoded {
            if let Ok(decoded) = urlencoding::decode(encoded) {
                let name = decoded.to_string();
                if !name.is_empty() {
                    return Some(name);
                }
            }
        }
    }
    // filename=
    if let Some(pos) = cd.find("filename=") {
        let rest = &cd[pos + 9..];
        let value = rest.split(';').next().unwrap_or("").trim();
        let unquoted = value.trim_matches('"').trim_matches('\'');
        if let Ok(decoded) = urlencoding::decode(unquoted) {
            let name = decoded.to_string();
            if !name.is_empty() {
                return Some(name);
            }
        } else if !unquoted.is_empty() {
            return Some(unquoted.to_string());
        }
    }
    None
}

fn guess_extension_from_response(resp: &reqwest::Response) -> &'static str {
    let ct = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();
    guess_extension(&ct)
}

fn guess_extension(ct: &str) -> &'static str {
    if ct.contains("spreadsheetml") || ct.contains("excel") || ct.contains("spreadsheet") {
        ".xlsx"
    } else if ct.contains("vnd.ms-excel") {
        ".xlsx"
    } else if ct.contains("csv") {
        ".csv"
    } else if ct.contains("pdf") {
        ".pdf"
    } else if ct.contains("zip") {
        ".zip"
    } else if ct.contains("rar") {
        ".rar"
    } else if ct.contains("json") {
        ".json"
    } else if ct.contains("xml") {
        ".xml"
    } else if ct.contains("text/plain") {
        ".txt"
    } else if ct.contains("msword") || ct.contains("wordprocessingml") {
        ".docx"
    } else if ct.contains("presentationml") || ct.contains("powerpoint") {
        ".pptx"
    } else {
        ".bin"
    }
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
            create_new_window,
            get_download_dir,
            get_os_type,
            save_file_to_downloads,
            download_file,
            open_file,
            open_file_folder
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
