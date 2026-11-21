// Builds the source images that `capacitor-assets` expands into every Android
// density. Source of truth is the vita isotype in apps/web/src/app/icon.svg:
// white "V" with a mint dot and an amber dot, on the brand teal.
//
// Usage (from apps/mobile): node scripts/make-assets.mjs && npx capacitor-assets generate --android
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const out = fileURLToPath(new URL("../assets/", import.meta.url));
mkdirSync(out, { recursive: true });

const TEAL = "#0d9b8e";
const CREAM = "#faf8f4";

// Glyph geometry copied from icon.svg (viewBox 144 160 965 965).
const glyph = `
  <path d="M410 395C445 395 470 415 487 440L612 696C640 745 695 785 775 742L720 840C690 890 650 915 608 915C560 915 520 890 497 840L335 520C318 485 322 405 410 395Z" fill="#ffffff"/>
  <circle cx="722" cy="648" r="87" fill="#a8d8cd"/>
  <circle cx="837" cy="459" r="90" fill="#f2b872"/>`;

// The glyph's bounding box is centered at (624.5, 642). It is scaled so it stays
// inside the adaptive-icon safe zone (the inner ~66% of the canvas).
const centered = (size, scale) =>
  `<g transform="translate(${size / 2} ${size / 2}) scale(${scale}) translate(-624.5 -642)">${glyph}</g>`;

const svg = (size, body) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`);

const png = (name, buffer) => sharp(buffer).png().toFile(`${out}${name}`);

// Adaptive icon layers.
await png("icon-foreground.png", svg(1024, centered(1024, 0.72)));
await png("icon-background.png", svg(1024, `<rect width="1024" height="1024" fill="${TEAL}"/>`));
// Legacy / full icon.
await png("icon-only.png", svg(1024, `<rect width="1024" height="1024" fill="${TEAL}"/>${centered(1024, 0.8)}`));
// Splash: isotype on the app's cream background.
await png("splash.png", svg(2732, `<rect width="2732" height="2732" fill="${CREAM}"/>${centered(2732, 0.9)}`));
await png("splash-dark.png", svg(2732, `<rect width="2732" height="2732" fill="#0f1923"/>${centered(2732, 0.9)}`));

console.log("assets written to", out);
