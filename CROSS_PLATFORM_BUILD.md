# 跨平台构建说明

## ⚠️ 重要提示

**在 macOS 上无法直接构建 Windows 版本！**

这是因为：
1. Windows 构建需要 Windows 特定的工具链（MSVC）
2. 需要 Windows 资源编译器（`llvm-rc`/`windres`）
3. 交叉编译配置复杂且容易出错

## ✅ 正确的构建方式

### 方案 1：GitHub Actions（最推荐）⭐

**优点：**
- 完全自动化
- 同时构建所有平台
- 无需本地环境配置
- 矩阵构建并行执行

**使用步骤：**
```bash
# 1. 推送代码到 GitHub
git push origin main

# 2. 前往 GitHub Actions 页面
# 3. 选择 "Build Multi-Platform" 工作流
# 4. 点击 "Run workflow"
# 5. 选择环境（test/uat/prod）
# 6. 等待构建完成（约 10-15 分钟）
# 7. 下载 Artifacts
```

### 方案 2：本地平台构建

#### macOS
```bash
./build.sh prod
```

#### Windows
```powershell
.\build.ps1 -Environment prod
```

#### Linux
```bash
./build.sh prod
```

## 📊 构建对照表

| 在此平台 | 可构建 | 命令 |
|---------|-------|------|
| macOS | ✅ macOS | `./build.sh prod` |
| macOS | ❌ Windows | 使用 GitHub Actions |
| macOS | ❌ Linux | 使用 GitHub Actions |
| Windows | ❌ macOS | 使用 GitHub Actions |
| Windows | ✅ Windows | `.\build.ps1 -Environment prod` |
| Windows | ❌ Linux | 使用 GitHub Actions |
| Linux | ❌ macOS | 使用 GitHub Actions |
| Linux | ❌ Windows | 使用 GitHub Actions |
| Linux | ✅ Linux | `./build.sh prod` |

## 🚀 GitHub Actions 工作流

### 1. Build Multi-Platform（推荐）

**文件：** `.github/workflows/build-release.yml`

**功能：**
- 同时构建 macOS、Windows、Linux
- 支持环境选择
- 自动上传构建产物

**触发方式：**
- 手动触发：GitHub Actions → Run workflow
- 自动触发：推送 tag `v*`

**产物：**
- `backstage68-macos-prod.zip`
- `backstage68-windows-prod.zip`
- `backstage68-linux-prod.zip`

### 2. Build Windows Release

**文件：** `.github/workflows/build-windows.yml`

**功能：**
- 仅构建 Windows 版本
- 更快的构建速度

## 🔧 为什么不支持交叉编译？

### Rust 跨平台编译的挑战

1. **工具链差异**
   - macOS: Clang/LLVM
   - Windows: MSVC
   - Linux: GCC

2. **系统 API 差异**
   - Windows: Win32 API
   - macOS: Cocoa/AppKit
   - Linux: GTK/X11

3. **Tauri 特定问题**
   - WebView2 (Windows) vs WebKit (macOS/Linux)
   - 图标格式（ICNS vs ICO）
   - 应用打包格式（.app vs .exe/.msi）

4. **资源文件**
   - Windows: .rc 文件需要 `rc.exe` 或 `llvm-rc`
   - 这些工具在非 Windows 平台难以配置

## 💡 最佳实践

### 开发阶段
- 在本机平台开发和测试
- 使用开发模式：`./build.sh test -d`

### 测试阶段
- 使用 GitHub Actions 构建所有平台
- 在对应平台测试安装包

### 发布阶段
- 使用 GitHub Actions Release 工作流
- 自动生成所有平台的安装包
- 自动创建 GitHub Release

## 🎯 总结

| 场景 | 推荐方案 |
|------|---------|
| 日常开发 | 本地构建 |
| 测试多平台 | GitHub Actions |
| 正式发布 | GitHub Actions + Release |
| 单平台构建 | 本地构建 |
| 多平台构建 | GitHub Actions |

---

**记住：用对的工具做对的事！GitHub Actions 是跨平台构建的最佳选择。** 🚀
