# Tauri Windows 打包脚本 (PowerShell)
# 用法: .\build.ps1 <环境> [-Dev]
# 示例: 
#   .\build.ps1 test -Dev    # 测试环境开发模式
#   .\build.ps1 prod         # 生产环境打包

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("test","uat","prod")]
    [string]$Environment,
    
    [switch]$Dev
)

# 颜色输出函数
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# 显示横幅
Write-ColorOutput "====================================" "Green"
Write-ColorOutput "   Tauri Windows 应用打包" "Green"
Write-ColorOutput "====================================" "Green"
Write-Host ""

# 检查环境配置文件
$envFile = "env.$Environment"
if (-not (Test-Path $envFile)) {
    Write-ColorOutput "错误: 环境配置文件 $envFile 不存在" "Red"
    exit 1
}

Write-ColorOutput "📋 加载环境配置: $Environment" "Yellow"

# 加载环境变量
Get-Content $envFile | ForEach-Object {
    if ($_ -notmatch '^#' -and $_ -match '(.+)=(.+)') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        
        # 设置环境变量
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
        
        Write-Host "   $name = $value"
    }
}

Write-Host ""

# 获取环境变量值（用于显示）
$envName = [Environment]::GetEnvironmentVariable("TAURI_ENV_NAME", "Process")
$envUrl = [Environment]::GetEnvironmentVariable("TAURI_ENV_URL", "Process")
$devtools = [Environment]::GetEnvironmentVariable("TAURI_DEVTOOLS_ENABLED", "Process")

Write-ColorOutput "环境信息:" "Cyan"
Write-Host "   名称: $envName"
Write-Host "   地址: $envUrl"
Write-Host "   调试: $devtools"
Write-Host ""

# 检查依赖
Write-ColorOutput "🔍 检查依赖..." "Yellow"

# 检查 Node.js
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-ColorOutput "错误: 未安装 Node.js" "Red"
    Write-ColorOutput "请访问 https://nodejs.org 下载安装" "Yellow"
    exit 1
}
Write-Host "   ✓ Node.js: $nodeVersion"

# 检查 Rust
$rustVersion = rustc --version 2>$null
if (-not $rustVersion) {
    Write-ColorOutput "错误: 未安装 Rust" "Red"
    Write-ColorOutput "请访问 https://rustup.rs 下载安装" "Yellow"
    exit 1
}
Write-Host "   ✓ Rust: $rustVersion"

Write-Host ""

# 开发模式或打包模式
if ($Dev) {
    Write-ColorOutput "🚀 启动开发模式..." "Yellow"
    Write-Host ""
    
    npm run tauri dev
    
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "开发模式启动失败" "Red"
        exit $LASTEXITCODE
    }
} else {
    Write-ColorOutput "📦 开始打包..." "Yellow"
    Write-Host ""
    
    # 清理旧的构建文件
    if (Test-Path "src-tauri\target\release\bundle") {
        Write-ColorOutput "   清理旧的构建文件..." "Gray"
        Remove-Item "src-tauri\target\release\bundle" -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    # 开始打包
    npm run tauri build
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-ColorOutput "====================================" "Green"
        Write-ColorOutput "✅ 打包成功！" "Green"
        Write-ColorOutput "====================================" "Green"
        Write-Host ""
        
        # 显示打包文件位置
        Write-ColorOutput "📁 打包文件位置:" "Cyan"
        
        $msiPath = "src-tauri\target\release\bundle\msi"
        if (Test-Path $msiPath) {
            Get-ChildItem $msiPath -Filter "*.msi" | ForEach-Object {
                $size = [math]::Round($_.Length / 1MB, 2)
                Write-Host "   ✓ $($_.Name) ($size MB)"
                Write-Host "     路径: $($_.FullName)" -ForegroundColor Gray
            }
        } else {
            Write-ColorOutput "   ⚠ 未找到 .msi 文件" "Yellow"
        }
        
        $nsiPath = "src-tauri\target\release\bundle\nsis"
        if (Test-Path $nsiPath) {
            Write-Host ""
            Get-ChildItem $nsiPath -Filter "*.exe" | ForEach-Object {
                $size = [math]::Round($_.Length / 1MB, 2)
                Write-Host "   ✓ $($_.Name) ($size MB)"
                Write-Host "     路径: $($_.FullName)" -ForegroundColor Gray
            }
        }
        
        Write-Host ""
        Write-ColorOutput "💡 提示: 可以在上述路径找到安装包" "Yellow"
        
        # 询问是否打开文件夹
        Write-Host ""
        $openFolder = Read-Host "是否打开输出文件夹? (Y/N)"
        if ($openFolder -eq "Y" -or $openFolder -eq "y") {
            if (Test-Path $msiPath) {
                explorer $msiPath
            }
        }
        
    } else {
        Write-Host ""
        Write-ColorOutput "====================================" "Red"
        Write-ColorOutput "❌ 打包失败" "Red"
        Write-ColorOutput "====================================" "Red"
        Write-Host ""
        Write-ColorOutput "常见问题排查:" "Yellow"
        Write-Host "  1. 检查是否安装了 Visual Studio Build Tools"
        Write-Host "  2. 检查是否安装了 WiX Toolset 3.11+"
        Write-Host "  3. 查看上面的错误信息"
        Write-Host ""
        exit $LASTEXITCODE
    }
}

