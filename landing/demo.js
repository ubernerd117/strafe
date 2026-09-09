(() => {
  const demo = document.querySelector('#demo');
  const reader = document.querySelector('#reader');
  const empty = document.querySelector('#empty-state');
  const article = document.querySelector('#article');
  const query = document.querySelector('#query');
  const tabs = [...document.querySelectorAll('[data-page]')];
  const pages = [
  {
    "title": "Sort a Vec<br>by a field.",
    "paragraphs": [
      "Use sort_by_key() with a closure that returns the field to compare. Here, users are ordered by score, lowest first."
    ],
    "code": "struct User {\n    score: u32,\n}\n\nlet mut users = vec![\n    User { score: 92 },\n    User { score: 98 },\n];\n\nusers.sort_by_key(|u| u.score);\nassert_eq!(users[0].score, 92);",
    "heading": "The vector changes in place",
    "closing": "The method sorts the existing elements and returns (). Keep the Vec mutable; no new sorted vector is returned."
  },
  {
    "title": "Highest score<br>first.",
    "paragraphs": [
      "Wrap the key in std::cmp::Reverse to sort in descending order. The highest score moves to the front."
    ],
    "code": "use std::cmp::Reverse;\n\nstruct User {\n    score: u32,\n}\n\nlet mut users = vec![\n    User { score: 92 },\n    User { score: 98 },\n];\n\nusers.sort_by_key(|u| Reverse(u.score));\nassert_eq!(users[0].score, 98);",
    "heading": "Reverse the comparison",
    "closing": "Reverse works with keys that implement Ord. It avoids subtracting or negating an unsigned score."
  },
  {
    "title": "Do ties need<br>to stay in order?",
    "paragraphs": [
      "Use sort_unstable_by_key() when the relative order of equal scores does not matter. It sorts in place without allocating auxiliary memory."
    ],
    "code": "struct User {\n    score: u32,\n}\n\nlet mut users = vec![\n    User { score: 92 },\n    User { score: 98 },\n];\n\nusers.sort_unstable_by_key(|u| u.score);\nassert_eq!(users[0].score, 92);",
    "heading": "Stable means preserving ties",
    "closing": "sort_by_key() keeps equal-score users in their original relative order. sort_unstable_by_key() does not guarantee that order."
  }
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
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = page.code;
    pre.append(code);
    copy.append(pre);
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
