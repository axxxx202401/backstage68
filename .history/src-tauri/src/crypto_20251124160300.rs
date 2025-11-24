use rsa::{RsaPublicKey, Pkcs1v15Encrypt};
use rsa::pkcs8::DecodePublicKey;
use base64::{Engine as _, engine::general_purpose};

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
/// 格式：timestamp|device_fingerprint|url_hash
pub fn generate_signature_data(timestamp: &str, fingerprint: &str, url: &str) -> String {
    use sha2::{Sha256, Digest};
    
    // URL 哈希（避免暴露完整 URL）
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    let url_hash = format!("{:x}", hasher.finalize());
    
    // 组合签名数据
    format!("{}|{}|{}", timestamp, fingerprint, &url_hash[..16])
}

