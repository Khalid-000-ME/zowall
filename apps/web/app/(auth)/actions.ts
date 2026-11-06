"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AccountError,
  createAccount,
  endSession,
  startSession,
  validateSignUp,
  verifyLogin,
  type Role,
} from "@/lib/accounts";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";

export type SignUpState = { error?: string; apiKey?: string; role?: Role };
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

export async function signUpAction(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  if (await limited()) return { error: "Too many attempts. Wait a minute and try again." };
  try {
    const input = validateSignUp({
      role: String(form.get("role") ?? "") as Role,
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    const { account, apiKey, token } = createAccount(input);
    await setSessionCookie(token);
    // The key is returned here and nowhere else: it is shown once, then only its hash exists.
    return { apiKey, role: account.role };
  } catch (err) {
    if (err instanceof AccountError) return { error: err.message };
    return { error: "Something went wrong. Try again." };
  }
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
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
