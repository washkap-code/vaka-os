// API client — token handling, tenant-aware, typed-ish.
import { createSessionRenewer } from "./shell/session-renewal-model";

const TOKEN_KEY = "jbp_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

// P9-010: single-flight background session renewal. The refresh credential
// lives in an HttpOnly cookie the server manages; this client only ever sees
// the rotated access token.
const renewer = createSessionRenewer({
  renew: async () => {
    const res = await fetch("/api/v1/auth/refresh", { method: "POST" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return typeof data.token === "string" && data.token ? data.token : null;
  },
  getToken,
  setToken,
});

// Renewal never applies to the auth endpoints themselves (a failed login or
// an explicit sign-out must surface directly).
const isAuthPath = (path: string) => path.startsWith("/auth/");

export async function api(path: string, opts: {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
} = {}) {
  const send = (token: string | null) => fetch(`/api/v1${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const initialToken = getToken();
  let res = await send(initialToken);
  if (res.status === 401 && initialToken && !isAuthPath(path)) {
    const renewedToken = await renewer.renewAfterAuthFailure(initialToken);
    if (renewedToken) res = await send(renewedToken);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || data.details?.join("; ") || `Request failed (${res.status})`) as Error & {
      code?: string; status?: number;
    };
    error.code = typeof data.error === "string" ? data.error : undefined;
    error.status = res.status;
    throw error;
  }
  return data;
}

export const fmt = (n: number | string, ccy = "USD") =>
  `${ccy === "ZWG" ? "ZWG" : "$"}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
