import { getDomain, type ParsedArticle } from "./readability";

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
