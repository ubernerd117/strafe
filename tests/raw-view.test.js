import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createReader } from "../src/reader";

let container;
let reader;
beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("main");
  document.body.append(container);
  reader = createReader(container);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.replaceChildren();
});
function render(rawHtml, url = "https://example.com/path/article") {
  reader.render({ pages: [{ url, domain: "example.com", article: null, rawHtml, error: null, loading: false }], activeIndex: 0, showImages: false, showRawView: true, aiSummary: null });
  vi.runAllTimers();
  return container.querySelector("iframe");
}
it("isolates raw content from the parent origin", () => {
  const iframe = render('<script>parent.document.body.remove()</script><p>Raw article</p>');
  expect(iframe.getAttribute("sandbox").split(/\s+/)).not.toContain("allow-same-origin");
  expect(iframe.srcdoc).toContain("Raw article");
});
it("removes source scripts and navigation while preserving styles and relative resources", () => {
  const iframe = render(`<html><head><base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example"><style>p { color: red }</style><link rel="stylesheet" href="./style.css"></head><body><script>parent.__TAURI__.core.invoke('attack')</script><p onclick="attack()">Article</p><img src="./photo.png"><iframe srcdoc="attack"></iframe></body></html>`);
  const doc = new DOMParser().parseFromString(iframe.srcdoc, "text/html");
  expect(doc.querySelector("[onclick], iframe, meta[http-equiv=refresh]")).toBeNull();
  expect([...doc.scripts].some(script => script.textContent.includes("attack"))).toBe(false);
  expect(doc.querySelector("meta[http-equiv='Content-Security-Policy']")).not.toBeNull();
  expect(doc.querySelector("base").href).toBe("https://example.com/path/article");
  expect(doc.querySelectorAll("base")).toHaveLength(1);
  expect(doc.querySelector("style").textContent).toContain("color: red");
  expect(doc.querySelector("link").href).toBe("https://example.com/path/style.css");
  expect(doc.querySelector("img").src).toBe("https://example.com/path/photo.png");
});
it("treats base URLs as data, including documents without a head", () => {
  const iframe = render('<p>Article</p>', 'https://example.com/" onload="attack()');
  const doc = new DOMParser().parseFromString(iframe.srcdoc, "text/html");
  expect(doc.querySelector("base").getAttribute("href")).toBe('https://example.com/" onload="attack()');
  expect(doc.querySelector("[onload]")).toBeNull();
});
it("scrolls through a message instead of accessing an isolated window", () => {
  const iframe = render("<p>Article</p>");
  const postMessage = vi.spyOn(iframe.contentWindow, "postMessage");
  const scrollBy = vi.spyOn(iframe.contentWindow, "scrollBy").mockImplementation(() => { throw new DOMException("Cross origin", "SecurityError"); });
  reader.scrollBy(120);
  vi.runAllTimers();
  expect(scrollBy).not.toHaveBeenCalled();
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "strafe:scroll", delta: 120 }), "*");
});
