#!/bin/bash

# Tauri Linux 打包脚本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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
    echo "  -d, --dev       开发模式（不打包）"
    echo "  -h, --help      显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 test -d      # 测试环境开发模式"
    echo "  $0 prod         # 生产环境打包"
    echo ""
    echo "💡 前置要求:"
    echo "  sudo apt-get install -y \\"
    echo "    pkg-config \\"
    echo "    libssl-dev \\"
    echo "    build-essential \\"
    echo "    libwebkit2gtk-4.1-dev (或 libwebkit2gtk-4.0-dev) \\"
    echo "    libappindicator3-dev (或 libayatana-appindicator3-dev) \\"
    echo "    librsvg2-dev \\"
    echo "    patchelf"
    exit 1
}

# 检查参数
if [ $# -eq 0 ]; then
    usage
fi

# 检查是否是帮助选项
if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
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
ENV_FILE=".env.${ENV}"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}错误: 环境配置文件 ${ENV_FILE} 不存在${NC}"
    exit 1
fi

# 检查操作系统
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo -e "${YELLOW}⚠️  警告: 此脚本专为 Linux 设计，当前系统: $OSTYPE${NC}"
    read -p "是否继续？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}   Tauri Linux 应用打包${NC}"
echo -e "${GREEN}====================================${NC}"
echo ""

# 检查必要的依赖工具
echo -e "${YELLOW}🔍 检查依赖工具...${NC}"
MISSING_DEPS=false

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm 未安装${NC}"
    echo ""
    echo -e "${YELLOW}安装方法：${NC}"
    echo ""
    echo "方式 1 - 使用 NodeSource 安装 Node.js (推荐):"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    echo ""
    echo "方式 2 - 使用系统包管理器:"
    echo "  sudo apt-get update"
    echo "  sudo apt-get install -y nodejs npm"
    MISSING_DEPS=true
else
    NPM_VERSION=$(npm --version)
    NODE_VERSION=$(node --version 2>/dev/null || echo "未知")
    echo -e "${GREEN}   ✓ npm: ${NPM_VERSION} (Node.js: ${NODE_VERSION})${NC}"
fi

# 检查 jq（打包模式需要）
if [ "$DEV_MODE" != true ]; then
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}❌ jq 未安装（打包模式需要）${NC}"
        echo "   安装命令: sudo apt-get install -y jq"
        MISSING_DEPS=true
    else
        JQ_VERSION=$(jq --version)
        echo -e "${GREEN}   ✓ jq: ${JQ_VERSION}${NC}"
    fi
fi

# 检查 Rust（可选，但推荐）
if ! command -v cargo &> /dev/null; then
    echo -e "${YELLOW}   ⚠️  Rust/Cargo 未安装（如果未安装依赖，构建时会自动安装）${NC}"
    echo "   手动安装: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
else
    RUST_VERSION=$(cargo --version 2>/dev/null | head -n1 || echo "未知")
    echo -e "${GREEN}   ✓ Rust: ${RUST_VERSION}${NC}"
fi

# 检查系统依赖包（Linux 构建必需）
echo ""
echo -e "${YELLOW}🔍 检查系统依赖包...${NC}"

# 检查函数：检查包是否已安装
check_package() {
    local pkg=$1
    if command -v dpkg &> /dev/null; then
        # Debian/Ubuntu 系统
        # 匹配包名（可能带架构后缀，如 :amd64）
        if dpkg -l 2>/dev/null | grep -qE "^ii[[:space:]]+${pkg}(:.*)?[[:space:]]"; then
            return 0
        fi
        # 也尝试直接查询（更可靠）
        if dpkg-query -W -f='${Status}' "${pkg}" 2>/dev/null | grep -q "install ok installed"; then
            return 0
        fi
    elif command -v rpm &> /dev/null; then
        # RPM 系统
        if rpm -q "${pkg}" &> /dev/null; then
            return 0
        fi
    elif command -v pacman &> /dev/null; then
        # Arch 系统
        if pacman -Q "${pkg}" &> /dev/null; then
            return 0
        fi
    fi
    return 1
}

