import { headers } from "next/headers";
import { brandedQrSvg } from "./qr-style.ts";

/** This site's address as the visitor reached it, so a QR works on any deployment. */
export async function siteOrigin() {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function qrDataUrl(text: string) {
  return `data:image/svg+xml;base64,${Buffer.from(brandedQrSvg(text)).toString("base64")}`;
}
