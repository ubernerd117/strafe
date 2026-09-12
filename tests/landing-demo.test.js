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

it('switches the four screenshot tabs without using app shortcuts', () => {
  const overview = document.querySelector('#tab-3');
  expect(overview).not.toBeNull();
  new Function(readFileSync('landing/demo.js', 'utf8'))();
  overview.click();
  expect(document.querySelector('#preview-image').getAttribute('src')).toBe('assets/strafe-ai-overview.png');
  expect(document.querySelector('#preview-full-size').getAttribute('href')).toBe('assets/strafe-ai-overview.png');
  expect(overview.getAttribute('aria-selected')).toBe('true');
});

it('leaves h and l alone while standard arrow keys navigate gallery tabs', () => {
  const first = document.querySelector('#tab-0');
  expect(first).not.toBeNull();
  new Function(readFileSync('landing/demo.js', 'utf8'))();
  for (const key of ['h', 'l']) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    first.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(first.getAttribute('aria-selected')).toBe('true');
  }
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  expect(document.querySelector('#preview-image').getAttribute('src')).toBe('assets/strafe-reader-image-mode.png');
  expect(document.activeElement.id).toBe('tab-1');
});
