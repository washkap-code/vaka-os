// ============================================================================
// P9-010 session renewal model — pure, dependency-injected logic so the
// single-flight behaviour is testable without a browser.
//
// On an access-token authentication failure the client makes ONE background
// renewal call (concurrent failures share the same in-flight attempt), then
// retries the original request once. On renewal failure the access token is
// cleared and the caller falls back to the existing sign-in state.
// ============================================================================

export interface SessionRenewalDeps {
  /** POST the renewal endpoint; resolves the new access token or null on any failure. */
  renew: () => Promise<string | null>;
  getToken: () => string | null;
  setToken: (token: string | null) => void;
}

export interface SessionRenewer {
  /**
   * Handle an authentication failure for `failedToken` (the token the failing
   * request was sent with). Returns the new access token when renewal
   * succeeds, or null when the caller should surface the sign-in state.
   */
  renewAfterAuthFailure: (failedToken: string | null) => Promise<string | null>;
}

export function createSessionRenewer(deps: SessionRenewalDeps): SessionRenewer {
  let inFlight: Promise<string | null> | null = null;

  const runRenewal = async (): Promise<string | null> => {
    let renewed: string | null = null;
    try {
      renewed = await deps.renew();
    } catch {
      renewed = null;
    }
    if (renewed) {
      deps.setToken(renewed);
      return renewed;
    }
    deps.setToken(null);
    return null;
  };

  return {
    async renewAfterAuthFailure(failedToken: string | null) {
      // Signed-out callers have nothing to renew.
      if (!failedToken) return null;
      const current = deps.getToken();
      // Another caller already renewed while this request was in flight:
      // reuse its result instead of spending our single-use credential.
      if (current && current !== failedToken) return current;
      if (!inFlight) {
        inFlight = runRenewal().finally(() => { inFlight = null; });
      }
      return inFlight;
    },
  };
}
