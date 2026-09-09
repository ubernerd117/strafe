# Strafe landing page

Standalone HTML, CSS, and JavaScript. No build step or runtime dependencies.

Open `index.html` in a browser, or serve this directory with a static server. From the repository root:

```sh
bunx --no-install vite landing --host 127.0.0.1 --port 4173
```

The local preview is at http://127.0.0.1:4173/. You can deploy the contents of this directory to a static host.

The interactive reader uses three original sample articles. The fixed sample search does not call an API. Click the reader to use h/l, j/k, 1–3, slash, and Escape; use article tabs or arrow buttons on touch devices. Download links open the project's latest GitHub release.

Both the app and this page load bundled Google Fonts from `fonts/`: Syne for editorial labels, DM Sans for headings and body text, IBM Plex Mono for key hints, and Literata for the reader. The font files work offline; their OFL licenses sit alongside them. `fonts.css` defines the shared faces. The arrow geometry matches `../branding/mark.svg`, and `app-icon.svg` provides the favicon.

## Typography

One scale defines text sizes and line heights in `style.css`; mobile layouts wrap rather than shrink captions and controls.

| Role | Size at a 16px root | Line height |
| --- | --- | --- |
| Caption / section label | 12px | 18px |
| Navigation / control | 14px | 21px |
| Body / reader | 16px | 26px / 28px |
| Small heading | 20px | 26px |
| Article title | 32px | 40px |
| Section title | 32–48px | 1.15 |
| Hero | 48–96px | 1.05 |

Sizes are local design choices, not WCAG minimums. The scale uses rem units and fluid sizing for display headings. Symbols and the wordmark have separate sizing.

Research applied:
- [GOV.UK type scale](https://design-system.service.gov.uk/styles/type-scale/): reuse a scale with paired line heights and relative units; preserve readable small text on mobile.
- [Carbon typography strategies](https://carbondesignsystem.com/elements/typography/style-strategies/): separate expressive page headings from compact product controls.
- [W3C text resizing](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) and [text spacing](https://www.w3.org/WAI/WCAG21/Understanding/text-spacing.html): check content and controls with enlarged text and spacing overrides.
