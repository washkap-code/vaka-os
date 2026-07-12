import { describe, expect, it } from "vitest";
import { backupManifestInputSchema, runBackupJobAdapter } from "../backup-manifests.js";
import { BACKUP_MANIFEST_CONTRACT } from "../control-center.js";

const baseManifest = {
  manifestId: "backup-20260712-0001",
  contractVersion: BACKUP_MANIFEST_CONTRACT.version,
  environment: "production",
  startedAt: "2026-07-12T00:00:00.000Z",
  completedAt: "2026-07-12T00:12:00.000Z",
  status: "succeeded",
  databaseSnapshotRef: "dbsnap-prod-20260712-0001",
  objectSnapshotRef: "objsnap-prod-20260712-0001",
  checksum: "sha256:1234567890abcdef1234567890abcdef",
  encryptionRef: "kms-policy-prod-backup-v1",
  retentionExpiresAt: "2026-10-12T00:12:00.000Z",
  operator: "backup-service",
};

describe("backup manifest evidence validation", () => {
  it("accepts a safe opaque backup manifest evidence record", () => {
    const parsed = backupManifestInputSchema.parse(baseManifest);

    expect(parsed.manifestId).toBe("backup-20260712-0001");
    expect(parsed.completedAt > parsed.startedAt).toBe(true);
  });

  it("requires a failure reason for failed or partial backup manifests", () => {
    const result = backupManifestInputSchema.safeParse({ ...baseManifest, status: "partial" });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected validation to fail");
    expect(result.error.issues.some((issue) => issue.path.includes("failureReason"))).toBe(true);
  });

  it("rejects secret-bearing or URL-shaped snapshot references", () => {
    const result = backupManifestInputSchema.safeParse({
      ...baseManifest,
      databaseSnapshotRef: "https://storage.example/backup?sig=abc123",
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected validation to fail");
    expect(JSON.stringify(result.error.issues).toLowerCase()).toContain("opaque");
  });

  it("builds a validated manifest from an injected backup executor", async () => {
    const manifest = await runBackupJobAdapter({
      environment: "production",
      operator: "backup-service",
      retentionDays: 90,
      now: new Date("2026-07-12T00:00:00.000Z"),
      manifestId: "backup-production-20260712000000",
    }, {
      async createSnapshot() {
        return {
          status: "succeeded",
          databaseSnapshotRef: "dbsnap-prod-20260712-0001",
          checksum: "sha256:abcdef1234567890abcdef1234567890",
          encryptionRef: "kms-policy-prod-backup-v1",
        };
      },
    });

    expect(manifest.status).toBe("succeeded");
    expect(manifest.retentionExpiresAt.toISOString()).toBe("2026-10-10T00:00:00.001Z");
  });

  it("rejects unsafe output returned by an injected backup executor", async () => {
    await expect(runBackupJobAdapter({
      environment: "production",
      operator: "backup-service",
      retentionDays: 90,
      now: new Date("2026-07-12T00:00:00.000Z"),
    }, {
      async createSnapshot() {
        return {
          status: "succeeded",
          databaseSnapshotRef: "https://storage.example/backup?token=abc",
          checksum: "sha256:abcdef1234567890abcdef1234567890",
          encryptionRef: "kms-policy-prod-backup-v1",
        };
      },
    })).rejects.toThrow();
  });
});
