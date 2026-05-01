import { getDomain, type ParsedArticle } from "./readability";

export interface ReaderPage {
  url: string;
  domain: string;
  article: ParsedArticle | null;
  rawHtml: string | null;
  error: string | null;
  loading: boolean;
}

export interface ReaderState {
  pages: ReaderPage[];
  activeIndex: number;
  showImages: boolean;
  showRawView: boolean;
  aiSummary: {
    text: string | null;
    loading: boolean;
    error: string | null;
  } | null;
}

export function createReader(container: HTMLElement): {
  render: (state: ReaderState) => void;
  getContentArea: () => HTMLElement | null;
  scrollBy: (deltaY: number) => void;
} {
  const el = document.createElement("div");
  el.className = "reader-container";
  container.appendChild(el);

  // Persistent DOM skeleton — never torn down, only children updated
  const tabBar = document.createElement("div");
  tabBar.className = "tab-bar";

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "content-wrapper";

  const hintsBar = document.createElement("div");
  hintsBar.className = "hints-bar";
  hintsBar.setAttribute("data-tauri-drag-region", "");

  el.append(tabBar, contentWrapper, hintsBar);

  // Scroll performance: cached target + requestAnimationFrame batching
  let scrollTarget: HTMLElement | null = null;
  let scrollIframe: HTMLIFrameElement | null = null;
  let pendingScroll = 0;
  let scrollRaf = 0;

  // Reference to current state for tab click handlers
  let stateRef: ReaderState | null = null;

  // Previous render snapshot for diffing
  let prev = {
    activeIndex: -1,
    showImages: false,
    showRawView: false,
    pageFp: "",
    activeFp: "",
  };

  // 3 chars per page: loading | hasError | hasArticle
  function fingerprint(
    pages: ReaderPage[],
    aiSummary: ReaderState["aiSummary"],
  ): string {
    const pagesFp = pages
      .map((p) => `${+p.loading}${+!!p.error}${+!!p.article}`)
      .join("");
    const aiFp = aiSummary
      ? `${+aiSummary.loading}${+!!aiSummary.error}${+!!aiSummary.text}`
      : "none";
    return `${pagesFp}|${aiFp}`;
  }

  function renderTabs(state: ReaderState) {
    const { pages, activeIndex, aiSummary } = state;
    const aiTabIndex = pages.length;
    let tabsHtml = pages
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

    if (aiSummary) {
      const active = activeIndex === aiTabIndex ? "active" : "";
      tabsHtml += `<div class="tab ${active} ai-tab" data-index="${aiTabIndex}">
        <span class="tab-number">${aiTabIndex + 1}</span> Overview
      </div>`;
    } else {
      const aiHintNumber = aiTabIndex + 1;
      tabsHtml += `<div class="tab-hint" style="padding: 10px 14px; font-size: 11px; font-family: var(--font-ui); color: var(--text-dim); opacity: 0.5;">
        <span class="tab-number">${aiHintNumber}</span> Press ${aiHintNumber} for AI
      </div>`;
    }

    tabBar.innerHTML = tabsHtml;

    tabBar.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const index = parseInt((tab as HTMLElement).dataset.index || "0");
        if (stateRef) {
          stateRef.activeIndex = index;
          render(stateRef);
        }
      });
    });

    const activeTab = tabBar.querySelector(".tab.active") as HTMLElement | null;
    if (activeTab) {
      requestAnimationFrame(() => {
        activeTab.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      });
    }
  }

  function renderContent(state: ReaderState) {
    const { pages, activeIndex, showImages, showRawView, aiSummary } = state;
    const aiTabIndex = pages.length;

    // Reset cached scroll references — will be re-cached on first scroll
    scrollTarget = null;
    scrollIframe = null;

    if (activeIndex === aiTabIndex && aiSummary) {
      if (aiSummary.loading) {
        contentWrapper.innerHTML = `
          <div class="loading-container">
            <div class="loading-text">Generating AI Overview...</div>
            <div class="loading-dots">
              <div class="loading-dot"></div>
              <div class="loading-dot"></div>
              <div class="loading-dot"></div>
            </div>
          </div>`;
      } else if (aiSummary.error) {
        const aiTabNumber = aiTabIndex + 1;
        const errorText = aiSummary.error.toLowerCase();
        const isUnavailable =
          errorText.includes("unavailable") ||
          errorText.includes("not available") ||
          errorText.includes("requires");
        const retryHint = isUnavailable 
          ? "Try a more general search query." 
          : `Press ${aiTabNumber} to retry`;
        
        contentWrapper.innerHTML = `
          <div class="error-message">
            ${aiSummary.error}
            <div class="retry-hint">${retryHint}</div>
          </div>`;
      } else if (aiSummary.text) {
        contentWrapper.innerHTML = `
          <div class="content-area">
            <div class="content-source">BRAVE AI OVERVIEW</div>
            <div class="ai-content" style="font-family: var(--font-body); line-height: 1.8; font-size: 15px; color: var(--text-secondary);">
              ${aiSummary.text
                .split("\n")
                .map((p) =>
                  p.trim() ? `<p style="margin-bottom: 1.2em;">${p}</p>` : "",
                )
                .join("")}
            </div>
          </div>`;
        scrollTarget = contentWrapper.querySelector(".content-area");
      }
      return;
    }

    const activePage = pages[activeIndex];

    if (!activePage) {
      contentWrapper.innerHTML = `<div class="loading-container"><div class="loading-text">No results</div></div>`;
    } else if (activePage.loading) {
      const readyCount = pages.filter((p) => !p.loading).length;
      const dots = pages
        .map(
          (p) => `<div class="loading-dot ${p.loading ? "" : "ready"}"></div>`,
        )
        .join("");
      contentWrapper.innerHTML = `
        <div class="loading-container">
          <div class="loading-text">Fetching pages...</div>
          <div class="loading-dots">${dots}</div>
          <div class="loading-progress">${readyCount} of ${pages.length} ready</div>
        </div>`;
    } else if (activePage.error) {
      contentWrapper.innerHTML = `
        <div class="error-message">
          ${activePage.error}
          <div class="retry-hint">Press / to search again</div>
        </div>`;
    } else if (showRawView && activePage.rawHtml) {
      const baseTag = `<base href="${activePage.url}">`;
      const html = activePage.rawHtml.replace(
        /<head([^>]*)>/i,
        `<head$1>${baseTag}`,
      );
      contentWrapper.innerHTML = `<div class="raw-view-container">
        <iframe class="raw-view" sandbox="allow-same-origin allow-scripts"></iframe>
      </div>`;
      requestAnimationFrame(() => {
        scrollIframe = contentWrapper.querySelector(
          ".raw-view",
        ) as HTMLIFrameElement | null;
        if (scrollIframe) scrollIframe.srcdoc = html;
      });
    } else if (activePage.article) {
      const imgClass = showImages ? "show-images" : "";
      contentWrapper.innerHTML = `
        <div class="content-area ${imgClass}">
          <div class="content-source">${activePage.domain || getDomain(activePage.url)}</div>
          ${activePage.article.content}
        </div>`;
      scrollTarget = contentWrapper.querySelector(".content-area");
    } else {
      contentWrapper.innerHTML = `
        <div class="no-content">
          No readable content found.
          <div class="open-hint">Press <strong>o</strong> to open in browser</div>
        </div>`;
    }
  }

  function renderHints(state: ReaderState) {
    const { pages, showImages, showRawView, aiSummary } = state;
    const rawIndicator = showRawView
      ? ' · <span style="color:var(--error)">RAW</span>'
      : "";
    const imgIndicator =
      showImages && !showRawView
        ? ' · <span style="color:var(--accent)">IMG</span>'
        : "";
    const aiTabNumber = pages.length + 1;
    const aiHint = !aiSummary
      ? ` · <span style="color:var(--accent)">${aiTabNumber}: AI</span>`
      : "";
    hintsBar.innerHTML = `h/l: nav · j/k: scroll · i: img · w: raw · o: open · /: search · esc: close${imgIndicator}${rawIndicator}${aiHint}`;
  }

  function render(state: ReaderState) {
    stateRef = state;
    const { pages, activeIndex, showImages, showRawView, aiSummary } = state;

    const pageFp = fingerprint(pages, aiSummary);
    const activeFp =
      activeIndex < pages.length
        ? pageFp.slice(activeIndex * 3, activeIndex * 3 + 3)
        : activeIndex === pages.length
          ? `ai-${+!!aiSummary?.loading}-${+!!aiSummary?.error}-${+!!aiSummary?.text}`
          : "";

    // Fast path: toggling images on the same article — just flip a CSS class
    if (
      activeIndex === prev.activeIndex &&
      showRawView === prev.showRawView &&
      activeFp === prev.activeFp &&
      showImages !== prev.showImages &&
      !showRawView
    ) {
      const area = contentWrapper.querySelector(".content-area");
      if (area) {
        area.classList.toggle("show-images", showImages);
        renderHints(state);
        prev.showImages = showImages;
        return;
      }
    }

    // Update tabs when active tab or any page loading state changed
    if (activeIndex !== prev.activeIndex || pageFp !== prev.pageFp) {
      renderTabs(state);
    }

    // Update content only when the viewed page or its state actually changed
    if (
      activeIndex !== prev.activeIndex ||
      showRawView !== prev.showRawView ||
      showImages !== prev.showImages ||
      activeFp !== prev.activeFp
    ) {
      renderContent(state);
    }

    renderHints(state);

    prev = { activeIndex, showImages, showRawView, pageFp, activeFp };
  }

  return {
    render,
    getContentArea: () => contentWrapper.querySelector(".content-area"),
    scrollBy: (deltaY: number) => {
      // Batch all scroll deltas within a single animation frame
      pendingScroll += deltaY;
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        const delta = pendingScroll;
        pendingScroll = 0;

        if (scrollIframe) {
          try {
            scrollIframe.contentWindow?.scrollBy(0, delta);
          } catch {}
          return;
        }
        if (scrollTarget) {
          scrollTarget.scrollTop += delta;
          return;
        }
        // Fallback: query DOM and cache for next time
        const iframe = contentWrapper.querySelector(
          ".raw-view",
        ) as HTMLIFrameElement | null;
        if (iframe) {
          scrollIframe = iframe;
          try {
            iframe.contentWindow?.scrollBy(0, delta);
          } catch {}
        } else {
          const area = contentWrapper.querySelector(
            ".content-area",
          ) as HTMLElement | null;
          if (area) {
            scrollTarget = area;
            area.scrollTop += delta;
          }
        }
      });
    },
  };
}
