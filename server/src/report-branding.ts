import { eq } from "drizzle-orm";
import { db, schema } from "./lib.js";

export const FINANCE_REPORT_BRANDING_VERSION = "finance-report-branding-v1" as const;

export type FinanceReportBranding = {
  version: typeof FINANCE_REPORT_BRANDING_VERSION;
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  physicalAddress: string | null;
  registrationNumber: string | null;
  taxNumber: string | null;
  vatNumber: string | null;
};

const safeColour = (value: string, fallback: string) =>
  /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : fallback;

export async function getFinanceReportBranding(tenantId: string): Promise<FinanceReportBranding> {
  const [tenant] = await db.select({
    companyName: schema.tenants.companyName,
    logoUrl: schema.tenants.logoUrl,
    primaryColor: schema.tenants.brandPrimaryColor,
    accentColor: schema.tenants.brandSecondaryColor,
    physicalAddress: schema.tenants.physicalAddress,
    registrationNumber: schema.tenants.registrationNumber,
    taxNumber: schema.tenants.taxNumber,
    vatNumber: schema.tenants.vatNumber,
  }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  if (!tenant) throw new Error("Tenant document identity is unavailable");
  return {
    version: FINANCE_REPORT_BRANDING_VERSION,
    companyName: tenant.companyName,
    logoUrl: tenant.logoUrl,
    primaryColor: safeColour(tenant.primaryColor, "#14171F"),
    accentColor: safeColour(tenant.accentColor, "#E8B44F"),
    physicalAddress: tenant.physicalAddress,
    registrationNumber: tenant.registrationNumber,
    taxNumber: tenant.taxNumber,
    vatNumber: tenant.vatNumber,
  };
}
