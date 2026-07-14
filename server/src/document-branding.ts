import { eq } from "drizzle-orm";
import { db, schema } from "./lib.js";
import type { ReportBranding } from "./report-pdf.js";

export const VAKA_DOCUMENT_FOOTER = "Powered by VAKA OS  |  www.vakaos.com";

/**
 * Tenant letterhead for official reports (VAT, statutory pack, ...). Reports are
 * the tenant's own branded documents, so they carry the tenant company name,
 * address, brand colour and logo — never VAKA branding.
 */
export async function getReportBranding(tenantId: string): Promise<ReportBranding> {
  const [tenant] = await db.select({
    companyName: schema.tenants.companyName,
    logoUrl: schema.tenants.logoUrl,
    brandPrimaryColor: schema.tenants.brandPrimaryColor,
    physicalAddress: schema.tenants.physicalAddress,
    registrationNumber: schema.tenants.registrationNumber,
    taxNumber: schema.tenants.taxNumber,
    vatNumber: schema.tenants.vatNumber,
    showVatNumberOnInvoices: schema.tenants.showVatNumberOnInvoices,
  }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));

  return {
    companyName: tenant?.companyName ?? "Company",
    logoUrl: tenant?.logoUrl ?? null,
    primaryColor: tenant?.brandPrimaryColor ?? null,
    physicalAddress: tenant?.physicalAddress ?? null,
    registrationNumber: tenant?.registrationNumber ?? null,
    taxNumber: tenant?.taxNumber ?? null,
    vatNumber: tenant?.showVatNumberOnInvoices ? tenant?.vatNumber ?? null : null,
  };
}
