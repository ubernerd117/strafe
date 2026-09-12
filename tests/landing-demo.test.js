import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

beforeEach(() => {
  document.documentElement.innerHTML = readFileSync('landing/index.html', 'utf8');
});
afterEach(() => { document.documentElement.innerHTML = '<head></head><body></body>'; });

it('ships every local asset referenced by the landing page', () => {
  const attributes = ['src', 'poster', 'data-src'];
  const references = [...document.querySelectorAll('img, video, source, script, link')]
    .flatMap(element => [...attributes, ...(element.tagName === 'LINK' ? ['href'] : [])]
      .map(attribute => element.getAttribute(attribute)).filter(Boolean));
  for (const reference of references) {
    if (/^(https?:|data:)/.test(reference)) continue;
    expect(existsSync(resolve('landing', reference.split('?')[0])), reference).toBe(true);
  }
});

it('keeps page navigation and full-size screenshot links working', () => {
  for (const link of document.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    if (href.startsWith('#') && href.length > 1) {
      expect(document.getElementById(href.slice(1)), href).not.toBeNull();
    } else if (href.startsWith('assets/')) {
      expect(existsSync(resolve('landing', href)), href).toBe(true);
    }
  }
});
