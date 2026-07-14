import { randomUUID } from "node:crypto";
import type { DomainEventInput } from "./platform/events/registry.js";
import { DOMAIN_EVENTS } from "./platform/events/registry.js";

export type PartyRoleChange = "created" | "updated" | "imported" | "bulk-updated" | "removed";

type PartyRoles = { isCustomer: boolean; isVendor: boolean };

export function queuePartyRoleEvents(
  queue: (event: DomainEventInput) => void,
  opts: {
    tenantId: string;
    actorUserId: string;
    contactId: string;
    change: PartyRoleChange;
    before?: PartyRoles | null;
    after?: PartyRoles | null;
  },
): void {
  const customerAffected = Boolean(opts.before?.isCustomer || opts.after?.isCustomer);
  const supplierAffected = Boolean(opts.before?.isVendor || opts.after?.isVendor);
  if (customerAffected) {
    queue({
      id: `${DOMAIN_EVENTS.CUSTOMER_CHANGED}:${opts.contactId}:${opts.change}:${randomUUID()}`,
      type: DOMAIN_EVENTS.CUSTOMER_CHANGED,
      tenantId: opts.tenantId,
      actorUserId: opts.actorUserId,
      payload: { customerId: opts.contactId, change: opts.change },
    });
  }
  if (supplierAffected) {
    queue({
      id: `${DOMAIN_EVENTS.SUPPLIER_CHANGED}:${opts.contactId}:${opts.change}:${randomUUID()}`,
      type: DOMAIN_EVENTS.SUPPLIER_CHANGED,
      tenantId: opts.tenantId,
      actorUserId: opts.actorUserId,
      payload: { supplierId: opts.contactId, change: opts.change },
    });
  }
}
