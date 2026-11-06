"use server";

import { revalidatePath } from "next/cache";

import { AccountError, createKey, revokeKey } from "@/lib/accounts";
import { toAtomic } from "@/lib/amounts";
import { RegistryError, canManage, getEndpoint, registerEndpoint, removeEndpoint, reverify } from "@/lib/registry";
import { requireAccount } from "@/lib/session";

export type EndpointState = { error?: string; ok?: { name: string; status: string; reasons: string[] } };
export type KeyState = { error?: string; apiKey?: string };

const msg = (e: unknown) =>
  e instanceof RegistryError || e instanceof AccountError ? e.message : e instanceof Error ? e.message : "Something went wrong. Try again.";

export async function registerEndpointAction(_prev: EndpointState, form: FormData): Promise<EndpointState> {
  const account = await requireAccount("vendor");
  try {
    const asset = String(form.get("asset") ?? "0.0.0");
    const endpoint = await registerEndpoint(account.id, {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      url: String(form.get("url") ?? ""),
      payTo: String(form.get("payTo") ?? ""),
      asset,
      network: "hedera:testnet",
      amount: toAtomic(asset, String(form.get("price") ?? "")),
      tags: String(form.get("tags") ?? "").split(","),
      visibility: form.get("visibility") === "private" ? "private" : "public",
    });
    revalidatePath("/app");
    revalidatePath("/app/endpoints");
    return { ok: { name: endpoint.name, status: endpoint.status, reasons: endpoint.verification?.reasons ?? [] } };
  } catch (err) {
    return { error: msg(err) };
  }
}

export async function verifyEndpointAction(id: string): Promise<{ error?: string }> {
  const account = await requireAccount("vendor");
  const e = getEndpoint(id);
  if (!e || !canManage(e, account)) return { error: "No such endpoint." };
  try {
    await reverify(id);
    revalidatePath("/app/endpoints");
    revalidatePath("/app");
    return {};
  } catch (err) {
    return { error: msg(err) };
  }
}

export async function removeEndpointAction(id: string): Promise<{ error?: string }> {
  const account = await requireAccount("vendor");
  const e = getEndpoint(id);
  if (!e || !canManage(e, account)) return { error: "No such endpoint." };
  try {
    removeEndpoint(id);
    revalidatePath("/app/endpoints");
    revalidatePath("/app");
    return {};
  } catch (err) {
    return { error: msg(err) };
  }
}

export async function createKeyAction(_prev: KeyState, form: FormData): Promise<KeyState> {
  const account = await requireAccount();
  try {
    const { apiKey } = createKey(account.id, String(form.get("name") ?? ""));
    revalidatePath("/app/keys");
    revalidatePath("/app");
    return { apiKey };
  } catch (err) {
    return { error: msg(err) };
  }
}

export async function revokeKeyAction(keyId: string): Promise<{ error?: string }> {
  const account = await requireAccount();
  try {
    revokeKey(account.id, keyId);
    revalidatePath("/app/keys");
    return {};
  } catch (err) {
    return { error: msg(err) };
  }
}
