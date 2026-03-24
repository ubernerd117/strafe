import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import "./style.css";
import { createSearchInput, createApiKeySetup } from "./search-input";
import { createReader, type ReaderState } from "./reader";
import { setupKeybindings } from "./keybindings";
import { parseArticle, getDomain } from "./readability";

import { createSettings } from "./settings";

type AppState = "search" | "loading" | "reader" | "api-key-setup" | "settings";

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
  showRawView: false,
};
let searchInput: ReturnType<typeof createSearchInput> | null = null;
let reader: ReturnType<typeof createReader> | null = null;
let cleanupKeybindings: (() => void) | null = null;
let scrollSpeed = 3;
let defaultViewMode: string = "text";

async function init() {
  const config = await invoke<{
    brave_api_key: string;
    scroll_speed: number;
    results_count: number;
    theme: string;
    default_view: string;
  }>("get_config");

  scrollSpeed = config.scroll_speed;
  defaultViewMode = config.default_view;
  applyTheme(config.theme);

  if (!config.brave_api_key) {
    showApiKeySetup();
  } else {
    showSearch();
  }

  appWindow.listen("window-shown", () => {
    if (currentState === "search" && searchInput) {
      searchInput.focus();
    }
  });

  appWindow.listen("show-settings", () => {
    showSettings();
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

async function showApiKeySetup() {
  currentState = "api-key-setup";
  clearApp();
  await appWindow.setSize(new LogicalSize(500, 140));
  await appWindow.center();

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
  await appWindow.setSize(new LogicalSize(600, 80));
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
  await appWindow.setSize(new LogicalSize(800, 600));
  await appWindow.center();

  readerState = {
    pages: [],
    activeIndex: 0,
    showImages: defaultViewMode === "text-images",
    showRawView: defaultViewMode === "raw",
  };

  reader = createReader(appEl);

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

  readerState.pages = results.map((r) => ({
    url: r.url,
    domain: getDomain(r.url),
    article: null,
    rawHtml: null,
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
        page.rawHtml = fp.html;
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
        reader?.scrollBy(scrollSpeed * 40);
      },
      scrollUp: () => {
        reader?.scrollBy(-(scrollSpeed * 40));
      },
      toggleImages: () => {
        readerState.showImages = !readerState.showImages;
        reader?.render(readerState);
      },
      toggleRawView: () => {
        readerState.showRawView = !readerState.showRawView;
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

async function showSettings() {
  currentState = "settings";
  clearApp();
  await appWindow.setSize(new LogicalSize(500, 600));
  await appWindow.center();

  createSettings(appEl, async () => {
    const config = await invoke<{ scroll_speed: number; theme: string; default_view: string }>("get_config");
    scrollSpeed = config.scroll_speed;
    defaultViewMode = config.default_view;
    applyTheme(config.theme);
    showSearch();
  });
}

function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === "auto") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

async function dismissWindow() {
  await appWindow.hide();
  showSearch();
}

init();
