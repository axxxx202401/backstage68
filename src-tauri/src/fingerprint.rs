use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

/// 获取设备指纹存储路径
fn get_fingerprint_path() -> PathBuf {
    let mut path = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("backstage68");
    fs::create_dir_all(&path).ok();
    path.push("device_fingerprint.json");
    path
}

#[derive(Debug, Serialize, Deserialize)]
struct DeviceFingerprint {
    device_id: String,
    hardware_hash: String,
    created_at: String,
}

/// 生成硬件指纹（基于系统信息）
fn generate_hardware_hash() -> String {
    let mut hasher = Sha256::new();

    // 收集系统信息
    let hostname = hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "unknown".to_string());

    let username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "unknown".to_string());

    let os_info = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);

    // 组合信息生成哈希
    hasher.update(hostname.as_bytes());
    hasher.update(username.as_bytes());
    hasher.update(os_info.as_bytes());

    format!("{:x}", hasher.finalize())
}

/// 获取或生成设备指纹
pub fn get_device_fingerprint() -> String {
    let path = get_fingerprint_path();

    // 尝试读取已存在的指纹
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(fingerprint) = serde_json::from_str::<DeviceFingerprint>(&content) {
            // 返回格式：device_id:hardware_hash
            return format!("{}:{}", fingerprint.device_id, fingerprint.hardware_hash);
        }
    }

    // 生成新的指纹
    let device_id = Uuid::new_v4().to_string();
    let hardware_hash = generate_hardware_hash();
    let created_at = chrono::Utc::now().to_rfc3339();

    let fingerprint = DeviceFingerprint {
        device_id: device_id.clone(),
        hardware_hash: hardware_hash.clone(),
        created_at,
    };

    // 保存到文件
    if let Ok(json) = serde_json::to_string_pretty(&fingerprint) {
        let _ = fs::write(&path, json);
    }

    format!("{}:{}", device_id, hardware_hash)
}
