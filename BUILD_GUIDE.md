# Backstage68 构建指南

## 📦 本地构建

### macOS 构建

```bash
# 构建测试环境
./build.sh test

# 构建 UAT 环境
./build.sh uat

# 构建生产环境
./build.sh prod
```

构建产物位置：
- `src-tauri/target/release/bundle/macos/*.app` - 应用程序
- `src-tauri/target/release/bundle/dmg/*.dmg` - DMG 安装包

**注意：** macOS 上无法直接构建 Windows 版本，请使用 GitHub Actions 或在 Windows 上构建。

### Windows 构建

**方式 1：在 Windows 上直接构建**

前置要求：
- Node.js 20+
- Rust (rustup)
- Visual Studio Build Tools

```powershell
# 克隆项目
git clone <repository>
cd backstage68

# 安装依赖
npm install

# 构建（PowerShell）
$env:TAURI_ENV_NAME="测试环境"
$env:TAURI_ENV_URL="https://test-otc.68chat.co/"
$env:TAURI_ENV_KEY="test"
$env:TAURI_DEVTOOLS_ENABLED="true"
$env:TAURI_PRODUCT_NAME="Backstage68-Test"
$env:TAURI_BUNDLE_IDENTIFIER="com.backstage68.test"
$env:TAURI_ENABLE_LOGS="true"

npm run tauri build
```

构建产物位置：
- `src-tauri/target/release/bundle/msi/*.msi` - MSI 安装包
- `src-tauri/target/release/bundle/nsis/*.exe` - NSIS 安装包

**方式 2：使用 GitHub Actions（推荐）**

1. 推送代码到 GitHub
2. 前往 Actions 标签页
3. 运行 "Build Windows Release" 或 "Build Multi-Platform Release"
4. 选择环境（test/uat/prod）
5. 下载构建产物

### Linux 构建

前置要求：
```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.0-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

构建：
```bash
./build.sh test  # 或 uat/prod
```

构建产物位置：
- `src-tauri/target/release/bundle/deb/*.deb` - Debian 包
- `src-tauri/target/release/bundle/appimage/*.AppImage` - AppImage

## 🌍 多环境配置

项目支持三个环境，每个环境有独立的配置：

| 环境 | 配置文件 | 产品名称 | Bundle ID |
|------|---------|----------|-----------|
| 测试 | `env.test` | Backstage68-Test | com.backstage68.test |
| UAT | `env.uat` | Backstage68-UAT | com.backstage68.uat |
| 生产 | `env.prod` | Backstage68 | com.backstage68.prod |

环境配置文件示例（`env.test`）：
```bash
TAURI_ENV_NAME=测试环境
TAURI_ENV_URL=https://test-otc.68chat.co/
TAURI_ENV_KEY=test
TAURI_DEVTOOLS_ENABLED=true
TAURI_PRODUCT_NAME=Backstage68-Test
TAURI_BUNDLE_IDENTIFIER=com.backstage68.test
TAURI_ENABLE_LOGS=true
```

## 🔧 开发模式

```bash
# 启动开发模式（热重载）
./build.sh test -d
```

## 🚀 GitHub Actions 自动构建

### 工作流文件

- `.github/workflows/build-windows.yml` - Windows 专用构建
- `.github/workflows/build-release.yml` - 跨平台构建（macOS/Windows/Linux）

### 使用方法

1. 推送代码到 GitHub
2. 前往仓库的 **Actions** 标签页
3. 选择工作流：
   - **Build Windows Release** - 仅构建 Windows
   - **Build Multi-Platform Release** - 构建所有平台
4. 点击 **Run workflow**
5. 选择环境（test/uat/prod）
6. 等待构建完成
7. 下载 **Artifacts** 中的构建产物

### 构建产物命名

- macOS: `Backstage68-Test-aarch64-apple-darwin.zip`
- Windows: `Backstage68-Test-windows.zip`
- Linux: `Backstage68-Test-linux.zip`

## 📝 注意事项

### macOS
- 首次打开可能需要：右键 → 打开 → 确认
- 或执行：`xattr -cr /path/to/app`

### Windows
- MSI 安装包需要管理员权限
- Windows Defender 可能会警告，选择"仍要运行"

### Linux
- AppImage 需要执行权限：`chmod +x *.AppImage`
- Debian 包：`sudo dpkg -i *.deb`

## 🎨 图标

图标源文件位于 `src-tauri/icons/`：
- `app-icon.svg` - SVG 源文件
- `*.png` - 各尺寸 PNG
- `icon.icns` - macOS 图标
- `icon.ico` - Windows 图标

修改图标后重新生成：
```bash
cd src-tauri/icons
# 编辑 app-icon.svg
# 打开 generate_icons.html 重新生成 PNG
# 运行 iconutil 生成 ICNS
```

## 🔐 安全特性

应用内置以下安全特性：
- RSA 非对称加密请求签名
- 设备指纹识别
- 时间戳防重放攻击
- 自动请求拦截和验证

## 📊 日志控制

- 测试/UAT 环境：`TAURI_ENABLE_LOGS=true` - 启用详细日志
- 生产环境：`TAURI_ENABLE_LOGS=false` - 禁用日志（提高性能）

## 🐛 故障排查

### 构建失败
1. 检查环境变量是否正确加载
2. 清理构建缓存：`rm -rf src-tauri/target`
3. 重新安装依赖：`npm install`

### Windows 构建问题
- 确保安装了 Visual Studio Build Tools
- 确保 Rust 工具链正确：`rustup target add x86_64-pc-windows-msvc`

### macOS 签名问题
- 应用未签名，分发时接收方需要手动信任
- 如需签名，需要 Apple Developer 账号

## 📞 技术支持

如有问题，请查看：
- `KEYS_README.md` - 密钥说明
- `ICON_README.md` - 图标说明
- GitHub Issues

