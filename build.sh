#!/bin/bash

# Tauri 多环境打包脚本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 显示使用方法
usage() {
    echo "用法: $0 [环境] [选项]"
    echo ""
    echo "环境:"
    echo "  test    - 测试环境"
    echo "  uat     - 预发布环境"
    echo "  prod    - 生产环境"
    echo ""
    echo "选项:"
    echo "  -d, --dev     开发模式（不打包）"
    echo "  -h, --help    显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 test -d    # 测试环境开发模式"
    echo "  $0 prod       # 生产环境打包"
    exit 1
}

# 检查参数
if [ $# -eq 0 ]; then
    usage
fi

ENV=$1
DEV_MODE=false

# 解析选项
shift
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dev)
            DEV_MODE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}错误: 未知选项 $1${NC}"
            usage
            ;;
    esac
done

# 检查环境配置文件
ENV_FILE="env.${ENV}"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}错误: 环境配置文件 ${ENV_FILE} 不存在${NC}"
    exit 1
fi

echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}   Tauri 应用打包${NC}"
echo -e "${GREEN}====================================${NC}"
echo ""

# 加载环境变量
echo -e "${YELLOW}📋 加载环境配置: ${ENV}${NC}"
export $(cat $ENV_FILE | grep -v '^#' | xargs)

echo "   环境名称: $TAURI_ENV_NAME"
echo "   访问地址: $TAURI_ENV_URL"
echo "   开发工具: $TAURI_DEVTOOLS_ENABLED"
echo ""

# 开发模式或打包模式
if [ "$DEV_MODE" = true ]; then
    echo -e "${YELLOW}🚀 启动开发模式...${NC}"
    npm run tauri dev
else
    echo -e "${YELLOW}📦 开始打包...${NC}"
    npm run tauri build
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}====================================${NC}"
        echo -e "${GREEN}✅ 打包成功！${NC}"
        echo -e "${GREEN}====================================${NC}"
        echo ""
        echo "打包文件位置:"
        echo "  macOS:   src-tauri/target/release/bundle/macos/"
        echo "  Windows: src-tauri/target/release/bundle/msi/"
        echo "  Linux:   src-tauri/target/release/bundle/appimage/"
    else
        echo -e "${RED}❌ 打包失败${NC}"
        exit 1
    fi
fi

