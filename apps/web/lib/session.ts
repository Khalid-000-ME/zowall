import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, SESSION_MAX_AGE_S, accountForSession, type Account, type Role } from "@/lib/accounts";

/** The signed-in account, or null. Read from the session cookie, never from the request body. */
export async function currentAccount(): Promise<Account | null> {
  const jar = await cookies();
  return accountForSession(jar.get(SESSION_COOKIE)?.value);
}

/** For pages that need an account. Anyone else is sent to log in. */
export async function requireAccount(role?: Role): Promise<Account> {
  const account = await currentAccount();
  if (!account) redirect("/login");
  if (role && account.role !== role) redirect("/app");
  return account;
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

export async function clearSessionCookie(): Promise<string | undefined> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  jar.delete(SESSION_COOKIE);
  return token;
}
