# 加密验证测试

## 从日志提取的数据

### 登录请求示例
```
📍 URL: POST http://test-otc.68chat.co/base_api/login
📝 Signature Data: 2025-11-24T07:50:26.719031+00:00|18260dcf-8e59-4f12-b7eb-e9a26539c0a9:7baa6ebd603597d9d73f64e79aaf27447bb8d1143943b180059785c25341d5c3|a25c099f95c32532
🔒 Encrypted Signature: h0xAYX6ktuOwSpgRpu5t5qDdQnYyXK5FvvJsXw7RGyOCAI6nbrDABtwDq55dwFnbYBAeRz5pjbWnzOG2Lld17QH8EmNdrQvtHwUVCEwXgJk8VqDaINJUx8w74pzYMv5KLSTaOcWvw2WqRpvZ14fD+C5/oRdvBv7dbdb/u5TCd7z48ijLkEic/CGc5uGpnR5RgLEqfdDyXTxTdCNcbWHOj9FQSiwn3VZ+G1E7okyduvaUnwYg9EATkTy1l6Rzf4Yq4JMFBv5U7hsfwduajfEzDNDD9w0JWZFsMv3RLzsJ4CaJHzwk83BnbvKGVdKmrksROTYbh/VRqhxtsF1Zv5whZg==

Headers:
   X-Client-Signature: h0xAYX6ktuOwSpgRpu5t5qDdQnYyXK5FvvJsXw7RGyOCAI6nbrDABtwDq55dwFnbYBAeRz5pjbWnzOG2Lld17QH8EmNdrQvtHwUVCEwXgJk8VqDaINJUx8w74pzYMv5KLSTaOcWvw2WqRpvZ14fD+C5/oRdvBv7dbdb/u5TCd7z48ijLkEic/CGc5uGpnR5RgLEqfdDyXTxTdCNcbWHOj9FQSiwn3VZ+G1E7okyduvaUnwYg9EATkTy1l6Rzf4Yq4JMFBv5U7hsfwduajfEzDNDD9w0JWZFsMv3RLzsJ4CaJHzwk83BnbvKGVdKmrksROTYbh/VRqhxtsF1Zv5whZg==
   X-Timestamp: 2025-11-24T07:50:26.719031+00:00
   X-Device-Fingerprint: 18260dcf-8e59-4f12-b7eb-e9a26539c0a9:7baa6ebd603597d9d73f64e79aaf27447bb8d1143943b180059785c25341d5c3

Response: 403 Forbidden
```

## Java 端验证步骤

Java 后端需要：
1. 接收请求头：`X-Client-Signature`, `X-Timestamp`, `X-Device-Fingerprint`
2. 使用私钥解密 `X-Client-Signature`
3. 解密后应得到：`2025-11-24T07:50:26.719031+00:00|18260dcf-8e59-4f12-b7eb-e9a26539c0a9:7baa6ebd603597d9d73f64e79aaf27447bb8d1143943b180059785c25341d5c3|a25c099f95c32532`
4. 验证：
   - 时间戳匹配
   - 设备指纹匹配
   - URL 哈希匹配（计算 `http://test-otc.68chat.co/base_api/login` 的 SHA256 前16位应该是 `a25c099f95c32532`）

## 可能的问题

1. **私钥不匹配** - Java 项目中的 `private_key.pem` 是否是最新的？
2. **URL 不一致** - Java 端拿到的 URL 可能是 `http://34.92.235.96/base_api/login` 而不是 `http://test-otc.68chat.co/base_api/login`
3. **解密失败** - RSA 解密抛出异常

## 建议

在 Java `SafeVerifyInterceptor` 中添加详细日志：
```java
log.info("收到请求: {}", getRequestUrl(request));
log.info("X-Client-Signature: {}", signature);
log.info("X-Timestamp: {}", timestamp);
log.info("X-Device-Fingerprint: {}", fingerprint);

try {
    String decrypted = decrypt(signature);
    log.info("解密成功: {}", decrypted);
} catch (Exception e) {
    log.error("解密失败", e);
}
```

