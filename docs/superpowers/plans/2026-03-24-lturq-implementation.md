# lturq Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri v2 desktop app that summons a floating search window via global shortcut, fetches top N web pages in parallel, strips them with Readability.js, and lets the user speed-read through them with vim keybindings.

**Architecture:** Three layers — Tauri shell (window/tray/shortcuts), Rust backend (search API + page fetching), TypeScript frontend (UI + content stripping). Communication via Tauri IPC `invoke` calls.

**Tech Stack:** Tauri v2, Rust (reqwest, serde, tokio), TypeScript (vanilla), Vite, @mozilla/readability, Brave Search API

**Spec:** `docs/superpowers/specs/2026-03-24-lturq-design.md`

---

## File Structure

```
lturq/
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs            # Tauri plugin registration, app setup
│   │   ├── commands.rs       # IPC command handlers (search, fetch_pages, config ops)
│   │   ├── search.rs         # Brave Search API client
│   │   ├── fetcher.rs        # Parallel page fetcher using reqwest
│   │   └── config.rs         # Config struct, read/write to JSON file
│   ├── Cargo.toml
│   ├── capabilities/
│   │   └── default.json      # Permissions for plugins
│   └── tauri.conf.json
├── src/
│   ├── index.html            # Single HTML entry point
│   ├── main.ts               # App bootstrap, state machine, event wiring
│   ├── search-input.ts       # Search bar: render, focus, submit handling
│   ├── reader.ts             # Reader view: tabs, content display, scrolling
│   ├── keybindings.ts        # Global keydown handler, vim bindings dispatch
│   ├── readability.ts        # Wrapper around @mozilla/readability
│   └── style.css             # All styles (dark theme)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Task 1: Scaffold Tauri v2 Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `src/index.html`, `src/main.ts`, `src/style.css`
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`

- [ ] **Step 1: Create the Tauri project using the scaffolding tool**

```bash
npm create tauri-app@latest lturq-scaffold -- --template vanilla-ts
```

Select defaults when prompted. Then copy the generated files into our repo root:

```bash
cp -r lturq-scaffold/* /Users/sourab/Development/ubernerd117/lturq/
cp -r lturq-scaffold/.* /Users/sourab/Development/ubernerd117/lturq/ 2>/dev/null || true
rm -rf lturq-scaffold
```

- [ ] **Step 2: Install Tauri plugins for global shortcuts, shell, and store**

```bash
cd /Users/sourab/Development/ubernerd117/lturq
npm install
npm run tauri add global-shortcut
npm run tauri add shell
```

- [ ] **Step 3: Enable tray-icon feature in Cargo.toml**

In `src-tauri/Cargo.toml`, ensure the tauri dependency has the `tray-icon` feature:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
```

Also add reqwest and serde:

```toml
reqwest = { version = "0.12", features = ["json"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
```

- [ ] **Step 4: Configure the window in tauri.conf.json**

Set up the borderless, always-on-top floating window:

```json
{
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "lturq",
        "width": 600,
        "height": 80,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "resizable": false,
        "visible": false,
        "center": true
      }
    ]
  }
}
```

Key properties: `decorations: false` (no titlebar), `transparent: true`, `alwaysOnTop: true`, `visible: false` (starts hidden, shown by shortcut).

- [ ] **Step 5: Set up capabilities/default.json with required permissions**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "default permissions",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "global-shortcut:default",
    "shell:default"
  ]
}
```

- [ ] **Step 6: Replace the scaffold's index.html with our minimal entry**

`src/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>lturq</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="main.ts"></script>
</body>
</html>
```

- [ ] **Step 7: Add .gitignore entries**

Append to `.gitignore`:

```
node_modules/
dist/
src-tauri/target/
.superpowers/
```

- [ ] **Step 8: Verify the scaffold builds and runs**

```bash
npm run tauri dev
```

