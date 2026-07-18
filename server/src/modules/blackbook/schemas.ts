import { z } from "zod";
import {
  GOVERNMENT_CONTACT_TYPES,
  GOVERNMENT_ORGANISATION_STATUSES,
  GOVERNMENT_ORGANISATION_TYPES,
  GOVERNMENT_SERVICE_CATEGORIES,
} from "./types.js";

const country = z.string().trim().regex(/^[A-Z]{2}$/, "country must be an ISO 3166-1 alpha-2 code");
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional().default(null);
const nullableDate = z.string().date().nullable().optional().default(null);
const nullableHttpsUrl = z.string().url().refine((value) => value.startsWith("https://"), {
  message: "URL must use HTTPS",
}).nullable().optional().default(null);
const structuredItems = z.array(z.record(z.string(), z.unknown())).max(100).nullable().optional().default(null);

export const organisationWriteSchema = z.object({
  orgType: z.enum(GOVERNMENT_ORGANISATION_TYPES),
  name: z.string().trim().min(1).max(200),
  acronym: nullableText(30),
  parentOrgId: z.string().uuid().nullable().optional().default(null),
  country: country.default("ZW"),
  description: nullableText(5_000),
  website: nullableHttpsUrl,
  status: z.enum(GOVERNMENT_ORGANISATION_STATUSES).default("active"),
  verifiedAt: nullableDate,
  reason: z.string().trim().min(3).max(1_000),
}).strict();

export const contactPointWriteSchema = z.object({
  type: z.enum(GOVERNMENT_CONTACT_TYPES),
  label: z.string().trim().min(1).max(120),
  value: nullableText(1_000),
  region: nullableText(120),
  verifiedAt: nullableDate,
  reason: z.string().trim().min(3).max(1_000),
}).strict();

export const governmentServiceWriteSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: nullableText(5_000),
  category: z.enum(GOVERNMENT_SERVICE_CATEGORIES),
  requirementsJson: structuredItems,
  feesJson: structuredItems,
  processingTime: nullableText(500),
  officialFormUrl: nullableHttpsUrl,
  onlineServiceUrl: nullableHttpsUrl,
  verifiedAt: nullableDate,
  reason: z.string().trim().min(3).max(1_000),
}).strict();

export const revisionReasonSchema = z.object({
  reason: z.string().trim().min(3).max(1_000),
}).strict();

export const organisationListQuerySchema = z.object({
  type: z.enum(GOVERNMENT_ORGANISATION_TYPES).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  country: country.default("ZW"),
}).strict();

export const serviceListQuerySchema = z.object({
  category: z.enum(GOVERNMENT_SERVICE_CATEGORIES).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  country: country.default("ZW"),
}).strict();
