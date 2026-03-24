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
}

export function createReader(container: HTMLElement): {
  render: (state: ReaderState) => void;
  getContentArea: () => HTMLElement | null;
  scrollBy: (deltaY: number) => void;
} {
  const el = document.createElement("div");
  el.className = "reader-container";
  container.appendChild(el);

  function render(state: ReaderState) {
    const { pages, activeIndex, showImages, showRawView } = state;

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

    const rawIndicator = showRawView ? ' · <span style="color:var(--error)">RAW</span>' : "";
    const imgIndicator = showImages && !showRawView ? ' · <span style="color:var(--accent)">IMG</span>' : "";
    const hints = `<div class="tab-hints" data-tauri-drag-region>h/l: nav · j/k: scroll · i: img · w: raw · o: open · esc: close${imgIndicator}${rawIndicator}</div>`;

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
    } else if (showRawView && activePage.rawHtml) {
      // Inject <base> so relative URLs resolve against the original domain
      const baseTag = `<base href="${activePage.url}">`;
      const html = activePage.rawHtml.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
      contentHtml = `<div class="raw-view-container">
        <iframe class="raw-view" sandbox="allow-same-origin allow-scripts"></iframe>
      </div>`;
      // We'll set srcdoc after innerHTML to avoid escaping issues
      requestAnimationFrame(() => {
        const iframe = el.querySelector(".raw-view") as HTMLIFrameElement | null;
        if (iframe) iframe.srcdoc = html;
      });
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
    scrollBy: (deltaY: number) => {
      const iframe = el.querySelector(".raw-view") as HTMLIFrameElement | null;
      if (iframe) {
        try { iframe.contentWindow?.scrollBy(0, deltaY); } catch {}
        return;
      }
      const area = el.querySelector(".content-area");
      if (area) area.scrollTop += deltaY;
    },
  };
}
