export const GOVERNMENT_ORGANISATION_TYPES = [
  "ministry", "department", "regulator", "local_authority", "utility",
  "court", "police", "hospital", "association", "tender_portal", "embassy",
] as const;

export const GOVERNMENT_ORGANISATION_STATUSES = ["active", "merged", "dissolved"] as const;
export const GOVERNMENT_CONTACT_TYPES = ["phone", "email", "address", "office_location"] as const;
export const GOVERNMENT_SERVICE_CATEGORIES = [
  "licensing", "registration", "tax", "permits", "tenders", "utilities", "other",
] as const;

export type GovernmentOrganisationType = typeof GOVERNMENT_ORGANISATION_TYPES[number];
export type GovernmentOrganisationStatus = typeof GOVERNMENT_ORGANISATION_STATUSES[number];
export type GovernmentContactType = typeof GOVERNMENT_CONTACT_TYPES[number];
export type GovernmentServiceCategory = typeof GOVERNMENT_SERVICE_CATEGORIES[number];

export interface OrganisationInput {
  orgType: GovernmentOrganisationType;
  name: string;
  acronym: string | null;
  parentOrgId: string | null;
  country: string;
  description: string | null;
  website: string | null;
  status: GovernmentOrganisationStatus;
  verifiedAt: string | null;
}

export interface ContactPointInput {
  type: GovernmentContactType;
  label: string;
  value: string | null;
  region: string | null;
  verifiedAt: string | null;
}

export interface GovernmentServiceInput {
  orgId: string;
  name: string;
  description: string | null;
  category: GovernmentServiceCategory;
  requirementsJson: Record<string, unknown>[] | null;
  feesJson: Record<string, unknown>[] | null;
  processingTime: string | null;
  officialFormUrl: string | null;
  onlineServiceUrl: string | null;
  verifiedAt: string | null;
}

export interface EditorWrite<T> {
  actorUserId: string;
  entityId: string;
  reason: string;
  input: T;
}

export interface OrganisationFilters {
  type?: GovernmentOrganisationType;
  q?: string;
  country: string;
}

export interface ServiceFilters {
  category?: GovernmentServiceCategory;
  q?: string;
  country: string;
}
