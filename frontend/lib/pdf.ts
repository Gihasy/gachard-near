/**
 * The print-ready PDF: a simulation of the print pipeline (ADR-043, decision 3).
 * Card size follows docs/CREATOR-ASSET-GUIDE.md: 63 x 88 mm trim, 3 mm bleed, and
 * the QR in the 12 mm zone at the bottom right of the safe area.
 *
 * The simulation notice is in the page margin and on the card back. The card face
 * stays clean. The notice that cannot be cropped off is the Scan status.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { brandedQr, printCode, printUrl, rounded } from "./qr-style.ts";
import { readArt } from "./art.ts";

export const SIMULATION_NOTICE = "SIMULATION: NEAR Hackathon demo. Not an official printed card.";

const mm = (value: number) => (value * 72) / 25.4;
const A4 = { width: mm(210), height: mm(297) };
const TRIM = { width: 63, height: 88 };
const BLEED = 3;

export async function printPdf(card: {
  tokenId: string;
  cardName: string;
  seriesName: string;
  media: string;
  serial: string;
  printCycle: number;
  origin: string;
}) {
  const scanUrl = printUrl(card.origin, card.tokenId, card.serial);
  const doc = await PDFDocument.create();
  doc.setTitle(`${card.cardName} - hackathon demo print`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const ink = rgb(0.1, 0.1, 0.14);

  const art = await readArt(card.media);
  if (!art) throw new Error("Artwork not found");
  const front = card.media.endsWith(".png") ? await doc.embedPng(art) : await doc.embedJpg(art);

  // Fetched from the site: a serverless function has no public folder on disk.
  const backResponse = await fetch(`${card.origin}/cards/card-back.jpg`);
  if (!backResponse.ok) throw new Error("Card back not found");
  const back = await doc.embedJpg(await backResponse.arrayBuffer());

  const qr = brandedQr(scanUrl);

  const drawPage = (title: string) => {
    const page = doc.addPage([A4.width, A4.height]);
    const x = (A4.width - mm(TRIM.width)) / 2;
    const y = (A4.height - mm(TRIM.height)) / 2;
    page.drawText(SIMULATION_NOTICE, { x: mm(15), y: A4.height - mm(15), size: 10, font: bold, color: rgb(0.75, 0.1, 0.2) });
    page.drawText(title, { x: mm(15), y: A4.height - mm(22), size: 9, font, color: ink });
    page.drawText("In production, cards are printed and shipped by the platform.", {
      x: mm(15), y: mm(19), size: 7.5, font, color: ink,
    });
    page.drawText(`Check this card: ${scanUrl}`, { x: mm(15), y: mm(15), size: 6.5, font, color: ink });
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
    const { page, x, y } = drawPage(`Front: ${card.seriesName} / ${card.cardName}, ${printCode(card.tokenId, card.printCycle)}`);
    page.drawImage(front, {
      x: x - mm(BLEED), y: y - mm(BLEED),
      width: mm(TRIM.width + BLEED * 2), height: mm(TRIM.height + BLEED * 2),
    });
    const zone = 12;
    const qx = x + mm(TRIM.width - 3 - zone);
    const qy = y + mm(3);
    // An SVG path is drawn down from its anchor, so the anchor is the zone's top left.
    for (const layer of [qr.plate, ...qr.layers]) {
      const [r, g, b] = [1, 3, 5].map((at) => parseInt(layer.color.slice(at, at + 2), 16) / 255);
      page.drawSvgPath(layer.path, { x: qx, y: qy + mm(zone), scale: mm(zone) / qr.size, color: rgb(r, g, b) });
    }
    cropMarks(page, x, y);
  }

  // Back: which print this is. The QR on the front holds the same serial.
  {
    const { page, x, y } = drawPage("Back: this paper is not ownership. Only the holder's account can transfer or return the card.");
    page.drawImage(back, {
      x: x - mm(BLEED), y: y - mm(BLEED),
      width: mm(TRIM.width + BLEED * 2), height: mm(TRIM.height + BLEED * 2),
    });
    // A plate in the card's own colors, which names this print. The front names the card.
    const plate = { x: x + mm(11), y: y + mm(13.5), width: mm(TRIM.width - 22), height: mm(11.5) };
    const left = plate.x + mm(3);
    page.drawSvgPath(rounded(0, 0, plate.width, plate.height, mm(1.6)), {
      x: plate.x,
      y: plate.y + plate.height,
      color: rgb(0.039, 0.043, 0.078),
      opacity: 0.94,
      borderColor: rgb(0.79, 0.7, 0.98),
      borderWidth: 0.6,
      borderOpacity: 0.7,
    });
    page.drawText("HACKATHON DEMO PRINT", { x: left, y: plate.y + mm(8.5), size: 4.4, font: bold, color: rgb(0.97, 0.79, 0.42) });
    page.drawText(printCode(card.tokenId, card.printCycle), { x: left, y: plate.y + mm(4.8), size: 8, font: bold, color: rgb(0.96, 0.95, 1) });
    page.drawText(card.serial, { x: left, y: plate.y + mm(2), size: 5, font: mono, color: rgb(0.79, 0.7, 0.98) });
    cropMarks(page, x, y);
  }

  return Buffer.from(await doc.save());
}
