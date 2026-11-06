// Draws the card back in Gachard's own colors, as code, and writes public/cards/card-back.jpg
// for the print PDF and card-back.webp for the site. Run from frontend:
//   node scripts/make-card-back.mjs
//
// A printed card is trimmed about 36 px inside this image. The print PDF covers about
// y 679-965 with a white panel naming the print, so the mark and the name stay above it,
// and only decoration sits below. See lib/pdf.ts.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const W = 800;
const H = 1120;
const CX = W / 2;
const MARK = { cy: 340, size: 210 };

const star = (x, y, r, opacity = 1) =>
  `<path transform="translate(${x} ${y}) scale(${r / 12})" d="M0-12 2.8-2.8 12 0 2.8 2.8 0 12-2.8 2.8-12 0-2.8-2.8z" fill="url(#crystal)" opacity="${opacity}"/>`;

const DUST = [
  [150, 210, 7], [650, 180, 9], [120, 470, 5], [690, 440, 6], [210, 600, 4], [600, 620, 5],
  [170, 760, 6], [640, 790, 8], [260, 900, 4], [560, 930, 5],
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif">
<defs>
  <linearGradient id="crystal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4D9FF"/><stop offset=".5" stop-color="#B9A2FF"/><stop offset="1" stop-color="#FFB8E6"/></linearGradient>
  <pattern id="lattice" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H46M0 0V46" fill="none" stroke="#C9B3FB" stroke-width="1"/></pattern>
  <radialGradient id="fade" cx=".5" cy="${MARK.cy / H}" r=".7"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".35" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".26"/></radialGradient>
  <mask id="latticeFade"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
  <radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FF9EF1" stop-opacity=".42"/><stop offset=".55" stop-color="#8F6BFF" stop-opacity=".16"/><stop offset="1" stop-color="#8F6BFF" stop-opacity="0"/></radialGradient>
  <radialGradient id="glow" cx=".5" cy="${MARK.cy / H}" r=".62"><stop offset="0" stop-color="#4A2C86"/><stop offset=".55" stop-color="#1A1436"/><stop offset="1" stop-color="#0C0D18"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<rect width="${W}" height="${H}" fill="url(#lattice)" mask="url(#latticeFade)"/>
<circle cx="${CX}" cy="${MARK.cy}" r="230" fill="url(#halo)"/>
<rect x="54" y="56" width="${W - 108}" height="${H - 112}" rx="24" fill="none" stroke="url(#crystal)" stroke-width="8"/>
<rect x="70" y="72" width="${W - 140}" height="${H - 144}" rx="14" fill="none" stroke="url(#crystal)" stroke-width="1.5" opacity=".45"/>
<g fill="none" stroke="url(#crystal)">
  <circle cx="${CX}" cy="${MARK.cy}" r="150" stroke-width="2" opacity=".6"/>
  <circle cx="${CX}" cy="${MARK.cy}" r="196" stroke-width="1.5" opacity=".3" stroke-dasharray="3 11"/>
  <circle cx="${CX}" cy="${MARK.cy}" r="262" stroke-width="1.5" opacity=".16"/>
</g>
${DUST.map(([x, y, r]) => star(x, y, r, 0.6)).join("")}
${[[104, 108], [696, 108], [104, 1012], [696, 1012]].map(([x, y]) => star(x, y, 15, 0.9)).join("")}
<text x="${CX + 7}" y="578" font-size="50" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="14">GACHARD</text>
<text x="${CX + 2}" y="628" font-size="23" fill="#CFC4F2" text-anchor="middle" letter-spacing="4">Collect. Verify. Print.</text>
${star(CX, 830, 40, 0.8)}
</svg>`;

const mark = await sharp(readFileSync(new URL("../public/icons/icon-512.png", import.meta.url)))
  .resize(MARK.size, MARK.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();
const image = await sharp(Buffer.from(svg))
  .composite([{ input: mark, left: Math.round(CX - MARK.size / 2), top: MARK.cy - MARK.size / 2 }])
  .png()
  .toBuffer();

const out = new URL("../public/cards/", import.meta.url);
const jpeg = await sharp(image).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
const webp = await sharp(image).webp({ quality: 84 }).toBuffer();
writeFileSync(new URL("card-back.jpg", out), jpeg);
writeFileSync(new URL("card-back.webp", out), webp);
console.log(`card-back.jpg ${(jpeg.length / 1024).toFixed(0)} KB, card-back.webp ${(webp.length / 1024).toFixed(0)} KB`);
