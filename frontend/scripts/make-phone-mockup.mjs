// Puts a capture of the app's screen into the phone picture, and cuts the phone out of its
// backdrop. Run from frontend: node scripts/make-phone-mockup.mjs
//
// The capture, design/demo-art/phone-screen.png, is the app at 500 x 1109 CSS pixels, the
// proportions of the phone's screen. The outline below is measured from mockup-phone.png.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = (name) => fileURLToPath(new URL(`../../design/demo-art/${name}`, import.meta.url));
const SCREEN = { x: 225, y: 70, w: 602, h: 1335 };

const { data, info } = await sharp(source("mockup-phone.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const outline = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="199.5" y="42" width="655.5" height="1395" rx="85" fill="#fff"/><rect x="850" y="312" width="10.5" height="180" rx="3" fill="#fff"/><rect x="850" y="564" width="10.5" height="92" rx="3" fill="#fff"/></svg>`);
const alpha = await sharp(outline).ensureAlpha().extractChannel(3).raw().toBuffer();
const screen = await sharp(source("phone-screen.png")).resize(SCREEN.w, SCREEN.h, { fit: "cover", position: "top" }).removeAlpha().raw().toBuffer();

const rgba = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    let [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const a = Math.max(0, Math.min(1, (g - Math.max(r, b)) / 150));
    if (a > 0 && x >= SCREEN.x && x < SCREEN.x + SCREEN.w && y >= SCREEN.y && y < SCREEN.y + SCREEN.h) {
      const j = ((y - SCREEN.y) * SCREEN.w + (x - SCREEN.x)) * 3;
      // The colour left at a soft edge is lit by the green, so it takes only red and blue.
      const under = Math.min(g, Math.max(r, b));
      [r, g, b] = [screen[j] * a + r * (1 - a), screen[j + 1] * a + under * (1 - a), screen[j + 2] * a + b * (1 - a)].map(Math.round);
    }
    rgba.set([r, g, b, alpha[y * W + x]], (y * W + x) * 4);
  }
}
const webp = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).resize(750, 1050).webp({ quality: 86, alphaQuality: 95 }).toBuffer();
writeFileSync(new URL("../public/cards/series/digital-card.webp", import.meta.url), webp);
console.log(`digital-card.webp  ${(webp.length / 1024).toFixed(0)} KB`);
