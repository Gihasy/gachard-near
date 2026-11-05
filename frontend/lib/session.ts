/**
 * A request is authenticated by the signed session cookie and nothing else
 * (ADR-032). This file has no database or framework imports because proxy.ts
 * uses it too. A proxy always runs on the Node.js runtime, so node:crypto is fine.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "gachard_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function sign(payload: string): string | null {
  const secret = process.env.ENCRYPTION_SECRET_KEY;
  if (!secret || secret.length < 32) return null;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createSessionToken(userId: string): string {
  const payload = `${userId}.${Math.floor(Date.now() / 1000)}`;
  const signature = sign(payload);
  if (!signature) throw new Error("ENCRYPTION_SECRET_KEY must be at least 32 characters");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  const parts = token?.split(".");
  if (parts?.length !== 3) return null;
  const [userId, timestamp, signature] = parts;
  const expected = sign(`${userId}.${timestamp}`);
  if (!expected) return null;
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > SESSION_MAX_AGE) return null;
  return userId;
}
