# 🪟 Windows 打包快速指南

## ⚡ 快速开始

### 1. 安装依赖（一次性配置）

```powershell
# 使用 Scoop（推荐）
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
scoop install nodejs rust git

# 安装 Visual Studio Build Tools
# 下载: https://visualstudio.microsoft.com/downloads/

# 安装 WiX Toolset
# 下载: https://github.com/wixtoolset/wix3/releases
```

详细步骤见 [WINDOWS_SETUP.md](WINDOWS_SETUP.md)

### 2. 克隆项目

```powershell
git clone <your-repo-url>
cd backstage68
npm install
```

### 3. 开发/打包

```powershell
# 开发模式
.\build.ps1 test -Dev

# 打包
.\build.ps1 prod
```

---

## 📦 打包命令

```powershell
# 测试环境 - 开发模式
.\build.ps1 test -Dev

# UAT环境 - 开发模式  
.\build.ps1 uat -Dev

# 生产环境 - 开发模式
.\build.ps1 prod -Dev

# 测试环境 - 打包
.\build.ps1 test

# UAT环境 - 打包
.\build.ps1 uat

# 生产环境 - 打包
.\build.ps1 prod
```

---

## 📁 输出位置

```
src-tauri\target\release\bundle\msi\
└── Backstage68_0.1.0_x64_en-US.msi
```

---

## 🆘 遇到问题？

查看详细文档：
- [WINDOWS_SETUP.md](WINDOWS_SETUP.md) - 完整安装配置指南
- [BUILD.md](BUILD.md) - 多平台打包说明

---

## ✅ 环境检查

```powershell
# 检查所有依赖
node --version    # 应显示 v18+
npm --version     # 应显示 9+
rustc --version   # 应显示 1.75+
cargo --version   # 应显示 1.75+
candle -?         # 应显示 WiX 帮助信息
```

---

## 💡 提示

- 首次编译约需 5-10 分钟
- 后续编译约需 1-2 分钟
- 生成的 .msi 文件可直接分发

