# 🚀 多环境打包说明

## 📁 环境配置文件

项目根目录包含三个环境配置文件：

- `env.test` - 测试环境
- `env.uat` - 预发布环境  
- `env.prod` - 生产环境

### 配置文件格式

```bash
# 环境名称（显示在窗口标题）
TAURI_ENV_NAME=测试环境

# 访问地址
TAURI_ENV_URL=http://test-otc.68chat.co/

# 环境标识
TAURI_ENV_KEY=test

# 是否启用开发者工具
TAURI_DEVTOOLS_ENABLED=true
```

## 🔨 打包命令

### 使用打包脚本（推荐）

```bash
# 测试环境 - 开发模式
./build.sh test -d

# UAT环境 - 开发模式
./build.sh uat -d

# 生产环境 - 打包
./build.sh prod

# 测试环境 - 打包
./build.sh test
```

### 手动打包

```bash
# 1. 加载环境变量
export $(cat env.prod | grep -v '^#' | xargs)

# 2. 开发模式
npm run tauri dev

# 或打包
npm run tauri build
```

## 📦 打包输出

打包完成后，文件位于：

### macOS
```
src-tauri/target/release/bundle/macos/Backstage68.app
src-tauri/target/release/bundle/dmg/Backstage68_0.1.0_x64.dmg
```

### Windows
```
src-tauri/target/release/bundle/msi/Backstage68_0.1.0_x64_en-US.msi
```

### Linux
```
src-tauri/target/release/bundle/appimage/backstage68_0.1.0_amd64.AppImage
src-tauri/target/release/bundle/deb/backstage68_0.1.0_amd64.deb
```

## 🎯 不同环境的差异

| 环境 | URL | 开发工具 | 窗口标题 | 用途 |
|------|-----|----------|----------|------|
| test | http://test-otc.68chat.co/ | ✅ 启用 | Backstage68 - 测试环境 | 开发测试 |
| uat | http://uat-otc.68chat.co/ | ❌ 禁用 | Backstage68 - 预发布环境 | 预发布验证 |
| prod | http://otc.68chat.co/ | ❌ 禁用 | Backstage68 - 生产环境 | 生产使用 |

## 🔧 修改环境配置

### 添加新环境

1. 创建新的环境配置文件，例如 `env.dev`:

```bash
cat > env.dev <<'EOF'
TAURI_ENV_NAME=开发环境
TAURI_ENV_URL=http://localhost:8080/
TAURI_ENV_KEY=dev
TAURI_DEVTOOLS_ENABLED=true
EOF
```

2. 使用新环境打包：

```bash
./build.sh dev
```

### 修改现有环境

直接编辑对应的 `env.*` 文件，然后重新打包。

## 🚨 注意事项

1. **环境变量在编译时注入**：打包后无法切换环境
2. **生产环境建议**：
   - 关闭开发者工具 (`TAURI_DEVTOOLS_ENABLED=false`)
   - 使用 HTTPS 地址
   - 进行充分测试
3. **打包前检查**：
   - 确认环境配置正确
   - 确认 URL 可访问
   - 确认私钥文件已配置

## 📋 CI/CD 集成

### GitHub Actions 示例

```yaml
name: Build

on:
  push:
    branches: [ main ]
    tags:
      - 'v*'

jobs:
  build:
    runs-on: macos-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node
      uses: actions/setup-node@v3
      with:
        node-version: 18
        
    - name: Setup Rust
      uses: actions-rs/toolchain@v1
      with:
        toolchain: stable
    
    - name: Install dependencies
      run: npm install
    
    - name: Build for Production
      run: |
        export $(cat env.prod | grep -v '^#' | xargs)
        npm run tauri build
        
    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: backstage68-macos
        path: src-tauri/target/release/bundle/macos/
```

## 🆘 常见问题

### Q: 打包后环境不对？
A: 检查是否正确加载了环境变量，确认 `env.*` 文件内容正确。

### Q: 如何验证当前环境？
A: 运行应用后，菜单栏 → "关于" → "环境: xxx" 可以看到当前环境。

### Q: 能否在一个包中支持多环境？
A: 不能。每个包只能包含一个环境配置。需要为每个环境分别打包。

### Q: Windows 和 Linux 如何打包？
A: 需要在对应的操作系统上运行打包命令，或使用 CI/CD 服务。

