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
4. Wait for Vercel to confirm valid configuration and HTTPS, then verify the screenshots, background motion control, downloads, and portfolio link at `https://strafe.sourab.tech/`.

The canonical URL, social metadata, robots file, and sitemap use `https://strafe.sourab.tech/`. Update them together if the production domain changes. Vercel normally adds `X-Robots-Tag: noindex` to preview deployments; keep that default so previews stay out of search results.

See [Vercel build settings](https://vercel.com/docs/builds/configure-a-build) and [custom domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## Page design

A dark forest hero introduces the app over a subdued, cropped recording. Warm ivory and sage sections show the four supplied screenshots in a fixed reading order: text reader, reader with images, original page layout, and optional Brave AI overview. Each image opens at full resolution. The page has no simulated search, app frame, tabs, or application keyboard handlers.

The shortcut reference describes the real app: h/l changes results, j/k scrolls, i toggles images, w toggles the original layout, o opens the browser, slash searches, and Escape dismisses. AI Overview needs a separate Brave Answers plan and key; regular search uses a Brave Search key.

The page uses bundled DM Sans for headings/body, Literata for display accents, and IBM Plex Mono for labels and keys. `fonts.css` is shared with the app. Fonts and their OFL licenses live in `fonts/`. The arrow matches `../branding/mark.svg`.

Design references:

- [Things](https://culturedcode.com/things/): product-first presentation and restrained navigation.
- [Craft](https://www.craft.do/): warm surfaces and editorial spacing.
- [Raycast](https://www.raycast.com/): a clear download action and keyboard affordances.
- [MDN video](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video) and [reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion): muted inline playback with a user-controlled static fallback.

## Assets and motion

- `assets/strafe-reader-mode.png`: text reader; also the static hero image, social image, and root README thumbnail.
- `assets/strafe-reader-image-mode.png`: reader with images.
- `assets/strafe-raw-mode.png`: original page layout.
- `assets/strafe-ai-overview.png`: a captured Brave AI overview.
- `assets/strafe-demo.mp4`: complete 37-second recording, opened by “Watch the film” and the README thumbnail.
- `assets/strafe-hero.mp4`: 17-second muted background excerpt cropped to the app window.

`motion.js` loads and plays the background video on desktop. It leaves the still image in place without loading the video on small screens (700px and below), with reduced motion, or with Save-Data. Visitors can explicitly play or pause it. Visibility and preference changes pause/resume playback without overriding a manual pause. Without JavaScript, the still image, screenshots, and links remain usable.

The three reader/layout captures show [Rocky Linux's NvimTree documentation](https://docs.rockylinux.org/books/nvchad/nvchad_ui/nvimtree/). The AI overview is a recorded example; the landing page makes no search or generation API calls.

Commit the MP4s and screenshots with page changes and push the feature branch. The static host deploys them after merge. The original `assets/strafe-demo.mov` stays local and is gitignored.

Regenerate the video assets with FFmpeg from the repository root (use `-y` to overwrite existing outputs):

```sh
ffmpeg -i landing/assets/strafe-demo.mov -vf 'scale=1920:-2,fps=30' -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart -an landing/assets/strafe-demo.mp4
ffmpeg -ss 14 -t 17 -i landing/assets/strafe-demo.mp4 -vf 'crop=888:656:514:178,scale=1280:-2,fps=24' -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -movflags +faststart -an landing/assets/strafe-hero.mp4
```

The README uses a clickable thumbnail linking to the complete hosted video. For an inline GitHub player, upload the MP4 in a GitHub Markdown editor and insert its attachment URL; committing a video does not create that attachment. See [GitHub's attachment documentation](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files).

## Verification

Run `bun run lint && bun run test` from the repository root. The landing resource test catches missing images, video files, scripts, and internal anchor targets. Browser QA should cover desktop/mobile overflow, image loading, full-size links, video pause/resume, reduced-motion changes, and the no-JavaScript fallback.
