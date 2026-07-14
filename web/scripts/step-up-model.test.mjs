import assert from "node:assert/strict";
import test from "node:test";
import {
  createProofHolder, isStepUpMfaRequired, isStepUpRequired, stepUpHeaders,
} from "../src/shell/step-up-model.ts";

test("classifies 428 STEP_UP_REQUIRED responses", () => {
  assert.equal(isStepUpRequired({ code: "STEP_UP_REQUIRED", status: 428 }), true);
  assert.equal(isStepUpRequired({ status: 428 }), true);
  assert.equal(isStepUpRequired({ code: "UNAUTHORIZED", status: 401 }), false);
  assert.equal(isStepUpRequired(new Error("network")), false);
  assert.equal(isStepUpRequired(null), false);
});

test("classifies the explicit MFA prompt requirement", () => {
  assert.equal(isStepUpMfaRequired({ code: "STEP_UP_MFA_REQUIRED", status: 401 }), true);
  assert.equal(isStepUpMfaRequired({ code: "UNAUTHORIZED", status: 401 }), false);
  assert.equal(isStepUpMfaRequired(null), false);
});

test("proof holder keeps the proof only until its safety-margin expiry", () => {
  let now = 1_000_000;
  const holder = createProofHolder(() => now);
  assert.equal(holder.get(), null);

  holder.set("proof-token", 600);
  assert.equal(holder.get(), "proof-token");

  now += 569_000; // just inside 600s - 30s margin
  assert.equal(holder.get(), "proof-token");

  now += 2_000; // past the margin
  assert.equal(holder.get(), null, "expired proof must never be presented");
});

test("clear() discards the proof immediately", () => {
  const holder = createProofHolder(() => 0);
  holder.set("proof-token", 600);
  holder.clear();
  assert.equal(holder.get(), null);
});

test("headers carry the proof only when one is held", () => {
  assert.deepEqual(stepUpHeaders("abc"), { "X-Vaka-Step-Up": "abc" });
  assert.deepEqual(stepUpHeaders(null), {});
});
