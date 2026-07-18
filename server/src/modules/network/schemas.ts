import { z } from "zod";
import { EMPLOYEE_BANDS, PROFILE_VISIBILITIES } from "./types.js";

export const BUSINESS_CATEGORIES = [
  "agriculture", "construction", "education", "energy", "finance-and-insurance",
  "healthcare", "hospitality-and-tourism", "ict-and-telecoms", "logistics-and-transport",
  "manufacturing", "mining", "ngo-and-community", "professional-services",
  "real-estate", "retail-and-wholesale", "other",
] as const;

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();
const capabilitySchema = z.object({
  category: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
}).strict();

/** Canonical P10 input plus the prior PN aliases kept for API compatibility. */
export const profileInputSchema = z.object({
  slug: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  tagline: nullableText(140),
  description: nullableText(5000),
  industryPrimary: nullableText(100),
  industrySecondary: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  categories: z.array(z.enum(BUSINESS_CATEGORIES)).min(1).max(3).optional(),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  region: nullableText(100),
  city: nullableText(100),
  address: z.record(z.string(), z.unknown()).nullable().optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{5,25}$/).nullable().optional(),
  contactPhone: z.string().trim().regex(/^\+?[0-9 ()-]{5,25}$/).nullable().optional(),
  emailPublic: z.string().trim().email().max(254).nullable().optional(),
  contactEmail: z.string().trim().email().max(254).nullable().optional(),
  website: z.string().trim().url().startsWith("https://").max(500).nullable().optional(),
  logoDocumentId: z.string().uuid().nullable().optional(),
  coverDocumentId: z.string().uuid().nullable().optional(),
  foundedYear: z.number().int().min(1000).max(9999).nullable().optional(),
  employeeBand: z.enum(EMPLOYEE_BANDS).nullable().optional(),
  visibility: z.enum(PROFILE_VISIBILITIES).default("public"),
  capabilities: z.array(capabilitySchema).max(100).default([]),
  showContact: z.boolean().optional(),
  acceptEnquiries: z.boolean().default(false),
}).strict().refine((value) => Boolean(value.name ?? value.displayName), {
  message: "name is required",
  path: ["name"],
}).transform((value) => {
  const canonicalInput = value.name !== undefined;
  const primary = value.industryPrimary ?? value.categories?.[0] ?? null;
  const secondary = value.industrySecondary ?? value.categories?.slice(1) ?? [];
  return {
    slug: value.slug,
    name: value.name ?? value.displayName!,
    tagline: value.tagline ?? null,
    description: value.description ?? null,
    industryPrimary: primary,
    industrySecondary: [...new Set(secondary)],
    country: value.country ?? value.countryCode ?? "ZW",
    region: value.region ?? null,
    city: value.city ?? null,
    address: value.address ?? null,
    phone: value.phone ?? value.contactPhone ?? null,
    emailPublic: value.emailPublic ?? value.contactEmail ?? null,
    website: value.website ?? null,
    logoDocumentId: value.logoDocumentId ?? null,
    coverDocumentId: value.coverDocumentId ?? null,
    foundedYear: value.foundedYear ?? null,
    employeeBand: value.employeeBand ?? null,
    visibility: value.visibility,
    capabilities: value.capabilities,
    showContact: value.showContact ?? canonicalInput,
    acceptEnquiries: value.acceptEnquiries,
  };
});

export const directoryQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  industry: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  region: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
}).strict().transform((value) => ({
  q: value.q,
  industry: value.industry ?? value.category,
  country: value.country,
  region: value.region ?? value.city,
  page: value.page,
  pageSize: 25,
}));

export const profileSlugSchema = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(120);

export type ParsedProfileInput = z.infer<typeof profileInputSchema>;
export type ParsedDirectoryQuery = z.infer<typeof directoryQuerySchema>;