Expected: A blank transparent window appears. Close it manually. If it compiles and opens, the scaffold is working.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Tauri v2 project with plugins"
```

---

## Task 2: Rust Config Module

**Files:**
- Create: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write config.rs**

```rust
// src-tauri/src/config.rs
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub shortcut: String,
    pub results_count: u8,
    pub brave_api_key: String,
    pub click_outside_dismisses: bool,
    pub scroll_speed: u8,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            shortcut: "Option+Space".to_string(),
            results_count: 4,
            brave_api_key: String::new(),
            click_outside_dismisses: true,
            scroll_speed: 3,
        }
    }
}

impl AppConfig {
    pub fn config_path(app_handle: &tauri::AppHandle) -> PathBuf {
        let config_dir = app_handle
            .path()
            .app_config_dir()
            .expect("failed to get app config dir");
        fs::create_dir_all(&config_dir).ok();
        config_dir.join("config.json")
    }

    pub fn load(app_handle: &tauri::AppHandle) -> Self {
        let path = Self::config_path(app_handle);
        match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
            Err(_) => {
                let config = Self::default();
                config.save(app_handle);
                config
            }
        }
    }

    pub fn save(&self, app_handle: &tauri::AppHandle) {
        let path = Self::config_path(app_handle);
        let json = serde_json::to_string_pretty(self).expect("failed to serialize config");
        fs::write(path, json).expect("failed to write config");
    }
}
```

- [ ] **Step 2: Register the module in lib.rs**

Add to `src-tauri/src/lib.rs`:

```rust
mod config;
mod commands;
mod search;
mod fetcher;
```

(The other modules will be created as empty files for now to avoid compile errors.)

Create placeholder files:

`src-tauri/src/commands.rs`:
```rust
// IPC commands — implemented in Task 5
```

`src-tauri/src/search.rs`:
```rust
// Brave Search API client — implemented in Task 3
```

`src-tauri/src/fetcher.rs`:
```rust
// Parallel page fetcher — implemented in Task 4
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/sourab/Development/ubernerd117/lturq
npm run tauri dev
```

Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/config.rs src-tauri/src/commands.rs src-tauri/src/search.rs src-tauri/src/fetcher.rs src-tauri/src/lib.rs
git commit -m "feat: add config module with JSON persistence"
```

---

## Task 3: Brave Search API Client (Rust)

**Files:**
- Modify: `src-tauri/src/search.rs`

- [ ] **Step 1: Implement the search client**

```rust
// src-tauri/src/search.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub description: String,
}

#[derive(Deserialize)]
struct BraveResponse {
    web: Option<BraveWeb>,
}

#[derive(Deserialize)]
struct BraveWeb {
    results: Vec<BraveResult>,
}

#[derive(Deserialize)]
struct BraveResult {
    title: String,
    url: String,
    description: String,
}

pub async fn search_brave(
    api_key: &str,
    query: &str,
    count: u8,
) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("X-Subscription-Token", api_key)
        .header("Accept", "application/json")
        .query(&[("q", query), ("count", &count.to_string())])
        .send()
        .await
        .map_err(|e| format!("Search request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Search API returned status: {}", resp.status()));
    }

    let brave_resp: BraveResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse search response: {}", e))?;

    let results = brave_resp
        .web
        .map(|w| {
            w.results
                .into_iter()
                .map(|r| SearchResult {
                    title: r.title,
                    url: r.url,
                    description: r.description,
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(results)
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run tauri dev
```

Expected: Compiles without errors (no callers yet, but the types should be valid).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/search.rs
git commit -m "feat: add Brave Search API client"
```

---

## Task 4: Parallel Page Fetcher (Rust)

**Files:**
- Modify: `src-tauri/src/fetcher.rs`

- [ ] **Step 1: Implement the parallel fetcher**

```rust
// src-tauri/src/fetcher.rs
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct FetchedPage {
    pub url: String,
    pub html: Option<String>,
    pub error: Option<String>,
}

