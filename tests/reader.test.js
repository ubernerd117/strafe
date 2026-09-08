import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReader } from "../src/reader";
import { parseArticle } from "../src/readability";

const payload = '<img src=x onerror="window.readerExecuted=true">';

function page(content = "<p>Readable content</p>") {
  return {
    url: "https://example.com/article",
    domain: "example.com",
    article: { title: "Article", content, textContent: "", excerpt: "", siteName: null },
    rawHtml: null,
    error: null,
    loading: false,
  };
}

function state(overrides = {}) {
  return {
    pages: [page()], activeIndex: 0, showImages: false,
    showRawView: false, aiSummary: null, ...overrides,
  };
}

describe("reader content safety", () => {
  let container;
  let reader;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("main");
    document.body.appendChild(container);
    reader = createReader(container);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.replaceChildren();
    delete window.readerExecuted;
  });

  it.each([false, true])("removes real Readability image handlers with showImages=%s", (showImages) => {
    const article = parseArticle(`<html><body><article><h1>Article</h1>
      <p>${"Readable article prose with enough detail for extraction. ".repeat(30)}</p>
      ${payload}</article></body></html>`, "https://example.com/article");
    expect(article).not.toBeNull();

    reader.render(state({ pages: [{ ...page(), article }], showImages }));

    const img = reader.getContentArea().querySelector("img");
    expect(img).not.toBeNull();
    expect(img.hasAttribute("onerror")).toBe(false);
    img.dispatchEvent(new Event("error"));
    expect(window.readerExecuted).toBeUndefined();
  });

  it.each([
    ['<script>window.readerExecuted=true</script>', "script"],
    ['<svg onload="window.readerExecuted=true"></svg>', "svg"],
    ['<iframe srcdoc="<script>parent.readerExecuted=true</script>"></iframe>', "iframe"],
    ['<object data="data:text/html,unsafe"></object><embed src="data:text/html,unsafe">', "object, embed"],
    ['<style>body { display: none; }</style><p style="position:fixed" data-tauri-drag-region>Text</p>', "style, [style], [data-tauri-drag-region]"],
    ['<form><input autofocus onfocus="window.readerExecuted=true"><button>Submit</button></form>', "form, input, button"],
  ])("removes executable or app-controlling markup: %s", (content, selector) => {
    reader.render(state({ pages: [page(content)] }));

    expect(reader.getContentArea().querySelector(selector)).toBeNull();
  });

  it.each(["javascript:window.readerExecuted=true", "jav&#x61;script:window.readerExecuted=true", "java&#10;script:window.readerExecuted=true"])(
    "removes executable link URL %s", (href) => {
      reader.render(state({ pages: [page(`<a href="${href}">Link</a>`)] }));

      expect(reader.getContentArea().querySelector("a").hasAttribute("href")).toBe(false);
    },
  );

  it("preserves readable formatting and safe links and images", () => {
    reader.render(state({ pages: [page('<h2>Heading</h2><p>A <strong>bold</strong> paragraph.</p><ul><li>Item</li></ul><a href="https://example.com/more">More</a><img src="https://example.com/photo.jpg" alt="Photo">')] }));

    const area = reader.getContentArea();
    expect(area.querySelector("h2").textContent).toBe("Heading");
    expect(area.querySelector("strong").textContent).toBe("bold");
    expect(area.querySelector("li").textContent).toBe("Item");
    expect(area.querySelector("a").href).toBe("https://example.com/more");
    expect(area.querySelector("img").src).toBe("https://example.com/photo.jpg");
    expect(area.querySelector("img").alt).toBe("Photo");
  });

  it("toggles images without replacing sanitized content", () => {
    const current = state({ pages: [page(payload)] });
    reader.render(current);
    const area = reader.getContentArea();
    const img = area.querySelector("img");
    expect(area.classList.contains("show-images")).toBe(false);

    reader.render({ ...current, showImages: true });

    expect(reader.getContentArea()).toBe(area);
    expect(area.querySelector("img")).toBe(img);
    expect(area.classList.contains("show-images")).toBe(true);
    expect(img.hasAttribute("onerror")).toBe(false);
    reader.render({ ...current, showImages: false });
    expect(area.classList.contains("show-images")).toBe(false);
    expect(area.querySelector("img")).toBe(img);
  });

  it.each([
    ["AI summary", { activeIndex: 1, aiSummary: { text: payload, loading: false, error: null } }, ".ai-content"],
    ["AI error", { activeIndex: 1, aiSummary: { text: null, loading: false, error: payload } }, ".error-message"],
    ["page error", { pages: [{ ...page(), error: payload }] }, ".error-message"],
    ["domain label", { pages: [{ ...page(), domain: payload }] }, ".content-source"],
    ["invalid URL fallback", { pages: [{ ...page(), domain: "", url: payload }] }, ".content-source"],
  ])("renders %s as literal text", (_label, overrides, selector) => {
    reader.render(state(overrides));

    expect(container.querySelector(selector).textContent).toContain(payload);
    expect(container.querySelector("img")).toBeNull();
    if (selector === ".content-source") {
      expect(container.querySelector(".tab").textContent).toContain(payload);
    }
  });

  it("preserves AI paragraphs and skips blank lines", () => {
    reader.render(state({ activeIndex: 1, aiSummary: { text: "First & second\n\n <b>Literal</b> ", loading: false, error: null } }));

    expect([...container.querySelectorAll(".ai-content p")].map((p) => p.textContent)).toEqual(["First & second", " <b>Literal</b> "]);
  });

  it.each([
    ["Service unavailable", "Try a more general search query."],
    ["Request failed", "Press 2 to retry"],
  ])("preserves the retry hint for %s", (error, hint) => {
    reader.render(state({ activeIndex: 1, aiSummary: { text: null, loading: false, error } }));

    expect(container.querySelector(".retry-hint").textContent).toBe(hint);
  });

  it("keeps tab clicks working with literal labels", () => {
    const current = state({ pages: [page(), { ...page("<p>Second article</p>"), domain: payload }] });
    reader.render(current);

    container.querySelectorAll(".tab")[1].click();

    expect(reader.getContentArea().textContent).toContain("Second article");
    expect(container.querySelector(".tab.active").textContent).toContain(payload);
    expect(container.querySelector("img")).toBeNull();
  });
});