# 检测可用包名（用于 apt）
find_available_package() {
    local pkg_list="$1"
    if command -v apt-cache &> /dev/null; then
        for pkg in $(echo "$pkg_list" | tr ':' ' '); do
            if apt-cache show "$pkg" &> /dev/null; then
                echo "$pkg"
                return 0
            fi
        done
    fi
    # 如果无法检测，返回第一个包名
    echo "$pkg_list" | cut -d':' -f1
    return 1
}

# 必需的系统依赖
REQUIRED_PACKAGES=(
    "pkg-config"
    "libssl-dev"
    "build-essential"
)

# 推荐的系统依赖（Tauri 构建需要）
RECOMMENDED_PACKAGES=(
    "libwebkit2gtk-4.0-dev:libwebkit2gtk-4.1-dev"
    "libappindicator3-dev:libayatana-appindicator3-dev"
    "librsvg2-dev"
    "patchelf"
)

MISSING_SYS_DEPS=false
MISSING_PKG_LIST=""

# 检查必需包
for pkg_info in "${REQUIRED_PACKAGES[@]}"; do
    # 处理包名（可能包含替代包，用冒号分隔）
    pkg_list=$(echo "$pkg_info" | tr ':' ' ')
    found=false
    installed_pkg=""
    
    # 检查主包名和所有替代包
    for pkg in $pkg_list; do
        if check_package "$pkg"; then
            installed_pkg="$pkg"
            found=true
            break
        fi
    done
    
    if [ "$found" = true ]; then
        if [ "$installed_pkg" = "$(echo "$pkg_info" | cut -d':' -f1)" ]; then
            echo -e "${GREEN}   ✓ ${installed_pkg}${NC}"
        else
            echo -e "${GREEN}   ✓ ${installed_pkg} (替代 $(echo "$pkg_info" | cut -d':' -f1))${NC}"
        fi
    else
        main_pkg=$(echo "$pkg_info" | cut -d':' -f1)
        echo -e "${RED}   ❌ ${main_pkg} 未安装${NC}"
        MISSING_SYS_DEPS=true
        MISSING_PKG_LIST="${MISSING_PKG_LIST} ${main_pkg}"
    fi
done

# 检查推荐包
for pkg_info in "${RECOMMENDED_PACKAGES[@]}"; do
    # 处理包名（可能包含替代包，用冒号分隔）
    pkg_list=$(echo "$pkg_info" | tr ':' ' ')
    found=false
    installed_pkg=""
    
    # 检查主包名和所有替代包
    for pkg in $pkg_list; do
        if check_package "$pkg"; then
            installed_pkg="$pkg"
            found=true
            break
        fi
    done
    
    if [ "$found" = true ]; then
        if [ "$installed_pkg" = "$(echo "$pkg_info" | cut -d':' -f1)" ]; then
            echo -e "${GREEN}   ✓ ${installed_pkg}${NC}"
        else
            echo -e "${GREEN}   ✓ ${installed_pkg} (替代 $(echo "$pkg_info" | cut -d':' -f1))${NC}"
        fi
    else
        main_pkg=$(echo "$pkg_info" | cut -d':' -f1)
        echo -e "${YELLOW}   ⚠️  ${main_pkg} 未安装（推荐安装）${NC}"
        # 推荐包不添加到必需安装列表，但可以提示
    fi
done

