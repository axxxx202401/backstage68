# Tauri 标签页缓存失效阶段 1 设计

## 目标

让应用启动、新建标签、复制标签和创建系统窗口时都使用新的 `_t` 毫秒时间戳，并清除注入脚本 source map 造成的控制台噪音。

## URL 处理

- 保留 Rust 中系统窗口创建时的缓存失效逻辑。
- 在前端增加单一 URL 转换函数，仅处理 `http:` 和 `https:` URL。
- 每次 `createTab` 创建 iframe 前替换 `_t`，因此初始标签、“+”新标签和“复制标签”统一生效。
- 保留路径、其他查询参数及 Hash 路由。
- 使用单调递增的毫秒值，确保同一窗口内连续创建标签时 `_t` 不重复。

## 日志

- 新标签日志输出转换后的实际 iframe URL。
- Rust 新窗口日志继续输出转换后的实际系统窗口 URL。

## Source Map

- Rollup 注入脚本不再生成外部 `inject.js.map`。
- 避免 `user-script://` 无法读取外部 map 文件产生控制台错误。

## 验证

- 使用 Node 内置测试覆盖无查询参数、已有参数、已有 `_t`、Hash 路由和连续时间戳。
- 重新构建 `src/inject.js`，确认末尾不存在 `sourceMappingURL`。
- 运行现有 Rust 测试与编译检查，确认系统窗口逻辑未回归。

## 不在本阶段处理

- macOS WKWebView 的 Tauri IPC 首次降级日志。
- 主页面与 iframe 重复运行导致的潜在 WebSocket 重复连接。
