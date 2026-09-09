import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

// Run with `bun branding/generate.ts` from any working directory.
const root = resolve(dirname(import.meta.path), '..');
const branding = join(root, 'branding');
const icons = join(root, 'src-tauri/icons');
const source = await readFile(join(branding, 'mark.svg'), 'utf8');
const path = source.match(/<path[^>]+\/>/)?.[0];
if (!path) throw new Error('branding/mark.svg must contain one self-closing path.');

const appSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">
  <rect x="96" y="96" width="832" height="832" rx="184" fill="#101311"/>
  <rect x="97" y="97" width="830" height="830" rx="183" stroke="#293126" stroke-width="2"/>
  <g transform="translate(128 128) scale(24)" color="#c3f5a5">
    ${path}
  </g>
</svg>
`;
const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" color="#000000">
  ${path}
</svg>
`;
await writeFile(join(branding, 'app-icon.svg'), appSvg);
await writeFile(join(branding, 'tray-template.svg'), traySvg);

async function generate(input: string, output: string, size?: number) {
  const args = ['bun', 'run', 'tauri', 'icon', input, '--output', output];
  if (size) args.push('--png', String(size));
  const result = Bun.spawnSync(args, { cwd: root, stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) throw new Error(`Icon generation failed: ${input}`);
}

// Tauri also emits mobile assets. Copy only the desktop formats this project uses.
const desktop = [
  '32x32.png', '128x128.png', '128x128@2x.png', 'icon.png', 'icon.ico', 'icon.icns',
  'Square30x30Logo.png', 'Square44x44Logo.png', 'Square71x71Logo.png',
  'Square89x89Logo.png', 'Square107x107Logo.png', 'Square142x142Logo.png',
  'Square150x150Logo.png', 'Square284x284Logo.png', 'Square310x310Logo.png', 'StoreLogo.png',
];
const temp = await mkdtemp(join(tmpdir(), 'strafe-icons-'));
try {
  await generate(join(branding, 'app-icon.svg'), join(temp, 'desktop'));
  for (const name of desktop) await copyFile(join(temp, 'desktop', name), join(icons, name));
  await writeFile(join(icons, 'icon.icns'), canonicalizeIcns(await readFile(join(icons, 'icon.icns'))));
  await generate(join(branding, 'app-icon.svg'), join(temp, 'master'), 1024);
  await copyFile(join(temp, 'master', '1024x1024.png'), join(root, 'icon.png'));
  await copyFile(join(root, 'icon.png'), join(root, 'icon_rounded.png'));
  await generate(join(branding, 'tray-template.svg'), join(temp, 'tray'), 32);
  const tray = join(temp, 'tray', '32x32.png');
  await copyFile(tray, join(icons, 'tray-template.png'));
  await writeFile(join(icons, 'tray-template.rgba'), decodeRgbaPng(await readFile(tray)));
} finally {
  await rm(temp, { recursive: true, force: true });
}

// Tauri emits ICNS entries in hash-map order. Sort the unchanged entries so a
// regeneration does not create a binary diff when the artwork has not changed.
function canonicalizeIcns(bytes: Buffer): Buffer {
  if (bytes.toString('ascii', 0, 4) !== 'icns' || bytes.readUInt32BE(4) !== bytes.length) {
    throw new Error('Invalid ICNS container.');
  }
  const entries: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > bytes.length) throw new Error('Invalid ICNS entry.');
    entries.push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  entries.sort((a, b) => Buffer.compare(a.subarray(0, 4), b.subarray(0, 4)));
  return Buffer.concat([bytes.subarray(0, 8), ...entries]);
}

// Tauri's SVG renderer produces non-interlaced RGBA8 PNGs. Decode their pixels
// using Bun's built-in zlib so the Rust tray needs no image-decoder feature.
function decodeRgbaPng(png: Buffer): Uint8Array {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!png.subarray(0, 8).equals(signature)) throw new Error('Invalid PNG signature.');
  const chunks: Buffer[] = [];
  let width = 0;
  let height = 0;
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const name = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (name === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (width !== 32 || height !== 32 || data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error('Tray PNG must be a non-interlaced 32x32 RGBA8 image.');
      }
    }
    if (name === 'IDAT') chunks.push(data);
    offset += length + 12;
  }
  const scanlines = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  if (width !== 32 || height !== 32 || scanlines.length !== (stride + 1) * height) {
    throw new Error('Unexpected tray PNG pixel count.');
  }
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = scanlines[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= 4 ? rgba[index - 4] : 0;
      const above = y > 0 ? rgba[index - stride] : 0;
      const upperLeft = x >= 4 && y > 0 ? rgba[index - stride - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const estimate = left + above - upperLeft;
        const distances = [Math.abs(estimate - left), Math.abs(estimate - above), Math.abs(estimate - upperLeft)];
        predictor = distances[0] <= distances[1] && distances[0] <= distances[2]
          ? left : distances[1] <= distances[2] ? above : upperLeft;
      } else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`);
      rgba[index] = (scanlines[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return rgba;
}
