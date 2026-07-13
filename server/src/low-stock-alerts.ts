import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./lib.js";
import type { EventBusContract } from "./platform/events/interfaces.js";
import { DOMAIN_EVENTS, type DomainEventPayloads } from "./platform/events/registry.js";
import type { NotificationServiceContract } from "./platform/notifications/interfaces.js";

type AlertDecision = {
  tenantId: string;
  productId: string;
  sku: string;
  name: string;
  onHand: string;
  threshold: number;
  breachSequence: number;
  actorUserId: string | null;
};

type AggregateRow = { on_hand: string; is_low: boolean };

export interface LowStockAlertCoordinatorContract {
  evaluate(tenantId: string, productId: string, actorUserId?: string | null): Promise<void>;
}

export class LowStockAlertCoordinator implements LowStockAlertCoordinatorContract {
  constructor(private readonly notifications: NotificationServiceContract) {}

  private async decide(tenantId: string, productId: string, actorUserId: string | null): Promise<AlertDecision | null> {
    return db.transaction(async (tx) => {
      const [product] = await tx.select({
        id: schema.products.id,
        sku: schema.products.sku,
        name: schema.products.name,
        reorderLevel: schema.products.reorderLevel,
        trackStock: schema.products.trackStock,
        isActive: schema.products.isActive,
      }).from(schema.products).where(and(
        eq(schema.products.tenantId, tenantId), eq(schema.products.id, productId),
      ));
      if (!product) return null;

      const aggregateResult = await tx.execute(sql`
        SELECT
          COALESCE(SUM(sl.quantity_on_hand), 0)::numeric(12,3)::text AS on_hand,
          COALESCE(SUM(sl.quantity_on_hand), 0) <= ${product.reorderLevel}::numeric AS is_low
        FROM stock_levels sl
        INNER JOIN warehouses w ON w.id = sl.warehouse_id AND w.tenant_id = ${tenantId}
        WHERE sl.product_id = ${productId}
      `);
      const aggregate = aggregateResult.rows[0] as AggregateRow | undefined;
      const onHand = aggregate?.on_hand ?? "0.000";
      const enabled = product.isActive && product.trackStock && product.reorderLevel > 0;
      const isLow = enabled && Boolean(aggregate?.is_low);

      await tx.insert(schema.lowStockAlertStates).values({ tenantId, productId })
        .onConflictDoNothing({ target: [schema.lowStockAlertStates.tenantId, schema.lowStockAlertStates.productId] });
      await tx.execute(sql`SELECT id FROM low_stock_alert_states
        WHERE tenant_id = ${tenantId} AND product_id = ${productId} FOR UPDATE`);
      const [state] = await tx.select().from(schema.lowStockAlertStates).where(and(
        eq(schema.lowStockAlertStates.tenantId, tenantId), eq(schema.lowStockAlertStates.productId, productId),
      ));
      if (!state) throw new Error("Low-stock state could not be initialized");

      const now = new Date();
      if (!isLow) {
        await tx.update(schema.lowStockAlertStates).set({
          state: "HEALTHY",
          lastObservedQuantity: onHand,
          threshold: product.reorderLevel,
          notificationPending: false,
          lastTransitionAt: state.state === "LOW" ? now : state.lastTransitionAt,
          updatedAt: now,
        }).where(eq(schema.lowStockAlertStates.id, state.id));
        return null;
      }

      const transitioned = state.state !== "LOW";
      const breachSequence = transitioned ? state.breachSequence + 1 : state.breachSequence;
      const notificationPending = transitioned || state.notificationPending;
      await tx.update(schema.lowStockAlertStates).set({
        state: "LOW",
        lastObservedQuantity: onHand,
        threshold: product.reorderLevel,
        breachSequence,
        notificationPending,
        lastTransitionAt: transitioned ? now : state.lastTransitionAt,
        updatedAt: now,
      }).where(eq(schema.lowStockAlertStates.id, state.id));
      return notificationPending ? {
        tenantId, productId, sku: product.sku, name: product.name, onHand,
        threshold: product.reorderLevel, breachSequence, actorUserId,
      } : null;
    });
  }

  private async activeRecipients(tenantId: string): Promise<string[]> {
    const rows = await db.select({ id: schema.users.id }).from(schema.users).innerJoin(schema.roles, and(
      eq(schema.roles.id, schema.users.roleId), eq(schema.roles.tenantId, tenantId),
    )).where(and(
      eq(schema.users.tenantId, tenantId),
      eq(schema.users.status, "active"),
      sql`${schema.roles.permissions} @> ARRAY['inventory.write']::text[]`,
    ));
    return rows.map((row) => row.id);
  }

  async evaluate(tenantId: string, productId: string, actorUserId: string | null = null): Promise<void> {
    const decision = await this.decide(tenantId, productId, actorUserId);
    if (!decision) return;
    const [current] = await db.select({
      state: schema.lowStockAlertStates.state,
      breachSequence: schema.lowStockAlertStates.breachSequence,
      notificationPending: schema.lowStockAlertStates.notificationPending,
    }).from(schema.lowStockAlertStates).where(and(
      eq(schema.lowStockAlertStates.tenantId, tenantId),
      eq(schema.lowStockAlertStates.productId, productId),
    ));
    if (!current || current.state !== "LOW" || !current.notificationPending
      || current.breachSequence !== decision.breachSequence) return;

    const recipients = await this.activeRecipients(tenantId);
    if (!recipients.length) return;
    for (const recipient of recipients) {
      const identity = `low-stock:${tenantId}:${productId}:${decision.breachSequence}:${recipient}`;
      await this.notifications.send({
        id: identity,
        tenantId,
        actorUserId,
        recipient,
        channel: "IN_APP",
        template: "inventory.low_stock",
        locale: "en-ZW",
        variables: {
          productId,
          sku: decision.sku,
          name: decision.name,
          onHand: decision.onHand,
          threshold: String(decision.threshold),
        },
        dedupeKey: identity,
      });
    }
    await db.update(schema.lowStockAlertStates).set({
      notificationPending: false,
      lastNotifiedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(schema.lowStockAlertStates.tenantId, tenantId),
      eq(schema.lowStockAlertStates.productId, productId),
      eq(schema.lowStockAlertStates.state, "LOW"),
      eq(schema.lowStockAlertStates.breachSequence, decision.breachSequence),
    ));
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function subscribeLowStockAlerts(bus: EventBusContract, coordinator: LowStockAlertCoordinatorContract): void {
  const evaluate = (event: { tenantId: string | null; actorUserId?: string | null }, productId: string) => {
    if (event.tenantId && UUID.test(event.tenantId) && UUID.test(productId)) {
      return coordinator.evaluate(event.tenantId, productId, event.actorUserId ?? null);
    }
  };
  bus.subscribe<DomainEventPayloads["stock.moved"]>(DOMAIN_EVENTS.STOCK_MOVED, (event) =>
    evaluate(event, event.payload.productId));
  bus.subscribe<DomainEventPayloads["stock.adjusted"]>(DOMAIN_EVENTS.STOCK_ADJUSTED, (event) =>
    evaluate(event, event.payload.productId));
  bus.subscribe<DomainEventPayloads["product.changed"]>(DOMAIN_EVENTS.PRODUCT_CHANGED, (event) => {
    return evaluate(event, event.payload.productId);
  });
}
