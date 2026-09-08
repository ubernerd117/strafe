import { afterEach, describe, expect, it, vi } from "vitest";
import { createSearchInput } from "../src/search-input";

describe("search input", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each([
    ["an active composition", { isComposing: true }],
    ["WebKit's composition key code", { keyCode: 229 }],
  ])("does not submit Enter during %s", (_label, eventProperties) => {
    const onSearch = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    createSearchInput(container, { onSearch, onDismiss: vi.fn() });
    const input = container.querySelector("input");
    input.value = "composing text";

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    for (const [name, value] of Object.entries(eventProperties)) {
      Object.defineProperty(event, name, { value });
    }
    input.dispatchEvent(event);

    expect(onSearch).not.toHaveBeenCalled();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith("composing text");
  });
});
