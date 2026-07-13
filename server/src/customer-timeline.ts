import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema, toCents, type DB } from "./lib.js";
import type { EventBusContract } from "./platform/events/interfaces.js";
import { DOMAIN_EVENTS, type DomainEventPayloads } from "./platform/events/registry.js";

export const timelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(512).optional(),
}).strict();

export type CustomerTimelineKind =
  | "activity.recorded"
  | "invoice.issued"
  | "invoice.voided"
  | "payment.recorded";

type TimelineCursor = { v: 1; occurredAt: string; id: string };
type Projection = {
  tenantId: string;
  contactId: string;
  eventKind: CustomerTimelineKind;
  sourceType: "activity" | "invoice" | "payment";
  sourceId: string;
  occurredAt: Date;
  actorUserId: string | null;
};

export type CustomerTimelineItem = {
  id: string;
  kind: CustomerTimelineKind;
  occurredAt: string;
  actorUserId: string | null;
  sourceId: string;
  detail:
    | { type: "activity"; activityType: string; body: string; dueAt: string | null; completedAt: string | null }
    | { type: "invoice"; number: string | null; status: string; currency: "USD" | "ZWG"; totalCents: string }
    | { type: "payment"; amountCents: string; currency: "USD" | "ZWG"; reference: string | null; invoiceId: string; invoiceNumber: string | null };
};

const cursorSchema = z.object({
  v: z.literal(1), occurredAt: z.string().datetime(), id: z.string().uuid(),
}).strict();

function decodeCursor(value: string | undefined): TimelineCursor | null {
  if (!value) return null;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new Error("INVALID_TIMELINE_CURSOR");
  }
}

function encodeCursor(row: typeof schema.customerTimelineEvents.$inferSelect): string {
  return Buffer.from(JSON.stringify({ v: 1, occurredAt: row.occurredAt.toISOString(), id: row.id }), "utf8").toString("base64url");
}

async function project(tx: DB, value: Projection): Promise<void> {
  await tx.insert(schema.customerTimelineEvents).values(value).onConflictDoUpdate({
    target: [schema.customerTimelineEvents.tenantId, schema.customerTimelineEvents.eventKind, schema.customerTimelineEvents.sourceId],
    set: {
      contactId: value.contactId,
      sourceType: value.sourceType,
      occurredAt: value.occurredAt,
      actorUserId: value.actorUserId,
      projectedAt: new Date(),
    },
  });
}

export interface CustomerTimelineProjectorContract {
  projectActivity(tenantId: string, activityId: string): Promise<void>;
  projectInvoice(tenantId: string, invoiceId: string, kind: "invoice.issued" | "invoice.voided", occurredAt?: Date, actorUserId?: string | null): Promise<void>;
  projectPayment(tenantId: string, paymentId: string): Promise<void>;
  reconcileCustomer(tenantId: string, contactId: string): Promise<void>;
}

export class CustomerTimelineProjector implements CustomerTimelineProjectorContract {
  async projectActivity(tenantId: string, activityId: string): Promise<void> {
    const [row] = await db.select({
      id: schema.activities.id, contactId: schema.activities.contactId,
      createdAt: schema.activities.createdAt, ownerUserId: schema.activities.ownerUserId,
    }).from(schema.activities).innerJoin(schema.contacts, and(
      eq(schema.contacts.id, schema.activities.contactId),
      eq(schema.contacts.tenantId, tenantId),
      eq(schema.contacts.isCustomer, true),
    )).where(and(eq(schema.activities.tenantId, tenantId), eq(schema.activities.id, activityId)));
    if (!row) return;
    await project(db, {
      tenantId, contactId: row.contactId, eventKind: "activity.recorded", sourceType: "activity",
      sourceId: row.id, occurredAt: row.createdAt, actorUserId: row.ownerUserId ?? null,
    });
  }

  async projectInvoice(
    tenantId: string,
    invoiceId: string,
    kind: "invoice.issued" | "invoice.voided",
    occurredAt?: Date,
    actorUserId: string | null = null,
  ): Promise<void> {
    const [row] = await db.select({
      id: schema.invoices.id, contactId: schema.invoices.contactId,
      issueDate: schema.invoices.issueDate, createdAt: schema.invoices.createdAt,
    }).from(schema.invoices).innerJoin(schema.contacts, and(
      eq(schema.contacts.id, schema.invoices.contactId),
      eq(schema.contacts.tenantId, tenantId),
      eq(schema.contacts.isCustomer, true),
    )).where(and(eq(schema.invoices.tenantId, tenantId), eq(schema.invoices.id, invoiceId)));
    if (!row || (kind === "invoice.issued" && !row.issueDate)) return;
    await project(db, {
      tenantId, contactId: row.contactId, eventKind: kind, sourceType: "invoice", sourceId: row.id,
      occurredAt: occurredAt ?? row.issueDate ?? row.createdAt, actorUserId,
    });
  }

