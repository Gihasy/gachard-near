/**
 * The print-ready PDF: a simulation of the print pipeline (ADR-043, decision 3).
 * Card size follows docs/CREATOR-ASSET-GUIDE.md: 63 x 88 mm trim, 3 mm bleed, and
 * the QR in the 12 mm zone at the bottom right of the safe area.
 *
 * The simulation notice is in the page margin and on the card back. The card face
 * stays clean. The notice that cannot be cropped off is the Scan status.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { ART_DIR } from "./catalog.ts";
import { formatCode } from "./cards.ts";

export const SIMULATION_NOTICE = "SIMULATION: NEAR Hackathon demo. Not an official printed card.";

const mm = (value: number) => (value * 72) / 25.4;
const A4 = { width: mm(210), height: mm(297) };
const TRIM = { width: 63, height: 88 };
const BLEED = 3;

async function png(input: Buffer) {
  return sharp(input).png().toBuffer();
}

function artFile(media: string): Buffer {
  const name = media.match(/^\/api\/art\/([0-9a-f]{64}\.webp)$/)?.[1];
  if (!name) throw new Error("Unknown artwork path");
  return readFileSync(join(ART_DIR, name));
}

export async function printPdf(card: {
  tokenId: string;
  cardName: string;
  seriesName: string;
  media: string;
  code: string;
  printCycle: number;
  scanUrl: string;
}) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${card.cardName} - hackathon demo print`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.14);

  const front = await doc.embedPng(await png(artFile(card.media)));
  const back = await doc.embedPng(
    await png(readFileSync(join(process.cwd(), "public", "cards", "card-back.webp"))),
  );
  const qr = await doc.embedPng(
    await QRCode.toBuffer(card.scanUrl, { margin: 1, width: 400, errorCorrectionLevel: "M" }),
  );

  const drawPage = (title: string) => {
    const page = doc.addPage([A4.width, A4.height]);
    const x = (A4.width - mm(TRIM.width)) / 2;
    const y = (A4.height - mm(TRIM.height)) / 2;
    page.drawText(SIMULATION_NOTICE, { x: mm(15), y: A4.height - mm(15), size: 10, font: bold, color: rgb(0.75, 0.1, 0.2) });
    page.drawText(title, { x: mm(15), y: A4.height - mm(22), size: 9, font, color: ink });
    page.drawText(`In production, cards are printed and shipped by the platform. Check this card: ${card.scanUrl}`, {
      x: mm(15), y: mm(15), size: 7.5, font, color: ink,
    });
    return { page, x, y };
  };

  const cropMarks = (page: ReturnType<typeof drawPage>["page"], x: number, y: number) => {
    const w = mm(TRIM.width);
    const h = mm(TRIM.height);
    const reach = mm(BLEED + 5);
    const gap = mm(BLEED + 1);
    for (const cx of [x, x + w]) {
      for (const [from, to] of [[y - reach, y - gap], [y + h + gap, y + h + reach]]) {
        page.drawLine({ start: { x: cx, y: from }, end: { x: cx, y: to }, thickness: 0.4, color: ink });
      }
    }
    for (const cy of [y, y + h]) {
      for (const [from, to] of [[x - reach, x - gap], [x + w + gap, x + w + reach]]) {
        page.drawLine({ start: { x: from, y: cy }, end: { x: to, y: cy }, thickness: 0.4, color: ink });
      }
    }
  };

  // Front: bleed-sized art, clean apart from the QR zone.
  {
    const { page, x, y } = drawPage(`Front: ${card.seriesName} / ${card.cardName}, token ${card.tokenId}, print cycle ${card.printCycle}`);
    page.drawImage(front, {
      x: x - mm(BLEED), y: y - mm(BLEED),
      width: mm(TRIM.width + BLEED * 2), height: mm(TRIM.height + BLEED * 2),
    });
    const zone = 12;
    const qx = x + mm(TRIM.width - 3 - zone);
    const qy = y + mm(3);
    page.drawRectangle({ x: qx, y: qy, width: mm(zone), height: mm(zone), color: rgb(1, 1, 1) });
    page.drawImage(qr, { x: qx + mm(0.5), y: qy + mm(0.5), width: mm(zone - 1), height: mm(zone - 1) });
    cropMarks(page, x, y);
  }

  // Back: the redeem code. In production it sits under a scratch-off layer.
  {
    const { page, x, y } = drawPage(`Back: the redeem code would be hidden under a scratch layer in production.`);
    page.drawImage(back, {
      x: x - mm(BLEED), y: y - mm(BLEED),
      width: mm(TRIM.width + BLEED * 2), height: mm(TRIM.height + BLEED * 2),
    });
    const panelY = y + mm(10);
    page.drawRectangle({ x: x + mm(5), y: panelY, width: mm(TRIM.width - 10), height: mm(24), color: rgb(1, 1, 1) });
    page.drawText("Hackathon demo print", { x: x + mm(8), y: panelY + mm(18), size: 8, font: bold, color: rgb(0.75, 0.1, 0.2) });
    page.drawText("Redeem code", { x: x + mm(8), y: panelY + mm(12.5), size: 7, font, color: ink });
    page.drawText(formatCode(card.code), { x: x + mm(8), y: panelY + mm(7), size: 9.5, font: bold, color: ink });
    page.drawText(`Token ${card.tokenId}`, { x: x + mm(8), y: panelY + mm(2.5), size: 7, font, color: ink });
    cropMarks(page, x, y);
  }

  return Buffer.from(await doc.save());
}
