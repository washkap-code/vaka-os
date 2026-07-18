import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { type AuthedRequest, requirePermission, tenantId } from "../../auth.js";
import {
  getJob, getJobRows, importJob, listJobs, mapJob, rollbackJob, suggestJobMapping,
  uploadJob, validateJob,
} from "./service.js";
import { jobPageSchema, listJobsSchema, mapJobSchema, uploadJobSchema } from "./schemas.js";

type Handler = (req: AuthedRequest, res: Response) => Promise<unknown>;

function route(handler: Handler) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await handler(req, res);
      if (!res.headersSent) res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

function jobId(req: AuthedRequest): string {
  return z.string().uuid().parse(req.params.id);
}

/** Registry-driven, resumable imports. Authentication is applied by the API root. */
export const migrationRouter = Router();

migrationRouter.use("/jobs", requirePermission("migration:run"));

migrationRouter.get("/jobs", route(async (req) =>
  listJobs(tenantId(req), listJobsSchema.parse(req.query))));

migrationRouter.post("/jobs", route(async (req) => {
  const body = uploadJobSchema.parse(req.body);
  return uploadJob({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    ...body,
  });
}));

migrationRouter.get("/jobs/:id", route(async (req) =>
  getJob(tenantId(req), jobId(req))));

migrationRouter.get("/jobs/:id/rows", route(async (req) =>
  getJobRows(tenantId(req), jobId(req), jobPageSchema.parse(req.query))));

migrationRouter.get("/jobs/:id/suggest-mapping", route(async (req) =>
  suggestJobMapping(tenantId(req), jobId(req))));

migrationRouter.post("/jobs/:id/map", route(async (req) => {
  const body = mapJobSchema.parse(req.body);
  return mapJob({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    jobId: jobId(req),
    mapping: body.mapping,
    duplicatePolicy: body.duplicatePolicy,
  });
}));

migrationRouter.post("/jobs/:id/validate", route(async (req) =>
  validateJob({ tenantId: tenantId(req), actorUserId: req.auth!.userId, jobId: jobId(req) })));

migrationRouter.post("/jobs/:id/import", route(async (req) =>
  importJob({ tenantId: tenantId(req), actorUserId: req.auth!.userId, jobId: jobId(req), ip: req.ip })));

migrationRouter.post("/jobs/:id/rollback", route(async (req) =>
  rollbackJob({ tenantId: tenantId(req), actorUserId: req.auth!.userId, jobId: jobId(req), ip: req.ip })));
