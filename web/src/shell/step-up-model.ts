// ============================================================================
// P9-011 step-up model — pure, dependency-injected logic for privileged
// reauthentication, testable without a browser.
//
// The proof is held ONLY in memory (never localStorage/sessionStorage, URLs
// or logs) and expires client-side slightly before its server expiry so a
// stale proof is never presented.
// ============================================================================

export interface StepUpErrorLike { code?: string; status?: number; message?: string }

/** The server refused the action pending fresh reauthentication. */
export const isStepUpRequired = (error: unknown): boolean => {
  const e = error as StepUpErrorLike | null;
  return Boolean(e && (e.code === "STEP_UP_REQUIRED" || e.status === 428));
};

/** MFA is enrolled and the server explicitly asks for an authenticator/recovery code. */
export const isStepUpMfaRequired = (error: unknown): boolean =>
  Boolean((error as StepUpErrorLike | null)?.code === "STEP_UP_MFA_REQUIRED");

/** Client-side safety margin before the server-side ten-minute expiry. */
const EXPIRY_MARGIN_SECONDS = 30;

export interface ProofHolder {
  get: () => string | null;
  set: (proof: string, expiresInSeconds: number) => void;
  clear: () => void;
}

/** In-memory, expiring holder for the current step-up proof. */
export function createProofHolder(now: () => number = () => Date.now()): ProofHolder {
  let proof: string | null = null;
  let expiresAt = 0;
  return {
    get: () => (proof && now() < expiresAt ? proof : null),
    set: (value: string, expiresInSeconds: number) => {
      proof = value;
      expiresAt = now() + Math.max(0, expiresInSeconds - EXPIRY_MARGIN_SECONDS) * 1000;
    },
    clear: () => { proof = null; expiresAt = 0; },
  };
}

/** Build the request headers that attach the proof to a protected call. */
export const stepUpHeaders = (proof: string | null): Record<string, string> =>
  proof ? { "X-Vaka-Step-Up": proof } : {};
