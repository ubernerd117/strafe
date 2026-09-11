import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, it } from 'vitest';

beforeEach(() => {
  document.body.innerHTML = readFileSync('landing/index.html', 'utf8');
  new Function(readFileSync('landing/demo.js', 'utf8'))();
});
afterEach(() => { document.body.innerHTML = ''; });

it('shows the captured reader on load and lets visitors open the full screenshot', () => {
  const image = document.querySelector('#preview-image');
  expect(image?.getAttribute('src')).toBe('assets/search-result-1.png');
  expect(image?.alt).toContain('Neo-tree');
  expect(document.querySelector('#preview-full-size')?.getAttribute('href')).toBe(image.getAttribute('src'));
});

it('switches captured views with keyboard and tabs, then restores the reader after dismissing', () => {
  const demo = document.querySelector('#demo');
  demo.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
  expect(document.querySelector('#preview-image')?.getAttribute('src')).toBe('assets/search-result-1-raw-mode.png');
  document.querySelector('#tab-2').click();
  expect(document.querySelector('#preview-image')?.getAttribute('src')).toBe('assets/ai-overview.png');
  expect(document.querySelector('#preview-full-size')?.getAttribute('href')).toBe('assets/ai-overview.png');
  expect(document.querySelector('#tab-2').getAttribute('aria-selected')).toBe('true');
  demo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('#reader').hidden).toBe(true);
  document.querySelector('#search-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  expect(document.querySelector('#reader').hidden).toBe(false);
  expect(document.querySelector('#preview-image').getAttribute('src')).toBe('assets/search-result-1.png');
});
