# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Strafe

Strafe is a Tauri v2 desktop app — a keyboard-driven web reader activated via a global hotkey (Alt+Space). Users search via the Brave Search API, and results are fetched in parallel and rendered using Mozilla Readability with vim-style navigation.

## Build & Dev Commands

```bash
npm run dev              # Vite dev server on localhost:1420
npm run build            # TypeScript compile + Vite bundle → dist/
npm run tauri dev        # Full dev mode (Vite + Rust hot-reload)
npm run tauri build      # Production build → DMG/app bundle
```

Rust backend builds are managed by Tauri CLI (`cargo build` happens under `npm run tauri dev/build`). No test suite or linter is configured.

## Architecture

**Two-process model:** Rust backend (networking, OS integration, config) ↔ TypeScript frontend (UI, content parsing, keybindings), communicating via Tauri's invoke IPC.

### Frontend (`src/`)

Vanilla TypeScript with no framework. The app is a state machine in `main.ts` with states: `search`, `loading`, `reader`, `api-key-setup`, `settings`. Each state maps to a module:

- **main.ts** — State machine, window show/hide lifecycle, orchestrates transitions
- **search-input.ts** — Search bar UI and API key setup form
- **reader.ts** — Article tab bar, content rendering, loading indicators
- **keybindings.ts** — Vim-style key handlers (h/l tabs, j/k scroll, i images, w raw view, o open in browser)
- **readability.ts** — Wraps `@mozilla/readability` for article extraction from raw HTML
- **settings.ts** — Settings panel (shortcut, result count, scroll speed, theme, default view)
- **style.css** — All styles, CSS variables for theming (dark/light/high-contrast variants), JetBrains Mono + Literata fonts

### Backend (`src-tauri/src/`)

- **lib.rs** — Tauri setup: system tray, global shortcut registration, window visibility toggle, event emission
- **commands.rs** — IPC command handlers bridging frontend invoke calls to backend logic
- **search.rs** — Brave Search API client
- **fetcher.rs** — HTTP page fetching via reqwest with timeout and user-agent spoofing
- **config.rs** — JSON config persistence in Tauri app config dir (`~/.config/strafe/config.json`)

### Data Flow

1. Global shortcut (Alt+Space) → Rust emits `window-shown` event → frontend focuses search input
2. Search query → `search_query` Tauri command → Brave API → results
3. For each result URL, `fetch_single_page` runs in parallel → raw HTML returned to frontend
4. Frontend parses HTML with Readability.js client-side → rendered in reader tabs

## Key Conventions

- **No framework** — DOM manipulation is direct; rendering functions return HTML strings or modify `innerHTML`
- **Window is 600x80px, transparent, undecorated, always-on-top** — it resizes dynamically based on state (search bar vs reader)
- **macOS-focused** — uses `macOSPrivateApi: true` for transparency; builds target macOS primarily
- **Config stored as JSON** — Rust `AppConfig` struct with serde, synced to frontend via invoke commands
- **Brave Search API key required** — stored in config, user prompted on first launch
