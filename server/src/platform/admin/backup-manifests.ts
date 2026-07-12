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

const opaqueReferenceKeys = new Set(["databaseSnapshotRef", "objectSnapshotRef", "encryptionRef"]);

export function findUnsafeManifestStrings(value: BackupManifestInput): Array<{ path: Array<string | number>; message: string }> {
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
