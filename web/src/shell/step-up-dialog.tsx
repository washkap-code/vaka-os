// ============================================================================
// P9-011 — reusable, accessible privileged-reauthentication dialog.
//
// `useStepUp()` wraps a protected API call: when the server answers
// 428 STEP_UP_REQUIRED, the dialog collects a fresh password (and, when the
// account has MFA enrolled, an authenticator or recovery code), exchanges it
// for a short-lived proof at /auth/step-up, then returns to the initiating
// action. The proof lives only in component memory — never in storage, URLs
// or logs — and an authentication error keeps the pending action alive.
// ============================================================================
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { LegacyModal } from "../accessibility/legacy-modal";
import { appStrings as appEnglish } from "../locales";
import { api } from "../api";
import {
  createProofHolder, isStepUpMfaRequired, isStepUpRequired, stepUpHeaders,
} from "./step-up-model";

const copy = appEnglish.stepUp;

type PendingAction = {
  resolve: () => void;
  reject: (error: Error) => void;
};

export function useStepUp(): {
  run: <T>(action: (headers: Record<string, string>) => Promise<T>) => Promise<T>;
  dialog: ReactNode;
} {
  const holder = useRef(createProofHolder()).current;
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async <T,>(action: (headers: Record<string, string>) => Promise<T>): Promise<T> => {
    try {
      return await action(stepUpHeaders(holder.get()));
    } catch (firstError) {
      if (!isStepUpRequired(firstError)) throw firstError;
      holder.clear();
      await new Promise<void>((resolve, reject) => {
        setMfaNeeded(false);
        setError("");
        setPending({ resolve, reject });
      });
      // Reauthenticated: return to the initiating action once.
      return action(stepUpHeaders(holder.get()));
    }
  }, [holder]);

  const close = useCallback(() => {
    setPending((current) => {
      current?.reject(new Error(copy.cancelled));
      return null;
    });
  }, []);

  const submit = useCallback(async (currentPassword: string, code: string) => {
    try {
      const result = await api("/auth/step-up", {
        method: "POST",
        body: { currentPassword, code: code.trim() || undefined },
      });
      holder.set(result.proof, result.expiresInSeconds);
      setPending((current) => {
        current?.resolve();
        return null;
      });
    } catch (stepUpError) {
      if (isStepUpMfaRequired(stepUpError)) {
        setMfaNeeded(true);
        setError(copy.codeRequired);
      } else {
        setError(copy.failed);
      }
    }
  }, [holder]);

  const dialog = pending
    ? <StepUpDialog mfaNeeded={mfaNeeded} error={error} onSubmit={submit} onClose={close} />
    : null;

  return { run, dialog };
}

function StepUpDialog({ mfaNeeded, error, onSubmit, onClose }: {
  mfaNeeded: boolean;
  error: string;
  onSubmit: (currentPassword: string, code: string) => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordId = useId();
  const codeId = useId();
  const codeHelpId = `${codeId}-help`;

  const confirm = async () => {
    if (!password || busy) return;
    setBusy(true);
    try { await onSubmit(password, code); }
    finally { setBusy(false); }
  };

  return (
    <LegacyModal labelledBy="step-up-dialog-title" onClose={onClose}>
      <div className="panel-heading">
        <h2 id="step-up-dialog-title" tabIndex={-1} data-modal-initial-focus>{copy.title}</h2>
        <button type="button" className="btn ghost sm" onClick={onClose}>{copy.cancel}</button>
      </div>
      <p className="sub">{copy.description}</p>
      <form onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
        <div className="field">
          <label htmlFor={passwordId}>{copy.password}</label>
          <div className="password-control">
            <input
              id={passwordId}
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              aria-pressed={passwordVisible}
              aria-label={passwordVisible ? appEnglish.auth.hidePassword : appEnglish.auth.showPassword}
              onClick={() => setPasswordVisible((current) => !current)}
            >
              {passwordVisible ? appEnglish.auth.hidePassword : appEnglish.auth.showPassword}
            </button>
          </div>
        </div>
        {mfaNeeded && (
          <div className="field">
            <label htmlFor={codeId}>{copy.codeLabel}</label>
            <input
              id={codeId}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-describedby={codeHelpId}
              value={code}
              disabled={busy}
              onChange={(event) => setCode(event.target.value)}
            />
            <small className="field-help" id={codeHelpId}>{copy.codeHelp}</small>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row end modal-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>{copy.cancel}</button>
          <button type="submit" className="btn accent" disabled={busy || !password}>{copy.confirm}</button>
        </div>
      </form>
    </LegacyModal>
  );
}
