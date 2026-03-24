<p align="center">
  <img src="icon_rounded.png" width="128" height="128" alt="Strafe">
</p>

<h1 align="center">Strafe</h1>

<p align="center">
  Speed search reader with vim keybindings.<br>
  Search → read stripped pages → move on. Under 20 seconds.
</p>

<p align="center">
  <a href="https://github.com/ubernerd117/strafe/releases/latest">
    <img src="https://img.shields.io/github/v/release/ubernerd117/strafe?style=flat-square&color=00d4aa" alt="Release">
  </a>
  <img src="https://img.shields.io/badge/platform-macOS-333?style=flat-square" alt="macOS">
  <img src="https://img.shields.io/github/license/ubernerd117/strafe?style=flat-square&color=333" alt="License">
</p>

---

## Download

**[Download Strafe for macOS (Apple Silicon)](https://github.com/ubernerd117/strafe/releases/latest/download/Strafe_0.1.0_aarch64.dmg)** — 5.9 MB

> Requires macOS 10.15+. On first launch, grant Accessibility permission for the global shortcut.

## What it does

Press `Option+Space` anywhere. A search bar appears. Type your query, hit Enter. Strafe fetches the top results, strips them down to clean readable text using Mozilla's Readability engine, and lets you flip through them instantly with vim keys.

No tabs. No ads. No waiting. Just the content.

## Keybindings

| Key | Action |
|-----|--------|
| `h` / `l` | Previous / next page |
| `j` / `k` | Scroll down / up |
| `w` | Toggle raw website view |
| `i` | Toggle images |
| `o` | Open current page in browser |
| `/` | New search |
| `1`–`9` | Jump to page N |
| `Esc` | Dismiss window |

## Setup

1. Open the DMG and drag Strafe to Applications
2. Launch Strafe — it lives in your menu bar
3. Press `Option+Space` to open the search bar
4. On first launch, enter your [Brave Search API key](https://brave.com/search/api/) (free tier: 2,000 searches/month)
5. Search away

## Settings

Right-click the menu bar icon → **Settings**

- **Global shortcut** — change from `Option+Space` to whatever you want
- **Results count** — how many pages to fetch (1–10)
- **Scroll speed** — j/k scroll multiplier
- **Default view** — text only, text + images, or raw website
- **Theme** — auto (follows system), dark, light, high contrast dark, high contrast light

## How it works

```
Option+Space → search bar → Enter
  → Brave Search API → top N URLs
  → Parallel fetch all pages (Rust/reqwest)
  → Strip with Readability.js → render clean text
  → Navigate with vim keys → Esc to dismiss
```

Pages are fetched in parallel and streamed — you see the first result as soon as it loads. The search results page itself is never shown; you go straight to the content.

## Tech stack

- [Tauri v2](https://v2.tauri.app/) — native shell, ~6MB binary
- Rust — search API calls, parallel page fetching
- TypeScript — UI, content stripping, keybindings
- [Readability.js](https://github.com/mozilla/readability) — Mozilla's reader mode engine
- [Brave Search API](https://brave.com/search/api/) — structured search results

## Build from source

```bash
# Prerequisites: Rust, Node.js
git clone https://github.com/ubernerd117/strafe.git
cd strafe
npm install
npm run tauri build
# DMG at src-tauri/target/release/bundle/dmg/
```

## License

MIT
