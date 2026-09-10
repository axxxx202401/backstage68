# Tauri URL Cache Busting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每次 Tauri 应用启动或窗口创建生成带新 `_t` 毫秒时间戳的站点 URL。

**Architecture:** 在现有 Rust 入口文件中增加一个可确定性测试的 URL 转换函数，以及一个读取系统时间的薄封装。所有创建 WebView 窗口的路径统一调用该封装，保留路径、其他查询参数和片段标识符，并替换已有 `_t`。

**Tech Stack:** Rust、Tauri 2、现有 `reqwest::Url`

---

### Task 1: URL 缓存失效函数

**Files:**
- Modify: `/Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri/src/lib.rs:52-57`
- Test: `/Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri/src/lib.rs`

- [ ] **Step 1: 编写失败的单元测试**

在 `/Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri/src/lib.rs` 末尾增加：

```rust
#[cfg(test)]
mod tests {
    use super::with_cache_busting_timestamp;

    #[test]
    fn appends_timestamp_to_url_without_query() {
        assert_eq!(
            with_cache_busting_timestamp("https://example.com/path", 123).unwrap(),
            "https://example.com/path?_t=123"
        );
    }

    #[test]
    fn preserves_existing_query_parameters() {
        assert_eq!(
            with_cache_busting_timestamp("https://example.com/path?lang=zh", 123).unwrap(),
            "https://example.com/path?lang=zh&_t=123"
        );
    }

    #[test]
    fn replaces_existing_timestamp() {
        assert_eq!(
            with_cache_busting_timestamp(
                "https://example.com/path?foo=bar&_t=old&lang=zh",
                123,
            )
            .unwrap(),
            "https://example.com/path?foo=bar&lang=zh&_t=123"
        );
    }

    #[test]
    fn preserves_fragment() {
        assert_eq!(
            with_cache_busting_timestamp("https://example.com/path?foo=bar#section", 123)
                .unwrap(),
            "https://example.com/path?foo=bar&_t=123#section"
        );
    }

    #[test]
    fn rejects_invalid_url() {
        assert!(with_cache_busting_timestamp("not a url", 123).is_err());
    }
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri
cargo test tests::
```

Expected: 编译失败，提示找不到 `with_cache_busting_timestamp`。

- [ ] **Step 3: 实现最小 URL 转换与系统时间封装**

在 `/Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri/src/lib.rs` 的 `env_url` 后增加：

```rust
fn with_cache_busting_timestamp(raw_url: &str, timestamp_ms: u128) -> Result<String, String> {
    let mut url = reqwest::Url::parse(raw_url)
        .map_err(|error| format!("Invalid URL '{raw_url}': {error}"))?;
    let retained_pairs: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, _)| key != "_t")
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();

    url.set_query(None);
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in retained_pairs {
            query.append_pair(&key, &value);
        }
        query.append_pair("_t", &timestamp_ms.to_string());
    }

    Ok(url.into())
}

fn cache_busted_url(raw_url: &str) -> Result<String, String> {
    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("System time is before Unix epoch: {error}"))?
        .as_millis();

    with_cache_busting_timestamp(raw_url, timestamp_ms)
}
```

- [ ] **Step 4: 运行单元测试并确认通过**

Run:

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri
cargo test tests::
```

Expected: 5 个相关测试全部通过。

### Task 2: 接入所有窗口创建路径

**Files:**
- Modify: `/Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri/src/lib.rs:598`
- Modify: `/Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri/src/lib.rs:728-738`
- Modify: `/Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri/src/lib.rs:807-817`

- [ ] **Step 1: 接入命令创建的新窗口**

将 `create_new_window` 中目标 URL 的构造改为：

```rust
let source_url = current_url.unwrap_or_else(env_url);
let target_url = cache_busted_url(&source_url)?;
log!("   Target URL: {}", target_url);
```

- [ ] **Step 2: 接入主窗口**

将 `setup` 中目标 URL 的构造改为：

```rust
let target_url =
    cache_busted_url(&env_url()).expect("Failed to add cache-busting timestamp to main URL");
```

保留现有 `target_url.parse().unwrap()` 创建窗口逻辑。

- [ ] **Step 3: 接入 macOS 重开窗口**

将 `create_reopen_window` 中目标 URL 的构造改为：

```rust
let target_url = cache_busted_url(&env_url())?;
```

保留现有解析错误映射和窗口创建逻辑。

- [ ] **Step 4: 运行完整 Rust 验证**

Run:

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68/src-tauri
cargo fmt -- --check
cargo test
cargo check
```

Expected: 格式检查、全部测试和编译检查均通过。

- [ ] **Step 5: 检查最终差异**

Run:

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68
git diff --check
git diff -- src-tauri/src/lib.rs
```

Expected: 没有空白错误；差异仅包含 URL 缓存失效函数、测试及三处窗口接入。

- [ ] **Step 6: 提交实现**

```bash
cd /Volumes/TRANSCEND/works/objects/github/backstage68
git add src-tauri/src/lib.rs docs/superpowers/plans/2026-09-10-tauri-url-cache-busting.md
git commit -m "fix: bust cached Tauri site URLs"
```
