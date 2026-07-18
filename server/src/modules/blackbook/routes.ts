import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../../auth.js";
import { requirePlatformPermission } from "../../auth.js";
import { notFound } from "../../lib.js";
import {
  contactPointWriteSchema, governmentServiceWriteSchema, organisationListQuerySchema,
  organisationWriteSchema, revisionReasonSchema, serviceListQuerySchema,
} from "./schemas.js";
import { defaultBlackBookService } from "./service.js";

export const blackBookRouter = Router();

const wrap = (handler: (req: AuthedRequest, res: Response) => Promise<unknown>) =>
  (req: AuthedRequest, res: Response, next: NextFunction) => handler(req, res)
    .then((result) => result !== undefined && res.json(result))
    .catch(next);

const uuidParam = (req: AuthedRequest, name: string): string =>
  z.string().uuid().parse(req.params[name]);

blackBookRouter.get("/organisations", wrap(async (req, res) => {
  const query = organisationListQuerySchema.parse({
    type: req.query.type,
    q: req.query.q,
    country: req.query.country ?? "ZW",
  });
  res.setHeader("Cache-Control", "private, no-store");
  return defaultBlackBookService.listOrganisations(query);
}));

blackBookRouter.get("/organisations/:id", wrap(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  return defaultBlackBookService.getOrganisation(uuidParam(req, "id"));
}));

blackBookRouter.get("/services", wrap(async (req, res) => {
  const query = serviceListQuerySchema.parse({
    category: req.query.category,
    q: req.query.q,
    country: req.query.country ?? "ZW",
  });
  res.setHeader("Cache-Control", "private, no-store");
  return defaultBlackBookService.listServices(query);
}));

blackBookRouter.put("/organisations/:id",
  requirePlatformPermission("blackbook:editor"),
  wrap(async (req) => {
    const body = organisationWriteSchema.parse(req.body);
    const { reason, ...input } = body;
    return defaultBlackBookService.upsertOrganisation({
      actorUserId: req.auth!.userId,
      entityId: uuidParam(req, "id"),
      reason,
      input,
    });
  }));

blackBookRouter.delete("/organisations/:id",
  requirePlatformPermission("blackbook:editor"),
  wrap(async (req) => {
    const { reason } = revisionReasonSchema.parse(req.body);
    return defaultBlackBookService.retireOrganisation(
      req.auth!.userId,
      uuidParam(req, "id"),
      reason,
    );
  }));

blackBookRouter.put("/organisations/:orgId/contacts/:contactId",
  requirePlatformPermission("blackbook:editor"),
  wrap(async (req) => {
    const body = contactPointWriteSchema.parse(req.body);
    const { reason, ...input } = body;
    return defaultBlackBookService.upsertContactPoint(uuidParam(req, "orgId"), {
      actorUserId: req.auth!.userId,
      entityId: uuidParam(req, "contactId"),
      reason,
      input,
    });
  }));

blackBookRouter.delete("/organisations/:orgId/contacts/:contactId",
  requirePlatformPermission("blackbook:editor"),
  wrap(async (req) => {
    // Resolve the parent first so a mismatched route cannot be used as a
    // misleading deletion path. The service still enforces editor identity.
    const organisation = await defaultBlackBookService.getOrganisation(uuidParam(req, "orgId"));
    const contactId = uuidParam(req, "contactId");
    if (!organisation.contacts.some((contact) => contact.id === contactId)) {
      throw notFound("Government contact point not found");
    }
    const { reason } = revisionReasonSchema.parse(req.body);
    return defaultBlackBookService.deleteContactPoint(req.auth!.userId, contactId, reason);
  }));

blackBookRouter.put("/services/:id",
  requirePlatformPermission("blackbook:editor"),
  wrap(async (req) => {
    const body = governmentServiceWriteSchema.parse(req.body);
    const { reason, ...input } = body;
    return defaultBlackBookService.upsertService({
      actorUserId: req.auth!.userId,
      entityId: uuidParam(req, "id"),
      reason,
      input,
    });
  }));

blackBookRouter.delete("/services/:id",
  requirePlatformPermission("blackbook:editor"),
  wrap(async (req) => {
    const { reason } = revisionReasonSchema.parse(req.body);
    return defaultBlackBookService.deleteService(req.auth!.userId, uuidParam(req, "id"), reason);
  }));
