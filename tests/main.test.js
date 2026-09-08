import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Map(),
  appWindow: {
    setSize: vi.fn(),
    center: vi.fn(),
    hide: vi.fn(),
    listen: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => tauri.appWindow,
  LogicalSize: class LogicalSize {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
  },
}));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

const defaultConfig = {
  shortcut: "Alt+Space",
  results_count: 4,
  brave_api_key: "test-key",
  click_outside_dismisses: true,
  scroll_speed: 3,
  theme: "auto",
  default_view: "text",
  shortcuts: {},
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

describe("app request lifecycle", () => {
  let config;
  let searchRequests;
  let pageRequests;

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<main id="app"></main>';
    document.documentElement.removeAttribute("data-theme");
    Element.prototype.scrollIntoView = vi.fn();

    config = { ...defaultConfig, shortcuts: {} };
    searchRequests = [];
    pageRequests = [];
    tauri.listeners.clear();
    tauri.invoke.mockReset();
    tauri.appWindow.setSize.mockReset().mockResolvedValue(undefined);
    tauri.appWindow.center.mockReset().mockResolvedValue(undefined);
    tauri.appWindow.hide.mockReset().mockResolvedValue(undefined);
    tauri.appWindow.listen.mockReset().mockImplementation((event, handler) => {
      tauri.listeners.set(event, handler);
      return Promise.resolve(() => {});
    });
    tauri.invoke.mockImplementation((command, args) => {
      if (command === "get_config") {
        return Promise.resolve({ ...config, shortcuts: { ...config.shortcuts } });
      }
      if (command === "search_query") {
        const request = { args, ...deferred() };
        searchRequests.push(request);
        return request.promise;
      }
      if (command === "fetch_single_page") {
        const request = { args, ...deferred() };
        pageRequests.push(request);
        return request.promise;
      }
      return Promise.resolve(undefined);
    });

  });

  async function loadApp() {
    await import("../src/main.ts");
    await flush();
    expect(document.querySelector(".search-input")).not.toBeNull();
  }

  afterEach(async () => {
    if (!document.querySelector(".settings-container")) {
      tauri.listeners.get("show-settings")?.();
      await flush();
    }
    document.querySelector(".settings-close")?.click();
    await flush();
    document.body.innerHTML = "";
  });

  function enter(input, query) {
    input.value = query;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }

  async function openSettings() {
    tauri.listeners.get("show-settings")();
    await flush();
    expect(document.querySelector(".settings-container")).not.toBeNull();
  }

  async function closeSettings() {
    document.querySelector(".settings-close").click();
    await flush();
    expect(document.querySelector(".search-input")).not.toBeNull();
  }

  it("reloads saved aliases when Settings closes", async () => {
    await loadApp();
    await openSettings();
    config.shortcuts = { docs: "https://example.com/docs" };
    await closeSettings();

    enter(document.querySelector(".search-input"), "docs");
    await flush();

    expect(pageRequests).toHaveLength(1);
    expect(pageRequests[0].args.url).toBe("https://example.com/docs");
    expect(searchRequests).toHaveLength(0);
    pageRequests[0].resolve({
      url: "https://example.com/docs",
      html: "<html><body><p>Documentation</p></body></html>",
      error: null,
    });
    await flush();
    expect(document.querySelector(".reader-container")).not.toBeNull();
  });

  it("treats inherited object properties as ordinary searches", async () => {
    await loadApp();
    enter(document.querySelector(".search-input"), "constructor");
    await flush();

    expect(searchRequests).toHaveLength(1);
    expect(searchRequests[0].args).toEqual({ query: "constructor" });
    expect(pageRequests).toHaveLength(0);
    searchRequests[0].resolve([]);
    await flush();
    expect(document.querySelector(".error-message")?.textContent).toContain("No results found");
  });

  it.each(["search", "alias"])(
    "keeps Settings open when an older %s finishes resizing",
    async (route) => {
      if (route === "alias") config.shortcuts = { docs: "https://example.com/docs" };
      await loadApp();
      const resize = deferred();
      tauri.appWindow.setSize.mockImplementationOnce(() => resize.promise);
      enter(document.querySelector(".search-input"), route === "alias" ? "docs" : "older search");
      await flush();
      await openSettings();

      resize.resolve();
      await flush();
      for (const request of searchRequests) request.resolve([]);
      await flush();

      expect(document.querySelector(".settings-container")).not.toBeNull();
      expect(searchRequests).toHaveLength(0);
      expect(pageRequests).toHaveLength(0);
    },
  );

  it.each(["resolve", "reject"])(
    "does not let an older %s search completion unlock a newer search",
    async (settlement) => {
      await loadApp();
      const firstInput = document.querySelector(".search-input");
      enter(firstInput, "old");
      await flush();
      expect(searchRequests).toHaveLength(1);

      await openSettings();
      await closeSettings();
      const newerInput = document.querySelector(".search-input");
      enter(newerInput, "new");
      await flush();
      expect(searchRequests).toHaveLength(2);

      if (settlement === "resolve") searchRequests[0].resolve([]);
      else searchRequests[0].reject(new Error("old request failed"));
      await flush();
      enter(newerInput, "must stay blocked");
      await flush();
      const requestCount = searchRequests.length;

      for (const request of searchRequests.slice(1)) request.resolve([]);
      await flush();
      expect(requestCount).toBe(2);
    },
  );

  it.each([
    ["result", "resolve"],
    ["result", "reject"],
    ["alias", "resolve"],
    ["alias", "reject"],
  ])("ignores a stale %s page %s after Settings opens", async (route, settlement) => {
    if (route === "alias") config.shortcuts = { docs: "https://example.com/docs" };
    await loadApp();
    enter(document.querySelector(".search-input"), route === "alias" ? "docs" : "topic");
    await flush();
    if (route === "result") {
      searchRequests[0].resolve([
        { title: "Example", url: "https://example.com/article", description: "" },
      ]);
      await flush();
    }
    expect(pageRequests).toHaveLength(1);
    await openSettings();

    if (settlement === "resolve") {
      pageRequests[0].resolve({
        url: pageRequests[0].args.url,
        html: "<html><body><article><p>Old page</p></article></body></html>",
        error: null,
      });
    } else {
      pageRequests[0].reject(new Error("old page failed"));
    }
    await flush();

    expect(document.querySelector(".settings-container")).not.toBeNull();
  });
});
