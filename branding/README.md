# Strafe identity

Use `mark.svg` for the Strafe arrow. Keep its geometry in app headers, the landing page, and native icons:

```svg
<path d="M6 26 26 6M15 6h11v11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
```

Use a `0 0 32 32` viewBox with no fill. Set the color through CSS when you inline the mark. For a standalone image, set a color on the containing SVG.

The dark palette uses charcoal `#101311`, sage `#c3f5a5`, and warm white `#edece3`. Use sage for the mark on charcoal. Use a neutral ink color when the surface needs more contrast.

## Generate native icons

From the repository root, run:

```sh
bun install
bun branding/generate.ts
```

The script reads the canonical path from `mark.svg` and writes `app-icon.svg` and `tray-template.svg`. It calls the project's Tauri CLI to rasterize the vectors and build desktop icon formats. Bun provides the file and PNG-decoding APIs; the script needs no extra image libraries.

The app icon places a sage arrow on a rounded charcoal tile. A 96px transparent inset on the 1024px canvas gives the tile space in the macOS Dock. `icon.png` and `icon_rounded.png` contain the same 1024px source render so both existing references use this identity.

The generated files in `src-tauri/icons/` include macOS ICNS, Windows ICO and store assets, Linux PNGs, and a monochrome tray mark. `tray-template.png` contains a black arrow with transparent surroundings. `tray-template.rgba` contains its 32 × 32 pixels as 4,096 uncompressed RGBA bytes in row order. Rust can load those bytes with `tauri::image::Image::new_owned(bytes.to_vec(), 32, 32)` and let the OS tint the image as a tray template.

Commit the SVG sources, generation script, and generated files together after changing the mark. Use the same path and stroke attributes in inline SVGs.
