import released from "./framed-art.json";

const FRAMED = new Set(released);

/**
 * Whether an image is one of Gachard's own framed cards, which carry a dark margin
 * for the print trim. On screen they show from their border out, with no margin. A
 * creator's own design has no such margin, so it is shown whole, while one framed by
 * lib/card-frame.ts says so in its address. The image and its hash on chain do not change.
 */
export function isFramedArt(src: string) {
  return FRAMED.has(src) || src.endsWith("?framed") || src.startsWith("/cards/series/") || src === "/cards/card-back.webp";
}
