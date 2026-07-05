import { and, eq, gt, isNull, or } from "drizzle-orm";
import { audit, badRequest, conflict, db, DB, schema } from "./lib.js";

export type ReferralProgram = "GENERAL" | "PROFESSIONAL";
export type ReferralReviewDecision = "PENDING" | "QUALIFIED" | "REJECTED" | "HELD";

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{4,31}$/;

export function normalizeReferralCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    throw badRequest("Referral code is invalid or unavailable");
  }
  return code;
}

export async function createReferralCode(opts: {
  code: string;
  program: ReferralProgram;
  ruleVersion: string;
  referrerTenantId?: string | null;
  referrerUserId?: string | null;
  campaign?: string | null;
  expiresAt?: Date | null;
  createdBy: string;
}) {
  const code = normalizeReferralCode(opts.code);
  if (!opts.referrerTenantId && !opts.referrerUserId) {
    throw badRequest("A referral code must identify a referrer");
  }
  if (opts.expiresAt && opts.expiresAt <= new Date()) {
    throw badRequest("Referral code expiry must be in the future");
  }

  try {
    return await schemaReferralTransaction(async (tx) => {
      if (opts.referrerTenantId) {
        const [tenant] = await tx.select({ id: schema.tenants.id })
          .from(schema.tenants).where(eq(schema.tenants.id, opts.referrerTenantId));
        if (!tenant) throw badRequest("Referrer tenant not found");
      }

      if (opts.referrerUserId) {
        const [user] = await tx.select({
          id: schema.users.id,
          tenantId: schema.users.tenantId,
        }).from(schema.users).where(eq(schema.users.id, opts.referrerUserId));
        if (!user) throw badRequest("Referrer user not found");
        if (opts.referrerTenantId && user.tenantId !== opts.referrerTenantId) {
          throw badRequest("Referrer user does not belong to the referrer tenant");
        }
      }

      const [existing] = await tx.select({ id: schema.referralCodes.id })
        .from(schema.referralCodes).where(eq(schema.referralCodes.code, code));
      if (existing) throw conflict("Referral code already exists");

      const [created] = await tx.insert(schema.referralCodes).values({
        code,
        program: opts.program,
        ruleVersion: opts.ruleVersion,
        referrerTenantId: opts.referrerTenantId ?? null,
        referrerUserId: opts.referrerUserId ?? null,
        campaign: opts.campaign?.trim() || null,
        expiresAt: opts.expiresAt ?? null,
        createdBy: opts.createdBy,
      }).returning();
      return created;
    });
  } catch (error: unknown) {
    if (databaseErrorCode(error) === "23505") {
      throw conflict("Referral code already exists");
    }
    throw error;
  }
}

export async function captureReferralAttribution(
  tx: DB,
  opts: { referralCode: string; referredTenantId: string; ownerEmail: string },
) {
  const code = normalizeReferralCode(opts.referralCode);
  const now = new Date();
  const [referral] = await tx.select().from(schema.referralCodes).where(and(
    eq(schema.referralCodes.code, code),
    eq(schema.referralCodes.status, "active"),
    or(isNull(schema.referralCodes.expiresAt), gt(schema.referralCodes.expiresAt, now)),
  ));
  if (!referral) throw badRequest("Referral code is invalid or unavailable");

  if (referral.referrerUserId) {
    const [referrer] = await tx.select({ email: schema.users.email })
      .from(schema.users).where(eq(schema.users.id, referral.referrerUserId));
    if (referrer?.email.toLowerCase() === opts.ownerEmail.toLowerCase()) {
      throw badRequest("Referral code is invalid or unavailable");
    }
  }

  const [existing] = await tx.select({ id: schema.referralAttributions.id })
    .from(schema.referralAttributions)
    .where(eq(schema.referralAttributions.referredTenantId, opts.referredTenantId));
  if (existing) throw conflict("Referral attribution already captured");

  const [attribution] = await tx.insert(schema.referralAttributions).values({
    referredTenantId: opts.referredTenantId,
    referralCodeId: referral.id,
    program: referral.program,
    ruleVersion: referral.ruleVersion,
  }).returning();
  await tx.insert(schema.referralReviewEvents).values({
    referralAttributionId: attribution.id,
    decision: "PENDING",
    reasonCode: "AUTOMATED_CAPTURE",
  });
  return { attribution, referral };
}

export function validateReferralReview(opts: {
  decision: ReferralReviewDecision;
  reasonCode: string;
  notes?: string | null;
}) {
  const reasonCode = opts.reasonCode.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,49}$/.test(reasonCode)) {
    throw badRequest("A valid referral review reason code is required");
  }
  const notes = opts.notes?.trim() || null;
  if (notes && notes.length > 500) {
    throw badRequest("Referral review notes must be 500 characters or fewer");
  }
  return { decision: opts.decision, reasonCode, notes };
}

export async function recordReferralReview(opts: {
  referralAttributionId: string;
  decision: ReferralReviewDecision;
  reasonCode: string;
  notes?: string | null;
  actorUserId: string;
}) {
  const review = validateReferralReview(opts);
  return db.transaction(async (tx) => {
    const [attribution] = await tx.select().from(schema.referralAttributions)
      .where(eq(schema.referralAttributions.id, opts.referralAttributionId));
    if (!attribution) throw badRequest("Referral attribution not found");

    const [event] = await tx.insert(schema.referralReviewEvents).values({
      referralAttributionId: attribution.id,
      decision: review.decision,
      reasonCode: review.reasonCode,
      notes: review.notes,
      actorUserId: opts.actorUserId,
    }).returning();

    await audit(tx, attribution.referredTenantId, opts.actorUserId,
      "referral.review_recorded", "referral_attribution", attribution.id, {
        decision: review.decision,
        reasonCode: review.reasonCode,
      });
    return event;
  });
}

// Keeps code creation atomic without exposing transaction plumbing to routes.
const schemaReferralTransaction = <T>(work: (tx: DB) => Promise<T>) =>
  db.transaction(work);

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
