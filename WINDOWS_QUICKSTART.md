# Windows 快速开始指南

## 🚀 第一次在 Windows 上构建？

### 🎯 一键修复（推荐）

运行修复脚本自动配置环境：

```powershell
# 方法 1：允许执行并运行修复脚本
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.\fix-windows.ps1

# 方法 2：一次性执行
powershell -ExecutionPolicy Bypass -File .\fix-windows.ps1
```

修复脚本会自动：
- ✅ 设置 PowerShell 执行策略
- ✅ 检查必需工具是否安装
- ✅ 验证环境配置文件
- ✅ 提供构建命令提示

### 📝 手动步骤

#### 步骤 1：解决 PowerShell 脚本执行限制

Windows 默认禁止运行 PowerShell 脚本。打开 **PowerShell**（不需要管理员权限），执行：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
```

**说明：**
- `-Scope Process` 表示仅对当前 PowerShell 会话生效
- 关闭 PowerShell 后需要重新执行
- 这是最安全的方式，不会永久修改系统设置

#### 步骤 2：运行构建脚本

```powershell
# 构建测试环境
.\build.ps1 -Environment test

# 构建生产环境
.\build.ps1 -Environment prod

# 开发模式
.\build.ps1 -Environment test -Dev
```

## 💡 常见错误和解决方案

### ❌ 错误 1：无法加载文件...禁止运行脚本

```
.\build.ps1 : 无法加载文件 C:\works\backstage68\build.ps1，因为在此系统上禁止运行脚本。
```

**解决方案：**
```powershell
# 方法 1：临时允许（推荐）
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.\build.ps1 -Environment test

# 方法 2：一次性执行
powershell -ExecutionPolicy Bypass -File .\build.ps1 -Environment test

# 方法 3：永久修改（需要管理员权限）
# 以管理员身份运行 PowerShell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### ❌ 错误 2：找不到 npm 命令

```
npm : 无法将"npm"项识别为 cmdlet、函数、脚本文件或可运行程序的名称。
```

**解决方案：**
```powershell
# 安装 Node.js
winget install OpenJS.NodeJS

# 重启 PowerShell
# 验证安装
node --version
npm --version
```

### ❌ 错误 3：找不到 rustc 命令

```
error: could not find `rustc`
```

**解决方案：**
```powershell
# 安装 Rust
winget install Rustlang.Rustup

# 添加 MSVC 目标
rustup target add x86_64-pc-windows-msvc

# 重启 PowerShell
# 验证安装
rustc --version
cargo --version
```

### ❌ 错误 4：需要 Visual Studio Build Tools

```
error: linker `link.exe` not found
```

**解决方案：**
```powershell
# 安装 Visual Studio Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools

# 或下载安装器：
# https://visualstudio.microsoft.com/downloads/
# 选择 "Desktop development with C++"
```

## 🔧 完整环境配置（首次）

第一次构建需要安装依赖，按顺序执行：

```powershell
# 1. 安装 Node.js
winget install OpenJS.NodeJS

# 2. 安装 Rust
winget install Rustlang.Rustup

# 3. 安装 Visual Studio Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools

# 4. 重启 PowerShell

# 5. 验证安装
node --version
npm --version
rustc --version

# 6. 进入项目目录
cd C:\works\backstage68

# 7. 安装项目依赖
npm install

# 8. 允许 PowerShell 脚本
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process

# 9. 构建
.\build.ps1 -Environment test
```

## 📦 构建完成后

构建成功后，可以在以下位置找到安装包：

```
src-tauri\target\release\bundle\msi\
  └── Backstage68-Test_0.1.0_x64_en-US.msi

src-tauri\target\release\bundle\nsis\
  └── Backstage68-Test_0.1.0_x64-setup.exe
```

## 🎯 快速命令参考

```powershell
# 允许脚本执行
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process

# 构建测试环境
.\build.ps1 -Environment test

# 构建 UAT 环境
.\build.ps1 -Environment uat

# 构建生产环境
.\build.ps1 -Environment prod

# 开发模式（热重载）
.\build.ps1 -Environment test -Dev

# 查看帮助
Get-Help .\build.ps1
```

## 🆘 仍然有问题？

### 检查清单

- [ ] 已安装 Node.js 20+
- [ ] 已安装 Rust
- [ ] 已安装 Visual Studio Build Tools
- [ ] 已重启 PowerShell
- [ ] 已执行 `npm install`
- [ ] 已允许 PowerShell 脚本执行

### 获取帮助

1. 查看完整文档：`BUILD_GUIDE.md`
2. 查看 Windows 专项说明：`WINDOWS_BUILD_SUMMARY.md`
3. 查看跨平台构建说明：`CROSS_PLATFORM_BUILD.md`

---

## 🌟 推荐：使用 GitHub Actions

如果本地构建遇到问题，最简单的方式是使用 GitHub Actions：

1. 推送代码到 GitHub
2. 前往 **Actions** → **Build Multi-Platform**
3. 点击 **Run workflow** → 选择环境
4. 等待构建完成（约 10-15 分钟）
5. 下载构建产物

**优点：**
- ✅ 无需配置本地环境
- ✅ 同时构建所有平台
- ✅ 完全自动化
- ✅ 稳定可靠

---

**祝你构建成功！** 🎉

