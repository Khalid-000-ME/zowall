/**
 * What the workspace knows about itself at page load.
 *
 * Every step is derived from something real - who has enrolled, what the vault
 * holds, whether the gate has ever decided anything - rather than from a
 * "completed onboarding" flag. A flag would let the workspace claim it is set
 * up while the vault is empty, which is the one lie this product cannot tell.
 *
 * Chain reads are wrapped because the Whitechain testnet RPC fails
 * intermittently: setup has to stay walkable when it does, so an unreachable
 * node reads as "not confirmed yet", never as an error page.
 */

import { getDecisions, getVault, type ChainDecision, type Vault } from "@/lib/chain";
import { humans, type Human } from "@/lib/humans";

export type SetupStep = {
  slug: "people" | "vault" | "agent" | "rules";
  n: string;
  title: string;
  blurb: string;
  done: boolean;
};

export type WorkspaceState = {
  people: Human[];
  verified: Human[];
  vault: Vault | null;
  decisions: ChainDecision[];
  chainReachable: boolean;
  steps: SetupStep[];
  ready: boolean;
};

/** Three distinct humans is the minimum the match can enforce. */
export const ROLES_NEEDED = 3;

export async function workspaceState(): Promise<WorkspaceState> {
  const people = humans();
  const verified = people.filter((h) => h.enrolled);

  let vault: Vault | null = null;
  let decisions: ChainDecision[] = [];
  let chainReachable = true;

  try {
    vault = await getVault();
  } catch {
    chainReachable = false;
  }

  try {
    decisions = await getDecisions();
  } catch {
    chainReachable = false;
  }

  const peopleDone = verified.length >= ROLES_NEEDED;
  const vaultDone = vault !== null && vault.balance > 0n;
  const agentDone = decisions.length > 0;

  const steps: SetupStep[] = [
    {
      slug: "people",
      n: "01",
      title: "People",
      blurb: "Verify the three humans the gate will hold apart.",
      done: peopleDone,
    },
    {
      slug: "vault",
      n: "02",
      title: "Vault",
      blurb: "Fund the balance that purchase orders reserve against.",
      done: vaultDone,
    },
    {
      slug: "agent",
      n: "03",
      title: "Agent",
      blurb: "Point your agent at the gate instead of at the payment.",
      done: agentDone,
    },
    {
      slug: "rules",
      n: "04",
      title: "Rules",
      blurb: "Read what the gate refuses before it refuses for you.",
      done: peopleDone && vaultDone && agentDone,
    },
  ];

  return {
    people,
    verified,
    vault,
    decisions,
    chainReachable,
    steps,
    ready: steps.every((s) => s.done),
  };
}

/** 6-decimal USDT, rendered the way an accountant expects to see it. */
export function usdt(value: bigint): string {
  const negative = value < 0n;
  const v = negative ? -value : value;
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}.${frac}`;
}

export function shortHex(value: string, lead = 6, tail = 4): string {
  return value.length <= lead + tail + 2 ? value : `${value.slice(0, lead + 2)}…${value.slice(-tail)}`;
}
