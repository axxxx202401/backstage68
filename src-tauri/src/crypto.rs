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

/// 内置的 RSA 公钥（PEM 格式）
/// 注意：对应的私钥保存在项目根目录 private_key.pem，仅用于服务端解密
const PUBLIC_KEY_PEM: &str = r#"-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAno05F7QiOpyW1r3xuqLY
Xk192G/EZwKYCfIK66Einx5DSdjT4Bg4I2gXZ+tHuXdKe+TNwov3WK1auStMRqOV
mecNjMwfMnnxelUmbU6y09tZeTjbb17zw30QCb4MRww7coktoWKqaXpMr5z9FzAX
gIsRhxSqzftc/zD5FuwqXkwtM85Gj6v+/ruIzpd80hWkTZP0JvQOh/iT4O8XYvDO
ACQJRQCRIyHoESM6ZhT6CneMpVh3dtdBVhjlXQIrtxx0rdEYglSYA2J+CRkUv+8J
SDM3sw7Zh4l/izYEVNVI8jFuWo7eZg+1gmQw5mrK17TGYR48QXMBes4sSTy8bPgK
WwIDAQAB
-----END PUBLIC KEY-----"#;

/// 使用 RSA 公钥加密签名数据
pub fn encrypt_signature(data: &str) -> Result<String, String> {
    // 解析公钥
    let public_key = RsaPublicKey::from_public_key_pem(PUBLIC_KEY_PEM)
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
    
    // 路径哈希
    let mut hasher = Sha256::new();
    hasher.update(final_path.as_bytes());
    let path_hash = format!("{:x}", hasher.finalize());
    
    // 组合签名数据
    format!("{}|{}|{}", timestamp, fingerprint, &path_hash[..16])
}

