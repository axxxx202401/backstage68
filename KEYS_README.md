# RSA 密钥说明

## 密钥对生成

已生成 2048 位 RSA 密钥对：

- **公钥**：`public_key.pem`（已嵌入到 Tauri 应用中）
- **私钥**：`private_key.pem`（⚠️ **仅用于 Java 后端，严禁泄露！**）

## Java 后端解密示例

### 1. 添加依赖（Maven）

```xml
<dependency>
    <groupId>org.bouncycastle</groupId>
    <artifactId>bcprov-jdk15on</artifactId>
    <version>1.70</version>
</dependency>
```

### 2. 解密验证代码

```java
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import javax.crypto.Cipher;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;

public class TauriRequestValidator {
    
    private static PrivateKey privateKey;
    
    static {
        try {
            Security.addProvider(new BouncyCastleProvider());
            // 读取私钥文件（部署时放到安全位置）
            String privateKeyPEM = new String(Files.readAllBytes(Paths.get("private_key.pem")))
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
            
            byte[] encoded = Base64.getDecoder().decode(privateKeyPEM);
            PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(encoded);
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            privateKey = keyFactory.generatePrivate(keySpec);
        } catch (Exception e) {
            throw new RuntimeException("Failed to load private key", e);
        }
    }
    
    /**
     * 验证 Tauri 客户端请求
     * @param encryptedSignature X-Client-Signature 头的值（Base64）
     * @param timestamp X-Timestamp 头的值
     * @param fingerprint X-Device-Fingerprint 头的值
     * @param requestUrl 请求的 URL
     * @return true 表示验证通过
     */
    public static boolean validateRequest(
            String encryptedSignature, 
            String timestamp, 
            String fingerprint, 
            String requestUrl) {
        
        try {
            // 1. 解密签名
            byte[] encryptedBytes = Base64.getDecoder().decode(encryptedSignature);
            Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
            cipher.init(Cipher.DECRYPT_MODE, privateKey);
            byte[] decryptedBytes = cipher.doFinal(encryptedBytes);
            String decryptedData = new String(decryptedBytes);
            
            // 2. 解析签名数据：timestamp|fingerprint|url_hash
            String[] parts = decryptedData.split("\\|");
            if (parts.length != 3) {
                return false;
            }
            
            String signTimestamp = parts[0];
            String signFingerprint = parts[1];
            String signUrlHash = parts[2];
            
            // 3. 验证时间戳（防重放攻击，允许 5 分钟误差）
            long requestTime = Instant.parse(signTimestamp).toEpochMilli();
            long currentTime = System.currentTimeMillis();
            if (Math.abs(currentTime - requestTime) > 5 * 60 * 1000) {
                return false; // 时间戳过期
            }
            
            // 4. 验证设备指纹是否匹配
            if (!fingerprint.equals(signFingerprint)) {
                return false;
            }
            
            // 5. 验证 URL 哈希（可选）
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String urlHash = bytesToHex(digest.digest(requestUrl.getBytes())).substring(0, 16);
            if (!urlHash.equals(signUrlHash)) {
                return false;
            }
            
            // 6. 可选：检查设备指纹白名单（从数据库查询）
            // if (!isDeviceWhitelisted(fingerprint)) {
            //     return false;
            // }
            
            return true;
            
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }
    
    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
```

### 3. Spring Boot 拦截器

```java
@Component
public class TauriClientInterceptor implements HandlerInterceptor {
    
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String signature = request.getHeader("X-Client-Signature");
        String timestamp = request.getHeader("X-Timestamp");
        String fingerprint = request.getHeader("X-Device-Fingerprint");
        
        if (signature == null || timestamp == null || fingerprint == null) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            return false;
        }
        
        String requestUrl = request.getRequestURL().toString();
        
        if (!TauriRequestValidator.validateRequest(signature, timestamp, fingerprint, requestUrl)) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            return false;
        }
        
        return true;
    }
}
```

## ⚠️ 安全注意事项

1. **私钥保护**：
   - `private_key.pem` 必须仅保存在服务端
   - 部署时放到安全目录（如 `/etc/secrets/`）
   - 设置文件权限 `chmod 600 private_key.pem`

2. **时间戳验证**：
   - 防止重放攻击
   - 建议允许误差 ≤ 5 分钟

3. **设备指纹白名单**（可选）：
   - 将合法设备的 fingerprint 保存到数据库
   - 拒绝未注册设备的访问

4. **密钥轮换**：
   - 定期更换密钥对（如每 6 个月）
   - 使用环境变量或配置中心管理

