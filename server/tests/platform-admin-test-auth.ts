import request from "supertest";

const PLATFORM_ADMIN_EMAIL = "washington@africaprocure.com";
const ROTATED_TEST_PASSWORDS = [
  "CI-Only-Replacement-Password-2026",
  "CI-Only-Replacement-Password-2026-Next",
  // restore-drill-evidence binds the shared principal to this test-only
  // credential; include it so fixture authentication is truly file-order safe.
  "Restore-Principal-Test-2026!",
] as const;

type TestApp = Parameters<typeof request>[0];

export const platformAdminTestPassword = process.env.PLATFORM_ADMIN_PASSWORD;

/**
 * Authenticate the shared platform-admin fixture without depending on test-file
 * order. The first test to use the temporary credential completes the forced
 * rotation; later files can reuse the deterministic test-only replacement.
 */
export async function loginPlatformAdminFixture(app: TestApp) {
  if (!platformAdminTestPassword) {
    throw new Error("PLATFORM_ADMIN_PASSWORD is required for the platform-admin fixture");
  }

  const candidates = [...new Set([platformAdminTestPassword, ...ROTATED_TEST_PASSWORDS])];
  const statuses: number[] = [];
  for (const password of candidates) {
    const login = await request(app).post("/api/v1/auth/login").send({
      email: PLATFORM_ADMIN_EMAIL,
      password,
    });
    statuses.push(login.status);
    if (login.status !== 200) continue;

    const auth = { Authorization: `Bearer ${login.body.token}` };
    let effectivePassword = password;
    if (login.body.user.mustChangePassword) {
      const replacement = ROTATED_TEST_PASSWORDS.find((candidate) => candidate !== password);
      if (!replacement) throw new Error("No distinct platform-admin test password is available");
      const changed = await request(app).post("/api/v1/auth/change-password").set(auth).send({
        currentPassword: password,
        newPassword: replacement,
      });
      if (changed.status !== 200) {
        throw new Error(`Platform-admin test password rotation failed with status ${changed.status}`);
      }
      effectivePassword = replacement;
    }

    return { auth, effectivePassword, login };
  }

  throw new Error(`Platform-admin fixture login failed with statuses: ${statuses.join(", ")}`);
}
