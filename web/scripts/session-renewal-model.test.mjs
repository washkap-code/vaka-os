import assert from "node:assert/strict";
import test from "node:test";
import { createSessionRenewer } from "../src/shell/session-renewal-model.ts";

function tokenStore(initial) {
  let token = initial;
  return { getToken: () => token, setToken: (t) => { token = t; }, peek: () => token };
}

test("successful renewal stores and returns the rotated access token", async () => {
  const store = tokenStore("expired-token");
  let renewCalls = 0;
  const renewer = createSessionRenewer({
    renew: async () => { renewCalls += 1; return "rotated-token"; },
    getToken: store.getToken,
    setToken: store.setToken,
  });

  const renewed = await renewer.renewAfterAuthFailure("expired-token");
  assert.equal(renewed, "rotated-token");
  assert.equal(store.peek(), "rotated-token");
  assert.equal(renewCalls, 1);
});

test("concurrent auth failures share a single renewal flight", async () => {
  const store = tokenStore("expired-token");
  let renewCalls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const renewer = createSessionRenewer({
    renew: async () => { renewCalls += 1; await gate; return "rotated-token"; },
    getToken: store.getToken,
    setToken: store.setToken,
  });

  const first = renewer.renewAfterAuthFailure("expired-token");
  const second = renewer.renewAfterAuthFailure("expired-token");
  const third = renewer.renewAfterAuthFailure("expired-token");
  release();
  const results = await Promise.all([first, second, third]);
  assert.deepEqual(results, ["rotated-token", "rotated-token", "rotated-token"]);
  assert.equal(renewCalls, 1, "renewal endpoint must be called exactly once");
});

test("failed renewal clears the access token and reports sign-in fallback", async () => {
  const store = tokenStore("expired-token");
  const renewer = createSessionRenewer({
    renew: async () => null,
    getToken: store.getToken,
    setToken: store.setToken,
  });

  const renewed = await renewer.renewAfterAuthFailure("expired-token");
  assert.equal(renewed, null);
  assert.equal(store.peek(), null, "access token must be cleared on renewal failure");
});

test("renewal rejection (network error) clears the token instead of looping", async () => {
  const store = tokenStore("expired-token");
  const renewer = createSessionRenewer({
    renew: async () => { throw new Error("network down"); },
    getToken: store.getToken,
    setToken: store.setToken,
  });

  const renewed = await renewer.renewAfterAuthFailure("expired-token");
  assert.equal(renewed, null);
  assert.equal(store.peek(), null);
});

test("a caller whose token was already rotated reuses it without renewing again", async () => {
  const store = tokenStore("already-rotated-token");
  let renewCalls = 0;
  const renewer = createSessionRenewer({
    renew: async () => { renewCalls += 1; return "unexpected"; },
    getToken: store.getToken,
    setToken: store.setToken,
  });

  const renewed = await renewer.renewAfterAuthFailure("stale-token-from-old-request");
  assert.equal(renewed, "already-rotated-token");
  assert.equal(renewCalls, 0, "no renewal call when another flight already rotated");
});

test("signed-out callers do not attempt renewal", async () => {
  const store = tokenStore(null);
  let renewCalls = 0;
  const renewer = createSessionRenewer({
    renew: async () => { renewCalls += 1; return "unexpected"; },
    getToken: store.getToken,
    setToken: store.setToken,
  });

  const renewed = await renewer.renewAfterAuthFailure(null);
  assert.equal(renewed, null);
  assert.equal(renewCalls, 0);
});

test("a fresh auth failure after a completed renewal starts a new flight", async () => {
  const store = tokenStore("token-1");
  let renewCalls = 0;
  const renewer = createSessionRenewer({
    renew: async () => { renewCalls += 1; return `token-${renewCalls + 1}`; },
    getToken: store.getToken,
    setToken: store.setToken,
  });

  assert.equal(await renewer.renewAfterAuthFailure("token-1"), "token-2");
  assert.equal(await renewer.renewAfterAuthFailure("token-2"), "token-3");
  assert.equal(renewCalls, 2);
});
