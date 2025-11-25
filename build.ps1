# Tauri Windows 构建脚本
# PowerShell 版本
#
# 如果遇到 "无法加载文件...禁止运行脚本" 错误，请执行：
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
# 然后重新运行此脚本

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("test", "uat", "prod")]
    [string]$Environment,
    
    [switch]$Dev
)

# 颜色输出函数
function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

Write-ColorOutput "====================================" "Green"
Write-ColorOutput "   Tauri 应用打包 (Windows)" "Green"
Write-ColorOutput "====================================" "Green"
Write-Host ""

# 检查环境配置文件
$envFile = "env.$Environment"
if (-not (Test-Path $envFile)) {
    Write-ColorOutput "错误: 环境配置文件 $envFile 不存在" "Red"
    exit 1
}

# 加载环境变量
Write-ColorOutput "📋 加载环境配置: $Environment" "Yellow"
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $name = $matches[1]
        $value = $matches[2]
        Set-Item -Path "env:$name" -Value $value
        Write-Host "   $name = $value"
    }
}
Write-Host ""

# 开发模式或打包模式
if ($Dev) {
    Write-ColorOutput "🚀 启动开发模式..." "Yellow"
    npm run tauri dev
} else {
    Write-ColorOutput "📦 开始打包 Windows 版本..." "Yellow"
    Write-Host ""
    
    # 备份原始配置
    Copy-Item "src-tauri/tauri.conf.json" "src-tauri/tauri.conf.json.bak"
    
    # 修改配置文件（使用 PowerShell JSON 处理）
    $config = Get-Content "src-tauri/tauri.conf.json" | ConvertFrom-Json
    $config.productName = $env:TAURI_PRODUCT_NAME
    $config.identifier = $env:TAURI_BUNDLE_IDENTIFIER
    $config | ConvertTo-Json -Depth 100 | Set-Content "src-tauri/tauri.conf.json"
    
    # 清理之前的构建
    if (Test-Path "src-tauri/target/release/bundle") {
        Remove-Item "src-tauri/target/release/bundle" -Recurse -Force
    }
    
    # 构建
    npm run tauri build
    
    $buildStatus = $LASTEXITCODE
    
    # 恢复配置
    Move-Item "src-tauri/tauri.conf.json.bak" "src-tauri/tauri.conf.json" -Force
    
    if ($buildStatus -eq 0) {
        Write-Host ""
        Write-ColorOutput "====================================" "Green"
        Write-ColorOutput "✅ Windows 打包成功！" "Green"
        Write-ColorOutput "====================================" "Green"
        Write-Host ""
        
        # 显示构建产物
        Write-ColorOutput "📦 构建产物:" "Cyan"
        
        $msiPath = "src-tauri/target/release/bundle/msi"
        $nsisPath = "src-tauri/target/release/bundle/nsis"
        
        if (Test-Path $msiPath) {
            Write-Host ""
            Write-ColorOutput "MSI 安装包:" "White"
            Get-ChildItem "$msiPath/*.msi" -ErrorAction SilentlyContinue | ForEach-Object {
                $size = "{0:N2} MB" -f ($_.Length / 1MB)
                Write-Host "   $($_.Name) ($size)"
            }
        }
        
        if (Test-Path $nsisPath) {
            Write-Host ""
            Write-ColorOutput "NSIS 安装包:" "White"
            Get-ChildItem "$nsisPath/*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
                $size = "{0:N2} MB" -f ($_.Length / 1MB)
                Write-Host "   $($_.Name) ($size)"
            }
        }
        
        Write-Host ""
        Write-Host "产品名称: $env:TAURI_PRODUCT_NAME"
        Write-Host "环境: $env:TAURI_ENV_NAME ($env:TAURI_ENV_KEY)"
        Write-Host "URL: $env:TAURI_ENV_URL"
        
    } else {
        Write-ColorOutput "❌ 打包失败" "Red"
        exit 1
    }
}
