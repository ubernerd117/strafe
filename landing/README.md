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

After verifying the generated deployment URL:

1. Open the new project's **Settings → Domains** and add `strafe.sourab.tech` to production.
2. At the authoritative DNS provider for `sourab.tech`, create a CNAME named `strafe` with the exact target displayed by Vercel. If Vercel manages DNS, check whether it created the record automatically.
3. Keep the portfolio's existing apex and `www` DNS records in place. No nameserver change is needed.
4. Wait for Vercel to confirm valid configuration and HTTPS, then verify the reader demo, downloads, and portfolio link at `https://strafe.sourab.tech/`.

The canonical URL, social metadata, robots file, and sitemap use `https://strafe.sourab.tech/`. Update them together if the production domain changes. Vercel normally adds `X-Robots-Tag: noindex` to preview deployments; keep that default so previews stay out of search results.

See [Vercel build settings](https://vercel.com/docs/builds/configure-a-build) and [custom domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

The screenshot gallery shows four captured app views: reader, reader with images, raw view, and Brave AI overview. Choose a tab or use the standard Left/Right/Home/End tab-navigation keys. The gallery has no search form, reset/dismiss controls, or app keyboard shortcuts. In Strafe itself, h/l changes results, i toggles images, and w toggles raw view. Each gallery view links to its full-size screenshot; AI Overview requires a separate Brave Answers API key. The reader screenshots show [Rocky Linux documentation](https://docs.rockylinux.org/books/nvchad/nvchad_ui/nvimtree/).

Both the app and this page load bundled Google Fonts from `fonts/`: Syne for editorial labels, DM Sans for headings and body text, IBM Plex Mono for key hints, and Literata for the reader. The font files work offline; their OFL licenses sit alongside them. `fonts.css` defines the shared faces. The arrow geometry matches `../branding/mark.svg`, and `app-icon.svg` provides the favicon.

## Demo video

`assets/strafe-demo.mp4` is the 37-second recording shown below the hero. The player uses native controls, plays inline on mobile, and waits for playback before loading the video. `assets/strafe-reader-mode.png` supplies its preview and the root README's clickable thumbnail; the reader-with-images, raw-view, and AI-overview PNGs supply the other gallery tabs.

Commit the MP4 and screenshots with the page changes, then push the feature branch and open a PR. They deploy with the static site after merge. The original `assets/strafe-demo.mov` stays local and is gitignored.

To regenerate the published assets with FFmpeg from the repository root:

```sh
ffmpeg -i landing/assets/strafe-demo.mov -vf 'scale=1920:-2,fps=30' -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart -an landing/assets/strafe-demo.mp4
```

The README thumbnail opens the complete hosted video. For an inline GitHub player instead, drag the MP4 into a GitHub Markdown editor and use the generated attachment URL in the README. That attachment upload is separate from committing the file. See [GitHub's attachment documentation](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files).

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