if [ "$MISSING_SYS_DEPS" = true ]; then
    echo ""
    echo -e "${RED}缺少必需的系统依赖包！${NC}"
    echo ""
    echo -e "${YELLOW}请安装缺失的依赖：${NC}"
    echo ""
    
    # 检测包管理器并给出相应命令
    if command -v apt-get &> /dev/null; then
        echo -e "${BLUE}═══════════════════════════════════════${NC}"
        echo -e "${BLUE}安装命令（可直接复制执行）：${NC}"
        echo -e "${BLUE}═══════════════════════════════════════${NC}"
        echo ""
        echo "sudo apt-get update"
        echo "sudo apt-get install -y${MISSING_PKG_LIST}"
        echo ""
        echo -e "${YELLOW}或完整安装所有推荐依赖：${NC}"
        echo ""
        echo "# 方式 1：尝试 4.1 版本（较新系统）"
        echo "sudo apt-get update"
        echo "sudo apt-get install -y \\"
        echo "  pkg-config \\"
        echo "  libssl-dev \\"
        echo "  build-essential \\"
        echo "  libwebkit2gtk-4.1-dev \\"
        echo "  libappindicator3-dev \\"
        echo "  librsvg2-dev \\"
        echo "  patchelf"
        echo ""
        echo "# 方式 2：如果方式 1 失败，尝试 4.0 版本（较旧系统）"
        echo "sudo apt-get install -y \\"
        echo "  libwebkit2gtk-4.0-dev \\"
        echo "  libayatana-appindicator3-dev"
        echo ""
        echo -e "${YELLOW}提示：如果两个版本都不可用，请检查您的系统版本和软件源配置${NC}"
    elif command -v yum &> /dev/null; then
        echo -e "${BLUE}═══════════════════════════════════════${NC}"
        echo -e "${BLUE}安装命令（可直接复制执行）：${NC}"
        echo -e "${BLUE}═══════════════════════════════════════${NC}"
        echo ""
        echo "sudo yum install -y${MISSING_PKG_LIST}"
    elif command -v dnf &> /dev/null; then
        echo -e "${BLUE}═══════════════════════════════════════${NC}"
        echo -e "${BLUE}安装命令（可直接复制执行）：${NC}"
        echo -e "${BLUE}═══════════════════════════════════════${NC}"
        echo ""
        echo "sudo dnf install -y${MISSING_PKG_LIST}"
    elif command -v pacman &> /dev/null; then
        echo -e "${BLUE}═══════════════════════════════════════${NC}"
        echo -e "${BLUE}安装命令（可直接复制执行）：${NC}"
        echo -e "${BLUE}═══════════════════════════════════════${NC}"
        echo ""
        echo "sudo pacman -S${MISSING_PKG_LIST}"
    else
        echo "请使用您的系统包管理器安装上述依赖包"
    fi
    
    echo ""
    exit 1
fi

if [ "$MISSING_DEPS" = true ]; then
    echo ""
    echo -e "${RED}请先安装缺失的依赖工具，然后重新运行脚本${NC}"
    exit 1
fi

echo ""

# 加载环境变量
echo -e "${YELLOW}📋 加载环境配置: ${ENV}${NC}"
export $(cat $ENV_FILE | grep -v '^#' | xargs)

echo "   环境名称: $TAURI_ENV_NAME"
echo "   访问地址: $TAURI_ENV_URL"
echo "   开发工具: $TAURI_DEVTOOLS_ENABLED (自动打开: $TAURI_DEVTOOLS_AUTO_OPEN)"
echo ""

# 构建 inject.js（重要：确保使用最新的模块化代码）
echo -e "${YELLOW}🔨 构建 inject.js...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ inject.js 构建失败${NC}"
    exit 1
fi
echo -e "${GREEN}✅ inject.js 构建成功${NC}"
echo ""

# 开发模式或打包模式
if [ "$DEV_MODE" = true ]; then
    echo -e "${YELLOW}🚀 启动开发模式...${NC}"
    npm run tauri dev
