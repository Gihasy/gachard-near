// Draws the card art for three fictional demo IPs, as code, so no image in them comes
// from anywhere else. The people and characters are invented. Writes JPEGs at 63 x 88
// proportions to public/cards/demo. Run from frontend: node scripts/make-demo-art.mjs
//
// The bottom right of each card is left plain: the print PDF puts its QR code there.
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const W = 800;
const H = 1120;
const ART = { x: 40, y: 150, w: 720, h: 690 };
const FRAME = {
  Common: ["#C9CDDD", "#7D8299"],
  Rare: ["#A9D2FF", "#4C8FE8"],
  Epic: ["#E2C6FF", "#9A5CF0"],
  Legendary: ["#FFE9A8", "#E0A32E"],
};
const star = (x, y, r, fill = "#fff", opacity = 1) =>
  `<path transform="translate(${x} ${y}) scale(${r / 12})" d="M0-12 2.8-2.8 12 0 2.8 2.8 0 12-2.8 2.8-12 0-2.8-2.8z" fill="${fill}" opacity="${opacity}"/>`;
const scatter = (points, fill = "#fff") => points.map(([x, y, r, o = 1]) => star(x, y, r, fill, o)).join("");

function card({ name, sub, rarity, flavor, art }) {
  const [light, deep] = FRAME[rarity];
  const pill = rarity.length * 15 + 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Arial, sans-serif">
<defs>
  <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".5" stop-color="${deep}"/><stop offset="1" stop-color="${light}"/></linearGradient>
  <clipPath id="window"><rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" rx="20"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="#0C0D18"/>
<rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="30" fill="none" stroke="url(#edge)" stroke-width="10"/>
<text x="44" y="82" font-size="48" font-weight="800" fill="#fff" letter-spacing="1">${name}</text>
<text x="46" y="124" font-size="26" fill="${light}">${sub}</text>
<rect x="${W - 44 - pill}" y="48" width="${pill}" height="44" rx="22" fill="none" stroke="${light}" stroke-width="2.5"/>
<text x="${W - 44 - pill / 2}" y="78" font-size="22" font-weight="700" fill="${light}" text-anchor="middle">${rarity.toUpperCase()}</text>
<g clip-path="url(#window)">${art}</g>
<rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" rx="20" fill="none" stroke="${light}" stroke-width="3" opacity=".8"/>
<text x="46" y="900" font-size="28" font-style="italic" fill="#E9E6F5">${flavor[0]}</text>
<text x="46" y="940" font-size="28" font-style="italic" fill="#E9E6F5">${flavor[1]}</text>
<text x="46" y="1026" font-size="21" font-weight="700" fill="${light}" letter-spacing="2">FICTIONAL DEMO IP</text>
<text x="46" y="1058" font-size="20" fill="#9C9BB5">Not a real person or brand. Art drawn for this demo.</text>
${star(686, 1006, 34, light, 0.55)}
</svg>`;
}

// ---- Mochi Puffs: round, soft, cute ----

function puff({ sky, ground, body, shade, extra = "", front = "", eyes = "open" }) {
  const cx = 400;
  const cy = 540;
  const eye = (x) =>
    eyes === "open"
      ? `<ellipse cx="${x}" cy="${cy - 20}" rx="26" ry="31" fill="#2A1E33"/><circle cx="${x + 9}" cy="${cy - 32}" r="10" fill="#fff"/><circle cx="${x - 8}" cy="${cy - 10}" r="5" fill="#fff" opacity=".85"/>`
      : `<path d="M${x - 26} ${cy - 18}q26 24 52 0" fill="none" stroke="#2A1E33" stroke-width="9" stroke-linecap="round"/>`;
  return `<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
  <radialGradient id="body" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${body}"/><stop offset="1" stop-color="${shade}"/></radialGradient>
</defs>
<rect x="0" y="0" width="${W}" height="${H}" fill="url(#sky)"/>
${extra}
<ellipse cx="${cx}" cy="838" rx="460" ry="110" fill="${ground}"/>
<ellipse cx="${cx}" cy="742" rx="205" ry="26" fill="#000" opacity=".16"/>
<ellipse cx="${cx - 196}" cy="${cy + 60}" rx="40" ry="30" fill="${body}" transform="rotate(-28 ${cx - 196} ${cy + 60})"/>
<ellipse cx="${cx + 196}" cy="${cy + 60}" rx="40" ry="30" fill="${body}" transform="rotate(28 ${cx + 196} ${cy + 60})"/>
<path d="M${cx - 215} ${cy + 60}c0-150 95-225 215-225s215 75 215 225c0 95-90 145-215 145s-215-50-215-145z" fill="url(#body)"/>
${eye(cx - 88)}${eye(cx + 88)}
<ellipse cx="${cx - 140}" cy="${cy + 38}" rx="38" ry="22" fill="#FF8FB1" opacity=".6"/>
<ellipse cx="${cx + 140}" cy="${cy + 38}" rx="38" ry="22" fill="#FF8FB1" opacity=".6"/>
<path d="M${cx - 20} ${cy + 22}q10 14 20 2q10 12 20-2" fill="none" stroke="#2A1E33" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
${front}`;
}

const cloud = (x, y, s, o = 0.9) =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff" opacity="${o}"><circle r="46"/><circle cx="52" cy="-14" r="58"/><circle cx="112" cy="4" r="42"/><rect x="-44" y="0" width="196" height="44" rx="22"/></g>`;

const crown = `<g transform="translate(400 340)"><path d="M-110 30-130-70-62-18 0-96 62-18 130-70 110 30z" fill="#FFD25E" stroke="#B9791A" stroke-width="7" stroke-linejoin="round"/><rect x="-112" y="24" width="224" height="30" rx="10" fill="#F2B233" stroke="#B9791A" stroke-width="7"/><circle cy="39" r="12" fill="#FF6B9D"/><circle cx="-66" cy="39" r="9" fill="#6BC6FF"/><circle cx="66" cy="39" r="9" fill="#6BC6FF"/></g>`;
const rays = (cx, cy, color, n = 16, o = 0.35) =>
  Array.from({ length: n }, (_, i) => `<path transform="translate(${cx} ${cy}) rotate(${(360 / n) * i})" d="M-46 0 0-900 46 0z" fill="${color}" opacity="${o}"/>`).join("");

const MOCHI = [
  {
    file: "mochi-common", name: "Vanilla Puff", sub: "Mochi Puffs", rarity: "Common",
    flavor: ["Soft, round, and very sure", "it was your idea to hug it."],
    art: puff({
      sky: ["#BFE6FF", "#FFE6F2"], ground: "#B8EFC8", body: "#FFF3DC", shade: "#F0CFA8",
      extra: cloud(90, 250, 0.9) + cloud(520, 300, 0.75) + scatter([[640, 220, 16], [150, 420, 10]]),
    }),
  },
  {
    file: "mochi-rare", name: "Berry Puff", sub: "Mochi Puffs", rarity: "Rare",
    flavor: ["Picked at dawn. Still", "insists it is a vegetable."],
    art: puff({
      sky: ["#8FD3FF", "#D9F3FF"], ground: "#8FE0A6", body: "#FFC2D6", shade: "#F07FA6",
      extra: cloud(70, 280, 0.8) + cloud(540, 240, 0.85),
      front: `<g transform="translate(400 335)"><path d="M-44-20C-30-70 30-70 44-20L0 60z" fill="#F0476B" stroke="#B9234A" stroke-width="6" stroke-linejoin="round"/><path d="M-52-22-20-40 0-66 20-40 52-22 16-18 0-2-16-18z" fill="#45B86B" stroke="#2C8A4C" stroke-width="5" stroke-linejoin="round"/><g fill="#FFE27A"><circle cx="-16" cy="4" r="4"/><circle cx="14" cy="-2" r="4"/><circle cx="2" cy="26" r="4"/></g></g>`,
    }),
  },
  {
    file: "mochi-epic", name: "Moonlit Puff", sub: "Mochi Puffs", rarity: "Epic",
    flavor: ["Awake only long enough", "to tell the moon goodnight."],
    art: puff({
      sky: ["#1C1648", "#6A3FB5"], ground: "#3A2A7A", body: "#D9C7FF", shade: "#8A67DA", eyes: "closed",
      extra: `<circle cx="150" cy="285" r="84" fill="#FFF2B8"/><circle cx="184" cy="262" r="74" fill="#2A1F63"/>` + scatter([[680, 240, 16], [300, 215, 9], [470, 225, 12], [110, 470, 10], [700, 480, 12], [620, 380, 8]], "#FFF2B8"),
      front: `<path d="M272 400C300 280 480 250 545 330L610 300 590 396C500 345 370 350 272 400z" fill="#5B3BC9" stroke="#2F1C80" stroke-width="6" stroke-linejoin="round"/><circle cx="612" cy="298" r="20" fill="#FFF2B8"/>`,
    }),
  },
  {
    file: "mochi-legendary", name: "Crown Puff", sub: "Mochi Puffs", rarity: "Legendary",
    flavor: ["Rules a small kingdom of", "cushions, kindly and badly."],
    art: puff({
      sky: ["#7A2FBF", "#FFB65C"], ground: "#E0902E", body: "#FFE8A3", shade: "#E8A93B",
      extra: rays(400, 500, "#FFE9A8", 18, 0.28) + scatter([[110, 250, 26], [690, 260, 30], [160, 620, 16], [650, 640, 18], [400, 190, 14]], "#FFF7D1"),
      front: crown + scatter([[210, 400, 18], [598, 420, 14]], "#fff"),
    }),
  },
];

// ---- Aika Nova: an anime-style streamer ----

function aika({ hair, hairDeep, eye, outfit, trim, bg, front = "", mouth = "smile", closed = false }) {
  const eyeAt = (x, flip) => closed
    ? `<path d="M${x - 44} 462q44 34 88 0" fill="none" stroke="#2B1B3D" stroke-width="10" stroke-linecap="round"/>`
    : `<path d="M${x - 50} 436q50 -34 100 ${flip ? 6 : -6}" fill="none" stroke="#2B1B3D" stroke-width="10" stroke-linecap="round"/>
<ellipse cx="${x}" cy="478" rx="40" ry="50" fill="#fff"/>
<ellipse cx="${x}" cy="482" rx="34" ry="45" fill="url(#iris)"/>
<ellipse cx="${x}" cy="488" rx="18" ry="27" fill="#1B1230"/>
<circle cx="${x + 12}" cy="460" r="13" fill="#fff"/><circle cx="${x - 12}" cy="506" r="7" fill="#fff" opacity=".85"/>`;
  const mouths = {
    smile: `<path d="M372 590q28 26 56 0" fill="none" stroke="#A8415E" stroke-width="7" stroke-linecap="round"/>`,
    open: `<path d="M368 580q32 8 64 0q-4 42-32 42t-32-42z" fill="#A8324F"/><path d="M380 606q20 14 40 0q-8 18-20 18t-20-18z" fill="#FF8FA8"/>`,
  };
  return `<defs>
  <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hair}"/><stop offset="1" stop-color="${hairDeep}"/></linearGradient>
  <linearGradient id="iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B1B3D"/><stop offset="1" stop-color="${eye}"/></linearGradient>
  <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0E4"/><stop offset="1" stop-color="#FFD9C6"/></linearGradient>
</defs>
${bg}
<path d="M190 900C150 660 110 470 190 320C250 200 550 200 610 320C690 470 650 660 610 900z" fill="url(#hair)"/>
<path d="M130 400C70 500 60 680 110 820C140 760 190 620 200 470z" fill="url(#hair)"/>
<path d="M670 400C730 500 740 680 690 820C660 760 610 620 600 470z" fill="url(#hair)"/>
<path d="M362 640h76v70c0 30-76 30-76 0z" fill="#F4C3AE"/>
<path d="M150 900c10-120 90-190 190-200l60 50 60-50c100 10 180 80 190 200z" fill="${outfit}"/>
<path d="M340 700l60 54 60-54 22 12-82 92-82-92z" fill="${trim}"/>
${star(400, 830, 26, trim)}
<path d="M224 400C224 280 576 280 576 400C576 540 500 648 400 648S224 540 224 400z" fill="url(#skin)"/>
<ellipse cx="294" cy="552" rx="40" ry="20" fill="#FF8FA8" opacity=".55"/>
<ellipse cx="506" cy="552" rx="40" ry="20" fill="#FF8FA8" opacity=".55"/>
${eyeAt(304, false)}${eyeAt(496, true)}
<path d="M396 556q4 8 8 0" fill="none" stroke="#D99A84" stroke-width="5" stroke-linecap="round"/>
${mouths[mouth]}
<path d="M208 430C190 300 270 210 400 210S610 300 592 430C570 380 540 340 500 322C490 372 450 400 410 410C430 380 432 350 420 330C380 390 300 420 260 400C240 400 220 410 208 430z" fill="url(#hair)"/>
<path d="M300 262C340 236 420 232 470 250" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".45"/>
<path d="M186 420C186 240 614 240 614 420" fill="none" stroke="#2B2D44" stroke-width="20"/>
<rect x="150" y="400" width="62" height="118" rx="28" fill="#2B2D44"/><rect x="588" y="400" width="62" height="118" rx="28" fill="#2B2D44"/>
<rect x="162" y="418" width="26" height="82" rx="13" fill="${trim}"/><rect x="612" y="418" width="26" height="82" rx="13" fill="${trim}"/>
${star(400, 236, 34, trim)}
${front}`;
}

const skyGrad = (a, b) => `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bg)"/>`;
const streamGrid = (color) => Array.from({ length: 9 }, (_, i) => `<path d="M${40 + i * 90} 150V840" stroke="${color}" stroke-width="2" opacity=".25"/><path d="M40 ${150 + i * 86}H760" stroke="${color}" stroke-width="2" opacity=".25"/>`).join("");
const beams = (color) => [[120, -18], [400, 0], [680, 18]].map(([x, r]) => `<path transform="rotate(${r} ${x} 150)" d="M${x - 24} 150h48l110 720h-268z" fill="${color}" opacity=".22"/>`).join("");
const liveTag = `<g transform="translate(70 180)"><rect width="118" height="50" rx="12" fill="#FF3D6E"/><circle cx="28" cy="25" r="9" fill="#fff"/><text x="46" y="35" font-size="28" font-weight="800" fill="#fff">LIVE</text></g>`;

const AIKA = [
  {
    file: "aika-common", name: "Morning Stream", sub: "Aika Nova", rarity: "Common",
    flavor: ["Three viewers and a cold", "coffee. A perfect start."],
    art: aika({
      hair: "#9FF0DC", hairDeep: "#3CB8A6", eye: "#35C7B2", outfit: "#F4F1FF", trim: "#3CB8A6",
      bg: skyGrad("#FFE9C9", "#BFEFE6") + cloud(70, 250, 0.7) + cloud(560, 300, 0.6),
    }),
  },
  {
    file: "aika-rare", name: "Midnight Stream", sub: "Aika Nova", rarity: "Rare",
    flavor: ["Chat said one more game", "at 2 a.m. Chat was lying."],
    art: aika({
      hair: "#8FC4FF", hairDeep: "#3A63D8", eye: "#5AA2FF", outfit: "#20264F", trim: "#5AD1FF",
      bg: skyGrad("#0E1438", "#2A2F7A") + streamGrid("#5AD1FF") + liveTag,
    }),
  },
  {
    file: "aika-epic", name: "Idol Stage", sub: "Aika Nova", rarity: "Epic",
    flavor: ["Every spotlight found her", "before the first note did."],
    art: aika({
      hair: "#E2A8FF", hairDeep: "#8A3FD6", eye: "#C86BFF", outfit: "#3A1A70", trim: "#FF9EF1", mouth: "open",
      bg: skyGrad("#1E0B45", "#8A2FA8") + beams("#FFD6F7") + scatter([[110, 230, 16], [700, 240, 18], [90, 520, 12], [710, 540, 14]], "#FFE2FA"),
    }),
  },
  {
    file: "aika-legendary", name: "Galaxy Diva", sub: "Aika Nova", rarity: "Legendary",
    flavor: ["The whole sky subscribed.", "She thanked it by name."],
    art: aika({
      hair: "#FFE28A", hairDeep: "#F2699A", eye: "#FFB03B", outfit: "#2A1450", trim: "#FFD25E", mouth: "open",
      bg: skyGrad("#120A3A", "#5A1E8A") + `<circle cx="400" cy="440" r="360" fill="none" stroke="#FFE9A8" stroke-width="10" opacity=".7"/>` + rays(400, 440, "#FFD25E", 20, 0.14) + scatter([[90, 210, 22], [710, 200, 26], [80, 470, 14], [725, 480, 16], [150, 330, 10], [650, 340, 12], [60, 660, 12], [740, 650, 12]], "#FFF2C4"),
    }),
  },
];

// ---- Noa Vantor: a poster-style film actor, drawn in shapes, no likeness ----

function actor({ tones, bg, hat = "", front = "", suit = "plain" }) {
  const [light, mid, dark] = tones;
  const dress = {
    plain: `<path d="M120 900c10-140 110-210 220-226l60 40 60-40c110 16 210 86 220 226z" fill="${dark}"/><path d="M400 714 340 674l-22 16 82 150 82-150-22-16z" fill="${light}"/>`,
    coat: `<path d="M110 900c10-150 120-230 230-246l60 90 60-90c110 16 220 96 230 246z" fill="${dark}"/><path d="M340 654 400 744 332 860 280 690zM460 654 400 744 468 860 520 690z" fill="${mid}"/>`,
    tux: `<path d="M120 900c10-140 110-210 220-226l60 40 60-40c110 16 210 86 220 226z" fill="${dark}"/><path d="M340 674 400 900 460 674 400 720z" fill="#F7F4FF"/><path d="M400 722 342 696v56zM400 722l58-26v56z" fill="${mid}"/><circle cx="400" cy="722" r="11" fill="${light}"/>`,
  };
  return `${bg}
<path d="M352 590h96v100l-48 34-48-34z" fill="${mid}"/>
${dress[suit]}
<path d="M270 400C270 290 530 290 530 400C530 530 470 640 400 640S270 530 270 400z" fill="${mid}"/>
<path d="M400 298C470 298 530 330 530 400C530 530 470 640 400 640z" fill="${dark}"/>
<path d="M270 400C270 290 400 298 400 298V640C330 640 270 530 270 400z" fill="${light}" opacity=".78"/>
<path d="M312 452q34-22 68-4M420 448q34-18 68 4" fill="none" stroke="${dark}" stroke-width="12" stroke-linecap="round"/>
<path d="M326 486q24-14 46 0q-24 14-46 0z" fill="${dark}"/><path d="M430 486q24-14 46 0q-24 14-46 0z" fill="${light}"/>
<path d="M386 548q14 10 28 0" fill="none" stroke="${dark}" stroke-width="6" stroke-linecap="round"/>
<path d="M360 596q40 16 80 0" fill="none" stroke="${dark}" stroke-width="9" stroke-linecap="round"/>
<path d="M258 440C230 300 310 226 410 226C510 226 570 300 542 440C530 380 500 348 450 344C390 370 320 366 290 356C270 370 262 400 258 440z" fill="${dark}"/>
<path d="M300 300C340 256 410 248 470 264" fill="none" stroke="${light}" stroke-width="9" stroke-linecap="round" opacity=".6"/>
${hat}${front}`;
}

const filmStrip = (color) => [46, 700].map((x) => `<rect x="${x}" y="150" width="56" height="690" fill="#000" opacity=".45"/>` + Array.from({ length: 9 }, (_, i) => `<rect x="${x + 13}" y="${166 + i * 76}" width="30" height="44" rx="6" fill="${color}" opacity=".8"/>`).join("")).join("");
const flashes = scatter([[110, 240, 44, 0.95], [690, 220, 54, 0.95], [150, 470, 26, 0.8], [660, 470, 32, 0.85], [90, 640, 22, 0.7], [715, 650, 24, 0.7]]);
const laurel = (color) => [1, -1].map((s) => `<g transform="translate(400 470) scale(${s} 1)" fill="${color}">${Array.from({ length: 9 }, (_, i) => {
  const a = (-70 + i * 20) * (Math.PI / 180);
  const x = Math.cos(a) * 330;
  const y = Math.sin(a) * 330;
  return `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="42" ry="17" transform="rotate(${(-70 + i * 20 + 90 + 28).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
}).join("")}</g>`).join("");

const NOA = [
  {
    file: "noa-common", name: "First Take", sub: "Noa Vantor", rarity: "Common",
    flavor: ["One line, forty attempts.", "Everyone kept the fortieth."],
    art: actor({
      tones: ["#BFF1E6", "#4FA79C", "#123E46"],
      bg: skyGrad("#0F4A52", "#2C8C86") + filmStrip("#BFF1E6"),
    }),
  },
  {
    file: "noa-rare", name: "City of Rain", sub: "Noa Vantor", rarity: "Rare",
    flavor: ["The detective never solved", "it. Audiences never left."],
    art: actor({
      tones: ["#BFD6FF", "#4E6FB8", "#0E1A3F"], suit: "coat",
      bg: skyGrad("#0A1230", "#2B4A8C") + Array.from({ length: 34 }, (_, i) => `<path d="M${50 + (i * 97) % 700} ${160 + (i * 211) % 640}l-10 44" stroke="#BFD6FF" stroke-width="3" opacity=".45"/>`).join(""),
      hat: `<path d="M226 310C300 330 500 330 574 310C560 348 240 348 226 310z" fill="#0A1230"/><path d="M290 318C296 220 340 186 400 200C460 186 504 220 510 318C440 336 360 336 290 318z" fill="#0A1230"/><path d="M290 296C360 312 440 312 510 296V318C440 336 360 336 290 318z" fill="#BFD6FF" opacity=".55"/>`,
    }),
  },
  {
    file: "noa-epic", name: "Red Carpet", sub: "Noa Vantor", rarity: "Epic",
    flavor: ["A thousand cameras asked", "one question: who is that?"],
    art: actor({
      tones: ["#FFD1E8", "#C2467F", "#3E0F35"], suit: "tux",
      bg: skyGrad("#2A0A30", "#A81E5C") + flashes + `<path d="M260 840 330 620h140l70 220z" fill="#E0245E" opacity=".55"/>`,
    }),
  },
  {
    file: "noa-legendary", name: "Golden Night", sub: "Noa Vantor", rarity: "Legendary",
    flavor: ["Every award that year", "had the same name on it."],
    art: actor({
      tones: ["#FFEFC2", "#D69E32", "#3A2408"], suit: "tux",
      bg: skyGrad("#2A1B05", "#8A5A12") + rays(400, 470, "#FFE28A", 18, 0.2) + laurel("#FFD25E") + scatter([[110, 220, 22], [690, 220, 26], [400, 180, 18]], "#FFF2C4"),
    }),
  },
];

export const DEMO_SERIES = [
  { name: "Mochi Puffs (fictional IP)", cards: MOCHI },
  { name: "Aika Nova (fictional VTuber)", cards: AIKA },
  { name: "Noa Vantor (fictional actor)", cards: NOA },
];

const out = new URL("../public/cards/demo/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const { cards } of DEMO_SERIES) {
  for (const c of cards) {
    const jpeg = await sharp(Buffer.from(card(c))).jpeg({ quality: 90 }).toBuffer();
    writeFileSync(new URL(`${c.file}.jpg`, out), jpeg);
    console.log(`${c.file}.jpg  ${(jpeg.length / 1024).toFixed(0)} KB`);
  }
}