  async projectPayment(tenantId: string, paymentId: string): Promise<void> {
    const [row] = await db.select({
      id: schema.payments.id, date: schema.payments.date, createdBy: schema.payments.createdBy,
      contactId: schema.invoices.contactId,
    }).from(schema.payments).innerJoin(schema.invoices, and(
      eq(schema.invoices.id, schema.payments.invoiceId), eq(schema.invoices.tenantId, tenantId),
    )).innerJoin(schema.contacts, and(
      eq(schema.contacts.id, schema.invoices.contactId),
      eq(schema.contacts.tenantId, tenantId),
      eq(schema.contacts.isCustomer, true),
    )).where(and(eq(schema.payments.tenantId, tenantId), eq(schema.payments.id, paymentId)));
    if (!row) return;
    await project(db, {
      tenantId, contactId: row.contactId, eventKind: "payment.recorded", sourceType: "payment",
      sourceId: row.id, occurredAt: row.date, actorUserId: row.createdBy ?? null,
    });
  }

  async reconcileCustomer(tenantId: string, contactId: string): Promise<void> {
    const [contact] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(and(
      eq(schema.contacts.tenantId, tenantId), eq(schema.contacts.id, contactId), eq(schema.contacts.isCustomer, true),
    ));
    if (!contact) return;
    await db.transaction(async (tx) => {
      const activities = await tx.select().from(schema.activities).where(and(
        eq(schema.activities.tenantId, tenantId), eq(schema.activities.contactId, contactId),
      ));
      const invoices = await tx.select().from(schema.invoices).where(and(
        eq(schema.invoices.tenantId, tenantId), eq(schema.invoices.contactId, contactId),
      ));
      const payments = await tx.select({
        id: schema.payments.id, date: schema.payments.date, createdBy: schema.payments.createdBy,
      }).from(schema.payments).innerJoin(schema.invoices, and(
        eq(schema.invoices.id, schema.payments.invoiceId),
        eq(schema.invoices.tenantId, tenantId),
        eq(schema.invoices.contactId, contactId),
      )).where(eq(schema.payments.tenantId, tenantId));
      const invoiceAudits = await tx.select().from(schema.auditLogs).where(and(
        eq(schema.auditLogs.tenantId, tenantId), inArray(schema.auditLogs.action, ["invoice.issued", "invoice.voided"]),
        eq(schema.auditLogs.entityType, "invoice"),
      ));
      const issueAudits = new Map(invoiceAudits.filter((row) => row.action === "invoice.issued").map((row) => [row.entityId, row]));
      const voidAudits = new Map(invoiceAudits.filter((row) => row.action === "invoice.voided").map((row) => [row.entityId, row]));
      for (const activity of activities) await project(tx, {
        tenantId, contactId, eventKind: "activity.recorded", sourceType: "activity", sourceId: activity.id,
        occurredAt: activity.createdAt, actorUserId: activity.ownerUserId ?? null,
      });
      for (const invoice of invoices) {
        if (invoice.issueDate) await project(tx, {
          tenantId, contactId, eventKind: "invoice.issued", sourceType: "invoice", sourceId: invoice.id,
          occurredAt: invoice.issueDate, actorUserId: issueAudits.get(invoice.id)?.userId ?? invoice.createdBy ?? null,
        });
        const voidAudit = invoice.status === "VOID" ? voidAudits.get(invoice.id) : null;
        if (voidAudit) await project(tx, {
          tenantId, contactId, eventKind: "invoice.voided", sourceType: "invoice", sourceId: invoice.id,
          occurredAt: voidAudit.createdAt, actorUserId: voidAudit.userId ?? null,
        });
      }
      for (const payment of payments) await project(tx, {
        tenantId, contactId, eventKind: "payment.recorded", sourceType: "payment", sourceId: payment.id,
        occurredAt: payment.date, actorUserId: payment.createdBy ?? null,
      });
    });
  }
}

