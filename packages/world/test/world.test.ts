import { test } from "node:test";
import assert from "node:assert/strict";

import { toPersonId, MemoryEnrollmentStore, SodError, assertDistinct } from "../src/registry.ts";
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
