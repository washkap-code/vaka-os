import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "./lib.js";
import type {
  AIAgentDefinition, AIAuditInput, AIEvidenceRecord, AIObjectRef, AITimelineEntry,
  AIContextReader, AIStore, AITimelineReader, PersistAISummaryInput, PersistedAISummary,
} from "./platform/ai/index.js";
import {
  getUniversalTimeline, resolveUniversalObjectType,
} from "./universal-timeline.js";

export class PostgresAIContextReader implements AIContextReader {
  async readObject(tenantId: string, objectRef: AIObjectRef): Promise<Record<string, unknown> | null> {
    if (objectRef.objectType === "Company") {
      const [row] = await db.select({
        companyName: schema.tenants.companyName,
        baseCurrency: schema.tenants.baseCurrency,
        countryCode: schema.tenants.countryCode,
        status: schema.tenants.status,
        invoicePaymentTerms: schema.tenants.invoicePaymentTerms,
      }).from(schema.tenants).where(and(
        eq(schema.tenants.id, tenantId),
        eq(schema.tenants.id, objectRef.objectId),
      ));
      return row ?? null;
    }
    if (objectRef.objectType === "Customer" || objectRef.objectType === "Supplier") {
      const [row] = await db.select({
        type: schema.contacts.type,
        name: schema.contacts.name,
        city: schema.contacts.city,
        region: schema.contacts.region,
        countryCode: schema.contacts.countryCode,
        website: schema.contacts.website,
        industry: schema.contacts.industry,
        tags: schema.contacts.tags,
        supplierCode: schema.contacts.supplierCode,
        supplierCurrency: schema.contacts.supplierCurrency,
        supplierPaymentTermsDays: schema.contacts.supplierPaymentTermsDays,
        supplierLeadTimeDays: schema.contacts.supplierLeadTimeDays,
      }).from(schema.contacts).where(and(
        eq(schema.contacts.tenantId, tenantId),
        eq(schema.contacts.id, objectRef.objectId),
        isNull(schema.contacts.deletedAt),
        objectRef.objectType === "Customer"
          ? eq(schema.contacts.isCustomer, true)
          : eq(schema.contacts.isVendor, true),
      ));
      return row ?? null;
    }
    if (objectRef.objectType === "Invoice") {
      const [row] = await db.select({
        number: schema.invoices.number,
        currency: schema.invoices.currency,
        rateToBase: schema.invoices.rateToBase,
        status: schema.invoices.status,
        issueDate: schema.invoices.issueDate,
        dueDate: schema.invoices.dueDate,
        taxJurisdiction: schema.invoices.taxJurisdiction,
        taxDate: schema.invoices.taxDate,
        taxTreatment: schema.invoices.taxTreatment,
        subtotal: schema.invoices.subtotal,
        taxTotal: schema.invoices.taxTotal,
        total: schema.invoices.total,
        amountPaid: schema.invoices.amountPaid,
      }).from(schema.invoices).where(and(
        eq(schema.invoices.tenantId, tenantId),
        eq(schema.invoices.id, objectRef.objectId),
      ));
      return row ?? null;
    }
    if (objectRef.objectType === "Payment") {
      const [row] = await db.select({
        amount: schema.payments.amount,
        currency: schema.payments.currency,
        date: schema.payments.date,
      }).from(schema.payments).where(and(
        eq(schema.payments.tenantId, tenantId),
        eq(schema.payments.id, objectRef.objectId),
      ));
      return row ?? null;
    }
    if (objectRef.objectType === "Product") {
      const [row] = await db.select({
        sku: schema.products.sku,
        name: schema.products.name,
        description: schema.products.description,
        unitOfMeasure: schema.products.unitOfMeasure,
        salePrice: schema.products.salePrice,
        currency: schema.products.currency,
        taxTreatment: schema.products.taxTreatment,
        reorderLevel: schema.products.reorderLevel,
        trackStock: schema.products.trackStock,
        isActive: schema.products.isActive,
      }).from(schema.products).where(and(
        eq(schema.products.tenantId, tenantId),
        eq(schema.products.id, objectRef.objectId),
      ));
      return row ?? null;
    }
    // Employee and User are deliberately absent: their registry definitions
    // are AI-hidden, so ContextAssemblyService rejects them before this adapter.
    return null;
  }
}

