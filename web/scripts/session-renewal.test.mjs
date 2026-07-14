import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const { api, getToken, setToken } = await import("../src/api.ts");

test("concurrent authentication failures share one refresh and retry with the rotated access token", async () => {
  setToken("expired-access");
  let refreshCalls = 0;
  let protectedCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/v1/auth/refresh") {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ token: "rotated-access" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    protectedCalls += 1;
    const authorization = options.headers?.Authorization;
    return new Response(JSON.stringify(authorization === "Bearer rotated-access" ? { ok: true } : { message: "Expired" }), {
      status: authorization === "Bearer rotated-access" ? 200 : 401,
      headers: { "Content-Type": "application/json" },
    });
  };

  const [first, second] = await Promise.all([api("/me"), api("/me")]);
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true });
  assert.equal(refreshCalls, 1);
  assert.equal(protectedCalls, 4);
  assert.equal(getToken(), "rotated-access");
});

test("failed renewal clears browser-readable access state and does not loop", async () => {
  setToken("expired-again");
  let refreshCalls = 0;
  globalThis.fetch = async (url) => {
    if (url === "/api/v1/auth/refresh") {
      refreshCalls += 1;
      return new Response(JSON.stringify({ message: "Session renewal failed" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ message: "Expired" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };

  await assert.rejects(() => api("/me"), /Expired/);
  assert.equal(refreshCalls, 1);
  assert.equal(getToken(), null);
});

test("credential endpoint failures never trigger session renewal", async () => {
  setToken("existing-access");
  let refreshCalls = 0;
  globalThis.fetch = async (url) => {
    if (url === "/api/v1/auth/refresh") refreshCalls += 1;
    return new Response(JSON.stringify({ message: "Invalid credentials" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  };

  await assert.rejects(() => api("/auth/login", { method: "POST", body: {} }), /Invalid credentials/);
  assert.equal(refreshCalls, 0);
});