pub async fn fetch_single_page(url: String) -> FetchedPage {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    match client.get(&url).send().await {
        Ok(resp) => match resp.text().await {
            Ok(html) => FetchedPage {
                url,
                html: Some(html),
                error: None,
            },
            Err(e) => FetchedPage {
                url,
                html: None,
                error: Some(format!("Failed to read body: {}", e)),
            },
        },
        Err(e) => FetchedPage {
            url,
            html: None,
            error: Some(format!("Failed to fetch: {}", e)),
        },
    }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run tauri dev
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/fetcher.rs
git commit -m "feat: add parallel page fetcher"
```

---

## Task 5: Tauri IPC Commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Implement IPC commands**

```rust
// src-tauri/src/commands.rs
use crate::config::AppConfig;
use crate::fetcher::{self, FetchedPage};
use crate::search::{self, SearchResult};
use tauri::Manager;

#[tauri::command]
pub async fn search_query(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let config = AppConfig::load(&app);
    if config.brave_api_key.is_empty() {
        return Err("No API key configured".to_string());
    }
    search::search_brave(&config.brave_api_key, &query, config.results_count).await
}

#[tauri::command]
pub async fn fetch_single_page(url: String) -> FetchedPage {
    fetcher::fetch_single_page(url).await
}

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> AppConfig {
    AppConfig::load(&app)
}

#[tauri::command]
pub fn save_config(app: tauri::AppHandle, config: AppConfig) {
    config.save(&app);
}
```

Note: `open_in_browser` is NOT a Rust command — we use `@tauri-apps/plugin-shell`'s `open()` on the frontend instead, avoiding an extra crate dependency.

- [ ] **Step 2: Wire commands into lib.rs**

Update `src-tauri/src/lib.rs` to register all commands:

```rust
mod commands;
mod config;
mod fetcher;
mod search;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::search_query,
            commands::fetch_single_page,
            commands::get_config,
            commands::save_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npm run tauri dev
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: wire up IPC commands for search, fetch, config"
```

---

## Task 6: System Tray + Global Shortcut + Window Management (Rust)

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add tray and shortcut setup to lib.rs**

Update `lib.rs` to set up the system tray, register the global shortcut, and handle window show/hide:

```rust
mod commands;
mod config;
mod fetcher;
mod search;

use config::AppConfig;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings_item, &quit_item])?;

    TrayIconBuilder::new()
        .icon(Image::from_path("icons/icon.png").unwrap_or_else(|_| {
            app.default_window_icon().cloned().expect("no app icon")
        }))
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("show-settings", ());
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn setup_shortcut(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    let app_handle = app.handle().clone();

    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |_app, _shortcut, event| {
                if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("window-shown", ());
                        }
                    }
                }
            })
            .build(),
    )?;

    app.global_shortcut().register(shortcut)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            setup_tray(app)?;
            setup_shortcut(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::search_query,
            commands::fetch_single_page,
            commands::get_config,
            commands::save_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Set `"visible": false` in tauri.conf.json window config**

Ensure the window starts hidden (shown only by shortcut).

- [ ] **Step 3: Test the shortcut**

```bash
npm run tauri dev
```

Press `Opt+Space`. Expected: window appears. Press again: window hides. Right-click tray icon: shows "Settings" and "Quit" menu.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/tauri.conf.json
git commit -m "feat: add system tray, global shortcut, window toggle"
```

---

## Task 7: Frontend — Styles

**Files:**
- Create: `src/style.css`

- [ ] **Step 1: Write the dark theme CSS**

```css
/* src/style.css */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  background: transparent;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  color: #c0caf5;
  overflow: hidden;
  height: 100%;
}

#app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Search Input State */
.search-container {
  background: #1a1b26;
  border-radius: 12px;
  border: 1px solid #2d2d2d;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-icon {
  color: #565f89;
  font-size: 18px;
  flex-shrink: 0;
}

.search-input {
  background: none;
  border: none;
  outline: none;
  color: #c0caf5;
  font-size: 16px;
  flex: 1;
  font-family: inherit;
}

