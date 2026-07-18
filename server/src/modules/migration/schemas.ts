import { z } from "zod";
import { DUPLICATE_POLICIES, MIGRATION_OBJECT_TYPES } from "./types.js";

const encoding = z.enum(["auto", "utf8", "utf16le", "utf16be", "windows1252"]);

export const uploadJobSchema = z.object({
  objectType: z.enum(MIGRATION_OBJECT_TYPES),
  sourceFilename: z.string().trim().min(1).max(255),
  duplicatePolicy: z.enum(DUPLICATE_POLICIES).default("skip"),
  csvText: z.string().max(2_000_000).optional(),
  contentBase64: z.string().max(2_700_000).optional(),
  encoding: encoding.default("auto"),
}).superRefine((value, context) => {
  if ((value.csvText === undefined) === (value.contentBase64 === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Provide exactly one of csvText or contentBase64" });
  }
});

export const mapJobSchema = z.object({
  mapping: z.record(z.string(), z.string().trim()).refine((value) => Object.keys(value).length > 0, "Mapping is required"),
  duplicatePolicy: z.enum(DUPLICATE_POLICIES).optional(),
});

export const jobPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  status: z.enum(["pending", "valid", "error", "imported", "skipped"]).optional(),
});

export const listJobsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