else
    echo -e "${YELLOW}📦 开始打包...${NC}"
    
    # 备份原始配置
    cp src-tauri/tauri.conf.json src-tauri/tauri.conf.json.bak
    
    # 修改配置文件（jq 已在前面检查过）
    jq --arg name "$TAURI_PRODUCT_NAME" --arg id "$TAURI_BUNDLE_IDENTIFIER" \
        '.productName = $name | .identifier = $id' \
        src-tauri/tauri.conf.json.bak > src-tauri/tauri.conf.json
    
    # 清理之前的构建
    rm -rf src-tauri/target/release/bundle/
    
    # 构建
    npm run tauri build
    
    BUILD_STATUS=$?
    
    # 恢复配置
    mv src-tauri/tauri.conf.json.bak src-tauri/tauri.conf.json
    
    if [ $BUILD_STATUS -eq 0 ]; then
        echo ""
        echo -e "${YELLOW}📦 查找构建产物...${NC}"
        
        # Linux 构建产物路径
        BUNDLE_DIR="src-tauri/target/release/bundle"
        DEB_DIR="${BUNDLE_DIR}/deb"
        APPIMAGE_DIR="${BUNDLE_DIR}/appimage"
        RPM_DIR="${BUNDLE_DIR}/rpm"
        
        # 查找并显示构建产物
        FOUND_ARTIFACTS=false
        
        # Debian 包
        if [ -d "$DEB_DIR" ]; then
            DEB_FILES=$(find "$DEB_DIR" -name "*.deb" 2>/dev/null)
            if [ -n "$DEB_FILES" ]; then
                echo ""
                echo -e "${GREEN}📦 Debian 包 (.deb):${NC}"
                for deb in $DEB_FILES; do
                    echo "   $(realpath "$deb")"
                    FOUND_ARTIFACTS=true
                done
                echo ""
                echo "   安装命令:"
                echo "   ${BLUE}sudo dpkg -i $(basename $(echo $DEB_FILES | head -n1))${NC}"
                echo "   或修复依赖:"
                echo "   ${BLUE}sudo apt-get install -f${NC}"
            fi
        fi
        
        # AppImage
        if [ -d "$APPIMAGE_DIR" ]; then
            APPIMAGE_FILES=$(find "$APPIMAGE_DIR" -name "*.AppImage" 2>/dev/null)
            if [ -n "$APPIMAGE_FILES" ]; then
                echo ""
                echo -e "${GREEN}📦 AppImage:${NC}"
                for appimage in $APPIMAGE_FILES; do
                    echo "   $(realpath "$appimage")"
                    FOUND_ARTIFACTS=true
                    # 确保有执行权限
                    chmod +x "$appimage" 2>/dev/null || true
                done
                echo ""
                echo "   运行方式:"
                echo "   ${BLUE}chmod +x $(basename $(echo $APPIMAGE_FILES | head -n1))${NC}"
                echo "   ${BLUE}./$(basename $(echo $APPIMAGE_FILES | head -n1))${NC}"
            fi
        fi
        
        # RPM 包
        if [ -d "$RPM_DIR" ]; then
            RPM_FILES=$(find "$RPM_DIR" -name "*.rpm" 2>/dev/null)
            if [ -n "$RPM_FILES" ]; then
                echo ""
                echo -e "${GREEN}📦 RPM 包 (.rpm):${NC}"
                for rpm in $RPM_FILES; do
                    echo "   $(realpath "$rpm")"
                    FOUND_ARTIFACTS=true
                done
                echo ""
                echo "   安装命令:"
                echo "   ${BLUE}sudo rpm -i $(basename $(echo $RPM_FILES | head -n1))${NC}"
                echo "   或使用 dnf/yum:"
                echo "   ${BLUE}sudo dnf install $(basename $(echo $RPM_FILES | head -n1))${NC}"
            fi
        fi
        
        if [ "$FOUND_ARTIFACTS" = false ]; then
            echo -e "${YELLOW}⚠️  未找到构建产物，请检查构建日志${NC}"
        fi
        
        echo ""
        echo -e "${GREEN}====================================${NC}"
        echo -e "${GREEN}✅ 打包成功！${NC}"
        echo -e "${GREEN}====================================${NC}"
        echo ""
        echo "构建信息:"
        echo "   Bundle ID: ${TAURI_BUNDLE_IDENTIFIER}"
        echo "   产品名称: ${TAURI_PRODUCT_NAME}"
        echo "   环境: ${TAURI_ENV_NAME} (${TAURI_ENV_KEY})"
        echo "   URL: ${TAURI_ENV_URL}"
        echo ""
        echo "构建产物位置: ${BUNDLE_DIR}"
        echo ""
    else
        echo -e "${RED}❌ 打包失败${NC}"
        exit 1
    fi
fi