.search-input::placeholder {
  color: #565f89;
}

.search-hint {
  color: #565f89;
  font-size: 12px;
  background: #2d2d2d;
  padding: 2px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

/* API Key Setup */
.api-key-container {
  background: #1a1b26;
  border-radius: 12px;
  border: 1px solid #2d2d2d;
  padding: 20px;
}

.api-key-container h3 {
  color: #7aa2f7;
  font-size: 14px;
  margin-bottom: 12px;
}

.api-key-input {
  background: #2d2d2d;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  color: #c0caf5;
  font-size: 14px;
  padding: 8px 12px;
  width: 100%;
  outline: none;
  font-family: monospace;
  margin-bottom: 10px;
}

.api-key-input:focus {
  border-color: #7aa2f7;
}

.api-key-save {
  background: #7aa2f7;
  border: none;
  border-radius: 6px;
  color: #1a1b26;
  font-size: 13px;
  padding: 6px 16px;
  cursor: pointer;
  font-weight: 600;
}

/* Reader State */
.reader-container {
  background: #1a1b26;
  border-radius: 12px;
  border: 1px solid #2d2d2d;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Tab Bar */
.tab-bar {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #2d2d2d;
  padding: 0;
  flex-shrink: 0;
}

.tab {
  padding: 10px 16px;
  font-size: 12px;
  color: #565f89;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
}

.tab.active {
  color: #c0caf5;
  border-bottom-color: #7aa2f7;
  background: #1e2030;
}

.tab .tab-number {
  color: #7aa2f7;
  margin-right: 4px;
}

.tab.active .tab-number {
  color: #7aa2f7;
}

.tab-hints {
  margin-left: auto;
  padding: 10px 16px;
  font-size: 11px;
  color: #565f89;
  white-space: nowrap;
}

/* Content Area */
.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  scrollbar-width: thin;
  scrollbar-color: #2d2d2d transparent;
}

.content-area::-webkit-scrollbar {
  width: 6px;
}

.content-area::-webkit-scrollbar-thumb {
  background: #2d2d2d;
  border-radius: 3px;
}

.content-source {
  color: #565f89;
  font-size: 11px;
  margin-bottom: 8px;
}

.content-area h1,
.content-area h2,
.content-area h3,
.content-area h4 {
  color: #c0caf5;
  margin: 20px 0 8px 0;
  font-weight: 600;
}

.content-area h1 { font-size: 22px; margin-top: 0; }
.content-area h2 { font-size: 18px; }
.content-area h3 { font-size: 16px; }

.content-area p {
  color: #a9b1d6;
  line-height: 1.7;
  font-size: 14px;
  margin-bottom: 12px;
}

.content-area a {
  color: #7aa2f7;
  text-decoration: none;
}

.content-area ul, .content-area ol {
  color: #a9b1d6;
  padding-left: 24px;
  margin-bottom: 12px;
  line-height: 1.7;
  font-size: 14px;
}

.content-area blockquote {
  border-left: 3px solid #7aa2f7;
  padding-left: 16px;
  color: #787c99;
  margin: 12px 0;
}

.content-area pre, .content-area code {
  background: #2d2d2d;
  border-radius: 4px;
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: 13px;
}

.content-area pre {
  padding: 12px;
  overflow-x: auto;
  margin-bottom: 12px;
}

.content-area code {
  padding: 2px 4px;
}

/* Images hidden by default */
.content-area img {
  display: none;
}

.content-area.show-images img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 12px 0;
}

/* Loading State */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
}

.loading-text {
  color: #7aa2f7;
  font-size: 14px;
}

.loading-dots {
  display: flex;
  gap: 6px;
}

.loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #565f89;
}

.loading-dot.ready {
  background: #9ece6a;
}

.loading-progress {
  color: #565f89;
  font-size: 12px;
}

/* Error State */
.error-message {
  color: #f7768e;
  font-size: 14px;
  padding: 20px;
  text-align: center;
}

