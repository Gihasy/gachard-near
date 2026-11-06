/**
 * The Gachard QR: dark violet modules with rounded ends, violet and pink corner marks,
 * and the crystal star in the middle. Drawn as vector layers, so the print PDF and the
 * screen share one design and no image library loads on the server (ADR-044). The star
 * covers a little over 2% of the code, which error correction level M can recover.
 */
import QRCode from "qrcode";

const INK = "#1A1033";
const VIOLET = "#4A25C4";
const PINK = "#B0237F";
const QUIET = 1.5;

export interface QrLayer {
  path: string;
  color: string;
}

const n = (value: number) => Number(value.toFixed(3));

function rounded(x: number, y: number, w: number, h: number, r: number) {
  return `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${n(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}h${n(2 * r - w)}a${r} ${r} 0 0 1 ${-r} ${-r}v${n(2 * r - h)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

/** The same, wound the other way, so it cuts a hole when filled with the shape around it. */
function roundedHole(x: number, y: number, w: number, h: number, r: number) {
  return `M${n(x + r)} ${n(y)}a${r} ${r} 0 0 0 ${-r} ${r}v${n(h - 2 * r)}a${r} ${r} 0 0 0 ${r} ${r}h${n(w - 2 * r)}a${r} ${r} 0 0 0 ${r} ${-r}v${n(2 * r - h)}a${r} ${r} 0 0 0 ${-r} ${-r}z`;
}

function star(cx: number, cy: number, radius: number) {
  const s = radius / 12;
  const points = [[0, -12], [2.8, -2.8], [12, 0], [2.8, 2.8], [0, 12], [-2.8, 2.8], [-12, 0], [-2.8, -2.8]];
  return `${points.map(([x, y], i) => `${i ? "L" : "M"}${n(cx + x * s)} ${n(cy + y * s)}`).join("")}z`;
}

/**
 * The address on a printed card. A QR stores capitals and digits in fewer bits than other
 * text, so this one needs fewer modules, which also print larger. app/S/ redirects it.
 */
export function printUrl(origin: string, tokenId: string, serial: string) {
  const [scheme, host] = origin.split("://");
  return `${scheme}://${host.toUpperCase()}/S/${tokenId}/${serial.toUpperCase()}`;
}

// The scheme stays lowercase, because some scanners only recognise it that way.
function segmentsOf(text: string) {
  const match = text.match(/^(https?:\/\/)([0-9A-Z $%*+\-./:]+)$/);
  if (!match) return text;
  return [
    { data: Buffer.from(match[1]), mode: "byte" as const },
    { data: match[2], mode: "alphanumeric" as const },
  ];
}

/** The drawing, in units of one module. `size` includes the quiet zone. */
export function brandedQr(text: string): { size: number; plate: QrLayer; layers: QrLayer[] } {
  const { modules } = QRCode.create(segmentsOf(text), { errorCorrectionLevel: "M" });
  const count = modules.size;
  const size = count + QUIET * 2;
  const at = (v: number) => v + QUIET;

  const inFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= count - 7 && y < 7) || (x < 7 && y >= count - 7);
  // An odd width, about a seventh of the code, centered on a module.
  let hole = Math.round(count * 0.15);
  if (hole % 2 === 0) hole += 1;
  const start = (count - hole) / 2;
  const inHole = (x: number, y: number) => x >= start && x < start + hole && y >= start && y < start + hole;

  let data = "";
  for (let y = 0; y < count; y++) {
    let x = 0;
    while (x < count) {
      const dark = (col: number) => modules.get(y, col) && !inFinder(col, y) && !inHole(col, y);
      if (!dark(x)) {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < count && dark(end + 1)) end++;
      data += rounded(at(x), at(y), end - x + 1, 1, 0.35);
      x = end + 1;
    }
  }

  let rings = "";
  let eyes = "";
  for (const [x, y] of [[0, 0], [count - 7, 0], [0, count - 7]]) {
    rings += rounded(at(x), at(y), 7, 7, 1.9) + roundedHole(at(x + 1), at(y + 1), 5, 5, 1.1);
    eyes += rounded(at(x + 2), at(y + 2), 3, 3, 0.8);
  }

  const center = size / 2;
  return {
    size,
    plate: { path: rounded(0, 0, size, size, 2.4), color: "#FFFFFF" },
    layers: [
      { path: data, color: INK },
      { path: rings, color: VIOLET },
      { path: eyes, color: PINK },
      { path: star(center, center, hole * 0.5), color: VIOLET },
    ],
  };
}

export function brandedQrSvg(text: string) {
  const { size, plate, layers } = brandedQr(text);
  const paths = [plate, ...layers].map((l) => `<path fill="${l.color}" fill-rule="evenodd" d="${l.path}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
}
