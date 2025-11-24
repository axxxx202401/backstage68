# ⚡ 快速开始

## 🎯 开发模式

### 测试环境
```bash
./build.sh test -d
```

### 预发布环境
```bash
./build.sh uat -d
```

### 生产环境
```bash
./build.sh prod -d
```

## 📦 打包发布

### 生产环境打包
```bash
./build.sh prod
```

打包文件位置：`src-tauri/target/release/bundle/`

### 测试环境打包
```bash
./build.sh test
```

### UAT环境打包
```bash
./build.sh uat
```

## 🔑 关键文件

```
backstage68/
├── env.test          # 测试环境配置
├── env.uat           # UAT环境配置
├── env.prod          # 生产环境配置
├── build.sh          # 打包脚本
├── config.json       # 运行时配置（已废弃，使用 env.*）
└── BUILD.md          # 详细说明文档
```

## 📝 配置环境

编辑对应的环境配置文件：

```bash
# 修改生产环境配置
vim env.prod

# 内容示例
TAURI_ENV_NAME=生产环境
TAURI_ENV_URL=http://otc.68chat.co/
TAURI_ENV_KEY=prod
TAURI_DEVTOOLS_ENABLED=false
```

## 🚀 一键命令

```bash
# 开发
./build.sh test -d

# 打包
./build.sh prod

# 查看帮助
./build.sh --help
```

## 📖 更多信息

- 详细打包说明：[BUILD.md](BUILD.md)
- 环境配置说明：[ENV_CONFIG.md](ENV_CONFIG.md)
- Java集成说明：[KEYS_README.md](KEYS_README.md)

