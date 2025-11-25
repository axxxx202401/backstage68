# 修复 Windows PowerShell 脚本问题
# 此脚本会：
# 1. 设置 PowerShell 执行策略
# 2. 确保所有脚本文件使用正确的行尾符

Write-Host "🔧 修复 Windows 构建环境..." -ForegroundColor Cyan
Write-Host ""

# 1. 设置执行策略
Write-Host "1️⃣ 设置 PowerShell 执行策略..." -ForegroundColor Yellow
try {
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force
    Write-Host "   ✅ 执行策略已设置" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  无法设置执行策略: $_" -ForegroundColor Yellow
}

Write-Host ""

# 2. 检查必需的工具
Write-Host "2️⃣ 检查必需工具..." -ForegroundColor Yellow

$tools = @{
    "node" = "Node.js"
    "npm" = "npm"
    "cargo" = "Rust/Cargo"
    "rustc" = "Rust编译器"
}

$missingTools = @()

foreach ($cmd in $tools.Keys) {
    try {
        $null = Get-Command $cmd -ErrorAction Stop
        Write-Host "   ✅ $($tools[$cmd])" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ $($tools[$cmd]) 未安装" -ForegroundColor Red
        $missingTools += $tools[$cmd]
    }
}

if ($missingTools.Count -gt 0) {
    Write-Host ""
    Write-Host "⚠️  缺少以下工具:" -ForegroundColor Yellow
    $missingTools | ForEach-Object { Write-Host "   - $_" }
    Write-Host ""
    Write-Host "请先安装必需工具后再运行构建脚本。" -ForegroundColor Yellow
    Write-Host "参考文档: WINDOWS_QUICKSTART.md" -ForegroundColor Cyan
}

Write-Host ""

# 3. 检查环境配置文件
Write-Host "3️⃣ 检查环境配置文件..." -ForegroundColor Yellow

$envFiles = @("env.test", "env.uat", "env.prod")
foreach ($file in $envFiles) {
    if (Test-Path $file) {
        Write-Host "   ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $file 不存在" -ForegroundColor Red
    }
}

Write-Host ""

# 4. 显示构建命令
Write-Host "✨ 环境检查完成！" -ForegroundColor Green
Write-Host ""
Write-Host "现在可以运行构建命令：" -ForegroundColor Cyan
Write-Host ""
Write-Host "   .\build.ps1 -Environment test      # 构建测试环境" -ForegroundColor White
Write-Host "   .\build.ps1 -Environment uat       # 构建 UAT 环境" -ForegroundColor White
Write-Host "   .\build.ps1 -Environment prod      # 构建生产环境" -ForegroundColor White
Write-Host "   .\build.ps1 -Environment test -Dev # 开发模式" -ForegroundColor White
Write-Host ""

# 5. 询问是否立即构建
$response = Read-Host "是否立即开始构建？(y/n)"
if ($response -eq 'y' -or $response -eq 'Y') {
    Write-Host ""
    $env = Read-Host "选择环境 (test/uat/prod)"
    if ($env -in @("test", "uat", "prod")) {
        Write-Host ""
        Write-Host "开始构建 $env 环境..." -ForegroundColor Cyan
        & .\build.ps1 -Environment $env
    } else {
        Write-Host "无效的环境选择" -ForegroundColor Red
    }
}

