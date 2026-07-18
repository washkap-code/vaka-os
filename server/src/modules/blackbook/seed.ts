import { eq } from "drizzle-orm";
import { db, schema } from "../../lib.js";
import { defaultBlackBookService } from "./service.js";
import type {
  GovernmentServiceInput, OrganisationInput,
} from "./types.js";

type SeedOrganisation = { id: string; input: OrganisationInput };
type SeedService = { id: string; input: GovernmentServiceInput };

const organisation = (
  id: string,
  orgType: OrganisationInput["orgType"],
  name: string,
  acronym: string | null = null,
): SeedOrganisation => ({
  id,
  input: {
    orgType,
    name,
    acronym,
    parentOrgId: null,
    country: "ZW",
    description: null,
    website: null,
    status: "active",
    verifiedAt: null,
  },
});

// Names mirror the repository's governed Zimbabwe country-pack structure.
// No contacts, websites, fees, requirements, processing times, or forms are
// asserted by this engineering seed.
export const ZIMBABWE_BLACKBOOK_ORGANISATION_SEED: readonly SeedOrganisation[] = [
  organisation("11111111-1111-4111-8111-111111111101", "ministry", "Ministry of Finance and Investment Promotion"),
  organisation("11111111-1111-4111-8111-111111111102", "ministry", "Ministry of Industry and Commerce"),
  organisation("11111111-1111-4111-8111-111111111103", "ministry", "Ministry of Local Government and Public Works"),
  organisation("11111111-1111-4111-8111-111111111104", "ministry", "Ministry of Public Service, Labour and Social Welfare"),
  organisation("11111111-1111-4111-8111-111111111105", "regulator", "Zimbabwe Revenue Authority", "ZIMRA"),
  organisation("11111111-1111-4111-8111-111111111106", "regulator", "National Social Security Authority", "NSSA"),
  organisation("11111111-1111-4111-8111-111111111107", "regulator", "Procurement Regulatory Authority of Zimbabwe", "PRAZ"),
  organisation("11111111-1111-4111-8111-111111111108", "regulator", "Reserve Bank of Zimbabwe", "RBZ"),
  organisation("11111111-1111-4111-8111-111111111109", "local_authority", "Harare City Council"),
  organisation("11111111-1111-4111-8111-111111111110", "local_authority", "Bulawayo City Council"),
  organisation("11111111-1111-4111-8111-111111111111", "local_authority", "Mutare City Council"),
  organisation("11111111-1111-4111-8111-111111111112", "local_authority", "Gweru City Council"),
  organisation("11111111-1111-4111-8111-111111111113", "local_authority", "City of Masvingo"),
];

const organisationIds = Object.fromEntries(ZIMBABWE_BLACKBOOK_ORGANISATION_SEED
  .map(({ id, input }) => [input.acronym ?? input.name, id]));

const service = (
  id: string,
  orgId: string,
  name: string,
  category: GovernmentServiceInput["category"],
): SeedService => ({
  id,
  input: {
    orgId,
    name,
    description: null,
    category,
    requirementsJson: null,
    feesJson: null,
    processingTime: null,
    officialFormUrl: null,
    onlineServiceUrl: null,
    verifiedAt: null,
  },
});

export const ZIMBABWE_BLACKBOOK_SERVICE_SEED: readonly SeedService[] = [
  service("22222222-2222-4222-8222-222222222201", organisationIds.ZIMRA, "Taxpayer Registration", "tax"),
  service("22222222-2222-4222-8222-222222222202", organisationIds.NSSA, "Employer Registration", "registration"),
  service("22222222-2222-4222-8222-222222222203", organisationIds.PRAZ, "Bidder and Contractor Registration", "registration"),
  service("22222222-2222-4222-8222-222222222204", organisationIds.PRAZ, "Electronic Public Tendering", "tenders"),
];

export async function seedZimbabweBlackBook(actorUserId: string) {
  const reason = "P11-001 initial Zimbabwe structure seed; editorial verification pending";
  for (const entry of ZIMBABWE_BLACKBOOK_ORGANISATION_SEED) {
    await defaultBlackBookService.upsertOrganisation({
      actorUserId,
      entityId: entry.id,
      reason,
      input: entry.input,
    });
    await defaultBlackBookService.upsertContactPoint(entry.id, {
      actorUserId,
      entityId: entry.id.replace(/^11111111/, "33333333"),
      reason,
      input: {
        type: "office_location",
        label: "Editorial verification pending",
        value: null,
        region: null,
        verifiedAt: null,
      },
    });
  }
  for (const entry of ZIMBABWE_BLACKBOOK_SERVICE_SEED) {
    await defaultBlackBookService.upsertService({
      actorUserId,
      entityId: entry.id,
      reason,
      input: entry.input,
    });
  }
  return {
    country: "ZW",
    organisations: ZIMBABWE_BLACKBOOK_ORGANISATION_SEED.length,
    placeholderContacts: ZIMBABWE_BLACKBOOK_ORGANISATION_SEED.length,
    services: ZIMBABWE_BLACKBOOK_SERVICE_SEED.length,
    verifiedValuesSeeded: 0,
  };
}

export async function seedZimbabweBlackBookWithPrincipalEditor() {
  const [principal] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.platformRoleKey, "PRINCIPAL_ADMIN"));
  if (!principal) throw new Error("Seed the platform Principal Administrator before the Black Book");
  return seedZimbabweBlackBook(principal.id);
}