.error-message .retry-hint {
  color: #565f89;
  font-size: 12px;
  margin-top: 8px;
}

/* No content fallback */
.no-content {
  color: #565f89;
  font-size: 14px;
  text-align: center;
  padding: 40px 20px;
}

.no-content .open-hint {
  color: #7aa2f7;
  margin-top: 8px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/style.css
git commit -m "feat: add dark theme styles for all UI states"
```

---

## Task 8: Frontend — Readability Wrapper

**Files:**
- Create: `src/readability.ts`

- [ ] **Step 1: Install @mozilla/readability**

```bash
npm install @mozilla/readability
```

- [ ] **Step 2: Write the readability wrapper**

```typescript
// src/readability.ts
import { Readability } from "@mozilla/readability";

export interface ParsedArticle {
  title: string;
  content: string; // clean HTML
  textContent: string;
  excerpt: string;
  siteName: string | null;
}

export function parseArticle(
  html: string,
  url: string
): ParsedArticle | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Set the base URL so relative links resolve
  const base = doc.createElement("base");
  base.href = url;
  doc.head.appendChild(base);

  const reader = new Readability(doc);
  const article = reader.parse();

  if (!article) return null;

  return {
    title: article.title,
    content: article.content,
    textContent: article.textContent,
    excerpt: article.excerpt,
    siteName: article.siteName,
  };
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/readability.ts package.json package-lock.json
git commit -m "feat: add Readability.js content stripping wrapper"
```

---

## Task 9: Frontend — Search Input Component

**Files:**
- Create: `src/search-input.ts`

- [ ] **Step 1: Write the search input component**

```typescript
// src/search-input.ts

export interface SearchInputCallbacks {
  onSearch: (query: string) => void;
  onDismiss: () => void;
}

export function createSearchInput(
  container: HTMLElement,
  callbacks: SearchInputCallbacks
): { focus: () => void; setValue: (v: string) => void; getElement: () => HTMLElement } {
  const el = document.createElement("div");
  el.className = "search-container";
  el.innerHTML = `
    <span class="search-icon">&#128269;</span>
    <input class="search-input" type="text" placeholder="Search anything..." autofocus />
    <span class="search-hint">Enter ↵</span>
  `;

  const input = el.querySelector(".search-input") as HTMLInputElement;

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && input.value.trim()) {
      e.preventDefault();
      callbacks.onSearch(input.value.trim());
    }
    if (e.key === "Escape") {
      e.preventDefault();
      callbacks.onDismiss();
    }
  });

  container.appendChild(el);

  return {
    focus: () => {
      input.focus();
      input.select();
    },
    setValue: (v: string) => {
      input.value = v;
    },
    getElement: () => el,
  };
}

export function createApiKeySetup(
  container: HTMLElement,
  onSave: (key: string) => void
): HTMLElement {
  const el = document.createElement("div");
  el.className = "api-key-container";
  el.innerHTML = `
    <h3>Enter your Brave Search API key to get started</h3>
    <input class="api-key-input" type="text" placeholder="BSA..." />
    <button class="api-key-save">Save</button>
  `;

  const input = el.querySelector(".api-key-input") as HTMLInputElement;
  const button = el.querySelector(".api-key-save") as HTMLButtonElement;

  const save = () => {
    const key = input.value.trim();
    if (key) onSave(key);
  };

  button.addEventListener("click", save);
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") save();
  });

  container.appendChild(el);
  setTimeout(() => input.focus(), 50);

  return el;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/search-input.ts
git commit -m "feat: add search input and API key setup components"
```

---

## Task 10: Frontend — Reader View Component

**Files:**
- Create: `src/reader.ts`

- [ ] **Step 1: Write the reader view component**

```typescript
// src/reader.ts
import { getDomain, ParsedArticle } from "./readability";

export interface ReaderPage {
  url: string;
  domain: string;
  article: ParsedArticle | null;
  error: string | null;
  loading: boolean;
}

export interface ReaderState {
  pages: ReaderPage[];
  activeIndex: number;
  showImages: boolean;
}

