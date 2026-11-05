/**
 * Card artwork, stored by the sha256 of its bytes, which is what the chain
 * records. A file on disk locally, a MongoDB document when hosted.
 *
 * The server does not decode images. The browser turns an upload into a JPEG
 * first, and the server only checks what it received, so no native image library
 * has to load in a serverless function (ADR-044).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Binary } from "mongodb";
import { DATA_DIR, mongoCollection, usesMongo } from "./db.ts";
import { ContractRefused } from "./near.ts";

// Vercel refuses request bodies over 4.5 MB, so anything larger would never arrive.
export const MAX_ART_BYTES = 4 * 1024 * 1024;
const ART_DIR = join(DATA_DIR, "art");
const MEDIA = /^\/api\/art\/([0-9a-f]{64})\.(jpg|png)$/;

interface ArtDoc {
  _id: string;
  bytes: Binary;
}

function imageType(bytes: Buffer): "jpg" | "png" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  return null;
}

export async function storeArt(bytes: Buffer) {
  if (bytes.length > MAX_ART_BYTES) throw new ContractRefused("Artwork must be under 4 MB.");
  const type = imageType(bytes);
  if (!type) throw new ContractRefused("That file is not a readable image.");
  const hash = createHash("sha256").update(bytes);
  const hex = hash.copy().digest("hex");
  const name = `${hex}.${type}`;
  if (usesMongo()) {
    const art = await mongoCollection<ArtDoc>("art");
    await art.updateOne({ _id: name }, { $set: { bytes: new Binary(bytes) } }, { upsert: true });
  } else {
    mkdirSync(ART_DIR, { recursive: true });
    writeFileSync(join(ART_DIR, name), bytes);
  }
  return { media: `/api/art/${name}`, mediaHash: hash.digest("base64") };
}

/** The stored bytes for a chain media path, or null if there are none. */
export async function readArt(media: string): Promise<Buffer | null> {
  const match = media.match(MEDIA);
  if (!match) return null;
  const name = `${match[1]}.${match[2]}`;
  if (usesMongo()) {
    const art = await mongoCollection<ArtDoc>("art");
    const doc = await art.findOne({ _id: name });
    return doc ? Buffer.from(doc.bytes.buffer) : null;
  }
  try {
    return readFileSync(join(ART_DIR, name));
  } catch {
    return null;
  }
}

/**
 * Whether the stored file still hashes to what the chain records. Null means it
 * could not be checked, which must never read as a pass.
 */
export async function artMatches(media: string, mediaHashBase64: string): Promise<boolean | null> {
  try {
    const bytes = await readArt(media);
    if (!bytes) return null;
    return createHash("sha256").update(bytes).digest("base64") === mediaHashBase64;
  } catch {
    return null;
  }
}
