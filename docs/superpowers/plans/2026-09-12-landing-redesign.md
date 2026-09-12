# Strafe landing redesign

Goal: Present Strafe as a focused Mac reader using the clean product captures, with a decorative hero video and accurate explanations of the app.

## Design direction

Dark forest hero, warm ivory editorial sections, mint calls to action, oversized DM Sans headlines, and Literata accents. Preserve the arrow wordmark and bundled fonts. Give the real screenshots space; remove the mock application frame, fake search, screenshot tabs, and simulated app shortcuts.

References: [Things](https://culturedcode.com/things/) for product-first presentation; [Craft](https://www.craft.do/) for editorial space and warm surfaces; [Raycast](https://www.raycast.com/) for a clear Mac download action and visible keyboard affordances. Borrow principles, not assets or copy.

## Implementation

- [x] Replace landing/index.html and style.css with a cohesive layout: atmospheric hero, two large alternating reader/image features, paired raw/overview features, accurate static shortcut reference, and installation CTA.
- [x] Make a short cropped hero clip from the existing demo; retain the complete video as a direct watch link. Muted looping background, pause control, poster fallback, no automatic playback/download for reduced motion, mobile, or Save-Data. Use native video events to keep the button accurate.
- [x] Remove demo.js and its simulation tests. Add a resource-integrity test to catch broken asset/anchor references, then implement against its failing result.
- [x] Use all four new screenshots unchanged, with meaningful alt text and full-size links. Attribute the Rocky Linux documentation example. Show reading and reading with images separately. Explain optional Brave Answers credentials beside AI overview.
- [x] Update the README thumbnail and landing documentation. Keep current canonical/download/source links.
- [x] Run lint and tests; verify desktop/mobile screenshots, resource loads, native motion controls, reduced motion and keyboard navigation in real Chromium. Independent review and address findings.

## Constraints

Static HTML/CSS/JS, no new runtime libraries. No app keyboard interception on the landing page. In the app h/l changes results, i toggles images, and w toggles raw view. No autoplay sound or foreground video player. No simulated search. Respect user-deleted old images and include their replacements.

Technical references: [MDN video](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video), [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion).

Validation: 116 tests and lint passed; Chromium verified widths 320–1920px, 200% text, no-JavaScript/mobile/reduced-motion still fallback, explicit pause/resume, full-size image links, and no intercepted app shortcuts. Independent review recommendations applied: concrete hero description, looser heading spacing, and 12px minimum labels.
