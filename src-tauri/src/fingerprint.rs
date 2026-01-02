use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::process::Command;

/// 设备详细信息结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    /// 设备唯一ID（Windows设备ID / macOS IOPlatformUUID / Linux machine-id）
    pub device_id: String,
    /// 设备名称（主机名）
    pub device_name: String,
    /// 操作系统名称
    pub os: String,
    /// 操作系统版本
    pub os_version: String,
    /// CPU 型号
    pub cpu: String,
    /// MAC 地址
    pub mac_address: String,
    /// 内网IP地址
    pub local_ip: String,
    /// 内存大小（可选）
    pub memory: Option<String>,
}

/// 获取系统级硬件 UUID
/// - macOS: IOPlatformUUID (硬件级，重置系统也不变)
/// - Windows: BIOS UUID 或主板序列号
/// - Linux: /etc/machine-id 或 DMI 信息
fn get_system_uuid() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        // macOS: 使用 ioreg 获取 IOPlatformUUID
        let output = Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
            .ok()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains("IOPlatformUUID") {
                // 提取 UUID 值: "IOPlatformUUID" = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                if let Some(start) = line.rfind('"') {
                    let end_part = &line[..start];
                    if let Some(quote_start) = end_part.rfind('"') {
                        let uuid = &line[quote_start + 1..start];
                        if !uuid.is_empty() {
                            return Some(uuid.to_string());
                        }
                    }
                }
            }
        }
        None
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: 使用 wmic 获取 BIOS UUID
        let output = Command::new("wmic")
            .args(["csproduct", "get", "UUID"])
            .output()
            .ok()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(1) {
            let uuid = line.trim();
            if !uuid.is_empty() && uuid != "UUID" {
                return Some(uuid.to_string());
            }
        }

        // 备选: 获取主板序列号
        let output = Command::new("wmic")
            .args(["baseboard", "get", "serialnumber"])
            .output()
            .ok()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(1) {
            let serial = line.trim();
            if !serial.is_empty() && serial != "SerialNumber" {
                return Some(serial.to_string());
            }
        }
        None
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: 优先读取 /etc/machine-id
        if let Ok(content) = std::fs::read_to_string("/etc/machine-id") {
            let id = content.trim();
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }

        // 备选: 读取 /var/lib/dbus/machine-id
        if let Ok(content) = std::fs::read_to_string("/var/lib/dbus/machine-id") {
            let id = content.trim();
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }

        // 备选: 读取 DMI product_uuid (需要 root 权限)
        if let Ok(content) = std::fs::read_to_string("/sys/class/dmi/id/product_uuid") {
            let id = content.trim();
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }

        None
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        None
    }
}

/// 获取第一个物理网卡的 MAC 地址
fn get_mac_address() -> Option<String> {
    mac_address::get_mac_address()
        .ok()
        .flatten()
        .map(|mac| mac.to_string())
}

/// 获取 CPU 信息作为辅助标识
fn get_cpu_info() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
            .ok()?;
        let info = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !info.is_empty() {
            return Some(info);
        }
        None
    }

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("wmic")
            .args(["cpu", "get", "processorid"])
            .output()
            .ok()?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(1) {
            let id = line.trim();
            if !id.is_empty() && id != "ProcessorId" {
                return Some(id.to_string());
            }
        }
        None
    }

    #[cfg(target_os = "linux")]
    {
        // 读取 /proc/cpuinfo 获取 CPU 信息
        if let Ok(content) = std::fs::read_to_string("/proc/cpuinfo") {
            for line in content.lines() {
                if line.starts_with("model name") || line.starts_with("Serial") {
                    if let Some(value) = line.split(':').nth(1) {
                        let info = value.trim();
                        if !info.is_empty() {
                            return Some(info.to_string());
                        }
                    }
                }
            }
        }
        None
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        None
    }
}

