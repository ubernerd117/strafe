import DOMPurify from "dompurify";
import { Marked } from "marked";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { createRawView, scrollRawView } from "./raw-view";
import { getDomain, type ParsedArticle } from "./readability";

const overviewMarkdown = new Marked({
  gfm: true,
  renderer: {
    // Model-provided HTML is readable text, never app markup.
    html({ text }) {
      return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },
  },
});

function renderOverviewMarkdown(text: string): DocumentFragment {
  const content = DOMPurify.sanitize(overviewMarkdown.parse(text, { async: false }), {
    ALLOWED_TAGS: [
      "p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del",
      "ul", "ol", "li", "blockquote", "hr", "a", "pre", "code",
      "table", "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: ["href", "title", "start", "align"],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  content.querySelectorAll("a").forEach((link) => {
    const status = document.createElement("span");
    status.className = "overview-link-status";
    status.setAttribute("role", "status");
    link.after(status);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const href = link.getAttribute("href");
      if (href) {
        void shellOpen(href).then(
          () => { status.textContent = ""; },
          () => { status.textContent = " Unable to open link in browser. Try again."; },
        );
      }
    });
    link.addEventListener("auxclick", (event) => event.preventDefault());
  });
  return content;
}

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
    tabBar.replaceChildren();
    pages.forEach((page, i) => {
      const tab = document.createElement("div");
      tab.className = i === activeIndex ? "tab active" : "tab";
      tab.dataset.index = String(i);
      const number = document.createElement("span");
      number.className = "tab-number";
      number.textContent = String(i + 1);
      const label = page.loading
        ? "Loading..."
        : page.domain || getDomain(page.url);
      tab.append(number, ` ${label}`);
      tabBar.appendChild(tab);
    });

    if (aiSummary) {
      const active = activeIndex === aiTabIndex ? "active" : "";
      tabBar.insertAdjacentHTML("beforeend", `<div class="tab ${active} ai-tab" data-index="${aiTabIndex}">
        <span class="tab-number">${aiTabIndex + 1}</span> Overview
      </div>`);
    }

    tabBar.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const index = parseInt(tab.dataset.index || "0");
        if (stateRef) {
          stateRef.activeIndex = index;
          render(stateRef);
        }
      });
    });

    const activeTab = tabBar.querySelector<HTMLElement>(".tab.active");
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
        const isAnswersSetupError =
          errorText.includes("brave answers api key") ||
          errorText.includes("answers key");
        const isUnavailable =
          errorText.includes("unavailable") ||
          errorText.includes("not available") ||
          errorText.includes("requires");
        const retryHint = isAnswersSetupError
          ? "Check your Brave Answers API key and plan in Settings."
          : isUnavailable
            ? "Try a more general search query."
            : `Press ${aiTabNumber} to retry`;

        const error = document.createElement("div");
        error.className = "error-message";
        error.textContent = aiSummary.error;
        const hint = document.createElement("div");
        hint.className = "retry-hint";
        hint.textContent = retryHint;
        error.appendChild(hint);
        contentWrapper.replaceChildren(error);
      } else if (aiSummary.text) {
        contentWrapper.innerHTML = `
          <div class="content-area">
            <div class="content-source">BRAVE AI OVERVIEW</div>
            <div class="ai-content"></div>
          </div>`;
        const aiContent = contentWrapper.querySelector(".ai-content");
        aiContent?.appendChild(renderOverviewMarkdown(aiSummary.text));
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
      const error = document.createElement("div");
      error.className = "error-message";
      error.textContent = activePage.error;
      const hint = document.createElement("div");
      hint.className = "retry-hint";
      hint.textContent = "Press / to search again";
      error.appendChild(hint);
      contentWrapper.replaceChildren(error);
    } else if (showRawView && activePage.rawHtml) {
      const wrapper = document.createElement("div");
      wrapper.className = "raw-view-container";
      scrollIframe = createRawView(activePage.rawHtml, activePage.url);
      wrapper.appendChild(scrollIframe);
      contentWrapper.replaceChildren(wrapper);
    } else if (activePage.article) {
      const area = document.createElement("div");
      area.className = showImages ? "content-area show-images" : "content-area";
      const source = document.createElement("div");
      source.className = "content-source";
      source.textContent = activePage.domain || getDomain(activePage.url);
      // Readability extracts content; it does not make HTML safe for the app DOM.
      area.append(source, DOMPurify.sanitize(activePage.article.content, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"],
        FORBID_ATTR: ["style"],
        ALLOW_DATA_ATTR: false,
        RETURN_DOM_FRAGMENT: true,
      }));
      contentWrapper.replaceChildren(area);
      scrollTarget = area;
    } else {
      contentWrapper.innerHTML = `
        <div class="no-content">
          No readable content found.
          <div class="open-hint">Press <strong>o</strong> to open in browser</div>
        </div>`;
    }
  }

  function renderHints(state: ReaderState) {
    const { showImages, showRawView } = state;
    const rawIndicator = showRawView
      ? ' · <span style="color:var(--error)">RAW</span>'
      : "";
    const imgIndicator =
      showImages && !showRawView
        ? ' · <span style="color:var(--accent)">IMG</span>'
        : "";
    hintsBar.innerHTML = `h/l: nav · j/k: scroll · i: img · w: raw · o: open · /: search · esc: close${imgIndicator}${rawIndicator}`;
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
          scrollRawView(scrollIframe, delta);
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
          scrollRawView(iframe, delta);
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
