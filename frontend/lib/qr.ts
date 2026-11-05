import { headers } from "next/headers";
import QRCode from "qrcode";

/** This site's address as the visitor reached it, so a QR works on any deployment. */
export async function siteOrigin() {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function qrDataUrl(text: string) {
  return QRCode.toDataURL(text, { margin: 1, width: 240, errorCorrectionLevel: "M" });
}