/// 获取硬盘序列号（作为额外的硬件标识）
fn get_disk_serial() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("system_profiler")
            .args(["SPSerialATADataType", "-json"])
            .output()
            .ok()?;
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        // 简单提取，查找 serial_number 字段
        if let Some(pos) = stdout.find("serial_number") {
            let rest = &stdout[pos..];
            if let Some(start) = rest.find(": \"") {
                let value_start = &rest[start + 3..];
                if let Some(end) = value_start.find('"') {
                    let serial = &value_start[..end];
                    if !serial.is_empty() {
                        return Some(serial.to_string());
                    }
                }
            }
        }
        None
    }

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("wmic")
            .args(["diskdrive", "get", "serialnumber"])
            .output()
            .ok()?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(1) {
            let serial = line.trim();
            if !serial.is_empty() && serial != "SerialNumber" {
                return Some(serial.to_string());
            }
        }
        None
    }

    #[cfg(target_os = "linux")]
    {
        // 尝试读取第一个硬盘的序列号
        if let Ok(entries) = std::fs::read_dir("/dev/disk/by-id") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                // 优先选择 ata 或 nvme 开头的（物理硬盘）
                if name.starts_with("ata-") || name.starts_with("nvme-") {
                    return Some(name);
                }
            }
        }
        None
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        None
    }
}

/// 获取操作系统名称
fn get_os_name() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("sw_vers").arg("-productName").output() {
            let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !name.is_empty() {
                return name;
            }
        }
        "macOS".to_string()
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("wmic")
            .args(["os", "get", "Caption"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                let name = line.trim();
                if !name.is_empty() && name != "Caption" {
                    return name.to_string();
                }
            }
        }
        "Windows".to_string()
    }

    #[cfg(target_os = "linux")]
    {
        // 读取 /etc/os-release
        if let Ok(content) = std::fs::read_to_string("/etc/os-release") {
            for line in content.lines() {
                if line.starts_with("PRETTY_NAME=") {
                    let value = line.trim_start_matches("PRETTY_NAME=").trim_matches('"');
                    if !value.is_empty() {
                        return value.to_string();
                    }
                }
            }
        }
        "Linux".to_string()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        std::env::consts::OS.to_string()
    }
}

/// 获取操作系统版本
fn get_os_version() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("sw_vers").arg("-productVersion").output() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !version.is_empty() {
                return version;
            }
        }
        "unknown".to_string()
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("wmic")
            .args(["os", "get", "Version"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                let version = line.trim();
                if !version.is_empty() && version != "Version" {
                    return version.to_string();
                }
            }
        }
        "unknown".to_string()
    }

    #[cfg(target_os = "linux")]
    {
        // 读取 /etc/os-release
        if let Ok(content) = std::fs::read_to_string("/etc/os-release") {
            for line in content.lines() {
                if line.starts_with("VERSION_ID=") {
                    let value = line.trim_start_matches("VERSION_ID=").trim_matches('"');
                    if !value.is_empty() {
                        return value.to_string();
                    }
                }
            }
        }
        // 备选：使用 uname
        if let Ok(output) = Command::new("uname").arg("-r").output() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !version.is_empty() {
                return version;
            }
        }
        "unknown".to_string()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "unknown".to_string()
    }
}

/// 获取 CPU 名称（用于显示）
fn get_cpu_name() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
        {
            let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !name.is_empty() {
                return name;
            }
        }
        "unknown".to_string()
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("wmic")
            .args(["cpu", "get", "Name"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                let name = line.trim();
                if !name.is_empty() && name != "Name" {
                    return name.to_string();
                }
            }
        }
        "unknown".to_string()
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = std::fs::read_to_string("/proc/cpuinfo") {
            for line in content.lines() {
                if line.starts_with("model name") {
                    if let Some(value) = line.split(':').nth(1) {
                        let name = value.trim();
                        if !name.is_empty() {
                            return name.to_string();
                        }
                    }
                }
            }
        }
        "unknown".to_string()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "unknown".to_string()
    }
}

/// 获取设备名称（主机名）
fn get_device_name() -> String {
    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "unknown".to_string())
}