async function hydrate(row: typeof schema.customerTimelineEvents.$inferSelect): Promise<CustomerTimelineItem | null> {
  const base = {
    id: row.id, kind: row.eventKind as CustomerTimelineKind, occurredAt: row.occurredAt.toISOString(),
    actorUserId: row.actorUserId, sourceId: row.sourceId,
  };
  if (row.sourceType === "activity") {
    const [activity] = await db.select().from(schema.activities).where(and(
      eq(schema.activities.tenantId, row.tenantId), eq(schema.activities.contactId, row.contactId),
      eq(schema.activities.id, row.sourceId),
    ));
    return activity ? { ...base, detail: {
      type: "activity", activityType: activity.type, body: activity.body,
      dueAt: activity.dueAt?.toISOString() ?? null, completedAt: activity.completedAt?.toISOString() ?? null,
    } } : null;
  }
  if (row.sourceType === "invoice") {
    const [invoice] = await db.select().from(schema.invoices).where(and(
      eq(schema.invoices.tenantId, row.tenantId), eq(schema.invoices.contactId, row.contactId),
      eq(schema.invoices.id, row.sourceId),
    ));
    return invoice ? { ...base, detail: {
      type: "invoice", number: invoice.number, status: invoice.status,
      currency: invoice.currency, totalCents: toCents(invoice.total).toString(),
    } } : null;
  }
  const [payment] = await db.select({
    amount: schema.payments.amount, currency: schema.payments.currency, reference: schema.payments.reference,
    invoiceId: schema.invoices.id, invoiceNumber: schema.invoices.number,
  }).from(schema.payments).innerJoin(schema.invoices, and(
    eq(schema.invoices.id, schema.payments.invoiceId), eq(schema.invoices.tenantId, row.tenantId),
    eq(schema.invoices.contactId, row.contactId),
  )).where(and(eq(schema.payments.tenantId, row.tenantId), eq(schema.payments.id, row.sourceId)));
  return payment ? { ...base, detail: {
    type: "payment", amountCents: toCents(payment.amount).toString(), currency: payment.currency,
    reference: payment.reference, invoiceId: payment.invoiceId, invoiceNumber: payment.invoiceNumber,
  } } : null;
}

export async function getCustomerTimeline(input: {
  tenantId: string; contactId: string; limit: number; cursor?: string;
}): Promise<{ items: CustomerTimelineItem[]; nextCursor: string | null }> {
  const cursor = decodeCursor(input.cursor);
  const cursorCondition = cursor ? or(
    lt(schema.customerTimelineEvents.occurredAt, new Date(cursor.occurredAt)),
    and(
      eq(schema.customerTimelineEvents.occurredAt, new Date(cursor.occurredAt)),
      lt(schema.customerTimelineEvents.id, cursor.id),
    ),
  ) : undefined;
  const rows = await db.select().from(schema.customerTimelineEvents).where(and(
    eq(schema.customerTimelineEvents.tenantId, input.tenantId),
    eq(schema.customerTimelineEvents.contactId, input.contactId),
    cursorCondition,
  )).orderBy(desc(schema.customerTimelineEvents.occurredAt), desc(schema.customerTimelineEvents.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const hydrated = (await Promise.all(page.map(hydrate))).filter((item): item is CustomerTimelineItem => item !== null);
  return { items: hydrated, nextCursor: rows.length > input.limit ? encodeCursor(page[page.length - 1]) : null };
}

export function subscribeCustomerTimeline(bus: EventBusContract, projector: CustomerTimelineProjectorContract): void {
  bus.subscribe<DomainEventPayloads["activity.recorded"]>(DOMAIN_EVENTS.ACTIVITY_RECORDED, (event) =>
    projector.projectActivity(event.tenantId ?? "", event.payload.activityId));
  bus.subscribe<DomainEventPayloads["invoice.issued"]>(DOMAIN_EVENTS.INVOICE_ISSUED, (event) =>
    projector.projectInvoice(event.tenantId ?? "", event.payload.invoiceId, "invoice.issued", undefined, event.actorUserId ?? null));
  bus.subscribe<DomainEventPayloads["invoice.voided"]>(DOMAIN_EVENTS.INVOICE_VOIDED, (event) =>
    projector.projectInvoice(event.tenantId ?? "", event.payload.invoiceId, "invoice.voided", event.occurredAt, event.actorUserId ?? null));
  bus.subscribe<DomainEventPayloads["payment.recorded"]>(DOMAIN_EVENTS.PAYMENT_RECORDED, (event) =>
    projector.projectPayment(event.tenantId ?? "", event.payload.paymentId));
}
