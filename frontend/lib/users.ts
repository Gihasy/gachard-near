import { createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { readDb, withDb, type User } from "./db.ts";
import { spend } from "./limits.ts";
import { collectorLabel, ContractRefused, createUserAccount, defaultUsername } from "./near.ts";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, verifySessionToken } from "./session.ts";

export const STARTING_CREDITS = 5000;
const MAX_NEW_USERS_PER_HOUR = 60;
const MAX_NEW_USERS_PER_VISITOR_PER_HOUR = 10;

export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const id = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  return id ? ((await readDb()).users.find((u) => u.id === id) ?? null) : null;
}

/**
 * Stands for a visitor in a limit, without keeping their address. Vercel sets x-real-ip
 * itself, so a visitor cannot choose it. A limit shared by one office is the cost.
 */
export async function visitorKey() {
  const list = await headers();
  const ip = list.get("x-real-ip") ?? list.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  return createHmac("sha256", process.env.ENCRYPTION_SECRET_KEY ?? "").update(`visitor:${ip}`).digest("hex").slice(0, 16);
}

/** Each new account costs the platform real testnet funds, so signups are capped. */
export async function createUser(provider: User["provider"], visitor: string, googleSub?: string): Promise<User> {
  const allowed = await withDb((d) => spend(d, [
    { key: `signup:${visitor}`, max: MAX_NEW_USERS_PER_VISITOR_PER_HOUR },
    { key: "signup", max: MAX_NEW_USERS_PER_HOUR },
  ]));
  if (!allowed) throw new ContractRefused("Too many new accounts this hour. Please try again later.");
  const id = randomBytes(12).toString("hex");
  const account = await createUserAccount(id);
  const user: User = {
    id,
    username: defaultUsername(account.accountId),
    provider,
    googleSub,
    ...account,
    credits: STARTING_CREDITS,
    approvedCreator: false,
    createdAt: new Date().toISOString(),
  };
  await withDb((d) => d.users.push(user));
  return user;
}

const USERNAME = /^[a-z0-9_]{3,20}$/;

export const cleanUsername = (name: string) => name.trim().replace(/^@/, "").toLowerCase();

/** The public name for an account: its username, or its anonymous label. */
export function nameOf(accountId: string, users: User[]): string {
  const username = users.find((u) => u.accountId === accountId)?.username;
  return username ? `@${username}` : collectorLabel(accountId);
}

export async function setUsername(user: User, name: string) {
  const username = cleanUsername(name);
  if (!USERNAME.test(username)) {
    throw new ContractRefused("A username is 3 to 20 letters, numbers or underscores.");
  }
  await withDb((d) => {
    if (d.users.some((u) => u.username === username && u.id !== user.id)) {
      throw new ContractRefused("That username is taken.");
    }
    const row = d.users.find((u) => u.id === user.id);
    if (row) row.username = username;
  });
  return username;
}

export function withSession<T>(body: T, userId: string) {
  const response = NextResponse.json(body);
  response.cookies.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

/** Turns a refusal into a plain message, and anything else into a generic one. */
export function failure(error: unknown) {
  if (error instanceof ContractRefused) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: "That did not go through. Please try again." }, { status: 502 });
}
