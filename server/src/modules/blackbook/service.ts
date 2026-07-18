import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import {
  badRequest, conflict, db, forbidden, notFound, schema, type DB,
} from "../../lib.js";
import type {
  ContactPointInput, EditorWrite, GovernmentServiceCategory, GovernmentServiceInput,
  OrganisationFilters, OrganisationInput, ServiceFilters,
} from "./types.js";

export const BLACKBOOK_EDITOR_PERMISSION = "blackbook:editor" as const;

type OrganisationRow = typeof schema.govOrganisations.$inferSelect;
type ContactPointRow = typeof schema.govContactPoints.$inferSelect;
type GovernmentServiceRow = typeof schema.govServices.$inferSelect;
type RevisionEntityType = typeof schema.blackbookRevisions.$inferInsert["entityType"];

function serialise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialise);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, serialise(item)]));
  }
  return value;
}

function snapshot(row: object): Record<string, unknown> {
  return serialise(row) as Record<string, unknown>;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function unchanged(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right);
}

function pattern(value: string): string {
  return `%${value.replace(/[%_\\]/g, "\\$&")}%`;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: unknown };
  return candidate.code === "23505" || isUniqueViolation(candidate.cause);
}

function organisationContent(row: OrganisationRow): OrganisationInput {
  return {
    orgType: row.orgType,
    name: row.name,
    acronym: row.acronym,
    parentOrgId: row.parentOrgId,
    country: row.country,
    description: row.description,
    website: row.website,
    status: row.status,
    verifiedAt: row.verifiedAt,
  };
}

function contactContent(row: ContactPointRow): ContactPointInput {
  return {
    type: row.type,
    label: row.label,
    value: row.value,
    region: row.region,
    verifiedAt: row.verifiedAt,
  };
}

function serviceContent(row: GovernmentServiceRow): GovernmentServiceInput {
  return {
    orgId: row.orgId,
    name: row.name,
    description: row.description,
    category: row.category,
    requirementsJson: (row.requirementsJson ?? null) as Record<string, unknown>[] | null,
    feesJson: (row.feesJson ?? null) as Record<string, unknown>[] | null,
    processingTime: row.processingTime,
    officialFormUrl: row.officialFormUrl,
    onlineServiceUrl: row.onlineServiceUrl,
    verifiedAt: row.verifiedAt,
  };
}

/** Null means unverified and therefore immediately due for editorial review. */
export function isReviewDue(verifiedAt: string | null, now = new Date()): boolean {
  if (!verifiedAt) return true;
  const cutoff = new Date(Date.UTC(
    now.getUTCFullYear() - 1,
    now.getUTCMonth(),
    now.getUTCDate(),
  )).toISOString().slice(0, 10);
  return verifiedAt < cutoff;
}

function reviewed<T extends { verifiedAt: string | null }>(row: T, now: Date) {
  return { ...row, review_due: isReviewDue(row.verifiedAt, now) };
}

async function recordRevision(
  tx: DB,
  input: {
    entityType: RevisionEntityType;
    entityId: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    actorUserId: string;
    reason: string;
  },
): Promise<void> {
  await tx.insert(schema.blackbookRevisions).values({
    entityType: input.entityType,
    entityId: input.entityId,
    beforeJson: input.before,
    afterJson: input.after,
    editorId: input.actorUserId,
    reason: input.reason,
  });
}

async function recordPlatformAudit(
  tx: DB,
  actorUserId: string,
  action: string,
  entityType: RevisionEntityType,
  entityId: string,
  reason: string,
): Promise<void> {
  await tx.insert(schema.platformAuditLogs).values({
    userId: actorUserId,
    action,
    metadata: { entityType, entityId, reason },
  });
}

