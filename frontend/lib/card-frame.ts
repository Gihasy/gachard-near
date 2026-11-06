/**
 * Puts a creator's art in Gachard's card frame, in the browser, so the server never
 * decodes an image (ADR-044). The art fills the frame, so a tall picture loses almost
 * nothing, and the text sits on dark fades over it.
 *
 * The layout matches scripts/make-series-art.mjs. A printed card is trimmed about 36 px
 * inside this image on every side, and its QR prints at x 591-730, y 906-1048 (lib/pdf.ts).
 * So the border sits inside the trim, and only a faint star is in the QR zone.
 */
const W = 800;
const H = 1120;
const BORDER = { x: 54, y: 56, w: 692, h: 1008, r: 24 };
const COLORS: Record<string, [string, string]> = {
  Common: ["#C9CDDD", "#7D8299"],
  Rare: ["#A9D2FF", "#4C8FE8"],
  Epic: ["#E2C6FF", "#9A5CF0"],
  Legendary: ["#FFE9A8", "#E0A32E"],
};
const STAR = "M0-12 2.8-2.8 12 0 2.8 2.8 0 12-2.8 2.8-12 0-2.8-2.8z";

export type CardFrame = { series: string; logo?: string; by?: string };
export type FramedCard = CardFrame & { source: Blob; name: string; rarity: string; flavor?: string; scale?: number };

/** Changes when something a draft's frame shows changes, so an old frame can be redrawn. */
export const frameKeyOf = ({ series, logo, by }: CardFrame) => JSON.stringify([1, series, logo ?? "", by ?? ""]);

function clip(context: CanvasRenderingContext2D, text: string, width: number) {
  if (context.measureText(text).width <= width) return text;
  let cut = text;
  while (cut && context.measureText(`${cut}...`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

function lines(context: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const first: string[] = [];
  while (words.length && context.measureText([...first, words[0]].join(" ")).width <= width) first.push(words.shift()!);
  return [first.join(" "), clip(context, words.join(" "), width)].filter(Boolean);
}

async function logoImage(src?: string) {
  if (!src) return null;
  try {
    return await createImageBitmap(await (await fetch(src)).blob());
  } catch {
    return null; // A card can do without its logo, and a publish should not stop for one.
  }
}

export async function renderCard({ source, name, rarity, flavor, series, logo, by, scale = 2 }: FramedCard): Promise<Blob> {
  const art = await createImageBitmap(source);
  const mark = await logoImage(logo);
  const family = getComputedStyle(document.body).fontFamily;
  await Promise.all(["800 44px", "700 22px", "400 25px", "italic 400 27px"].map((font) => document.fonts.load(`${font} ${family}`).catch(() => [])));

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the image.");
  context.scale(scale, scale);
  context.textBaseline = "alphabetic";
  const [light, deep] = COLORS[rarity] ?? COLORS.Common;
  const font = (style: string) => { context.font = `${style} ${family}`; };

  context.fillStyle = "#0C0D18";
  context.fillRect(0, 0, W, H);

  // The art, covering the frame.
  context.save();
  const frame = new Path2D();
  frame.roundRect(BORDER.x, BORDER.y, BORDER.w, BORDER.h, BORDER.r);
  context.clip(frame);
  const cover = Math.max(BORDER.w / art.width, BORDER.h / art.height);
  context.drawImage(art, BORDER.x + (BORDER.w - art.width * cover) / 2, BORDER.y + (BORDER.h - art.height * cover) / 2, art.width * cover, art.height * cover);
  art.close();
  const top = context.createLinearGradient(0, BORDER.y, 0, 214);
  top.addColorStop(0, "#0c0d18f2");
  top.addColorStop(0.6, "#0c0d18b3");
  top.addColorStop(1, "#0c0d1800");
  context.fillStyle = top;
  context.fillRect(BORDER.x, BORDER.y, BORDER.w, 158);
  const fadeFrom = flavor ? 720 : 840;
  const bottom = context.createLinearGradient(0, fadeFrom, 0, 925);
  bottom.addColorStop(0, "#0c0d1800");
  if (flavor) bottom.addColorStop(0.6, "#0c0d18cc");
  bottom.addColorStop(1, "#0c0d18f5");
  context.fillStyle = bottom;
  context.fillRect(BORDER.x, fadeFrom, BORDER.w, BORDER.y + BORDER.h - fadeFrom);
  context.restore();

  // The border, in the rarity's colours.
  const edge = context.createLinearGradient(0, 0, W, H);
  edge.addColorStop(0, light);
  edge.addColorStop(0.5, deep);
  edge.addColorStop(1, light);
  context.strokeStyle = edge;
  context.lineWidth = 8;
  context.stroke(frame);

  // The rarity, then the name in the room it leaves.
  const label = rarity.toUpperCase();
  font("700 22px");
  const pill = context.measureText(label).width + 40;
  context.strokeStyle = light;
  context.lineWidth = 2.5;
  context.beginPath();
  context.roundRect(722 - pill, 78, pill, 44, 22);
  context.stroke();
  context.fillStyle = light;
  context.textAlign = "center";
  context.fillText(label, 722 - pill / 2, 108);
  context.textAlign = "left";

  const room = 722 - pill - 16 - 78;
  let size = 44;
  font(`800 ${size}px`);
  while (size > 24 && context.measureText(name).width > room) {
    size -= 1;
    font(`800 ${size}px`);
  }
  context.fillStyle = "#ffffff";
  context.fillText(clip(context, name, room), 78, 116);
  font("400 25px");
  context.fillStyle = light;
  context.fillText(clip(context, series, 640), 78, 154);

  if (flavor) {
    font("italic 400 27px");
    context.fillStyle = "#E9E6F5";
    context.shadowColor = "#0c0d18";
    context.shadowBlur = 10;
    lines(context, flavor, 640).forEach((line, i) => context.fillText(line, 78, 858 + i * 38));
    context.shadowBlur = 0;
  }

  // The bottom line: the logo, and who released it. The QR zone on its right stays plain.
  let textX = 78;
  if (mark) {
    const box = mark.width / mark.height > 2 ? { w: 200, h: 72 } : { w: 92, h: 92 };
    const fit = Math.min(box.w / mark.width, box.h / mark.height);
    const w = mark.width * fit;
    const h = mark.height * fit;
    context.drawImage(mark, 78, 930 + (box.h - h) / 2, w, h);
    mark.close();
    textX = 78 + box.w + 18;
  }
  const width = 586 - textX;
  font("700 19px");
  context.fillStyle = light;
  context.fillText("RELEASED ON GACHARD", textX, 956, width);
  font("400 18px");
  context.fillStyle = "#9C9BB5";
  context.fillText(clip(context, by ? `by ${by}` : "By its creator", width), textX, 986);
  context.fillText("Demo card on NEAR testnet.", textX, 1012, width);

  context.save();
  context.translate(660, 977);
  context.scale(2.8, 2.8);
  context.globalAlpha = 0.55;
  context.fillStyle = light;
  context.fill(new Path2D(STAR));
  context.restore();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new Error("This browser cannot prepare the image.");
  return blob;
}
