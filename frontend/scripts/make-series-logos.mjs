// Cuts the four series logos out of their white backgrounds for dark surfaces, and writes
// public/cards/series/<prefix>-logo.png. Run from frontend: node scripts/make-series-logos.mjs
//
// Mochi Puffs and Thornmaw Wilds have a dark outline and a light inside, so only the white
// around them goes. Aika Nova and Luma Four are dark ink on white, so the white goes
// everywhere and the violet ink is lifted until it reads on a dark card.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = (path) => fileURLToPath(new URL(`../../design/demo-art/${path}`, import.meta.url));
const LOGOS = [
  { prefix: "mochi", file: "Mochi Puffs/mochi-logo.png", mode: "outline" },
  { prefix: "thornmaw", file: "Thornmaw Wilds/Thornmaw-logo.png", mode: "outline", holes: 900 },
  { prefix: "luma", file: "Luma Four/luma-logo.png", mode: "ink" },
  { prefix: "aika", file: "Aika Nova/aika-logo.png", mode: "ink" },
];
const LIFT = [232, 220, 255];
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

// Connected near-white areas. Those touching the picture's edge, or larger than \`holes\`
// pixels, are background. A small highlight in an eye stays.
function backgroundOf(data, W, H, holes) {
  const isWhite = (p) => Math.min(data[p * 3], data[p * 3 + 1], data[p * 3 + 2]) > 238;
  const seen = new Uint8Array(W * H);
  const background = new Uint8Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || !isWhite(start)) continue;
    const area = [];
    const stack = [start];
    let edge = false;
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      area.push(p);
      const x = p % W;
      if (x === 0 || x === W - 1 || p < W || p >= W * (H - 1)) edge = true;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (q >= 0 && q < W * H && !seen[q] && isWhite(q)) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (edge || (holes && area.length > holes)) for (const p of area) background[p] = 1;
  }
  return background;
}

for (const logo of LOGOS) {
  const { data, info } = await sharp(source(logo.file)).trim({ threshold: 12 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const rgba = Buffer.alloc(W * H * 4);
  if (logo.mode === "outline") {
    const background = backgroundOf(data, W, H, logo.holes);
    const solid = Buffer.alloc(W * H);
    for (let p = 0; p < W * H; p++) solid[p] = background[p] ? 0 : 255;
    const alpha = await sharp(solid, { raw: { width: W, height: H, channels: 1 } }).blur(1).extractChannel(0).raw().toBuffer();
    for (let p = 0; p < W * H; p++) rgba.set([data[p * 3], data[p * 3 + 1], data[p * 3 + 2], alpha[p]], p * 4);
  } else {
    for (let p = 0; p < W * H; p++) {
      const [r, g, b] = [data[p * 3], data[p * 3 + 1], data[p * 3 + 2]];
      // How far a pixel is from white is how much ink it holds.
      const ink = 1 - Math.min(r, g, b) / 255;
      const alpha = Math.min(1, ink * 2.2);
      const un = (c) => (ink > 0.02 ? clamp((c - (1 - ink) * 255) / ink) : c);
      const [ur, ug, ub] = [un(r), un(g), un(b)];
      const violet = ub >= ur;
      rgba.set(violet ? [clamp(ur * 0.2 + LIFT[0] * 0.8), clamp(ug * 0.2 + LIFT[1] * 0.8), clamp(ub * 0.2 + LIFT[2] * 0.8)] : [ur, ug, ub], p * 4);
      rgba[p * 4 + 3] = clamp(alpha * 255);
    }
  }
  const png = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .resize(640, 640, { fit: "inside" })
    .png({ compressionLevel: 9, palette: true, quality: 95 })
    .toBuffer();
  writeFileSync(new URL(`../public/cards/series/${logo.prefix}-logo.png`, import.meta.url), png);
  console.log(`${logo.prefix}-logo.png  ${(png.length / 1024).toFixed(0)} KB`);
}