/// 获取本机内网IP地址
fn get_local_ip() -> String {
    #[cfg(target_os = "macos")]
    {
        // macOS: 使用 ipconfig getifaddr en0 获取有线网卡IP，或 en1 获取无线网卡IP
        for interface in &["en0", "en1", "en2", "en3"] {
            if let Ok(output) = Command::new("ipconfig")
                .args(["getifaddr", interface])
                .output()
            {
                let ip = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !ip.is_empty() && (ip.starts_with("192.") || ip.starts_with("10.") || ip.starts_with("172.")) {
                    return ip;
                }
            }
        }
        // 备选：解析 ifconfig 输出
        if let Ok(output) = Command::new("ifconfig").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("inet ") && !line.contains("127.0.0.1") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if let Some(idx) = parts.iter().position(|&x| x == "inet") {
                        if let Some(ip) = parts.get(idx + 1) {
                            if ip.starts_with("192.") || ip.starts_with("10.") || ip.starts_with("172.") {
                                return ip.to_string();
                            }
                        }
                    }
                }
            }
        }
        "unknown".to_string()
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: 使用 ipconfig 获取内网IP
        if let Ok(output) = Command::new("ipconfig").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("IPv4") || line.contains("IP Address") {
                    if let Some(ip_part) = line.split(':').nth(1) {
                        let ip = ip_part.trim();
                        if ip.starts_with("192.") || ip.starts_with("10.") || ip.starts_with("172.") {
                            return ip.to_string();
                        }
                    }
                }
            }
        }
        "unknown".to_string()
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: 使用 hostname -I 获取内网IP
        if let Ok(output) = Command::new("hostname").arg("-I").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for ip in stdout.split_whitespace() {
                if ip.starts_with("192.") || ip.starts_with("10.") || ip.starts_with("172.") {
                    return ip.to_string();
                }
            }
            if let Some(ip) = stdout.split_whitespace().next() {
                return ip.to_string();
            }
        }
        // 备选：使用 ip addr
        if let Ok(output) = Command::new("ip").args(["addr", "show"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("inet ") && !line.contains("127.0.0.1") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if let Some(idx) = parts.iter().position(|&x| x == "inet") {
                        if let Some(ip_cidr) = parts.get(idx + 1) {
                            let ip = ip_cidr.split('/').next().unwrap_or("");
                            if ip.starts_with("192.") || ip.starts_with("10.") || ip.starts_with("172.") {
                                return ip.to_string();
                            }
                        }
                    }
                }
            }
        }
        "unknown".to_string()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "unknown".to_string()
    }
}

/// 获取完整的设备信息
/// 返回包含设备ID、名称、操作系统、CPU、MAC地址等信息的结构体
pub fn get_device_info() -> DeviceInfo {
    DeviceInfo {
        device_id: get_system_uuid().unwrap_or_else(|| "unknown".to_string()),
        device_name: get_device_name(),
        os: get_os_name(),
        os_version: get_os_version(),
        cpu: get_cpu_name(),
        mac_address: get_mac_address().unwrap_or_else(|| "unknown".to_string()),
        local_ip: get_local_ip(),
        memory: None, // 可选，暂不实现
    }
}

/// 获取设备信息的 JSON 字符串
pub fn get_device_info_json() -> String {
    let info = get_device_info();
    serde_json::to_string(&info).unwrap_or_else(|_| "{}".to_string())
}

