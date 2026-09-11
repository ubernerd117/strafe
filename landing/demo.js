(() => {
  const demo = document.querySelector('#demo');
  const reader = document.querySelector('#reader');
  const empty = document.querySelector('#empty-state');
  const article = document.querySelector('#article');
  const query = document.querySelector('#query');
  const tabs = [...document.querySelectorAll('[data-page]')];
  const pages = [
    { image: 'assets/search-result-1.png', alt: 'Neo-tree search result in Strafe reader view, showing a GitHub discussion about navigating to a parent directory.', caption: 'Read the GitHub discussion with the page stripped down to text and images.' },
    { image: 'assets/search-result-1-raw-mode.png', alt: 'The same Neo-tree GitHub discussion in Strafe raw view, with the original page layout and comments.', caption: 'Switch to raw view to see the source page’s layout and comments.' },
    { image: 'assets/ai-overview.png', alt: 'Brave AI overview in Strafe explaining Neo-tree parent-directory navigation with Backspace and the navigate_up command.', caption: 'Read a Brave AI overview alongside the search results. Captured from the app; this preview does not generate answers.' }
  ];
  let current = 0;
  function showPage(index, announce = true) {
    current = (index + pages.length) % pages.length;
    reader.hidden = false;
    empty.hidden = true;
    const page = pages[current];
    const image = document.querySelector('#preview-image');
    image.src = page.image;
    image.alt = page.alt;
    document.querySelector('#preview-caption').textContent = page.caption;
    document.querySelector('#preview-full-size').href = page.image;
    article.setAttribute('aria-labelledby', `tab-${current}`);
    article.scrollTop = 0;
    tabs.forEach((tab, index) => { tab.setAttribute('aria-selected', String(index === current)); tab.tabIndex = index === current ? 0 : -1; });
    if (announce) document.querySelector('#announcement').textContent = `Captured view ${current + 1} of 3: ${tabs[current].textContent.trim()}`;
  }
  function dismiss() { reader.hidden = true; empty.hidden = false; query.focus(); }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showPage(index));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = current + 1;
      if (event.key === 'ArrowLeft') next = current - 1;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = pages.length - 1;
      if (next === undefined) return;
      event.preventDefault(); showPage(next); tabs[current].focus();
    });
  });
  document.querySelector('#search-form').addEventListener('submit', (event) => { event.preventDefault(); showPage(0); article.focus(); });
  document.querySelector('#reset').addEventListener('click', () => { showPage(0); demo.focus(); });
  document.querySelector('#previous').addEventListener('click', () => showPage(current - 1));
  document.querySelector('#next').addEventListener('click', () => showPage(current + 1));
  demo.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target.isContentEditable) return;
    if (event.key === '/') { event.preventDefault(); dismiss(); return; }
    if (reader.hidden) return;
    if (!['h', 'l', 'j', 'k', 'Escape', '1', '2', '3'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'h') showPage(current - 1);
    if (event.key === 'l') showPage(current + 1);
    if (event.key === 'j') article.scrollTop += 90;
    if (event.key === 'k') article.scrollTop -= 90;
    if (event.key === 'Escape') dismiss();
    if (/^[1-3]$/.test(event.key)) showPage(Number(event.key) - 1);
  });
})();
