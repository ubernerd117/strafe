# lturq — Speed Search Reader

A Tauri v2 desktop app (macOS-first) that lets you invoke a global shortcut, type a search query, and instantly read stripped-down versions of the top N results — all navigable with vim keybindings. The goal is to go from question to "I roughly know the answer" in under 20 seconds.

## Architecture

### Three layers

1. **Tauri Shell** — native window management, global shortcuts, system tray, app lifecycle
2. **Rust Backend** — search API calls, parallel page fetching, configuration management
3. **Web Frontend (TypeScript)** — search input, content rendering, keybinding handling, Readability.js content stripping

### Data flow

```
Global Shortcut → Show Window → User types query → Enter
  → [Rust] Call Brave Search API → Get top N URLs
  → [Rust] Fetch all N pages in parallel (reqwest) → Return raw HTML
  → [Frontend] Strip each page with Readability.js → Render clean content
  → User reads with vim keybindings → Esc to dismiss / o to open in browser
```

### Why this split

- Content stripping happens in the frontend because Readability.js is battle-tested (used by Firefox Reader View) and the JS ecosystem has no Rust equivalent of equal quality.
- Page fetching happens in Rust because Tauri's webview has CORS restrictions — fetching arbitrary websites from the frontend would fail. Rust's `reqwest` has no such limitation and supports parallel async fetching natively.
- The Tauri IPC bridge connects the two: frontend calls `invoke("search", { query })` and `invoke("fetch_pages", { urls })`, Rust returns structured data.

## UI Design

### Three states

#### State 1: Search Input
- Triggered by global shortcut (default: `Opt+Space`, user-configurable)
- Floating borderless window, ~600px wide, centered in the top third of the screen
- Single search input, auto-focused
- Press `Enter` to search, `Esc` to dismiss

#### State 2: Loading
- Window expands to reading size (~800×600)
- Tab bar appears with numbered slots (1–N)
- Pages stream in — display the first page as soon as it's ready, don't wait for all N
- Loading indicator shows progress (e.g., "2 of 4 ready")

#### State 3: Reader View
- Tab bar shows page numbers and source domains (e.g., "1 Wikipedia", "2 Formula1.com")
- Active tab highlighted
- Content area shows stripped article: headings, paragraphs, source URL
- Images hidden by default (toggle with `i`)
- Keybinding cheat sheet in the tab bar (subtle, right-aligned)

### Keybindings

| Key | Action |
|-----|--------|
| `h` / `l` | Previous / next page |
| `j` / `k` | Scroll down / up |
| `i` | Toggle images on/off |
| `o` | Open current page in default browser |
| `Esc` | Dismiss window (app stays in system tray) |
| `/` | Focus search bar for a new query |
| `1`–`4` | Jump directly to page N |

### Window behavior
- Always-on-top floating window (like Spotlight)
- Click outside the window dismisses it (configurable)
- App lives in the system tray — the shortcut works anytime
- No dock icon when window is hidden

## Search API

### Brave Search API
- Free tier: 2,000 queries/month (sufficient for personal use)
- Returns structured results: title, URL, description
- Simple REST API with API key authentication
- Endpoint: `GET https://api.search.brave.com/res/v1/web/search?q={query}&count={n}`

### Why Brave Search
- Free tier is generous enough for personal use
- Clean, well-documented API
- No OAuth complexity (just an API key header)
- Returns structured JSON — no scraping needed

### API key management
- Stored in the app's config file (Tauri's `app_config_dir`)
- First-run setup: prompt user to enter their Brave Search API key
- Settings screen accessible from system tray menu

## Content Stripping

### Readability.js (Mozilla)
- The same engine behind Firefox's Reader View
- Extracts: title, author, content (clean HTML), text content, excerpt
- Handles most websites well — Wikipedia, news sites, blogs
- Runs client-side in the Tauri webview — no additional dependencies

### Image handling
- By default, images are stripped from the Readability output (CSS `display: none`)
- Press `i` to toggle images on for the current page
- Images load lazily when toggled on — no pre-fetching

## Configuration

### Config file
- Location: Tauri's `app_config_dir` (`~/Library/Application Support/com.lturq.app/config.json`)
- Format: JSON

### Configurable settings
```json
{
  "shortcut": "Option+Space",
  "results_count": 4,
  "brave_api_key": "BSA...",
  "click_outside_dismisses": true,
  "scroll_speed": 3
}
```

- `scroll_speed`: multiplier for j/k scroll distance. 1 = 40px per keypress, 3 = 120px. Range: 1–10.

### First-run setup
- On first launch with no API key, the search input shows an inline prompt: "Enter your Brave Search API key to get started" with a text field and save button.
- No modal dialogs — keeps the Spotlight-like feel.

### Shortcut conflict handling
- If the configured shortcut is already claimed by another app, Tauri will fail to register it silently. The app should detect this and show a system tray notification: "Shortcut unavailable — click to change."
- Settings screen lets the user pick an alternative.

```
```

### Settings access
- System tray right-click → "Settings"
- Opens a simple settings view inside the app window

## Tech Stack

| Component | Technology |
|-----------|-----------|
| App framework | Tauri v2 |
| Backend language | Rust |
| HTTP client | reqwest (async, parallel fetching) |
| Serialization | serde + serde_json |
| Frontend language | TypeScript (vanilla, no framework) |
| Bundler | Vite |
| Content stripping | @mozilla/readability + DOMParser |
| Search API | Brave Search API (free tier) |

## Project Structure

```
lturq/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # Tauri app setup, tray, shortcuts
│   │   ├── commands.rs       # IPC commands (search, fetch_pages)
│   │   ├── search.rs         # Brave Search API client
│   │   ├── fetcher.rs        # Parallel page fetcher
│   │   └── config.rs         # Config read/write
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── main.ts               # App entry point
│   ├── search-input.ts       # Search bar component
│   ├── reader.ts             # Reader view + tab management
│   ├── keybindings.ts        # Vim-style key handler
│   ├── readability.ts        # Content stripping wrapper
│   ├── style.css             # All styles
│   └── index.html            # Single HTML entry
├── package.json
├── tsconfig.json
├── vite.config.ts
└── docs/
```

## Error Handling

- **No API key:** First-run prompt to enter Brave Search API key. Cannot search without it.
- **Search API failure:** Show inline error in the search bar area. Allow retry.
- **Page fetch failure:** Show "Could not load" in that tab. Other tabs still work.
- **Page has no readable content:** Show the page title + URL with a message "No readable content found. Press `o` to open in browser."
- **Network offline:** Show "No internet connection" in the search bar.

## Out of Scope (v1)

- Search history / bookmarks (ephemeral by design)
- Multiple search engine support (Brave only for now)
- Windows / Linux support (macOS-first, but Tauri is cross-platform so it should mostly work)
- AI-powered summaries
- Caching / offline mode
- Theming (dark mode only for v1)

## Success Criteria

1. Global shortcut summons the window in under 100ms
2. Search results + page content displayed in under 2 seconds (network permitting)
3. Navigating between pages with h/l is instant (all pages pre-loaded)
4. Total flow from shortcut to "I know the answer" is under 20 seconds
5. App binary is under 15MB
6. Memory usage under 100MB during active use
