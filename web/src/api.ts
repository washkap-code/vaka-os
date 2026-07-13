// API client — token handling, tenant-aware, typed-ish.
const TOKEN_KEY = "jbp_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export async function api(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}) {
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.details?.join("; ") || `Request failed (${res.status})`);
  return data;
}

export const fmt = (n: number | string, ccy = "USD") =>
  `${ccy === "ZWG" ? "ZWG" : "$"}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