export class PostgresAITimelineReader implements AITimelineReader {
  async readTimeline(tenantId: string, objectRef: AIObjectRef): Promise<readonly AITimelineEntry[]> {
    const timeline = await getUniversalTimeline(
      tenantId,
      resolveUniversalObjectType(objectRef.objectType),
      objectRef.objectId,
      { page: 1, pageSize: 100 },
    );
    return timeline.entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      action: entry.action,
      occurredAt: entry.occurredAt,
      details: entry.details,
    }));
  }
}

export class PostgresAIStore implements AIStore {
  async agent(code: string): Promise<AIAgentDefinition | null> {
    const [row] = await db.select({
      code: schema.aiAgents.code,
      name: schema.aiAgents.name,
      purpose: schema.aiAgents.purpose,
      allowedTools: schema.aiAgents.allowedToolsJson,
      dataScopes: schema.aiAgents.dataScopesJson,
      requiresApprovalFor: schema.aiAgents.requiresApprovalForJson,
      active: schema.aiAgents.active,
    }).from(schema.aiAgents).where(eq(schema.aiAgents.code, code));
    return row ?? null;
  }

  async persistSummary(input: PersistAISummaryInput): Promise<PersistedAISummary> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [conversation] = await tx.insert(schema.aiConversations).values({
        tenantId: input.tenantId,
        userId: input.userId,
        agentCode: input.agentCode,
        title: input.title,
        startedAt: now,
        lastMessageAt: now,
      }).returning({ id: schema.aiConversations.id });
      const [userMessage] = await tx.insert(schema.aiMessages).values({
        conversationId: conversation.id,
        role: "user",
        content: input.userMessage,
        createdAt: now,
      }).returning({ id: schema.aiMessages.id });
      const [assistantMessage] = await tx.insert(schema.aiMessages).values({
        conversationId: conversation.id,
        role: "assistant",
        content: input.assistantMessage,
        createdAt: now,
      }).returning({ id: schema.aiMessages.id });
      // Retain the user-message insert as part of the same transaction. The
      // variable makes the two-message invariant explicit to TypeScript/tests.
      if (!userMessage.id) throw new Error("AI user message was not persisted");

      const evidenceRows = input.evidence.length
        ? await tx.insert(schema.aiEvidence).values(input.evidence.map((evidence) => ({
          messageId: assistantMessage.id,
          objectType: evidence.objectType,
          objectId: evidence.objectId,
          fieldNamesJson: [...evidence.fieldNames],
          snippet: evidence.snippet,
        }))).returning({
          id: schema.aiEvidence.id,
          messageId: schema.aiEvidence.messageId,
          objectType: schema.aiEvidence.objectType,
          objectId: schema.aiEvidence.objectId,
          fieldNames: schema.aiEvidence.fieldNamesJson,
          snippet: schema.aiEvidence.snippet,
        })
        : [];
      const evidence: AIEvidenceRecord[] = evidenceRows.map((row) => ({
        id: row.id,
        messageId: row.messageId,
        objectType: row.objectType,
        objectId: row.objectId,
        fieldNames: row.fieldNames,
        snippet: row.snippet,
      }));
      return { conversationId: conversation.id, messageId: assistantMessage.id, evidence };
    });
  }

  async recordAudit(input: AIAuditInput): Promise<void> {
    await db.insert(schema.aiAudit).values({
      tenantId: input.tenantId,
      userId: input.userId,
      agentCode: input.agentCode,
      action: input.action,
      promptHash: input.promptHash,
      model: input.model,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      evidenceCount: input.evidenceCount,
    });
  }
}
