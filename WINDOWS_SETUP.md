# 🪟 Windows 打包环境配置指南

## 📋 前置要求

### 必需软件

1. **Node.js 18+**
2. **Rust**
3. **Visual Studio Build Tools**
4. **WiX Toolset 3.11+**（用于生成 .msi 安装包）

---

## 🔧 一键安装脚本

### 方法 1: 使用 Scoop（推荐）

```powershell
# 1. 安装 Scoop（如果还没有）
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# 2. 安装所有依赖
scoop install nodejs rust git

# 3. 安装 Visual Studio Build Tools
scoop install vcredist2022

# 4. 下载并安装 WiX Toolset
# 访问: https://github.com/wixtoolset/wix3/releases
# 下载: wix311.exe 并安装
```

### 方法 2: 使用 winget

```powershell
# 安装 Node.js
winget install OpenJS.NodeJS

# 安装 Rust
winget install Rustlang.Rust.MSVC

# 安装 Git
winget install Git.Git

# 安装 Visual Studio Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools
```

---

## 🛠️ 详细配置步骤

### 1. 安装 Node.js

**下载地址**: https://nodejs.org/

```powershell
# 验证安装
node --version
npm --version
```

应显示类似：
```
v18.17.0
9.6.7
```

### 2. 安装 Rust

**下载地址**: https://rustup.rs/

```powershell
# 下载并运行 rustup-init.exe
# 选择默认选项即可

# 验证安装
rustc --version
cargo --version
```

应显示类似：
```
rustc 1.75.0
cargo 1.75.0
```

### 3. 安装 Visual Studio Build Tools

**重要**：Rust 编译 C++ 代码需要 MSVC 工具链

#### 选项 A: 完整 Visual Studio（推荐）

**下载地址**: https://visualstudio.microsoft.com/downloads/

1. 下载 Visual Studio 2022 Community（免费）
2. 在安装程序中选择：
   - ✅ "Desktop development with C++"
   - ✅ "Windows 10/11 SDK"
3. 点击安装

#### 选项 B: 仅 Build Tools（轻量）

**下载地址**: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022

1. 下载 Build Tools for Visual Studio 2022
2. 安装时选择：
   - ✅ "C++ build tools"
   - ✅ "Windows 10/11 SDK"

### 4. 安装 WiX Toolset（制作 .msi）

**下载地址**: https://github.com/wixtoolset/wix3/releases

1. 下载 `wix311.exe`（或最新版本）
2. 运行安装程序
3. 安装到默认位置（通常是 `C:\Program Files (x86)\WiX Toolset v3.11\`）

```powershell
# 验证安装（需要重启终端）
candle -?
```

应显示 WiX Toolset 帮助信息。

如果找不到命令，手动添加到 PATH：
```powershell
$env:Path += ";C:\Program Files (x86)\WiX Toolset v3.11\bin"
```

---

## 📦 克隆项目并打包

### 1. 克隆项目

```powershell
# 克隆项目
git clone <your-repo-url>
cd backstage68

# 安装依赖
npm install
```

### 2. 使用打包脚本

```powershell
# 开发模式 - 测试环境
.\build.ps1 test -Dev

# 开发模式 - UAT环境
.\build.ps1 uat -Dev

# 打包 - 生产环境
.\build.ps1 prod

# 打包 - 测试环境
.\build.ps1 test
```

### 3. 手动打包（如果脚本有问题）

```powershell
# 加载环境变量
Get-Content env.prod | ForEach-Object {
    if ($_ -notmatch '^#' -and $_ -match '(.+)=(.+)') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

# 验证环境变量
Write-Host "TAURI_ENV_NAME: $env:TAURI_ENV_NAME"
Write-Host "TAURI_ENV_URL: $env:TAURI_ENV_URL"

# 打包
npm run tauri build
```

---

## 📁 打包输出位置

打包完成后，文件位于：

```
src-tauri\target\release\bundle\
├── msi\               # Windows Installer (.msi)
│   └── Backstage68_0.1.0_x64_en-US.msi
└── nsis\              # NSIS Installer (.exe) - 如果配置了
    └── Backstage68_0.1.0_x64-setup.exe
```

---

## 🚨 常见问题

### Q1: 找不到 `link.exe`

**错误信息**:
```
error: linker `link.exe` not found
```

**解决方案**:
- 安装 Visual Studio Build Tools
- 确保选择了 "Desktop development with C++"

### Q2: 找不到 `candle.exe` 或 `light.exe`

**错误信息**:
```
Error running candle.exe
```

**解决方案**:
- 安装 WiX Toolset
- 添加 WiX 到 PATH 环境变量
- 重启 PowerShell

### Q3: 权限不足

**错误信息**:
```
Cannot be loaded because running scripts is disabled
```

**解决方案**:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Q4: npm 安装失败

**解决方案**:
```powershell
# 清理缓存
npm cache clean --force

# 删除 node_modules
Remove-Item node_modules -Recurse -Force

# 重新安装
npm install
```

### Q5: 编译很慢

**优化方案**:
```powershell
# 使用国内镜像
[Environment]::SetEnvironmentVariable("RUSTUP_DIST_SERVER", "https://mirrors.ustc.edu.cn/rust-static", "User")
[Environment]::SetEnvironmentVariable("RUSTUP_UPDATE_ROOT", "https://mirrors.ustc.edu.cn/rust-static/rustup", "User")
```

---

## ✅ 验证环境配置

运行此脚本检查所有依赖：

```powershell
# 检查 Node.js
Write-Host "Node.js:" -NoNewline
node --version

# 检查 npm
Write-Host "npm:" -NoNewline
npm --version

# 检查 Rust
Write-Host "Rust:" -NoNewline
rustc --version

# 检查 Cargo
Write-Host "Cargo:" -NoNewline
cargo --version

# 检查 WiX
Write-Host "WiX Toolset:" -NoNewline
candle -? 2>&1 | Select-String "version" | Select-Object -First 1

# 检查 MSVC
Write-Host "MSVC:" -NoNewline
if (Get-Command cl.exe -ErrorAction SilentlyContinue) {
    Write-Host "已安装" -ForegroundColor Green
} else {
    Write-Host "未安装" -ForegroundColor Red
}
```

---

## 🎯 推荐工作流程

### 日常开发
```powershell
# 1. 测试环境开发
.\build.ps1 test -Dev

# 2. 代码修改...

# 3. UAT 环境测试
.\build.ps1 uat -Dev
```

### 发布版本
```powershell
# 1. 确保代码已提交
git status

# 2. 打包生产版本
.\build.ps1 prod

# 3. 测试安装包
cd src-tauri\target\release\bundle\msi
.\Backstage68_0.1.0_x64_en-US.msi

# 4. 发布
# 上传到文件服务器或发布平台
```

---

## 📚 相关文档

- [Tauri 官方文档](https://tauri.app/v1/guides/building/windows)
- [WiX Toolset 文档](https://wixtoolset.org/documentation/)
- [Rust 官方文档](https://www.rust-lang.org/)

---

## 💡 提示

1. **首次编译较慢**：Rust 需要编译所有依赖，约需 5-10 分钟
2. **后续编译更快**：增量编译通常 1-2 分钟
3. **定期更新**：运行 `rustup update` 更新 Rust 工具链
4. **使用 SSD**：编译速度快很多

