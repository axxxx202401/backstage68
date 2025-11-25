# Backstage68

一个基于 Tauri 2.0 的跨平台桌面应用，支持 macOS、Windows 和 Linux。

## ✨ 特性

- 🔐 **内置安全**：RSA 加密、设备指纹、防重放攻击
- 🌍 **多环境支持**：测试、UAT、生产环境独立配置
- 🎨 **现代 UI**：简洁美观的"68"主题图标
- 📊 **日志控制**：生产环境自动禁用日志
- 🚀 **跨平台**：支持 macOS (Intel/Apple Silicon)、Windows、Linux

## 🚀 快速开始

### macOS/Linux

```bash
# 构建生产环境
./build.sh prod

# 构建测试环境
./build.sh test

# 开发模式（热重载）
./build.sh test -d
```

### Windows

```powershell
# 构建生产环境
.\build.ps1 -Environment prod

# 构建测试环境
.\build.ps1 -Environment test

# 开发模式
.\build.ps1 -Environment test -Dev
```

## 📦 构建产物

### macOS
- `*.app` - 应用程序包
- `*.dmg` - 磁盘映像安装包

### Windows
- `*.msi` - Windows Installer 安装包
- `*.exe` - NSIS 安装包

### Linux
- `*.deb` - Debian/Ubuntu 包
- `*.AppImage` - 通用 AppImage

## 🌍 环境配置

| 环境 | 应用名称 | Bundle ID | 日志 |
|------|---------|-----------|------|
| 测试 | Backstage68-Test | com.backstage68.test | ✅ |
| UAT | Backstage68-UAT | com.backstage68.uat | ✅ |
| 生产 | Backstage68 | com.backstage68.prod | ❌ |

编辑 `env.test`、`env.uat`、`env.prod` 文件来修改环境配置。

## 🔧 GitHub Actions

支持自动化构建，前往 GitHub Actions 选择：

- **Build Windows Release** - Windows 专用
- **Build Multi-Platform Release** - 所有平台

## 📖 文档

- [构建指南](BUILD_GUIDE.md) - 详细构建说明
- [跨平台构建](CROSS_PLATFORM_BUILD.md) - 为什么不能在 macOS 上构建 Windows 版本
- [Windows 构建总结](WINDOWS_BUILD_SUMMARY.md) - Windows 专项说明
- [密钥说明](KEYS_README.md) - RSA 密钥管理
- [图标说明](src-tauri/icons/ICON_README.md) - 图标资源
- [更新日志](CHANGELOG.md) - 版本更新记录

## 🛠️ 技术栈

- **Tauri 2.0** - 应用框架
- **Rust** - 后端逻辑
- **JavaScript** - 前端拦截
- **RSA 加密** - 请求签名
- **SHA-256** - 路径哈希

## 📝 开发

```bash
# 安装依赖
npm install

# 开发模式
./build.sh test -d  # macOS/Linux
.\build.ps1 -Environment test -Dev  # Windows

# 打包
./build.sh prod  # macOS/Linux
.\build.ps1 -Environment prod  # Windows
```

## 🔒 安全特性

1. **RSA 非对称加密**：客户端使用公钥加密，服务端使用私钥解密
2. **设备指纹**：基于硬件和系统信息生成唯一标识
3. **时间戳验证**：防止请求重放攻击
4. **URL 哈希**：请求路径完整性验证

## 📦 分发

### macOS
应用未签名，首次打开需要：
```bash
xattr -cr /path/to/Backstage68.app
```
或右键 → 打开 → 确认

### Windows
运行 MSI/EXE 安装包，可能需要管理员权限

### Linux
```bash
# AppImage
chmod +x *.AppImage
./Backstage68.AppImage

# Debian
sudo dpkg -i backstage68*.deb
```

## 🎨 自定义

### 修改图标
1. 编辑 `src-tauri/icons/app-icon.svg`
2. 打开 `src-tauri/icons/generate_icons.html`
3. 下载生成的 PNG 文件
4. 重新生成 ICNS/ICO

### 修改环境
编辑对应的 `env.*` 文件，修改：
- `TAURI_ENV_URL` - 后端地址
- `TAURI_PRODUCT_NAME` - 应用名称
- `TAURI_ENABLE_LOGS` - 日志开关

## 📄 许可证

[你的许可证]

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

