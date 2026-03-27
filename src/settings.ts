import { invoke } from "@tauri-apps/api/core";

interface AppConfig {
  shortcut: string;
  results_count: number;
  brave_api_key: string;
  click_outside_dismisses: boolean;
  scroll_speed: number;
  theme: string;
  default_view: string;
}

export function createSettings(
  container: HTMLElement,
  onClose: () => void
): { cleanup: () => void } {
  const el = document.createElement("div");
  el.className = "settings-container";
  el.innerHTML = `
    <div class="settings-header" data-tauri-drag-region>
      <h2 data-tauri-drag-region>Settings</h2>
      <span class="settings-close" title="Close (Esc)">✕</span>
    </div>
    <div class="settings-body">
      <div class="settings-loading">Loading...</div>
    </div>
  `;
  container.appendChild(el);

  const body = el.querySelector(".settings-body") as HTMLElement;
  const closeBtn = el.querySelector(".settings-close") as HTMLElement;

  function escHandler(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      cleanup();
      onClose();
    }
  }

  function cleanup() {
    document.removeEventListener("keydown", escHandler);
  }

  closeBtn.addEventListener("click", () => {
    cleanup();
    onClose();
  });

  document.addEventListener("keydown", escHandler);

  invoke<AppConfig>("get_config").then((config) => {
    body.innerHTML = `
      <div class="settings-group">
        <label class="settings-label">Global Shortcut</label>
        <input class="settings-input" data-field="shortcut" type="text" value="${config.shortcut}" />
        <span class="settings-hint">e.g. Option+Space, Control+Shift+K</span>
      </div>

      <div class="settings-group">
        <label class="settings-label">Brave Search API Key</label>
        <input class="settings-input mono" data-field="brave_api_key" type="password" value="${config.brave_api_key}" />
      </div>

      <div class="settings-group">
        <label class="settings-label">Results Count</label>
        <input class="settings-input small" data-field="results_count" type="number" min="1" max="10" value="${config.results_count}" />
        <span class="settings-hint">Number of pages to fetch (1–10)</span>
      </div>

      <div class="settings-group">
        <label class="settings-label">Scroll Speed</label>
        <input class="settings-input small" data-field="scroll_speed" type="number" min="1" max="10" value="${config.scroll_speed}" />
        <span class="settings-hint">j/k scroll multiplier (1–10)</span>
      </div>

      <div class="settings-group">
        <label class="settings-label">Default View</label>
        <select class="settings-input" data-field="default_view">
          <option value="text" ${config.default_view === "text" ? "selected" : ""}>Text only</option>
          <option value="text-images" ${config.default_view === "text-images" ? "selected" : ""}>Text + Images</option>
          <option value="raw" ${config.default_view === "raw" ? "selected" : ""}>Raw website</option>
        </select>
        <span class="settings-hint">Toggle with i (images) or w (raw) during reading</span>
      </div>

      <div class="settings-group">
        <label class="settings-label">Theme</label>
        <select class="settings-input" data-field="theme">
          <option value="auto" ${config.theme === "auto" ? "selected" : ""}>Auto (follow system)</option>
          <option value="dark" ${config.theme === "dark" ? "selected" : ""}>Dark</option>
          <option value="light" ${config.theme === "light" ? "selected" : ""}>Light</option>
          <option value="high-contrast-dark" ${config.theme === "high-contrast-dark" ? "selected" : ""}>High Contrast Dark</option>
          <option value="high-contrast-light" ${config.theme === "high-contrast-light" ? "selected" : ""}>High Contrast Light</option>
        </select>
      </div>

      <div class="settings-actions">
        <button class="settings-save">Save</button>
        <span class="settings-status"></span>
      </div>
    `;

    const saveBtn = body.querySelector(".settings-save") as HTMLButtonElement;
    const status = body.querySelector(".settings-status") as HTMLElement;

    saveBtn.addEventListener("click", async () => {
      const get = (field: string) =>
        (body.querySelector(`[data-field="${field}"]`) as HTMLInputElement).value;

      const theme = (body.querySelector('[data-field="theme"]') as HTMLSelectElement).value;
      const defaultView = (body.querySelector('[data-field="default_view"]') as HTMLSelectElement).value;

      const updated: AppConfig = {
        shortcut: get("shortcut"),
        brave_api_key: get("brave_api_key"),
        results_count: Math.min(10, Math.max(1, parseInt(get("results_count")) || 4)),
        scroll_speed: Math.min(10, Math.max(1, parseInt(get("scroll_speed")) || 3)),
        click_outside_dismisses: config.click_outside_dismisses,
        theme,
        default_view: defaultView,
      };

      try {
        await invoke("save_config", { config: updated });
        // Apply theme immediately
        if (updated.theme === "auto") {
          document.documentElement.removeAttribute("data-theme");
        } else {
          document.documentElement.setAttribute("data-theme", updated.theme);
        }
        status.textContent = "Saved! Restart app for shortcut changes.";
        status.style.color = "#9ece6a";
      } catch (err) {
        status.textContent = `Error: ${err}`;
        status.style.color = "#f7768e";
      }
    });

    // Allow Enter to save from any input
    body.querySelectorAll(".settings-input").forEach((input) => {
      input.addEventListener("keydown", (e: Event) => {
        if ((e as KeyboardEvent).key === "Enter") {
          saveBtn.click();
        }
      });
    });
  });

  return { cleanup };
}
