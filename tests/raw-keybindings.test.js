import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRawView } from "../src/raw-view";
import { setupKeybindings } from "../src/keybindings";
let frame;
let cleanup;
let actions;
let token;
beforeEach(() => {
  frame = createRawView("<p>Article</p>", "https://example.com");
  document.body.append(frame);
  // Read the bootstrap argument in this DOM harness; real remote scripts cannot
  // run under its CSP. Browser validation must separately check CSP and origins.
  const script = new DOMParser().parseFromString(frame.srcdoc, "text/html").querySelector("script").textContent;
  token = script.match(/\}\)\("([^"]+)"/)[1];
  actions = Object.fromEntries(["prevPage", "nextPage", "scrollDown", "scrollUp", "toggleImages", "toggleRawView", "openInBrowser", "dismiss", "focusSearch", "jumpToPage"].map(name => [name, vi.fn()]));
  cleanup = setupKeybindings(actions, 3);
});
afterEach(() => { cleanup(); document.body.replaceChildren(); });
function message(key, overrides = {}) {
  window.dispatchEvent(new MessageEvent("message", { source: frame.contentWindow, origin: "null", data: { type: "strafe:key", token, key }, ...overrides }));
}
it.each([["Escape", "dismiss"], ["/", "focusSearch"], ["w", "toggleRawView"], ["h", "prevPage"], ["l", "nextPage"], ["j", "scrollDown"], ["k", "scrollUp"]])("handles %s from the active isolated frame", (key, action) => {
  frame.focus();
  message(key);
  expect(actions[action]).toHaveBeenCalledOnce();
});
it.each([
  ["different window", () => ({ source: window })],
  ["different origin", () => ({ origin: "https://evil.example" })],
  ["missing token", () => ({ data: { type: "strafe:key", key: "Escape" } })],
  ["wrong token", () => ({ data: { type: "strafe:key", token: "wrong", key: "Escape" } })],
  ["unknown message", () => ({ data: { type: "invoke", token, key: "Escape" } })],
  ["malformed message", () => ({ data: null })],
])("ignores messages with %s", (_name, overrides) => {
  message("Escape", overrides());
  expect(actions.dismiss).not.toHaveBeenCalled();
});
it("ignores a removed frame", () => {
  const oldWindow = frame.contentWindow;
  frame.replaceWith(createRawView("<p>New</p>", "https://example.com/new"));
  message("Escape", { source: oldWindow });
  expect(actions.dismiss).not.toHaveBeenCalled();
});
it("removes the message listener on cleanup", () => {
  cleanup();
  message("Escape");
  expect(actions.dismiss).not.toHaveBeenCalled();
});
