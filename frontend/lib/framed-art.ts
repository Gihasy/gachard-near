import released from "./framed-art.json";

const FRAMED = new Set(released);

/**
 * A smaller copy, from the host's image optimizer, so the server still decodes nothing
 * (ADR-044). The widths must be among next.config.ts's image sizes.
 */
export function smallCopy(src: string, width: 384 | 640 = 384) {
  if (!src.startsWith("/cards/") && !src.startsWith("/api/art/")) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}

/**
 * Whether an image is one of Gachard's own framed cards, which carry a dark margin
 * for the print trim. On screen they show from their border out, with no margin. A
 * creator's own design has no such margin, so it is shown whole, while one framed by
 * lib/card-frame.ts says so in its address. The image and its hash on chain do not change.
 */
export function isFramedArt(src: string) {
  return FRAMED.has(src) || src.endsWith("?framed") || src.startsWith("/cards/series/") || src === "/cards/card-back.webp";
}
