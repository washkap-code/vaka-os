import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import {
  type AuthedRequest, requireAnyPermission, requirePermission, tenantId,
} from "../../auth.js";
import { badRequest } from "../../lib.js";
import { requireFeature } from "../../feature-flags.js";
import { MAIL_SERVICE, platformKernel } from "../../platform-runtime.js";
import type { MailActor } from "./types.js";

const router = Router();
const wrap = (handler: (req: AuthedRequest, res: Response) => Promise<unknown>) =>
  (req: AuthedRequest, res: Response, next: NextFunction) => {
    void handler(req, res).then((value) => {
      if (value !== undefined && !res.headersSent) res.json(value);
    }).catch(next);
  };
const param = (req: AuthedRequest, name: string): string => {
  const value = req.params[name];
  if (typeof value !== "string") throw badRequest(`Invalid route parameter: ${name}`);
  return value;
};
const actor = (req: AuthedRequest): MailActor => ({
  tenantId: tenantId(req),
  userId: req.auth!.userId,
  permissions: req.auth!.permissions,
});
const service = () => platformKernel().container.get(MAIL_SERVICE);

const providerConfigSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65_535),
  username: z.string().trim().min(1).max(500),
  password: z.string().min(1).max(2_000),
  tls: z.enum(["implicit", "starttls", "none"]),
}).strict();
const accountCreateSchema = z.object({
  ownerUserId: z.string().uuid(),
  type: z.enum(["imap", "shared"]),
  emailAddress: z.string().email().max(254),
  displayName: z.string().trim().min(1).max(160),
  imap: providerConfigSchema,
  smtp: providerConfigSchema,
}).strict();
const accountUpdateSchema = accountCreateSchema.partial().extend({
  syncStatus: z.enum(["IDLE", "DISABLED"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one account field is required");
const addressSchema = z.object({
  address: z.string().email().max(254),
  name: z.string().trim().max(160).optional(),
}).strict();
const messageBodySchema = z.object({
  bodyText: z.string().max(2_000_000).optional(),
  bodyHtml: z.string().max(2_000_000).optional(),
  cc: z.array(addressSchema).max(100).optional(),
  attachmentDocumentIds: z.array(z.string().trim().min(1).max(1_100)).max(10).optional(),
}).strict().refine((value) => Boolean(value.bodyText?.trim() || value.bodyHtml?.trim()), "Mail body is required");

router.use(requireFeature("mail.hub"));

router.get("/accounts", requireAnyPermission("mail.read", "mail.manage"), wrap(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  return service().listAccounts(actor(req));
}));
router.post("/accounts", requirePermission("mail.manage"), wrap(async (req, res) => {
  const account = await service().createAccount(actor(req), accountCreateSchema.parse(req.body));
  res.status(201).setHeader("Cache-Control", "private, no-store");
  return account;
}));
router.get("/accounts/:id", requireAnyPermission("mail.read", "mail.manage"), wrap(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  return service().getAccount(actor(req), z.string().uuid().parse(param(req, "id")));
}));
router.patch("/accounts/:id", requirePermission("mail.manage"), wrap(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  return service().updateAccount(
    actor(req), z.string().uuid().parse(param(req, "id")), accountUpdateSchema.parse(req.body),
  );
}));
router.delete("/accounts/:id", requirePermission("mail.manage"), wrap(async (req) =>
  service().deleteAccount(actor(req), z.string().uuid().parse(param(req, "id")))));

const threadListSchema = z.object({
  accountId: z.string().uuid(),
  folder: z.string().trim().min(1).max(1_000).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
router.get("/threads", requireAnyPermission("mail.read", "mail.manage"), wrap(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  return service().listThreads(actor(req), threadListSchema.parse(req.query));
}));
router.get("/threads/:id", requireAnyPermission("mail.read", "mail.manage"), wrap(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  return service().getThread(actor(req), z.string().uuid().parse(param(req, "id")));
}));
router.post("/threads/:id/link", requireAnyPermission("mail.send", "mail.manage"), wrap(async (req, res) => {
  const body = z.object({ objectType: z.string().trim().min(1).max(100), objectId: z.string().uuid() }).strict().parse(req.body);
  const result = await service().linkThread(actor(req), z.string().uuid().parse(param(req, "id")), body.objectType, body.objectId);
  res.status(201);
  return result;
}));

const sendSchema = messageBodySchema.extend({
  accountId: z.string().uuid(),
  to: z.array(addressSchema).min(1).max(100),
  subject: z.string().max(998),
}).strict();
router.post("/messages", requireAnyPermission("mail.send", "mail.manage"), wrap(async (req, res) => {
  const message = await service().send(actor(req), sendSchema.parse(req.body));
  res.status(201).setHeader("Cache-Control", "private, no-store");
  return message;
}));
router.post("/messages/:id/reply", requireAnyPermission("mail.send", "mail.manage"), wrap(async (req, res) => {
  const message = await service().reply(
    actor(req), z.string().uuid().parse(param(req, "id")), messageBodySchema.parse(req.body),
  );
  res.status(201).setHeader("Cache-Control", "private, no-store");
  return message;
}));

export const mailRouter = router;