/// 生成稳定的设备指纹
/// 基于多个硬件信息组合生成 SHA256 哈希，确保重启/重置后保持一致
pub fn get_device_fingerprint() -> String {
    let mut hasher = Sha256::new();
    let mut components: Vec<String> = Vec::new();

    // 1. 系统 UUID (最重要，通常固化在 BIOS/固件中)
    if let Some(uuid) = get_system_uuid() {
        components.push(format!("SYS:{}", uuid));
        hasher.update(uuid.as_bytes());
    }

    // 2. MAC 地址 (网卡物理地址，固化在硬件中)
    if let Some(mac) = get_mac_address() {
        components.push(format!("MAC:{}", mac));
        hasher.update(mac.as_bytes());
    }

    // 3. CPU 信息 (作为辅助标识)
    if let Some(cpu) = get_cpu_info() {
        components.push(format!("CPU:{}", cpu));
        hasher.update(cpu.as_bytes());
    }

    // 4. 硬盘序列号 (作为额外标识)
    if let Some(disk) = get_disk_serial() {
        components.push(format!("DISK:{}", disk));
        hasher.update(disk.as_bytes());
    }

    // 如果所有硬件信息都获取失败，使用备用方案
    if components.is_empty() {
        // 使用主机名 + 用户名 + 系统信息作为最后的备选
        let hostname = hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "unknown".to_string());
        
        let username = std::env::var("USER")
            .or_else(|_| std::env::var("USERNAME"))
            .unwrap_or_else(|_| "unknown".to_string());
        
        let os_info = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
        
        hasher.update(hostname.as_bytes());
        hasher.update(username.as_bytes());
        hasher.update(os_info.as_bytes());
        
        components.push(format!("FALLBACK:{}:{}:{}", hostname, username, os_info));
    }

    // 生成最终的指纹哈希
    let hash = format!("{:x}", hasher.finalize());
    
    // 返回格式：前16位作为短ID + 完整哈希
    // 这样既有可读性又有完整的唯一性
    let short_id = &hash[..16];
    format!("{}:{}", short_id, hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fingerprint_consistency() {
        // 测试指纹的一致性：多次调用应该返回相同的结果
        let fp1 = get_device_fingerprint();
        let fp2 = get_device_fingerprint();
        assert_eq!(fp1, fp2, "指纹应该保持一致");
    }

    #[test]
    fn test_fingerprint_format() {
        let fp = get_device_fingerprint();
        // 检查格式：短ID:完整哈希
        assert!(fp.contains(':'), "指纹应该包含冒号分隔符");
        let parts: Vec<&str> = fp.split(':').collect();
        assert_eq!(parts.len(), 2, "指纹应该有两部分");
        assert_eq!(parts[0].len(), 16, "短ID应该是16个字符");
        assert_eq!(parts[1].len(), 64, "完整哈希应该是64个字符 (SHA256)");
    }

    #[test]
    fn test_hardware_info_collection() {
        // 测试至少能获取到一些硬件信息
        let has_uuid = get_system_uuid().is_some();
        let has_mac = get_mac_address().is_some();
        let has_cpu = get_cpu_info().is_some();
        let has_disk = get_disk_serial().is_some();
        
        println!("System UUID: {}", has_uuid);
        println!("MAC Address: {}", has_mac);
        println!("CPU Info: {}", has_cpu);
        println!("Disk Serial: {}", has_disk);
        
        // 至少应该能获取到 MAC 地址或系统 UUID
        assert!(
            has_uuid || has_mac,
            "应该至少能获取到系统UUID或MAC地址"
        );
    }

    #[test]
    fn test_device_info() {
        // 测试获取设备详细信息
        let info = get_device_info();
        
        println!("\n📱 设备详细信息:");
        println!("   设备ID: {}", info.device_id);
        println!("   设备名称: {}", info.device_name);
        println!("   操作系统: {}", info.os);
        println!("   系统版本: {}", info.os_version);
        println!("   CPU: {}", info.cpu);
        println!("   MAC地址: {}", info.mac_address);
        println!("   内网IP: {}", info.local_ip);
        
        // 验证 JSON 序列化
        let json = get_device_info_json();
        println!("\n📦 JSON 格式:\n{}", json);
        
        // 验证必要字段不为空
        assert!(!info.device_id.is_empty() || info.device_id == "unknown", "设备ID不应为空");
        assert!(!info.device_name.is_empty(), "设备名称不应为空");
        assert!(!info.os.is_empty(), "操作系统不应为空");
    }
}