export function createReader(container: HTMLElement): {
  render: (state: ReaderState) => void;
  getContentArea: () => HTMLElement | null;
} {
  const el = document.createElement("div");
  el.className = "reader-container";
  container.appendChild(el);

  function render(state: ReaderState) {
    const { pages, activeIndex, showImages } = state;

    // Tab bar
    const tabsHtml = pages
      .map((page, i) => {
        const active = i === activeIndex ? "active" : "";
        const label = page.loading
          ? "Loading..."
          : page.domain || getDomain(page.url);
        return `<div class="tab ${active}" data-index="${i}">
          <span class="tab-number">${i + 1}</span> ${label}
        </div>`;
      })
      .join("");

    const hints = `<div class="tab-hints">h/l: nav · j/k: scroll · i: images · o: open · esc: close</div>`;

    // Content
    const activePage = pages[activeIndex];
    let contentHtml = "";

    if (!activePage) {
      contentHtml = `<div class="loading-container"><div class="loading-text">No results</div></div>`;
    } else if (activePage.loading) {
      const readyCount = pages.filter((p) => !p.loading).length;
      const dots = pages
        .map((p) => `<div class="loading-dot ${p.loading ? "" : "ready"}"></div>`)
        .join("");
      contentHtml = `
        <div class="loading-container">
          <div class="loading-text">Fetching pages...</div>
          <div class="loading-dots">${dots}</div>
          <div class="loading-progress">${readyCount} of ${pages.length} ready</div>
        </div>`;
    } else if (activePage.error) {
      contentHtml = `
        <div class="error-message">
          ${activePage.error}
          <div class="retry-hint">Press / to search again</div>
        </div>`;
    } else if (activePage.article) {
      const imgClass = showImages ? "show-images" : "";
      contentHtml = `
        <div class="content-area ${imgClass}">
          <div class="content-source">${activePage.domain || getDomain(activePage.url)}</div>
          ${activePage.article.content}
        </div>`;
    } else {
      contentHtml = `
        <div class="no-content">
          No readable content found.
          <div class="open-hint">Press <strong>o</strong> to open in browser</div>
        </div>`;
    }

    el.innerHTML = `
      <div class="tab-bar">${tabsHtml}${hints}</div>
      ${contentHtml}
    `;

    // Tab click handlers
    el.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const index = parseInt((tab as HTMLElement).dataset.index || "0");
        state.activeIndex = index;
        render(state);
      });
    });
  }

  return {
    render,
    getContentArea: () => el.querySelector(".content-area"),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/reader.ts
git commit -m "feat: add reader view with tabs, content display, loading states"
```

---

## Task 11: Frontend — Keybindings

**Files:**
- Create: `src/keybindings.ts`

- [ ] **Step 1: Write the keybinding handler**

```typescript
// src/keybindings.ts

export interface KeybindingActions {
  prevPage: () => void;
  nextPage: () => void;
  scrollDown: () => void;
  scrollUp: () => void;
  toggleImages: () => void;
  openInBrowser: () => void;
  dismiss: () => void;
  focusSearch: () => void;
  jumpToPage: (index: number) => void;
}

export function setupKeybindings(
  actions: KeybindingActions,
  scrollSpeed: number
): () => void {
  const scrollAmount = scrollSpeed * 40;

  function handler(e: KeyboardEvent) {
    // Don't intercept when typing in an input
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return;
    }

    switch (e.key) {
      case "h":
        e.preventDefault();
        actions.prevPage();
        break;
      case "l":
        e.preventDefault();
        actions.nextPage();
        break;
      case "j":
        e.preventDefault();
        actions.scrollDown();
        break;
      case "k":
        e.preventDefault();
        actions.scrollUp();
        break;
      case "i":
        e.preventDefault();
        actions.toggleImages();
        break;
      case "o":
        e.preventDefault();
        actions.openInBrowser();
        break;
      case "Escape":
        e.preventDefault();
        actions.dismiss();
        break;
      case "/":
        e.preventDefault();
        actions.focusSearch();
        break;
      default:
        // Number keys 1-9 for direct page jump
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          actions.jumpToPage(num - 1);
        }
        break;
    }
  }

  document.addEventListener("keydown", handler);

  // Return cleanup function
  return () => document.removeEventListener("keydown", handler);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/keybindings.ts
