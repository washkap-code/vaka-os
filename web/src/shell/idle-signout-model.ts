export type IdleSignOutPhase = "ACTIVE" | "WARNING" | "EXPIRED";

export const normalizeIdleSignOutMinutes = (minutes: number): number =>
  Math.min(480, Math.max(5, Number.isFinite(minutes) ? Math.trunc(minutes) : 5));

export const idleSignOutPhase = (deadlineMs: number, nowMs: number): IdleSignOutPhase => {
  const remaining = deadlineMs - nowMs;
  if (remaining <= 0) return "EXPIRED";
  if (remaining <= 60_000) return "WARNING";
  return "ACTIVE";
};
