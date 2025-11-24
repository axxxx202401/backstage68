# 应用图标设计说明

## 设计理念

基于章鱼图标 🐙 创建的安全主题应用图标。

### 设计元素

1. **盾牌形状**：代表安全防护
   - 蓝色渐变 (#42A5F5 → #1E88E5)
   - 经典盾牌轮廓

2. **章鱼图形**：代表全方位监控
   - 白色章鱼身体（透明度 95%）
   - 8 条触手象征 8 个方向的安全防护
   - 蓝色眼睛增强专业感

3. **锁图标**：中心安全标志
   - 金色锁头（#FFD700）
   - 位于章鱼中心位置
   - 强调加密和保护功能

### 文件说明

- `app-icon.svg` - 原始 SVG 矢量图（可编辑）
- `icon.png` - 512x512 主图标
- `32x32.png` - 小尺寸图标
- `128x128.png` - 中等尺寸图标
- `128x128@2x.png` - Retina 显示图标
- `icon.icns` - macOS 图标格式
- `icon.ico` - Windows 图标格式

### 颜色方案

| 颜色 | 十六进制 | 用途 |
|------|---------|------|
| 主蓝色 | #1E88E5 | 盾牌主体、章鱼眼睛 |
| 浅蓝色 | #42A5F5 | 盾牌渐变起点 |
| 深蓝色 | #1565C0 | 盾牌边框 |
| 金色 | #FFD700 | 锁图标 |
| 白色 | #FFFFFF | 章鱼身体、触手 |

### 如何修改

1. 编辑 `app-icon.svg` 文件
2. 使用在线工具转换：
   - [Convertio SVG to PNG](https://convertio.co/svg-png/)
   - [CloudConvert](https://cloudconvert.com/svg-to-png)
3. 或使用命令行工具：
```bash
# 安装 ImageMagick
brew install imagemagick

# 转换 SVG 为多种尺寸
convert app-icon.svg -resize 32x32 32x32.png
convert app-icon.svg -resize 128x128 128x128.png
convert app-icon.svg -resize 512x512 icon.png
```

### 设计工具推荐

- **Figma** - 在线协作设计工具
- **Inkscape** - 免费 SVG 编辑器
- **Adobe Illustrator** - 专业矢量设计工具

