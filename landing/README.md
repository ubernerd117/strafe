# Strafe landing page

Standalone HTML, CSS, and JavaScript. No build step or runtime dependencies.

Open `index.html` in a browser, or serve this directory with a static server. From the repository root:

```sh
bunx --no-install vite landing --host 127.0.0.1 --port 4173
```

The local preview is at http://127.0.0.1:4173/. You can deploy the contents of this directory to a static host.

## Deploy to Vercel

Create a separate Vercel project named `strafe-website` from this GitHub repository. Keep the portfolio's existing Vercel project connected to `sourab.tech`.

| Setting | Value |
| --- | --- |
| Root Directory | `landing` |
| Framework Preset | Other |
| Install Command | Empty (configured in `vercel.json`) |
| Build Command | Empty (configured in `vercel.json`) |
| Output Directory | `.` (configured in `vercel.json`) |

Vercel reads `landing/vercel.json` when `landing` is selected as the root. This site serves its HTML, CSS, JavaScript, and bundled fonts directly. It needs no environment variables, Brave API key, Rust, or Tauri build. Leave **Include source files outside of the Root Directory in the Build Step** disabled.

The landing page and Vercel setup currently live on `codex/landing-vercel`. Merge that branch into `main` before deploying `main`, or explicitly select `codex/landing-vercel` as the Vercel project's production branch until it is merged. Importing `main` before the merge will not include this directory.

After verifying the generated deployment URL:

1. Open the new project's **Settings → Domains** and add `strafe.sourab.tech` to production.
2. At the authoritative DNS provider for `sourab.tech`, create a CNAME named `strafe` with the exact target displayed by Vercel. If Vercel manages DNS, check whether it created the record automatically.
3. Keep the portfolio's existing apex and `www` DNS records in place. No nameserver change is needed.
4. Wait for Vercel to confirm valid configuration and HTTPS, then verify the reader demo, downloads, and portfolio link at `https://strafe.sourab.tech/`.

The canonical URL, social metadata, robots file, and sitemap use `https://strafe.sourab.tech/`. Update them together if the production domain changes. Vercel normally adds `X-Robots-Tag: noindex` to preview deployments; keep that default so previews stay out of search results.

See [Vercel build settings](https://vercel.com/docs/builds/configure-a-build) and [custom domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

The interactive reader uses three original Rust examples for the query “rust sort vec of structs by field”: sort_by_key(), descending order with Reverse, and stable versus unstable sorting. The syntax follows the [Rust slice documentation](https://doc.rust-lang.org/std/primitive.slice.html#method.sort_by_key); these are authored samples, not fetched search results. The fixed sample search does not call an API. Click the reader to use h/l, j/k, 1–3, slash, and Escape; use article tabs or arrow buttons on touch devices. Download links open the project's latest GitHub release.

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
