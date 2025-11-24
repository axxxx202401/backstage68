# 🪟 Windows 应用打包指南

## ❌ Mac 上无法直接打包 Windows 应用

由于以下原因，无法在 Mac 上直接打包 Windows 应用：

1. **系统 API 依赖** - Windows API 需要 Windows 系统
2. **工具链限制** - WiX Toolset（制作 .msi）只在 Windows 上运行
3. **代码签名** - Windows 应用签名需要 Windows 环境

## ✅ 三种解决方案

### 方案 1: GitHub Actions 自动打包（推荐）⭐

**优点**：
- 🚀 自动化，无需本地 Windows 环境
- 🔄 同时打包 macOS + Windows + Linux
- 📦 每次 push tag 自动触发
- 💰 GitHub 提供免费的 CI/CD 时间

**使用步骤**：

1. **推送代码到 GitHub**
```bash
git add .
git commit -m "Add multi-platform build"
git push origin main
```

2. **创建 tag 触发打包**
```bash
# 打包生产环境
git tag v1.0.0
git push origin v1.0.0
```

3. **或手动触发**
- 打开 GitHub 仓库
- 进入 Actions 标签
- 选择 "Build Multi-Platform"
- 点击 "Run workflow"
- 选择环境（test/uat/prod）
- 点击 "Run workflow"

4. **下载打包文件**
- 等待打包完成（约 10-20 分钟）
- 在 Actions 页面下载 artifacts
- 包含所有平台的安装包

### 方案 2: 使用 Windows 虚拟机

**在 Mac 上运行 Windows 虚拟机**：

#### 使用 Parallels Desktop（付费）
```bash
# 1. 安装 Parallels Desktop
# 2. 创建 Windows 11 虚拟机
# 3. 在虚拟机中安装开发环境
```

#### 使用 UTM（免费）
```bash
# 1. 下载 UTM (https://mac.getutm.app/)
# 2. 创建 Windows 11 ARM 虚拟机
# 3. 安装开发工具
```

**在 Windows 虚拟机中**：

```powershell
# 1. 安装 Node.js
winget install OpenJS.NodeJS

# 2. 安装 Rust
winget install Rustlang.Rust.MSVC

# 3. 安装 Visual Studio Build Tools
# 下载: https://visualstudio.microsoft.com/downloads/

# 4. 克隆项目
git clone <your-repo-url>
cd backstage68

# 5. 打包
npm install
$env:TAURI_ENV_NAME="生产环境"
$env:TAURI_ENV_URL="http://otc.68chat.co/"
$env:TAURI_ENV_KEY="prod"
$env:TAURI_DEVTOOLS_ENABLED="false"
npm run tauri build
```

### 方案 3: 远程 Windows 机器

**使用云服务器或实体 Windows 电脑**：

#### 云服务（按需付费）
- Azure Windows VM
- AWS EC2 Windows
- 阿里云 Windows 实例

#### 配置步骤
```powershell
# 1. 连接到 Windows 机器（RDP）

# 2. 安装依赖
winget install OpenJS.NodeJS
winget install Rustlang.Rust.MSVC
winget install Git.Git

# 3. 克隆并打包
git clone <your-repo-url>
cd backstage68
npm install

# 4. 使用 PowerShell 脚本
./build.ps1 prod
```

## 📝 Windows 打包脚本

创建 `build.ps1`（PowerShell 版本）：

```powershell
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("test","uat","prod")]
    [string]$Environment,
    
    [switch]$Dev
)

Write-Host "====================================" -ForegroundColor Green
Write-Host "   Tauri 应用打包 (Windows)" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""

$envFile = "env.$Environment"
if (-not (Test-Path $envFile)) {
    Write-Host "错误: 环境配置文件 $envFile 不存在" -ForegroundColor Red
    exit 1
}

Write-Host "加载环境配置: $Environment" -ForegroundColor Yellow
Get-Content $envFile | ForEach-Object {
    if ($_ -notmatch '^#' -and $_ -match '(.+)=(.+)') {
        $name = $matches[1]
        $value = $matches[2]
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
        Write-Host "  $name = $value"
    }
}

Write-Host ""

if ($Dev) {
    Write-Host "启动开发模式..." -ForegroundColor Yellow
    npm run tauri dev
} else {
    Write-Host "开始打包..." -ForegroundColor Yellow
    npm run tauri build
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "====================================" -ForegroundColor Green
        Write-Host "打包成功！" -ForegroundColor Green
        Write-Host "====================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "打包文件位置: src-tauri\target\release\bundle\msi\"
    } else {
        Write-Host "打包失败" -ForegroundColor Red
        exit 1
    }
}
```

使用方法：
```powershell
# 开发模式
.\build.ps1 test -Dev

# 打包
.\build.ps1 prod
```

## 🎯 推荐方案对比

| 方案 | 成本 | 难度 | 速度 | 推荐度 |
|------|------|------|------|--------|
| GitHub Actions | 免费 | ⭐ | 中 | ⭐⭐⭐⭐⭐ |
| Parallels Desktop | ¥698/年 | ⭐⭐ | 快 | ⭐⭐⭐⭐ |
| UTM（免费虚拟机） | 免费 | ⭐⭐⭐ | 慢 | ⭐⭐⭐ |
| 云服务器 | 按需 | ⭐⭐⭐ | 快 | ⭐⭐⭐ |
| 实体 Windows PC | 设备成本 | ⭐ | 最快 | ⭐⭐⭐⭐ |

## 📦 GitHub Actions 详细配置

### 1. 推送到 GitHub

```bash
# 初始化仓库（如果还没有）
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/your-username/backstage68.git
git push -u origin main
```

### 2. 触发打包

**自动触发（推送 tag）**：
```bash
git tag v1.0.0
git push origin v1.0.0
```

**手动触发**：
1. 打开 GitHub 仓库页面
2. 点击 "Actions" 标签
3. 选择 "Build Multi-Platform" workflow
4. 点击 "Run workflow" 按钮
5. 选择环境（test/uat/prod）
6. 点击绿色的 "Run workflow" 按钮

### 3. 下载打包结果

打包完成后（约 10-20 分钟）：
1. 进入 Actions 页面
2. 点击完成的 workflow run
3. 下载 Artifacts：
   - `backstage68-macos-prod` - macOS 版本
   - `backstage68-windows-prod` - Windows 版本
   - `backstage68-linux-prod` - Linux 版本

## 🔧 Windows 本地开发环境配置

如果您有 Windows 电脑，完整配置步骤：

```powershell
# 1. 安装 Scoop (包管理器)
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# 2. 安装依赖
scoop install nodejs rust git

# 3. 安装 Visual Studio Build Tools
# 下载并安装: https://visualstudio.microsoft.com/downloads/
# 选择 "Desktop development with C++"

# 4. 克隆项目
git clone <your-repo-url>
cd backstage68

# 5. 安装依赖
npm install

# 6. 打包
Get-Content env.prod | ForEach-Object {
    if ($_ -notmatch '^#' -and $_ -match '(.+)=(.+)') {
        $name = $matches[1]; $value = $matches[2]
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}
npm run tauri build
```

## 💡 最佳实践

1. **日常开发**: 在 Mac 上开发和测试
2. **打包发布**: 使用 GitHub Actions 自动打包所有平台
3. **紧急修复**: 如有 Windows 特定问题，使用虚拟机调试

## 📞 需要帮助？

如果您选择了某个方案但遇到问题，可以：
1. 查看 [Tauri 官方文档](https://tauri.app/v1/guides/building/)
2. 检查 GitHub Actions 的构建日志
3. 确认所有环境变量正确设置

