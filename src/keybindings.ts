export interface KeybindingActions {
  prevPage: () => void;
  nextPage: () => void;
  scrollDown: () => void;
  scrollUp: () => void;
  toggleImages: () => void;
  openInBrowser: () => void;
  dismiss: () => void;
  focusSearch: () => void;
  jumpToPage: (index: number) => void;
}

export function setupKeybindings(
  actions: KeybindingActions,
  scrollSpeed: number
): () => void {
  void (scrollSpeed * 40); // scrollAmount available to callers via actions

  function handler(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return;
    }

    switch (e.key) {
      case "h":
        e.preventDefault();
        actions.prevPage();
        break;
      case "l":
        e.preventDefault();
        actions.nextPage();
        break;
      case "j":
        e.preventDefault();
        actions.scrollDown();
        break;
      case "k":
        e.preventDefault();
        actions.scrollUp();
        break;
      case "i":
        e.preventDefault();
        actions.toggleImages();
        break;
      case "o":
        e.preventDefault();
        actions.openInBrowser();
        break;
      case "Escape":
        e.preventDefault();
        actions.dismiss();
        break;
      case "/":
        e.preventDefault();
        actions.focusSearch();
        break;
      default:
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
          e.preventDefault();
          actions.jumpToPage(num - 1);
        }
        break;
    }
  }

  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}
