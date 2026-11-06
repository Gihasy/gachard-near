import released from "./framed-art.json";

const FRAMED = new Set(released);

/**
 * Whether an image is one of Gachard's own framed cards, which carry a dark margin
 * for the print trim. On screen they show from their border out, with no margin. A
 * creator's upload has no such margin, so it is shown whole. The image itself and its
 * hash on chain do not change.
 */
export function isFramedArt(src: string) {
  return FRAMED.has(src) || src.startsWith("/cards/series/") || src === "/cards/card-back.webp";
}
