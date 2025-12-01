/// 安全检测模块
/// 包含反调试、虚拟机检测、环境安全评分等功能
use std::process::Command;

/// 安全评分（0-100）
pub struct SecurityScore {
    pub score: u8,
    pub is_debugger: bool,
    pub is_vm: bool,
    pub is_modified: bool,
}

/// 计算环境安全评分
pub fn calculate_security_score() -> SecurityScore {
    let mut score = 100u8;
    let mut is_debugger = false;
    let mut is_vm = false;
    let is_modified = false;

    // 检测调试器（-30分）
    if !check_debugger() {
        score = score.saturating_sub(30);
        is_debugger = true;
    }

    // 检测虚拟机（-20分）
    if !check_vm() {
        score = score.saturating_sub(20);
        is_vm = true;
    }

    // 检测异常环境指标（-10分）
    if !check_environment_indicators() {
        score = score.saturating_sub(10);
    }

    SecurityScore {
        score,
        is_debugger,
        is_vm,
        is_modified,
    }
}

/// 检测是否被调试器附加
fn check_debugger() -> bool {
    #[cfg(target_os = "macos")]
    {
        // macOS: 使用 sysctl 检测 P_TRACED 标志
        match Command::new("sysctl")
            .args(&["-n", "kern.proc.pid", &std::process::id().to_string()])
            .output()
        {
            Ok(output) => {
                let result = String::from_utf8_lossy(&output.stdout);
                // 如果包含 P_TRACED，说明被调试
                !result.contains("P_TRACED")
            }
            Err(_) => true, // 检测失败，假定安全
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        true // 其他平台假定安全
    }
}

/// 检测是否在虚拟机中运行
fn check_vm() -> bool {
    #[cfg(target_os = "macos")]
    {
        // 检查 MAC 地址特征
        match Command::new("ifconfig").output() {
            Ok(output) => {
                let text = String::from_utf8_lossy(&output.stdout);
                // VirtualBox: 08:00:27
                // VMware: 00:0c:29, 00:50:56, 00:05:69
                // Parallels: 00:1c:42
                !(text.contains("08:00:27")
                    || text.contains("00:0c:29")
                    || text.contains("00:50:56")
                    || text.contains("00:1c:42"))
            }
            Err(_) => true,
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// 检测其他环境指标
fn check_environment_indicators() -> bool {
    // 检查进程数量（VM 中通常进程较少）
    // 检查运行时间（刚启动的环境可疑）
    // 这里简化处理
    true
}

/// 根据安全评分决定安全级别
#[derive(Debug, PartialEq)]
pub enum SecurityLevel {
    Safe,    // 90-100: 完全安全
    Warning, // 70-89:  可疑
    Danger,  // 0-69:   危险
}

impl SecurityScore {
    pub fn level(&self) -> SecurityLevel {
        match self.score {
            90..=100 => SecurityLevel::Safe,
            70..=89 => SecurityLevel::Warning,
            _ => SecurityLevel::Danger,
        }
    }
}
