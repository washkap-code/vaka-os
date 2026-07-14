import { z } from "zod";
import { BACKUP_MANIFEST_CONTRACT } from "./control-center.js";

export const backupManifestInputSchema = z.object({
  manifestId: z.string().trim().min(8).max(120),
  contractVersion: z.string().trim().max(40).default(BACKUP_MANIFEST_CONTRACT.version),
  environment: z.string().trim().min(2).max(80),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date(),
  status: z.enum(["succeeded", "failed", "partial"]),
  databaseSnapshotRef: z.string().trim().min(6).max(240),
  objectSnapshotRef: z.string().trim().min(6).max(240).optional(),
  checksum: z.string().trim().min(16).max(180),
  encryptionRef: z.string().trim().min(6).max(160),
  retentionExpiresAt: z.coerce.date(),
  operator: z.string().trim().min(3).max(120),
  failureReason: z.string().trim().min(5).max(500).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
}).superRefine((value, ctx) => {
  if (value.completedAt <= value.startedAt) {
    ctx.addIssue({ code: "custom", path: ["completedAt"], message: "completedAt must be after startedAt" });
  }
  if (value.status !== "succeeded" && !value.failureReason) {
    ctx.addIssue({ code: "custom", path: ["failureReason"], message: "failureReason is required for failed or partial manifests" });
  }
  for (const issue of findUnsafeManifestStrings(value)) {
    ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  }
});

export type BackupManifestInput = z.infer<typeof backupManifestInputSchema>;

export type BackupJobSnapshotResult = {
  status: "succeeded" | "failed" | "partial";
  databaseSnapshotRef: string;
  objectSnapshotRef?: string;
  checksum: string;
  encryptionRef: string;
  failureReason?: string;
  metadata?: BackupManifestInput["metadata"];
};

export type BackupJobExecutor = {
  createSnapshot(input: { environment: string; operator: string; startedAt: Date }): Promise<BackupJobSnapshotResult>;
};

export type BackupJobRunInput = {
  environment: string;
  operator: string;
  retentionDays: number;
  now?: Date;
  manifestId?: string;
};

export async function runBackupJobAdapter(
  input: BackupJobRunInput,
  executor: BackupJobExecutor,
): Promise<BackupManifestInput> {
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 3660) {
    throw new Error("retentionDays must be an integer between 1 and 3660");
  }
  const startedAt = input.now ?? new Date();
  const snapshot = await executor.createSnapshot({
    environment: input.environment,
    operator: input.operator,
    startedAt,
  });
  const completedAt = new Date(startedAt.getTime() + 1);
  const manifestId = input.manifestId ?? `backup-${input.environment}-${startedAt.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
  const retentionExpiresAt = new Date(completedAt.getTime() + input.retentionDays * 86_400_000);

  return backupManifestInputSchema.parse({
    manifestId,
    contractVersion: BACKUP_MANIFEST_CONTRACT.version,
    environment: input.environment,
    startedAt,
    completedAt,
    status: snapshot.status,
    databaseSnapshotRef: snapshot.databaseSnapshotRef,
    objectSnapshotRef: snapshot.objectSnapshotRef,
    checksum: snapshot.checksum,
    encryptionRef: snapshot.encryptionRef,
    retentionExpiresAt,
    operator: input.operator,
    failureReason: snapshot.failureReason,
    metadata: snapshot.metadata,
  });
}

const secretPatterns = [
  /password\s*=/i,
  /token\s*=/i,
  /secret\s*=/i,
  /private[-_ ]?key/i,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /sig(nature)?=/i,
  /x-amz-signature/i,
  /:\/\/[^/\s]+:[^@\s]+@/,
];

const opaqueReferenceKeys = new Set([
  "databaseSnapshotRef", "objectSnapshotRef", "encryptionRef", "isolatedTargetRef",
]);

export function findUnsafeEvidenceStrings(value: unknown): Array<{ path: Array<string | number>; message: string }> {
  const issues: Array<{ path: Array<string | number>; message: string }> = [];
  const visit = (current: unknown, path: Array<string | number>) => {
    if (typeof current === "string") {
      if (secretPatterns.some((pattern) => pattern.test(current))) {
        issues.push({ path, message: "Manifest evidence must not contain credentials, tokens, private keys or signed URLs" });
      }
      const key = String(path[path.length - 1] ?? "");
      if (opaqueReferenceKeys.has(key) && /https?:\/\//i.test(current)) {
        issues.push({ path, message: "Snapshot and encryption references must be opaque non-secret references, not URLs" });
      }
      return;
    }
    if (Array.isArray(current)) current.forEach((item, index) => visit(item, [...path, index]));
    else if (current && typeof current === "object") {
      for (const [key, item] of Object.entries(current)) visit(item, [...path, key]);
    }
  };
  visit(value, []);
  return issues;
}

export function findUnsafeManifestStrings(value: BackupManifestInput): Array<{ path: Array<string | number>; message: string }> {
  return findUnsafeEvidenceStrings(value);
}
