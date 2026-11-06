import { test } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  JsonFileEnrollmentStore,
  toPersonId,
  MemoryEnrollmentStore,
  SodError,
  assertDistinct,
} from "../src/registry.ts";
import { actionFor, configuredMode, isFresh, newCheck } from "../src/freshness.ts";
import { ROLE_CODE, roleFromCode } from "../src/roles.ts";
import { verifyWorldProof } from "../src/verify.ts";

const A = toPersonId("0xa1");
const B = toPersonId("0xb2");

test("a decimal nullifier and its hex form are the same person", () => {
  assert.equal(toPersonId("255"), toPersonId("0xff"));
  assert.equal(toPersonId("0xFF"), toPersonId("0xff"));
  assert.equal(toPersonId("0xff").length, 66);
});

test("a nullifier that cannot be a personId is refused, not coerced", () => {
  assert.throws(() => toPersonId(""), /empty nullifier/);
  assert.throws(() => toPersonId("not-a-nullifier"), /not a number or hex/);
  assert.throws(() => toPersonId(`0x${"ff".repeat(33)}`), /wider than 32 bytes/);
});

test("a stand-in enrollment never overwrites a real one", () => {
  const store = new MemoryEnrollmentStore();
  store.put({ personId: A, address: "0xAAA", label: "Alice", enrolledAt: 1, live: true });
  store.put({ personId: A, address: "0xAAA", label: "Alice (fake)", enrolledAt: 2, live: false });

  assert.equal(store.get(A)?.label, "Alice");
  assert.equal(store.get(A)?.live, true);
});

test("enrollment is found by either personId or wallet", () => {
  const store = new MemoryEnrollmentStore();
  store.put({ personId: B, address: "0xBbB", label: "Bob", enrolledAt: 1, live: true });

  assert.equal(store.byAddress("0xbbb")?.personId, B);
  assert.equal(store.byAddress("0xNOPE"), undefined);
});

test("segregation of duties names the roles that clash", () => {
  assert.doesNotThrow(() => assertDistinct(B, { creator: A, receiver: null }));

  try {
    assertDistinct(A, { creator: A, receiver: A, approver: null });
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof SodError);
    assert.deepEqual(err.heldRoles, ["creator", "receiver"]);
    assert.match(err.message, /a different person has to do this/);
  }
});

test("role codes match the contract's enum", () => {
  assert.equal(ROLE_CODE.Creator, 0);
  assert.equal(ROLE_CODE.Receiver, 1);
  assert.equal(ROLE_CODE.Approver, 2);
  assert.equal(roleFromCode(2), "Approver");
  assert.throws(() => roleFromCode(9), /unknown role code/);
});

test("session mode sends no action, per-role mode sends one", () => {
  // A blank action alongside a signature made without one is what produces
  // invalid_rp_signature, so session mode must send null, not "".
  assert.equal(actionFor("Receiver", "session"), null);
  assert.equal(actionFor("Receiver", "per-role"), "zowall-receipt");
});

test("freshness mode is configured, never silently downgraded", () => {
  assert.equal(configuredMode({}), "session");
  assert.equal(configuredMode({ WORLD_FRESHNESS_MODE: "per-role" }), "per-role");
  assert.equal(configuredMode({ WORLD_FRESHNESS_MODE: "nonsense" }), "session");
});

test("a freshness check expires", () => {
  const check = newCheck("Approver", "session", 1_000);
  assert.equal(isFresh(check, 1_500), true);
  assert.equal(isFresh(check, 1_000 + 601), false);
});

test("verify refuses to run with no World app configured", async () => {
  const result = await verifyWorldProof({}, { rpId: undefined });
  assert.equal(result.success, false);
  assert.match(result.detail ?? "", /No World app configured/);
});

test("the nullifier is read from responses[], not the root", async () => {
  const fetchImpl = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;

  const ok = await verifyWorldProof(
    { nullifier: "0xROOT", responses: [{ nullifier: "0xINSIDE" }] },
    { rpId: "rp_test", fetchImpl },
  );
  assert.equal(ok.success, true);
  assert.equal(ok.nullifier, "0xINSIDE");

  const rootOnly = await verifyWorldProof({ nullifier: "0xROOT" }, { rpId: "rp_test", fetchImpl });
  assert.equal(rootOnly.success, false);
  assert.match(rootOnly.detail ?? "", /carried no nullifier/);
});

test("nullifier_replayed is reported as the integration working", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ code: "nullifier_replayed" }), {
      status: 400,
    })) as unknown as typeof fetch;

  const result = await verifyWorldProof(
    { responses: [{ nullifier: "0xKNOWN" }] },
    { rpId: "rp_test", fetchImpl },
  );

  assert.equal(result.success, false);
  assert.equal(result.alreadyVerified, true);
  // the nullifier is trustworthy here: World only reaches "already used"
  // after validating the proof cryptographically
  assert.equal(result.nullifier, "0xKNOWN");
});

