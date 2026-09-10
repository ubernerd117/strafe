import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReader } from "../src/reader";
import { parseArticle } from "../src/readability";
import { open as shellOpen } from "@tauri-apps/plugin-shell";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn().mockResolvedValue(undefined) }));

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
    vi.clearAllMocks();
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

  it("renders Markdown paragraphs while preserving raw HTML as literal text", () => {
    reader.render(state({ activeIndex: 1, aiSummary: { text: "First & second\n\n<b>Literal</b>", loading: false, error: null } }));

    expect([...container.querySelectorAll(".ai-content p")].map((p) => p.textContent)).toEqual(["First & second", "<b>Literal</b>"]);
    expect(container.querySelector(".ai-content b")).toBeNull();
  });

  it("renders Overview Markdown headings, emphasis, lists, tables, and fenced code", () => {
    const text = [
      "# Overview", "", "A **bold** and *emphasized* summary with ~~old~~ text.", "",
      "- First item", "- Second item", "", "1. Ordered item", "", "> Quoted text", "",
      "| Name | Value |", "| --- | --- |", "| Answer | 42 |", "",
      "```js", 'const element = "<script>literal</script>";', "```",
    ].join("\n");

    reader.render(state({ activeIndex: 1, aiSummary: { text, loading: false, error: null } }));

    const content = container.querySelector(".ai-content");
    expect(content.querySelector("h1")?.textContent).toBe("Overview");
    expect(content.querySelector("strong")?.textContent).toBe("bold");
    expect(content.querySelector("em")?.textContent).toBe("emphasized");
    expect(content.querySelector("del")?.textContent).toBe("old");
    expect([...content.querySelectorAll("ul li")].map((item) => item.textContent)).toEqual(["First item", "Second item"]);
    expect(content.querySelector("ol li")?.textContent).toBe("Ordered item");
    expect(content.querySelector("blockquote")?.textContent.trim()).toBe("Quoted text");
    expect([...content.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual(["Name", "Value"]);
    expect([...content.querySelectorAll("td")].map((cell) => cell.textContent)).toEqual(["Answer", "42"]);
    expect(content.querySelector("pre code")?.textContent).toBe('const element = "<script>literal</script>";\n');
    expect(content.querySelector("script")).toBeNull();
  });

  it.each(["https://example.com/source", "http://example.com/source"])("opens %s externally only after a click and prevents app navigation", (url) => {
    reader.render(state({ activeIndex: 1, aiSummary: { text: `[**Source**](${url})`, loading: false, error: null } }));
    const link = container.querySelector(".ai-content a");
    expect(link?.getAttribute("href")).toBe(url);
    expect(shellOpen).not.toHaveBeenCalled();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });

    link.querySelector("strong").dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(shellOpen).toHaveBeenCalledExactlyOnceWith(url);
  });

  it.each([
    "javascript:alert%281%29", "jav&#x61;script:alert%281%29", "java&#10;script:alert%281%29",
    "data:text/html,unsafe", "file:///etc/passwd", "tauri://localhost/", "mailto:user@example.com",
    "//example.com/source", "/relative/path", "#section",
  ])("disables Overview links with unsafe or non-HTTP URL %s", (url) => {
    reader.render(state({ activeIndex: 1, aiSummary: { text: `[Source](${url})`, loading: false, error: null } }));
    const link = container.querySelector(".ai-content a");

    expect(link).not.toBeNull();
    expect(link.hasAttribute("href")).toBe(false);
    link.click();
    expect(shellOpen).not.toHaveBeenCalled();
  });

  it("shows an accessible inline hint when an Overview link cannot open", async () => {
    shellOpen.mockRejectedValueOnce(new Error("vendor failure: secret-token"));
    reader.render(state({ activeIndex: 1, aiSummary: { text: '[Source](https://example.com/source "Source title")', loading: false, error: null } }));
    const link = container.querySelector(".ai-content a");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });

    link.dispatchEvent(click);
    await Promise.resolve();

    const status = container.querySelector('.ai-content [role="status"]');
    expect(status?.textContent).toContain("Unable to open link in browser.");
    expect(status.hidden).toBe(false);
    expect(container.textContent).not.toContain("secret-token");
    expect(link.title).toBe("Source title");
    expect(click.defaultPrevented).toBe(true);
  });

  it("keeps a single inline hint after repeated Overview link failures", async () => {
    shellOpen.mockRejectedValueOnce(new Error("cannot open"));
    reader.render(state({ activeIndex: 1, aiSummary: { text: "[Source](https://example.com/source)", loading: false, error: null } }));
    const link = container.querySelector(".ai-content a");
    link.click();
    await Promise.resolve();
    shellOpen.mockRejectedValueOnce(new Error("cannot open"));

    link.click();
    await Promise.resolve();

    expect(container.querySelectorAll('.ai-content [role="status"]')).toHaveLength(1);
    expect(container.querySelector('.ai-content [role="status"]')?.textContent.match(/Unable to open/g)).toHaveLength(1);
  });

  it("clears the inline hint after successfully retrying an Overview link", async () => {
    shellOpen.mockRejectedValueOnce(new Error("cannot open"));
    reader.render(state({ activeIndex: 1, aiSummary: { text: "[Source](https://example.com/source)", loading: false, error: null } }));
    const link = container.querySelector(".ai-content a");
    link.click();
    await Promise.resolve();
    expect(container.querySelector('.ai-content [role="status"]')?.textContent).toContain("Unable to open");

    link.click();
    await Promise.resolve();

    expect(container.textContent).not.toContain("Unable to open");
    expect(link.title).not.toContain("Unable to open");
  });

  it("keeps embedded HTML inert and literal inside Overview", () => {
    const html = '<script>window.readerExecuted=true</script>\n<style>body {display:none}</style>\n<form><input autofocus><button>Submit</button></form>';

    reader.render(state({ activeIndex: 1, aiSummary: { text: html, loading: false, error: null } }));

    const content = container.querySelector(".ai-content");
    expect(content.textContent).toContain(html);
    expect(content.querySelector("script, style, form, input, button, [onerror], [style]")).toBeNull();
    expect(window.readerExecuted).toBeUndefined();
  });

  it("shows no Overview tab or keyboard hint when Overview is disabled", () => {
    reader.render(state());

    expect(container.querySelector(".tab-hint, .ai-tab")).toBeNull();
    expect(container.querySelector(".hints-bar").textContent).not.toContain("AI");
    expect(container.querySelectorAll(".tab")).toHaveLength(1);
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
