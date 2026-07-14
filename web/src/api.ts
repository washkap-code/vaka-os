// API client — token handling, tenant-aware, typed-ish.
const TOKEN_KEY = "jbp_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

type ApiOptions = { method?: string; body?: unknown; signal?: AbortSignal; stepUpToken?: string };
let refreshInFlight: Promise<boolean> | null = null;

async function renewSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.token !== "string") {
      setToken(null);
      return false;
    }
    setToken(data.token);
    return true;
  })().catch(() => {
    setToken(null);
    return false;
  }).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function request(path: string, opts: ApiOptions) {
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(opts.stepUpToken ? { "X-Vaka-Step-Up": opts.stepUpToken } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    credentials: "same-origin",
  });
  return res;
}

export async function api(path: string, opts: ApiOptions = {}) {
  const attemptedToken = getToken();
  let res = await request(path, opts);
  const mayRenew = res.status === 401 && Boolean(attemptedToken) && !path.startsWith("/auth/");
  if (mayRenew && getToken() !== attemptedToken) {
    res = await request(path, opts);
  } else if (mayRenew && await renewSession()) {
    res = await request(path, opts);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.details?.join("; ") || `Request failed (${res.status})`);
  return data;
}

export const fmt = (n: number | string, ccy = "USD") =>
  `${ccy === "ZWG" ? "ZWG" : "$"}${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