export class BlackBookService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  private async assertEditor(tx: DB, actorUserId: string): Promise<void> {
    const [editor] = await tx.select({
      tenantId: schema.users.tenantId,
      isPlatformAdmin: schema.users.isPlatformAdmin,
      status: schema.users.status,
      permissions: schema.platformRoles.permissions,
    }).from(schema.users).leftJoin(
      schema.platformRoles,
      eq(schema.platformRoles.key, schema.users.platformRoleKey),
    ).where(eq(schema.users.id, actorUserId));
    if (editor?.tenantId !== null || !editor.isPlatformAdmin || editor.status !== "active"
      || !editor.permissions?.includes(BLACKBOOK_EDITOR_PERMISSION)) {
      throw forbidden("Black Book editor access required");
    }
  }

  private async assertParent(
    tx: DB,
    parentOrgId: string | null,
    country: string,
    entityId: string,
  ): Promise<void> {
    if (!parentOrgId) return;
    let cursor: string | null = parentOrgId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === entityId || seen.has(cursor)) throw conflict("Organisation hierarchy would contain a cycle");
      seen.add(cursor);
      const [parent] = await tx.select({
        id: schema.govOrganisations.id,
        parentOrgId: schema.govOrganisations.parentOrgId,
        country: schema.govOrganisations.country,
      }).from(schema.govOrganisations).where(eq(schema.govOrganisations.id, cursor));
      if (!parent) throw badRequest("Parent organisation does not exist");
      if (parent.country !== country) throw badRequest("Parent organisation must be in the same country");
      cursor = parent.parentOrgId;
    }
  }

  private async assertActiveOrganisation(tx: DB, orgId: string): Promise<OrganisationRow> {
    const [organisation] = await tx.select().from(schema.govOrganisations)
      .where(eq(schema.govOrganisations.id, orgId));
    if (!organisation) throw badRequest("Government organisation does not exist");
    if (organisation.status !== "active") throw conflict("Services and contacts require an active organisation");
    return organisation;
  }

  async listOrganisations(filters: OrganisationFilters) {
    const conditions: SQL[] = [eq(schema.govOrganisations.country, filters.country)];
    if (filters.type) conditions.push(eq(schema.govOrganisations.orgType, filters.type));
    if (filters.q) {
      const query = pattern(filters.q);
      conditions.push(or(
        ilike(schema.govOrganisations.name, query),
        ilike(schema.govOrganisations.acronym, query),
        ilike(schema.govOrganisations.description, query),
      )!);
    }
    const rows = await db.select().from(schema.govOrganisations)
      .where(and(...conditions))
      .orderBy(asc(schema.govOrganisations.name), asc(schema.govOrganisations.id));
    const now = this.now();
    return rows.map((row) => reviewed(row, now));
  }

  async getOrganisation(id: string) {
    const [organisation] = await db.select().from(schema.govOrganisations)
      .where(eq(schema.govOrganisations.id, id));
    if (!organisation) throw notFound("Government organisation not found");
    const [contacts, services, children] = await Promise.all([
      db.select().from(schema.govContactPoints).where(eq(schema.govContactPoints.orgId, id))
        .orderBy(asc(schema.govContactPoints.type), asc(schema.govContactPoints.label)),
      db.select().from(schema.govServices).where(eq(schema.govServices.orgId, id))
        .orderBy(asc(schema.govServices.name)),
      db.select().from(schema.govOrganisations).where(eq(schema.govOrganisations.parentOrgId, id))
        .orderBy(asc(schema.govOrganisations.name)),
    ]);
    const now = this.now();
    return {
      ...reviewed(organisation, now),
      contacts: contacts.map((contact) => reviewed(contact, now)),
      services: services.map((service) => reviewed(service, now)),
      children: children.map((child) => reviewed(child, now)),
    };
  }

  async listServices(filters: ServiceFilters) {
    const conditions: SQL[] = [
      eq(schema.govOrganisations.country, filters.country),
      eq(schema.govOrganisations.status, "active"),
    ];
    if (filters.category) conditions.push(eq(schema.govServices.category, filters.category));
    if (filters.q) {
      const query = pattern(filters.q);
      conditions.push(or(
        ilike(schema.govServices.name, query),
        ilike(schema.govServices.description, query),
        ilike(schema.govOrganisations.name, query),
      )!);
    }
    const rows = await db.select({
      service: schema.govServices,
      organisation: {
        id: schema.govOrganisations.id,
        name: schema.govOrganisations.name,
        acronym: schema.govOrganisations.acronym,
        country: schema.govOrganisations.country,
      },
    }).from(schema.govServices).innerJoin(
      schema.govOrganisations,
      eq(schema.govOrganisations.id, schema.govServices.orgId),
    ).where(and(...conditions))
      .orderBy(asc(schema.govServices.name), asc(schema.govServices.id));
    const now = this.now();
    return rows.map((row) => ({ ...reviewed(row.service, now), organisation: row.organisation }));
  }

  async upsertOrganisation(write: EditorWrite<OrganisationInput>) {
    try {
      return await db.transaction(async (tx) => {
        await this.assertEditor(tx, write.actorUserId);
        await this.assertParent(tx, write.input.parentOrgId, write.input.country, write.entityId);
        const [current] = await tx.select().from(schema.govOrganisations)
          .where(eq(schema.govOrganisations.id, write.entityId)).for("update");
        if (current && unchanged(organisationContent(current), write.input)) {
          return reviewed(current, this.now());
        }
        const now = this.now();
        let saved: OrganisationRow;
        if (!current) {
          [saved] = await tx.insert(schema.govOrganisations).values({
            id: write.entityId,
            ...write.input,
            updatedBy: write.actorUserId,
            updatedAt: now,
          }).returning();
        } else {
          [saved] = await tx.update(schema.govOrganisations).set({
            ...write.input,
            version: current.version + 1,
            updatedBy: write.actorUserId,
            updatedAt: now,
          }).where(eq(schema.govOrganisations.id, current.id)).returning();
        }
        await recordRevision(tx, {
          entityType: "organisation",
          entityId: saved.id,
          before: current ? snapshot(current) : null,
          after: snapshot(saved),
          actorUserId: write.actorUserId,
          reason: write.reason,
        });
        await recordPlatformAudit(
          tx,
          write.actorUserId,
          current ? "blackbook.organisation.updated" : "blackbook.organisation.created",
          "organisation",
          saved.id,
          write.reason,
        );
        return reviewed(saved, now);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("An organisation with this country and name already exists");
      throw error;
    }
  }

  async retireOrganisation(actorUserId: string, entityId: string, reason: string) {
    return db.transaction(async (tx) => {
      await this.assertEditor(tx, actorUserId);
      const [current] = await tx.select().from(schema.govOrganisations)
        .where(eq(schema.govOrganisations.id, entityId)).for("update");
      if (!current) throw notFound("Government organisation not found");
      if (current.status === "dissolved") return { retired: true, organisation: reviewed(current, this.now()) };
      const now = this.now();
      const [saved] = await tx.update(schema.govOrganisations).set({
        status: "dissolved",
        version: current.version + 1,
        updatedBy: actorUserId,
        updatedAt: now,
      }).where(eq(schema.govOrganisations.id, current.id)).returning();
      await recordRevision(tx, {
        entityType: "organisation", entityId, before: snapshot(current), after: snapshot(saved),
        actorUserId, reason,
      });
      await recordPlatformAudit(tx, actorUserId, "blackbook.organisation.retired", "organisation", entityId, reason);
      return { retired: true, organisation: reviewed(saved, now) };
    });
  }

  async upsertContactPoint(
    orgId: string,
    write: EditorWrite<ContactPointInput>,
  ) {
    return db.transaction(async (tx) => {
      await this.assertEditor(tx, write.actorUserId);
      await this.assertActiveOrganisation(tx, orgId);
      const [current] = await tx.select().from(schema.govContactPoints)
        .where(eq(schema.govContactPoints.id, write.entityId)).for("update");
      if (current && current.orgId !== orgId) throw notFound("Government contact point not found");
      if (current && unchanged(contactContent(current), write.input)) return reviewed(current, this.now());
      let saved: ContactPointRow;
      if (!current) {
        [saved] = await tx.insert(schema.govContactPoints).values({
          id: write.entityId, orgId, ...write.input,
        }).returning();
      } else {
        [saved] = await tx.update(schema.govContactPoints).set(write.input)
          .where(eq(schema.govContactPoints.id, current.id)).returning();
      }
      await recordRevision(tx, {
        entityType: "contact_point", entityId: saved.id,
        before: current ? snapshot(current) : null, after: snapshot(saved),
        actorUserId: write.actorUserId, reason: write.reason,
      });
      await recordPlatformAudit(
        tx, write.actorUserId,
        current ? "blackbook.contact_point.updated" : "blackbook.contact_point.created",
        "contact_point", saved.id, write.reason,
      );
      return reviewed(saved, this.now());
    });
  }

  async deleteContactPoint(actorUserId: string, entityId: string, reason: string) {
    return db.transaction(async (tx) => {
      await this.assertEditor(tx, actorUserId);
      const [current] = await tx.select().from(schema.govContactPoints)
        .where(eq(schema.govContactPoints.id, entityId)).for("update");
      if (!current) throw notFound("Government contact point not found");
      await tx.delete(schema.govContactPoints).where(eq(schema.govContactPoints.id, entityId));
      await recordRevision(tx, {
        entityType: "contact_point", entityId, before: snapshot(current), after: null,
        actorUserId, reason,
      });
      await recordPlatformAudit(tx, actorUserId, "blackbook.contact_point.deleted", "contact_point", entityId, reason);
      return { deleted: true, id: entityId };
    });
  }

  async upsertService(write: EditorWrite<GovernmentServiceInput>) {
    try {
      return await db.transaction(async (tx) => {
        await this.assertEditor(tx, write.actorUserId);
        await this.assertActiveOrganisation(tx, write.input.orgId);
        const [current] = await tx.select().from(schema.govServices)
          .where(eq(schema.govServices.id, write.entityId)).for("update");
        if (current && unchanged(serviceContent(current), write.input)) return reviewed(current, this.now());
        let saved: GovernmentServiceRow;
        if (!current) {
          [saved] = await tx.insert(schema.govServices).values({
            id: write.entityId, ...write.input,
          }).returning();
        } else {
          [saved] = await tx.update(schema.govServices).set(write.input)
            .where(eq(schema.govServices.id, current.id)).returning();
        }
        await recordRevision(tx, {
          entityType: "service", entityId: saved.id,
          before: current ? snapshot(current) : null, after: snapshot(saved),
          actorUserId: write.actorUserId, reason: write.reason,
        });
        await recordPlatformAudit(
          tx, write.actorUserId,
          current ? "blackbook.service.updated" : "blackbook.service.created",
          "service", saved.id, write.reason,
        );
        return reviewed(saved, this.now());
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("This organisation already has a service with that name");
      throw error;
    }
  }

  async deleteService(actorUserId: string, entityId: string, reason: string) {
    return db.transaction(async (tx) => {
      await this.assertEditor(tx, actorUserId);
      const [current] = await tx.select().from(schema.govServices)
        .where(eq(schema.govServices.id, entityId)).for("update");
      if (!current) throw notFound("Government service not found");
      await tx.delete(schema.govServices).where(eq(schema.govServices.id, entityId));
      await recordRevision(tx, {
        entityType: "service", entityId, before: snapshot(current), after: null,
        actorUserId, reason,
      });
      await recordPlatformAudit(tx, actorUserId, "blackbook.service.deleted", "service", entityId, reason);
      return { deleted: true, id: entityId };
    });
  }

  async listRevisions(entityType: RevisionEntityType, entityId: string) {
    return db.select().from(schema.blackbookRevisions).where(and(
      eq(schema.blackbookRevisions.entityType, entityType),
      eq(schema.blackbookRevisions.entityId, entityId),
    )).orderBy(desc(schema.blackbookRevisions.revisedAt), desc(schema.blackbookRevisions.id));
  }
}

const defaultBlackBookService = new BlackBookService();

/** Internal compliance lookup: current services from active organisations only. */
export function lookupService(category: GovernmentServiceCategory, country: string) {
  return defaultBlackBookService.listServices({ category, country });
}

export { defaultBlackBookService };
