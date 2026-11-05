import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readDb, withDb, type User } from "./db.ts";
import { ContractRefused, createUserAccount } from "./near.ts";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, verifySessionToken } from "./session.ts";

export const STARTING_CREDITS = 5000;
const MAX_NEW_USERS_PER_HOUR = 30;

export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const id = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  return id ? (readDb().users.find((u) => u.id === id) ?? null) : null;
}

/** Each new account costs the platform real testnet funds, so signups are capped. */
export async function createUser(provider: User["provider"], googleSub?: string): Promise<User> {
  const hourAgo = Date.now() - 3_600_000;
  const recent = readDb().users.filter((u) => Date.parse(u.createdAt) > hourAgo).length;
  if (recent >= MAX_NEW_USERS_PER_HOUR) {
    throw new ContractRefused("Too many new accounts this hour. Please try again later.");
  }
  const id = randomBytes(12).toString("hex");
  const account = await createUserAccount(id);
  const user: User = {
    id,
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
