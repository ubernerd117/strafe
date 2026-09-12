(() => {
  const tabs = [...document.querySelectorAll('[data-page]')];
  const views = [
    { image: 'assets/strafe-reader-mode.png', alt: "Rocky Linux's NvimTree documentation in Strafe's text-only reader.", caption: 'Read Rocky Linux documentation in a clean text view.' },
    { image: 'assets/strafe-reader-image-mode.png', alt: 'The same Rocky Linux documentation in Strafe with its file-tree illustration visible.', caption: 'Keep useful diagrams and screenshots alongside the text. In the app, i toggles images.' },
    { image: 'assets/strafe-raw-mode.png', alt: 'Rocky Linux documentation in Strafe with its original layout and blue header.', caption: 'See a static preview of the original layout. In the app, w toggles raw view.' },
    { image: 'assets/strafe-ai-overview.png', alt: 'A captured Brave AI overview about finding files in Neo-tree, alongside source results in Strafe.', caption: 'Read an overview alongside your results. AI Overview requires a separate Brave Answers API key.' }
  ];
  function select(index) {
    const view = views[index];
    const image = document.querySelector('#preview-image');
    image.src = view.image;
    image.alt = view.alt;
    document.querySelector('#preview-caption').textContent = view.caption;
    document.querySelector('#preview-full-size').href = view.image;
    document.querySelector('#screenshot-panel').setAttribute('aria-labelledby', tabs[index].id);
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      select(next);
      tabs[next].focus();
    });
  });
})();
