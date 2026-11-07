"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AccountError,
  endSession,
  startSession,
  verifyLogin,
} from "@/lib/accounts";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";

export type LoginState = { error?: string };

/* A few attempts per address per minute. Memory only: it slows a guesser down on one
   server, which is all a password form on a small deployment can honestly promise. */
const g = globalThis as unknown as { __zowallAuthHits?: Map<string, number[]> };
const hits = (g.__zowallAuthHits ??= new Map<string, number[]>());

async function limited(): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 12;
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  // World ID is how people sign in. Passwords exist only for accounts made before that,
  // and only while the operator has asked for them.
  if (process.env["ALLOW_PASSWORD_LOGIN"] !== "true") return { error: "Password sign-in is turned off. Use World ID." };
  if (await limited()) return { error: "Too many attempts. Wait a minute and try again." };
  try {
    const account = verifyLogin(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
    await setSessionCookie(startSession(account.id));
  } catch (err) {
    return { error: err instanceof AccountError ? err.message : "Something went wrong. Try again." };
  }
  redirect("/app");
}

export async function logoutAction(): Promise<void> {
  endSession(await clearSessionCookie());
  redirect("/login");
}