test("an enrolment survives a restart, which World would not let us redo", () => {
  const dir = mkdtempSync(join(tmpdir(), "zowall-enroll-"));
  const file = join(dir, "enrollments.json");
  try {
    const first = new JsonFileEnrollmentStore(file);
    first.put({ personId: A, address: "", label: "Priya", enrolledAt: 1, live: true });

    // a new process: nothing in memory, only the file
    const second = new JsonFileEnrollmentStore(file);
    assert.equal(second.get(A)?.label, "Priya");
    assert.equal(second.get(A)?.live, true);
    assert.equal(second.all().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stand-in still cannot overwrite a real enrolment once it is persisted", () => {
  const dir = mkdtempSync(join(tmpdir(), "zowall-enroll-"));
  const file = join(dir, "enrollments.json");
  try {
    const first = new JsonFileEnrollmentStore(file);
    first.put({ personId: A, address: "", label: "Priya", enrolledAt: 1, live: true });

    const second = new JsonFileEnrollmentStore(file);
    second.put({ personId: A, address: "", label: "Priya (fake)", enrolledAt: 2, live: false });
    assert.equal(new JsonFileEnrollmentStore(file).get(A)?.label, "Priya");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a damaged registry file is an empty registry, not a crash", () => {
  const dir = mkdtempSync(join(tmpdir(), "zowall-enroll-"));
  const file = join(dir, "enrollments.json");
  try {
    writeFileSync(file, "{ this is not json");
    const store = new JsonFileEnrollmentStore(file);
    assert.equal(store.all().length, 0);
    store.put({ personId: B, address: "", label: "Bob", enrolledAt: 1, live: true });
    assert.equal(new JsonFileEnrollmentStore(file).get(B)?.label, "Bob");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


/* ---------------------------------------------------- action-bound signing -- */

import {
  cancelActionHash,
  createActionHash,
  holdActionHash,
  receiptActionHash,
  signAttestation,
} from "../src/attest.ts";

test("action hashes match the contract, byte for byte", () => {
  // The same constants are asserted in packages/contracts/test/Quorum.t.sol.
  const po = {
    vendor: "0x1111111111111111111111111111111111111111",
    payee: "0x000000000000000000000000000000000000bEEF",
    specHash: `0x${"11".repeat(32)}`,
    qty: 100n,
    unitPrice: 40_000_000n,
    priceTolBps: 500,
    qtyTolBps: 0,
    expiry: 1_800_086_400n,
  } as const;
  assert.equal(createActionHash(po), "0x074a0408d04090b7af21f9e4a49dbcc691addd36f089e3b8113e364abb35c52a");
  assert.equal(cancelActionHash(7n), "0x2ebb366b821f152a4878790575e1a8f092886991ec04a08a19562970e1e273d0");
  assert.equal(
    receiptActionHash(7n, 50n, `0x${"22".repeat(32)}`),
    "0x2b729feb248cfbf3728276d56f1b1100519a2cdad273d05335d29793101c5849",
  );
  assert.equal(holdActionHash(3n, true), "0x30bf7943399976457b4c8c607a8040365fea1382d752f4068a8017fd5a4b2f24");
  assert.equal(holdActionHash(3n, false), "0x75cc1c0675da75a9929e4648aca3a95345bbbfde853124f07efc055e18fb3d27");
});

test("a verdict changes the action hash, so a flipped approval cannot reuse a signature", () => {
  assert.notEqual(holdActionHash(3n, true), holdActionHash(3n, false));
  assert.notEqual(
    receiptActionHash(7n, 50n, `0x${"22".repeat(32)}`),
    receiptActionHash(7n, 500n, `0x${"22".repeat(32)}`),
  );
});

test("a quorum attestation carries exactly the threshold of signatures, ascending by signer", async () => {
  const keys = [
    "0x0000000000000000000000000000000000000000000000000000000000000a01",
    "0x0000000000000000000000000000000000000000000000000000000000000a02",
    "0x0000000000000000000000000000000000000000000000000000000000000a03",
  ] as const;
  const att = await signAttestation(
    {
      personId: `0x${"a1".repeat(32)}`,
      role: "Creator",
      poId: 0n,
      actionHash: `0x${"00".repeat(31)}01`,
    },
    {
      privateKeys: keys,
      threshold: 2,
      chainId: 1874,
      gateAddress: "0x1fcb96e5e1a092bab2376517036113beb3cc9c5a",
    },
  );
  assert.equal((att.sig.length - 2) / 2, 2 * 65, "two 65-byte signatures");
});

test("a threshold the keys cannot meet is refused before anything is signed", async () => {
  await assert.rejects(
    signAttestation(
      { personId: `0x${"a1".repeat(32)}`, role: "Creator", poId: 0n, actionHash: `0x${"00".repeat(32)}` },
      {
        privateKeys: ["0x0000000000000000000000000000000000000000000000000000000000000a01"],
        threshold: 2,
        chainId: 1874,
        gateAddress: "0x1fcb96e5e1a092bab2376517036113beb3cc9c5a",
      },
    ),
    /cannot be met/,
  );
});
