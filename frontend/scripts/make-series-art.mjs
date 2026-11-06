// Frames the AI-generated art in design/demo-art as cards for the four fictional demo
// series, and writes them to public/cards/series. The originals are too large to ship
// and stay out of the repository: this keeps only what the site serves.
// Run from frontend: node scripts/make-series-art.mjs
//
// A printed card is trimmed 3 mm inside this image on every side, about 36 px, and the
// print PDF puts its QR at x 591-730, y 906-1048. So the border sits inside the trim
// and nothing but a faint star is in the QR zone. See lib/pdf.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import sharp from "sharp";
import { FILES, SERIES } from "./series-data.mjs";

const W = 800;
const H = 1120;
const ART = { x: 66, y: 172, w: 668, h: 640 };
const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"];
const FRAME = {
  Common: ["#C9CDDD", "#7D8299"],
  Rare: ["#A9D2FF", "#4C8FE8"],
  Epic: ["#E2C6FF", "#9A5CF0"],
  Legendary: ["#FFE9A8", "#E0A32E"],
};
const source = new URL("../../design/demo-art/", import.meta.url);
const out = new URL("../public/cards/series/", import.meta.url);
const fromSource = (path) => decodeURIComponent(new URL(path.replaceAll(" ", "%20"), source).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

// The logo, cut out for dark surfaces by make-series-logos.mjs. Run that first.
async function logoChip(series) {
  const path = new URL(`${series.prefix}-logo.png`, out);
  const { width, height } = await sharp(fileURLToPath(path)).metadata();
  const chip = width / height > 2 ? { w: 200, h: 72 } : { w: 92, h: 92 };
  const logo = await sharp(fileURLToPath(path))
    .resize(chip.w, chip.h, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return { logo, pad: 0, ...chip };
}

function frameSvg({ name, sub, rarity, flavor, chip }) {
  const [light, deep] = FRAME[rarity];
  const pill = rarity.length * 15 + 34;
  const room = 728 - 72 - pill - 16;
  const nameSize = Math.min(44, Math.floor(room / (name.length * 0.56)));
  const logoY = 930;
  const textX = 72 + chip.w + 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif">
<defs><linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".5" stop-color="${deep}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs>
<rect x="54" y="56" width="${W - 108}" height="${H - 112}" rx="24" fill="none" stroke="url(#edge)" stroke-width="8"/>
<text x="72" y="116" font-size="${nameSize}" font-weight="800" fill="#fff">${name}</text>
<text x="74" y="154" font-size="25" fill="${light}">${sub}</text>
<rect x="${728 - pill}" y="78" width="${pill}" height="44" rx="22" fill="none" stroke="${light}" stroke-width="2.5"/>
<text x="${728 - pill / 2}" y="108" font-size="22" font-weight="700" fill="${light}" text-anchor="middle">${rarity.toUpperCase()}</text>
<rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" rx="18" fill="none" stroke="${light}" stroke-width="3" opacity=".8"/>
<text x="72" y="858" font-size="27" font-style="italic" fill="#E9E6F5">${flavor[0]}</text>
<text x="72" y="896" font-size="27" font-style="italic" fill="#E9E6F5">${flavor[1]}</text>
<text x="${textX}" y="${logoY + 26}" font-size="19" font-weight="700" fill="${light}" letter-spacing="1.5">FICTIONAL DEMO IP</text>
<text x="${textX}" y="${logoY + 56}" font-size="18" fill="#9C9BB5">Not a real person or brand.</text>
<text x="${textX}" y="${logoY + 82}" font-size="18" fill="#9C9BB5">AI art made for this demo.</text>
<path transform="translate(660 977) scale(2.8)" d="M0-12 2.8-2.8 12 0 2.8 2.8 0 12-2.8 2.8-12 0-2.8-2.8z" fill="${light}" opacity=".55"/>
</svg>`;
}

async function makeCard(series, file, rarity, [name, ...flavor], chip) {
  const corners = Buffer.from(`<svg width="${ART.w}" height="${ART.h}"><rect width="${ART.w}" height="${ART.h}" rx="18" fill="#fff"/></svg>`);
  const art = await sharp(fromSource(`${series.folder}/${series.prefix}-${file}.png`))
    .resize(ART.w, ART.h, { fit: "cover" })
    .composite([{ input: corners, blend: "dest-in" }])
    .png()
    .toBuffer();
  return sharp({ create: { width: W, height: H, channels: 3, background: "#0C0D18" } })
    .composite([
      { input: art, left: ART.x, top: ART.y },
      { input: Buffer.from(frameSvg({ name, sub: series.sub, rarity, flavor, chip })), left: 0, top: 0 },
      { input: chip.logo, left: 72 + chip.pad, top: 930 + chip.pad },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

// Replaces the pure green area of a mockup with a card, keeping the fingers on top,
// and leaves the picture transparent around the hand and the card.
async function composite(mockup, cardJpeg) {
  const { data, info } = await sharp(fromSource(mockup)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const isGreen = (i) => data[i + 1] > 180 && data[i] < 110 && data[i + 2] < 110;
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (isGreen((y * info.width + x) * 3)) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  // The card's outline, so its edge stays straight wherever the green was uneven.
  const RADIUS = 28;
  const inCard = (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const dx = Math.max(x0 + RADIUS - x, x - (x1 - RADIUS), 0);
    const dy = Math.max(y0 + RADIUS - y, y - (y1 - RADIUS), 0);
    return dx * dx + dy * dy <= RADIUS * RADIUS;
  };
  const fitted = await sharp(cardJpeg).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const result = Buffer.from(data);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * info.width + x) * 3;
      const green = data[i + 1] - Math.max(data[i], data[i + 2]);
      // Violet at the card's edge is backdrop showing through. Skin is redder than it is blue.
      const fringe = inCard(x, y) && data[i + 2] > data[i] * 1.12;
      const alpha = fringe ? 1 : Math.max(0, Math.min(1, green / 150));
      if (alpha === 0) continue;
      const j = ((y - y0) * w + (x - x0)) * 3;
      // The colour left at a soft edge is lit by the green, so it takes only red and blue.
      for (let c = 0; c < 3; c++) {
        const under = c === 1 ? Math.min(data[i + 1], Math.max(data[i], data[i + 2])) : data[i + c];
        result[i + c] = Math.round(fitted[j + c] * alpha + under * (1 - alpha));
      }
    }
  }
  // Cuts away the violet backdrop. It is filled in from the picture's edges, so a dark
  // tint inside the hand or the card is never reached.
  const W = info.width;
  const H = info.height;
  const isBackdrop = (p) => {
    const i = p * 3;
    return data[i + 1] < 45 && data[i + 2] > 12 && data[i + 2] > data[i] * 1.12;
  };
  let backdrop = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (backdrop[p] || !isBackdrop(p)) continue;
    backdrop[p] = 1;
    if (p % W > 0) stack.push(p - 1);
    if (p % W < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * (H - 1)) stack.push(p + W);
  }
  // Backdrop shut in between the fingers cannot be reached from the edges.
  for (let p = 0; p < W * H; p++) {
    if (!backdrop[p] && isBackdrop(p) && data[p * 3 + 2] > 40 && !inCard(p % W, Math.floor(p / W))) backdrop[p] = 1;
  }
  // Grown a little, because an edge pixel still carries some of the violet.
  for (let round = 0; round < 2; round++) {
    const grown = backdrop.slice();
    for (let p = 0; p < W * H; p++) {
      if (backdrop[p]) continue;
      if ((p % W > 0 && backdrop[p - 1]) || (p % W < W - 1 && backdrop[p + 1]) || (p >= W && backdrop[p - W]) || (p < W * (H - 1) && backdrop[p + W])) grown[p] = 1;
    }
    backdrop = grown;
  }
  const solid = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) solid[p] = backdrop[p] && !inCard(p % W, Math.floor(p / W)) ? 0 : 255;
  const alpha = await sharp(solid, { raw: { width: W, height: H, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer();
  const rgba = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) rgba.set([result[p * 3], result[p * 3 + 1], result[p * 3 + 2], alpha[p]], p * 4);
  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).resize(750, 1050).webp({ quality: 86, alphaQuality: 95 }).toBuffer();
}

mkdirSync(out, { recursive: true });
const made = new Map();
for (const series of SERIES) {
  const chip = await logoChip(series);
  for (const [index, [file, rarity]] of FILES.entries()) {
    const jpeg = await makeCard(series, file, RARITY_NAMES[rarity], series.cards[index], chip);
    const name = `${series.prefix}-${file}.jpg`;
    made.set(name, jpeg);
    writeFileSync(new URL(name, out), jpeg);
    console.log(`${name}  ${(jpeg.length / 1024).toFixed(0)} KB`);
  }
}
// How the app knows these cards by the path it stores for them (lib/framed-art.ts).
// Earlier releases stay listed: cards already bought keep showing without a margin.
const list = new URL("../lib/framed-art.json", import.meta.url);
const earlier = existsSync(list) ? JSON.parse(readFileSync(list, "utf8")) : [];
const released = [...made.values()].map((jpeg) => `/api/art/${createHash("sha256").update(jpeg).digest("hex")}.jpg`);
writeFileSync(list, `${JSON.stringify([...new Set([...earlier, ...released])], null, 2)}\n`);
const showcase = made.get("thornmaw-legendary.jpg");
// The phone is made by make-phone-mockup.mjs, from a capture of the app's own screen.
// The card in the hand runs to its border, with no dark margin around it.
// Its QR sits where the print PDF puts one, and opens the live Verify page.
const qr = await QRCode.toBuffer("https://gachard-near.vercel.app/scan", { margin: 1, width: 139, errorCorrectionLevel: "M" });
const printed = await sharp(showcase).composite([{ input: qr, left: 591, top: 908 }]).toBuffer();
const toBorder = await sharp(printed).extract({ left: 50, top: 52, width: 700, height: 1016 }).toBuffer();
const webp = await composite("mockup-hand.png", toBorder);
writeFileSync(new URL("real-card.webp", out), webp);
console.log(`real-card.webp  ${(webp.length / 1024).toFixed(0)} KB`);
