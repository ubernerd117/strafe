import DOMPurify from "dompurify";

const frameTokens = new WeakMap<HTMLIFrameElement, string>();
const readerKeys = new Set(["h", "l", "j", "k", "i", "w", "o", "Escape", "/", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

// Serialized into the opaque frame. Keep this function self-contained.
function rawViewBridge(token: string, keys: string[]) {
  document.addEventListener("keydown", (event) => {
    if (!event.isTrusted || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!keys.includes(event.key)) return;
    const target = event.target;
    if (event.key !== "Escape" && event.key !== "/" && target instanceof HTMLElement &&
      (target.isContentEditable || target.closest("input, textarea, select"))) return;
    event.preventDefault();
    parent.postMessage({ type: "strafe:key", token, key: event.key }, "*");
  }, true);
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== parent || !data || data.token !== token ||
      data.type !== "strafe:scroll" || typeof data.delta !== "number" || !Number.isFinite(data.delta)) return;
    window.scrollBy(0, data.delta);
  });
  // Navigation would replace our script and strand keyboard focus. Raw view is
  // a static preview; the app's `o` shortcut opens the original in a browser.
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a, area")) event.preventDefault();
  }, true);
  document.addEventListener("auxclick", (event) => event.preventDefault(), true);
  document.addEventListener("submit", (event) => event.preventDefault(), true);
}

export function createRawView(rawHtml: string, url: string): HTMLIFrameElement {
  const token = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    WHOLE_DOCUMENT: true,
    USE_PROFILES: { html: true },
    ADD_TAGS: ["link"],
    FORBID_TAGS: ["base", "meta", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["nonce", "autofocus"],
    ALLOW_DATA_ATTR: false,
  });
  const html = new DOMParser().parseFromString(cleanHtml, "text/html").documentElement;
  const head = html.querySelector("head") ?? html.insertBefore(document.createElement("head"), html.firstChild);
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' https: http:; img-src https: http: data:; font-src https: http: data:; media-src https: http:; base-uri https: http:; form-action 'none'`;
  const base = document.createElement("base");
  // DOM serialization escapes quotes and creates a head for fragment-only pages.
  base.setAttribute("href", url);
  const script = document.createElement("script");
  script.setAttribute("nonce", nonce);
  script.textContent = `(${rawViewBridge.toString()})(${JSON.stringify(token)},${JSON.stringify([...readerKeys])});`;
  head.prepend(policy, base, script);

  const iframe = document.createElement("iframe");
  iframe.className = "raw-view";
  iframe.title = "Raw page preview (press o to open in browser)";
  // Never add allow-same-origin: srcdoc would inherit the privileged app origin.
  // Only the nonce-authorized keyboard/scroll bridge may execute scripts.
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.referrerPolicy = "no-referrer";
  frameTokens.set(iframe, token);
  iframe.srcdoc = `<!doctype html>${html.outerHTML}`;
  return iframe;
}

export function scrollRawView(iframe: HTMLIFrameElement, delta: number): void {
  // Opaque origins require '*'; the receiver checks the parent and frame token.
  iframe.contentWindow?.postMessage({ type: "strafe:scroll", token: frameTokens.get(iframe), delta }, "*");
}

export function getRawViewKey(event: MessageEvent): string | null {
  const iframe = document.querySelector<HTMLIFrameElement>(".raw-view");
  const data: unknown = event.data;
  if (!iframe || event.source !== iframe.contentWindow || event.origin !== "null" ||
    typeof data !== "object" || data === null || !("type" in data) || data.type !== "strafe:key" ||
    !("token" in data) || data.token !== frameTokens.get(iframe) ||
    !("key" in data) || typeof data.key !== "string" || !readerKeys.has(data.key)) return null;
  return data.key;
}
