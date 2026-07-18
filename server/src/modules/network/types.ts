import type { IdentityServiceContract } from "../../platform/identity/interfaces.js";

export const PROFILE_VISIBILITIES = ["public", "network", "hidden"] as const;
export const PROFILE_STATUSES = ["draft", "pending_review", "published", "suspended"] as const;
export const EMPLOYEE_BANDS = ["1-9", "10-49", "50-249", "250-999", "1000+"] as const;

export type ProfileVisibility = typeof PROFILE_VISIBILITIES[number];
export type ProfileStatus = typeof PROFILE_STATUSES[number];
export type EmployeeBand = typeof EMPLOYEE_BANDS[number];

export interface ProfileCapabilityInput {
  category: string;
  name: string;
}

export interface BusinessProfileInput {
  slug?: string;
  name: string;
  tagline: string | null;
  description: string | null;
  industryPrimary: string | null;
  industrySecondary: string[];
  country: string;
  region: string | null;
  city: string | null;
  address: Record<string, unknown> | null;
  phone: string | null;
  emailPublic: string | null;
  website: string | null;
  logoDocumentId: string | null;
  coverDocumentId: string | null;
  foundedYear: number | null;
  employeeBand: EmployeeBand | null;
  visibility: ProfileVisibility;
  capabilities: ProfileCapabilityInput[];
  showContact: boolean;
  acceptEnquiries: boolean;
}

export interface PublicProfileSnapshot {
  slug: string;
  name: string;
  displayName: string;
  tagline: string | null;
  description: string;
  industryPrimary: string;
  industrySecondary: string[];
  categories: string[];
  country: string;
  countryCode: string;
  region: string | null;
  city: string | null;
  address: Record<string, unknown> | null;
  phone?: string | null;
  contactPhone?: string | null;
  emailPublic?: string | null;
  contactEmail?: string | null;
  website: string | null;
  logoDocumentId: string | null;
  coverDocumentId: string | null;
  foundedYear: number | null;
  employeeBand: EmployeeBand | null;
  capabilities: ProfileCapabilityInput[];
  acceptEnquiries: boolean;
}

export interface DirectoryProfile extends PublicProfileSnapshot {
  id: string;
  publishedAt: Date;
  legalName: string;
  registrationNumber: string | null;
  verificationStatus: "verified" | "unverified";
}

export interface DirectoryFilters {
  q?: string;
  industry?: string;
  country?: string;
  region?: string;
  page: number;
  pageSize: number;
}

export interface NetworkRequestContext {
  tenantId: string;
  actorUserId: string;
  identity: IdentityServiceContract;
}
