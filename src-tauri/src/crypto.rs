use rsa::{RsaPublicKey, Pkcs1v15Encrypt};
use rsa::pkcs8::DecodePublicKey;
use base64::{Engine as _, engine::general_purpose};

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

// 日志宏
macro_rules! log {
    ($($arg:tt)*) => {
        if ENABLE_LOGS {
            println!($($arg)*);
        }
    };
}

/// 真实的 RSA 公钥（正常环境使用）
const REAL_PUBLIC_KEY: &str = r#"-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAno05F7QiOpyW1r3xuqLY
Xk192G/EZwKYCfIK66Einx5DSdjT4Bg4I2gXZ+tHuXdKe+TNwov3WK1auStMRqOV
mecNjMwfMnnxelUmbU6y09tZeTjbb17zw30QCb4MRww7coktoWKqaXpMr5z9FzAX
gIsRhxSqzftc/zD5FuwqXkwtM85Gj6v+/ruIzpd80hWkTZP0JvQOh/iT4O8XYvDO
ACQJRQCRIyHoESM6ZhT6CneMpVh3dtdBVhjlXQIrtxx0rdEYglSYA2J+CRkUv+8J
SDM3sw7Zh4l/izYEVNVI8jFuWo7eZg+1gmQw5mrK17TGYR48QXMBes4sSTy8bPgK
WwIDAQAB
-----END PUBLIC KEY-----"#;

/// 假公钥（异常环境使用）
const FAKE_PUBLIC_KEY: &str = r#"-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyQx8VvFzlXmD5TQaFwL3
kH9rG4JzPxE2Yn6tKp8mN3QhF7vRsB2pW9kXyT4mL6nH8rJ3dF5sQ2wE9tK7mP4v
L8nR6sT2xH5vK9wP3rE7qF4tJ8mD2nY5sL6vX9rT3wP4nH7qJ5sR2yK8vL3nP9wF
6rE5tQ2xL7vK9sP4mH8rJ3nD5wL2yE6vT9sK3nP7wF4rH5qJ2xL8vT3sP6nK9wE5
rJ7tQ2wH4vL8mP3nD9sF2yE6rT5wK7vJ3xL9sP4nH8qR2wE5vK3tJ7mP9wF6rL2x
H4vT8sP3nD6wK5yE9rJ2wL7vQ3xH8mP4nF5sR6wJ9tL2yE3vK7xP8mD4nH5rQ2wF
6wIDAQAB
-----END PUBLIC KEY-----"#;

/// 降级公钥（可疑环境使用）
const DEGRADED_PUBLIC_KEY: &str = r#"-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp7TxR5vK2mL8wN3hF9qJ
4tE6sY8vP3nL7wK5rJ2xH4mT9sD6nP8wF5rL3yE7vK4tQ2xJ8mH5sP3nD9wF2yR6
vT5wK7nJ3xL9sP4mH8qR2wE5vK3tJ7mP9wF6rL2xH4vT8sP3nD6wK5yE9rJ2wL7v
Q3xH8mP4nF5sR6wJ9tL2yE3vK7xP8mD4nH5rQ2wF6tE9sL3vK7xP4mH8nD5wR2yJ
6vT3sK9wF5rL7xE2vQ4tJ8mH6sP3nD9wF2yR5vT6wK7nJ3xL8sP4mH9qR2wE5vK
4tJ7mP9wF6rL2xH5vT8sP3nD6wK5yE9rJ2wL7vQ3xH8mP4nF5sR6wJ9tL2yE3vK7
xwIDAQAB
-----END PUBLIC KEY-----"#;

/// 根据环境安全评分选择公钥
fn select_public_key() -> &'static str {
    use crate::security::{calculate_security_score, SecurityLevel};
    
    let score = calculate_security_score();
    
    log!("🔒 Security Check - Score: {}, Debugger: {}, VM: {}", 
        score.score, score.is_debugger, score.is_vm);
    
    match score.level() {
        SecurityLevel::Safe => {
            log!("✅ Environment: SAFE - Using real key");
            REAL_PUBLIC_KEY
        }
        SecurityLevel::Warning => {
            log!("⚠️  Environment: WARNING - Using degraded key");
            DEGRADED_PUBLIC_KEY
        }
        SecurityLevel::Danger => {
            log!("❌ Environment: DANGER - Using fake key");
            FAKE_PUBLIC_KEY
        }
    }
}

/// 使用 RSA 公钥加密签名数据（动态选择公钥）
pub fn encrypt_signature(data: &str) -> Result<String, String> {
    // 动态选择公钥
    let public_key_pem = select_public_key();
    
    // 解析公钥
    let public_key = RsaPublicKey::from_public_key_pem(public_key_pem)
        .map_err(|e| format!("Failed to parse public key: {}", e))?;
    
    // 加密数据
    let mut rng = rand::thread_rng();
    let encrypted = public_key.encrypt(&mut rng, Pkcs1v15Encrypt, data.as_bytes())
        .map_err(|e| format!("Failed to encrypt: {}", e))?;
    
    // Base64 编码
    Ok(general_purpose::STANDARD.encode(&encrypted))
}

/// 生成验证签名数据
/// 格式：timestamp|device_fingerprint|path_hash
/// 注意：Nginx 会去掉 /base_api 前缀，所以我们也要去掉再哈希
pub fn generate_signature_data(timestamp: &str, fingerprint: &str, url: &str) -> String {
    use sha2::{Sha256, Digest};
    
    // 提取路径并去掉 /base_api 前缀（因为 Nginx 会去掉）
    let path_to_hash = if let Some(idx) = url.find("/base_api/") {
        // 找到 /base_api/，取后面的部分（包括开头的 /）
        &url[idx + 9..]  // "/base_api" 是 9 个字符
    } else if let Some(_idx) = url.find("/base_api") {
        // 如果是 /base_api 结尾（无斜杠）
        "/"
    } else {
        // 没有 /base_api，直接用原 URL
        url
    };
    
    // 确保以 / 开头
    let final_path = if path_to_hash.starts_with('/') {
        path_to_hash.to_string()
    } else {
        format!("/{}", path_to_hash)
    };
    
    log!("   📝 Path for hashing (after removing /base_api): {}", final_path);
    
    // URL 解码（Java 的 URI.getPath() 和 getQuery() 会自动解码）
    let decoded_path = urlencoding::decode(&final_path)
        .unwrap_or(std::borrow::Cow::Borrowed(&final_path))
        .to_string();
    
    log!("   📝 Decoded path: {}", decoded_path);
    
    // 路径哈希
    let mut hasher = Sha256::new();
    hasher.update(decoded_path.as_bytes());
    let path_hash = format!("{:x}", hasher.finalize());
    
    // 组合签名数据
    format!("{}|{}|{}", timestamp, fingerprint, &path_hash[..16])
}

