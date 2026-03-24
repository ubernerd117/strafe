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
    <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input class="search-input" type="text" placeholder="search..." autofocus />
    <span class="search-hint">enter ↵</span>
  `;

  const input = el.querySelector(".search-input") as HTMLInputElement;

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && input.value.trim()) {
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
    <h3>Enter your Brave Search API key to get started</h3>
    <input class="api-key-input" type="text" placeholder="BSA..." />
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
