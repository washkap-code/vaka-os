import { and, desc, eq } from "drizzle-orm";
import { audit, db, notFound, schema } from "./lib.js";
import type { FinanceDeliveryLocale } from "./finance-delivery-catalogues.js";

export type EmailPreferenceStatus = "CONSENTED" | "OPTED_OUT";
export type EmailPreferenceSource = "CUSTOMER_REQUEST" | "CONTRACT" | "LEGITIMATE_INTEREST" | "OTHER";

export async function latestEmailPreference(tenantId: string, contactId: string) {
  const [preference] = await db.select().from(schema.contactCommunicationPreferenceEvents).where(and(
    eq(schema.contactCommunicationPreferenceEvents.tenantId, tenantId),
    eq(schema.contactCommunicationPreferenceEvents.contactId, contactId),
    eq(schema.contactCommunicationPreferenceEvents.channel, "EMAIL"),
  )).orderBy(
    desc(schema.contactCommunicationPreferenceEvents.createdAt),
    desc(schema.contactCommunicationPreferenceEvents.id),
  ).limit(1);
  return preference ?? null;
}

export async function recordEmailPreference(opts: {
  tenantId: string;
  contactId: string;
  actorUserId: string;
  status: EmailPreferenceStatus;
  locale: FinanceDeliveryLocale;
  evidenceSource: EmailPreferenceSource;
  reason?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [contact] = await tx.select({ id: schema.contacts.id }).from(schema.contacts).where(and(
      eq(schema.contacts.id, opts.contactId),
      eq(schema.contacts.tenantId, opts.tenantId),
    ));
    if (!contact) throw notFound("Contact not found");
    const [preference] = await tx.insert(schema.contactCommunicationPreferenceEvents).values({
      tenantId: opts.tenantId,
      contactId: contact.id,
      channel: "EMAIL",
      status: opts.status,
      locale: opts.locale,
      evidenceSource: opts.evidenceSource,
      reason: opts.reason?.trim() || null,
      actorUserId: opts.actorUserId,
    }).returning();
    await audit(tx, opts.tenantId, opts.actorUserId, "contact.email_preference_recorded", "contact", contact.id, {
      preferenceEventId: preference.id,
      status: preference.status,
      locale: preference.locale,
      evidenceSource: preference.evidenceSource,
      reasonProvided: Boolean(preference.reason),
    });
    return preference;
  });
}
