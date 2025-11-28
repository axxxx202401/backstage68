# Backstage68 编码规范

> 更新时间：2025-11-28T04:18:02Z（UTC）
>
> 参考资料：Rust Coding Guidelines、Tauri 官方文档、Airbnb JavaScript Style Guide 等公开规范。

本文定义了 Backstage68 项目的统一开发规范，适用于 `src-tauri` 下的 Rust 代码、`src` 下的 JavaScript 注入脚本，以及与 Tauri 相关的工程配置。所有新增或修改代码均需遵循以下要求。

---

## 1. 通用准则

- **代码提交前必须通过**：`rustfmt`、`clippy`、至少一次前端打包（`npm run build`）以及项目现有的测试/自检脚本。
- **命名必须语义化**，禁止使用无意义缩写（如 `tmp1`）。若业务术语使用英文缩写（如 `UAT`、`RSA`），需在首次出现处解释。
- **文件组织**：Rust 逻辑放在 `src-tauri/src/`，前端注入模块放在 `src/modules/` 并按功能拆分（示例：`tabs/`、`utils/`）。
- **文档与注释**：复杂逻辑必须附带说明，注释语言与代码所处文件一致（Rust 用英文，JS 可用中英混排但须保持简洁）。
- **安全优先**：跨窗口/跨进程数据（包括 storage、网络请求）必须校验来源，严禁信任前端输入。

---

## 2. Rust（`src-tauri/`）规范

### 2.1 风格
- **命名**：函数、变量使用 `snake_case`；结构体、枚举、Trait 使用 `PascalCase`；常量与静态量使用 `SCREAMING_SNAKE_CASE`。
- **格式化**：统一运行 `cargo fmt`（内含 4 空格缩进，行宽 100 列）。
- **模块布局**：公共 API 放在 `lib.rs`，具体实现拆分至 `{feature}.rs`，禁止单文件过长（>400 行需拆分）。

### 2.2 错误处理
- 默认使用 `Result<T, E>` / `Option<T>`；只有在逻辑必然成功时才允许 `expect`（需写明原因），禁止 `unwrap()`。
- 对外暴露的 `#[tauri::command]` 必须返回 `Result`，并将详细错误写入日志而非直接 panic。

### 2.3 安全 & 配置
- 编译期环境变量统一通过 `option_env!` 注入，必要时由 `build.rs` 生成常量，避免因 CI 未配置导致编译失败。
- `WebviewWindowBuilder` 创建窗口时必须设置：
  - `.initialization_script()` 仅注入经过审计的脚本。
  - `.inner_size()` 经过范围校验（建议 200–3000 像素）。
  - 如需启用 DevTools，使用 feature flag `devtools` 控制，并在 `Cargo.toml` 中声明。

### 2.4 工具链
- `cargo fmt -- --check`
- `cargo clippy -- -D warnings`
- 如使用自定义 lint，需在 `docs/` 目录记录说明。

---

## 3. Tauri 专项规范

### 3.1 前后端通信
- 所有 `invoke` 命令集中在 `src-tauri/src/lib.rs` 注册，命令名使用 `snake_case`，参数在 Rust 侧进行类型和范围校验。
- 前端调用 `window.__TAURI__.core.invoke` 时必须通过统一封装（目前为 `window.tauriOpenNewWindow` 等），避免到处散落裸 `invoke`。

### 3.2 多窗口/安全
- 拉起新窗口时必须：
  - 复制登录状态前先序列化并校验 storage。
  - 传递窗口尺寸、必要的上下文信息。
  - 在 Rust 端记录窗口标签，用于调试。
- 禁止在 `tauri.conf.json` 开启 `allowlist.all = true`。若需要新增 API，需最小化授权范围并说明用途。

### 3.3 打包与配置
- `.env.{env}` 中的变量只用于构建脚本，不得直接被前端脚本读取。
- 构建脚本（`build.sh`、`build.ps1`）在改动后需同步更新文档（`BUILD_GUIDE.md`）。

---

## 4. JavaScript 注入脚本（`src/`）规范

### 4.1 风格
- **命名**：变量/函数使用 `camelCase`，类/构造函数使用 `PascalCase`，常量使用 `SCREAMING_SNAKE_CASE`。
- **格式**：2 空格缩进，行宽 100 列以内。保存前运行 `npm run lint` 或 Prettier（未来可加入）。
- **模块结构**：每个模块只负责单一职责，必要时拆分子目录（例如 `tabs/ui.js`、`tabs/events.js`）。

### 4.2 DOM/事件
- 使用 `addEventListener` 时统一传入 `{ passive: false }` 或 `{ once: true }` 等选项，避免默认行为。
- 动态创建的 DOM 应通过 CSS class 控制样式；禁止直接在 JS 中写长串 `style`（除非是一次性 DEBUG 元素）。

### 4.3 网络与存储
- 任何覆盖 `fetch`/`XMLHttpRequest` 的逻辑必须保留原始引用，并对 URL 做白名单校验（目前仅 `/base_api/`）。
- 本地存储序列化函数集中在 `src/modules/utils/storage.js`，其他模块不得重复实现。

### 4.4 日志
- `initLogger` 提供 `log.info/warn/error`，默认仅在 `window.__TAURI_ENABLE_LOGS__` 为 `true` 时输出。新代码必须使用该 logger，禁止直接 `console.log`（调试阶段除外）。

---

## 5. 工具与流程

| 任务 | 命令 | 说明 |
| --- | --- | --- |
| Rust 格式化 | `cargo fmt -- --check` | PR 必须通过 |
| Rust 静态检查 | `cargo clippy -- -D warnings` | 视为阻塞 |
| 前端打包 | `npm run build` | 确保 `src/inject.js` 最新 |
| Tauri 开发 | `./build.sh test -d` 或 `build.ps1 -Environment test -Dev` | 用于本地调试 |

- **分支策略**：所有功能分支从 `main`/`develop` 切出，提交信息需采用 `feat: ...` / `fix: ...` / `docs: ...` 模式。
- **代码评审**：合并前至少一次 review，审查者需确认：编码规范、错误处理、安全与日志、测试结果。

---

## 6. 未来扩展

- 若引入 TypeScript 或 ESLint/Prettier，请在本文追加对应条目并注明版本。
- 对 Tauri 插件、安全策略的更新，需在 `docs/` 目录新建章节引用，并同步调整此规范。

---

若在执行过程中发现规范无法覆盖的新场景，请先与团队讨论，再更新本文件。所有人应定期复查并迭代规范，确保其与项目现状保持一致。

