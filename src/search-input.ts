import { brandMark, brandWordmark } from "./brand";

export interface SearchInputCallbacks {
  onSearch: (query: string) => void;
  onDismiss: () => void;
}

export function createSearchInput(
  container: HTMLElement,
  callbacks: SearchInputCallbacks
): { focus: () => void; setValue: (v: string) => void; getElement: () => HTMLElement } {
  const el = document.createElement("div");
  el.className = "search-container";
  el.setAttribute("data-tauri-drag-region", "");
  el.innerHTML = `
    ${brandMark}
    <input class="search-input" type="text" placeholder="Search" aria-label="Search" autofocus />
    <span class="search-hint">enter ↵</span>
  `;

  const input = el.querySelector(".search-input") as HTMLInputElement;

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (
      e.key === "Enter" &&
      !e.isComposing &&
      e.keyCode !== 229 &&
      input.value.trim()
    ) {
      e.preventDefault();
      callbacks.onSearch(input.value.trim());
    }
    if (e.key === "Escape") {
      e.preventDefault();
      callbacks.onDismiss();
    }
  });

  container.appendChild(el);

  return {
    focus: () => {
      input.focus();
      input.select();
    },
    setValue: (v: string) => {
      input.value = v;
    },
    getElement: () => el,
  };
}

export function createApiKeySetup(
  container: HTMLElement,
  onSave: (key: string) => void
): HTMLElement {
  const el = document.createElement("div");
  el.className = "api-key-container";
  el.innerHTML = `
    ${brandWordmark}
    <h3>Brave Search API key</h3>
    <label class="api-key-label" for="brave-api-key">Enter your key to search the web.</label>
    <input id="brave-api-key" class="api-key-input" type="password" placeholder="BSA…" autocomplete="off" />
    <button class="api-key-save">Save</button>
  `;

  const input = el.querySelector(".api-key-input") as HTMLInputElement;
  const button = el.querySelector(".api-key-save") as HTMLButtonElement;

  const save = () => {
    const key = input.value.trim();
    if (key) onSave(key);
  };

  button.addEventListener("click", save);
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") save();
  });

  container.appendChild(el);
  setTimeout(() => input.focus(), 50);

  return el;
}
