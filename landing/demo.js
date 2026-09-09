(() => {
  const demo = document.querySelector('#demo');
  const reader = document.querySelector('#reader');
  const empty = document.querySelector('#empty-state');
  const article = document.querySelector('#article');
  const query = document.querySelector('#query');
  const tabs = [...document.querySelectorAll('[data-page]')];
  const pages = [
    { title: 'Reading on<br>a screen.', paragraphs: ['You opened an essay someone sent you, or searched for a reference you need for your work. You want to read it and get back to what you were doing.', 'Give that page your attention. Read at your own pace, follow a thought, and leave when you have what you need.'], heading: 'Start with the words', closing: 'On a quiet page, you can spend your time with the writing. Choose a comfortable line length and leave enough room between paragraphs.' },
    { title: 'Checking<br>a source.', paragraphs: ['Before you search, write down what you want to know. A specific question gives you a place to start and a reason to stop.', 'Read a few sources. Compare their examples and check the details that matter to your work. Keep a note of the parts you want to revisit.'], heading: 'Follow the reference', closing: 'An author may point you to an earlier essay or a study. Open that source if you need the context. You can return to your question after you read it.' },
    { title: 'Taking<br>reading notes.', paragraphs: ['You can close the page after you find your answer. Take a moment to write what you learned in your own words.', 'A sentence in your notebook may be enough. You can use it as a starting point when you return to your work.'], heading: 'Return to your work', closing: 'Try the idea in the thing you were making. You may find another question worth searching for, or you may have enough to keep going.' }
  ];
  let current = 0;
  function showPage(index, announce = true) {
    current = (index + pages.length) % pages.length;
    reader.hidden = false;
    empty.hidden = true;
    const page = pages[current];
    document.querySelector('#article-title').innerHTML = page.title;
    const copy = document.querySelector('#article-copy');
    copy.replaceChildren();
    for (const paragraph of page.paragraphs) {
      const p = document.createElement('p'); p.textContent = paragraph; copy.append(p);
    }
    const heading = document.createElement('h4'); heading.textContent = page.heading;
    const closing = document.createElement('p'); closing.textContent = page.closing;
    copy.append(heading, closing);
    document.querySelector('#page-number').textContent = `0${current + 1} / 03`;
    article.setAttribute('aria-labelledby', `tab-${current}`);
    article.scrollTop = 0;
    tabs.forEach((tab, index) => { tab.setAttribute('aria-selected', String(index === current)); tab.tabIndex = index === current ? 0 : -1; });
    if (announce) document.querySelector('#announcement').textContent = `Sample article ${current + 1} of 3: ${tabs[current].textContent.trim()}`;
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