git commit -m "feat: add vim-style keybinding handler"
```

---

## Task 12: Frontend — Main App (Wire Everything Together)

**Files:**
- Modify: `src/main.ts`
- Modify: `src/index.html`

- [ ] **Step 1: Write main.ts — the app state machine**

```typescript
// src/main.ts
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/window";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import "./style.css";
import { createSearchInput, createApiKeySetup } from "./search-input";
import { createReader, ReaderPage, ReaderState } from "./reader";
import { setupKeybindings } from "./keybindings";
import { parseArticle, getDomain } from "./readability";

type AppState = "search" | "loading" | "reader" | "api-key-setup";

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

interface FetchedPage {
  url: string;
  html: string | null;
  error: string | null;
}

const appEl = document.getElementById("app")!;
const appWindow = getCurrentWindow();

let currentState: AppState = "search";
let readerState: ReaderState = {
  pages: [],
  activeIndex: 0,
  showImages: false,
};
let searchInput: ReturnType<typeof createSearchInput> | null = null;
let reader: ReturnType<typeof createReader> | null = null;
let cleanupKeybindings: (() => void) | null = null;
let scrollSpeed = 3;

async function init() {
  const config = await invoke<{
    brave_api_key: string;
    scroll_speed: number;
    results_count: number;
  }>("get_config");

  scrollSpeed = config.scroll_speed;

  if (!config.brave_api_key) {
    showApiKeySetup();
  } else {
    showSearch();
  }

  // Listen for window shown events (from global shortcut)
  appWindow.listen("window-shown", () => {
    if (currentState === "search" && searchInput) {
      searchInput.focus();
    }
  });

  // Listen for settings request from tray
  appWindow.listen("show-settings", () => {
    showApiKeySetup();
  });
}

function clearApp() {
  appEl.innerHTML = "";
  if (cleanupKeybindings) {
    cleanupKeybindings();
    cleanupKeybindings = null;
  }
  searchInput = null;
  reader = null;
}

function showApiKeySetup() {
  currentState = "api-key-setup";
  clearApp();
  appWindow.setSize(new LogicalSize(500, 140));

  createApiKeySetup(appEl, async (key: string) => {
    const config = await invoke<any>("get_config");
    config.brave_api_key = key;
    await invoke("save_config", { config });
    showSearch();
  });
}

async function showSearch() {
  currentState = "search";
  clearApp();
  await appWindow.setSize(
    new LogicalSize(600, 80)
  );
  await appWindow.center();

  searchInput = createSearchInput(appEl, {
    onSearch: handleSearch,
    onDismiss: dismissWindow,
  });
  searchInput.focus();
}

