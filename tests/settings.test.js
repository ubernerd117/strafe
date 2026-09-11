import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createSettings } from "../src/settings";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("Settings API keys", () => {
  let storedConfig;
  let settings;

  beforeEach(() => {
    storedConfig = {
      shortcut: "Option+Space",
      results_count: 4,
      brave_api_key: "search-key",
      brave_answers_api_key: "answers-key",
      click_outside_dismisses: true,
      scroll_speed: 3,
      theme: "auto",
      default_view: "text",
      shortcuts: {},
    };
    invoke.mockImplementation(async (command, args) => {
      if (command === "get_config") return { ...storedConfig };
      if (command === "save_config") {
        storedConfig = { ...args.config };
        return;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
  });

  afterEach(() => {
    settings?.cleanup();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-theme");
    vi.clearAllMocks();
  });

  async function openSettings() {
    settings?.cleanup();
    document.body.innerHTML = "";
    settings = createSettings(document.body, vi.fn());
    await Promise.resolve();
  }

  function field(name) {
    const input = document.querySelector(`[data-field="${name}"]`);
    expect(input).not.toBeNull();
    return input;
  }

  it("offers a separate optional password field for the Answers plan", async () => {
    await openSettings();

    const answers = field("brave_answers_api_key");
    expect(answers.type).toBe("password");
    expect(answers.required).toBe(false);
    expect(answers.value).toBe("answers-key");
    expect(field("brave_api_key").value).toBe("search-key");
    expect(answers.closest(".settings-group").textContent).toContain(
      "AI Overview requires a separate Brave Answers plan and API key."
    );
  });

  it.each([
    ["updates Search", "brave_api_key", "new-search-key", "new-search-key", "answers-key"],
    ["clears Search", "brave_api_key", "", "", "answers-key"],
    ["updates Answers", "brave_answers_api_key", "new-answers-key", "search-key", "new-answers-key"],
    ["clears Answers", "brave_answers_api_key", "", "search-key", ""],
  ])("%s without changing the other key after save and reopen", async (_label, name, value, searchKey, answersKey) => {
    await openSettings();
    field(name).value = value;

    document.querySelector(".settings-save").click();
    await vi.waitFor(() => {
      expect(document.querySelector(".settings-status").textContent).toContain("Settings saved.");
    });
    await openSettings();

    expect(field("brave_api_key").value).toBe(searchKey);
    expect(field("brave_answers_api_key").value).toBe(answersKey);
  });

  it("opens old config with an empty Answers key while preserving Search", async () => {
    delete storedConfig.brave_answers_api_key;

    await openSettings();

    expect(field("brave_answers_api_key").value).toBe("");
    expect(field("brave_api_key").value).toBe("search-key");
  });

  it("restores keys literally without interpreting them as HTML attributes", async () => {
    storedConfig.brave_api_key = 'search" data-injected="search';
    storedConfig.brave_answers_api_key = 'answers" data-injected="answers';

    await openSettings();

    expect(field("brave_api_key").value).toBe('search" data-injected="search');
    expect(field("brave_answers_api_key").value).toBe('answers" data-injected="answers');
    expect(document.querySelector("[data-injected]")).toBeNull();
  });
});