async function handleSearch(query: string) {
  currentState = "loading";
  clearApp();
  await appWindow.setSize(
    new LogicalSize(800, 600)
  );
  await appWindow.center();

  // Initialize reader with loading pages
  readerState = {
    pages: [],
    activeIndex: 0,
    showImages: false,
  };

  reader = createReader(appEl);

  // Search
  let results: SearchResult[];
  try {
    results = await invoke<SearchResult[]>("search_query", { query });
  } catch (err) {
    appEl.innerHTML = `<div class="reader-container">
      <div class="error-message">
        ${err}
        <div class="retry-hint">Press / to search again</div>
      </div>
    </div>`;
    setupReaderKeybindings();
    return;
  }

  if (results.length === 0) {
    appEl.innerHTML = `<div class="reader-container">
      <div class="error-message">
        No results found
        <div class="retry-hint">Press / to search again</div>
      </div>
    </div>`;
    setupReaderKeybindings();
    return;
  }

  // Initialize pages as loading
  readerState.pages = results.map((r) => ({
    url: r.url,
    domain: getDomain(r.url),
    article: null,
    error: null,
    loading: true,
  }));
  reader.render(readerState);
  setupReaderKeybindings();

  // Fetch pages individually in parallel — stream results as they arrive
  currentState = "reader";
  const fetchPromises = results.map((r, i) =>
    invoke<FetchedPage>("fetch_single_page", { url: r.url }).then((fp) => {
      const page = readerState.pages[i];
      page.loading = false;

      if (fp.error || !fp.html) {
        page.error = fp.error || "Could not load page";
      } else {
        page.article = parseArticle(fp.html, fp.url);
      }

      reader!.render(readerState);
    }).catch(() => {
      readerState.pages[i].loading = false;
      readerState.pages[i].error = "Failed to fetch page";
      reader!.render(readerState);
    })
  );

  await Promise.all(fetchPromises);
}

function setupReaderKeybindings() {
  if (cleanupKeybindings) cleanupKeybindings();

  cleanupKeybindings = setupKeybindings(
    {
      prevPage: () => {
        if (readerState.activeIndex > 0) {
          readerState.activeIndex--;
          reader?.render(readerState);
        }
      },
      nextPage: () => {
        if (readerState.activeIndex < readerState.pages.length - 1) {
          readerState.activeIndex++;
          reader?.render(readerState);
        }
      },
      scrollDown: () => {
        const area = reader?.getContentArea();
        if (area) area.scrollTop += scrollSpeed * 40;
      },
      scrollUp: () => {
        const area = reader?.getContentArea();
        if (area) area.scrollTop -= scrollSpeed * 40;
      },
      toggleImages: () => {
        readerState.showImages = !readerState.showImages;
        reader?.render(readerState);
      },
      openInBrowser: async () => {
        const page = readerState.pages[readerState.activeIndex];
        if (page?.url) {
          await shellOpen(page.url);
        }
      },
      dismiss: dismissWindow,
      focusSearch: () => showSearch(),
      jumpToPage: (index: number) => {
        if (index >= 0 && index < readerState.pages.length) {
          readerState.activeIndex = index;
          reader?.render(readerState);
        }
      },
    },
    scrollSpeed
  );
}

async function dismissWindow() {
  await appWindow.hide();
  showSearch(); // Reset to search state for next invocation
}

init();
```

- [ ] **Step 2: Update index.html if needed**

Ensure `src/index.html` matches the structure from Task 1 Step 6.

- [ ] **Step 3: Test the full flow**

```bash
npm run tauri dev
```

Expected flow:
1. `Opt+Space` shows search bar
2. Type a query, hit Enter
3. Window expands, shows loading, then reader view
4. `h`/`l` switches tabs, `j`/`k` scrolls, `o` opens in browser, `Esc` hides

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/index.html
git commit -m "feat: wire up complete app flow — search, fetch, read, navigate"
```

---

## Task 13: Add .gitignore and Clean Up

**Files:**
- Create/modify: `.gitignore`

- [ ] **Step 1: Ensure .gitignore is complete**

```
node_modules/
dist/
src-tauri/target/
.superpowers/
*.log
```

- [ ] **Step 2: Verify the full app works end-to-end**

```bash
npm run tauri dev
```

Test checklist:
- [ ] `Opt+Space` shows window
- [ ] First-run prompts for API key
- [ ] Search returns results
- [ ] Pages load and display stripped content
- [ ] `h`/`l` navigates between tabs
- [ ] `j`/`k` scrolls content
- [ ] `i` toggles images
- [ ] `o` opens in default browser
- [ ] `Esc` hides window
- [ ] `/` returns to search input
- [ ] `1`–`4` jumps to specific tab
- [ ] Tray icon shows with Settings/Quit menu
- [ ] `Opt+Space` again shows window (app stays resident)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: lturq v1 — speed search reader with vim keybindings"
```
