import { eq } from "drizzle-orm";
import { publicAppUrl } from "./config.js";
import { db, schema } from "./lib.js";
import type { NotificationServiceContract } from "./platform/notifications/index.js";
import { NOTIFICATION_SERVICE, platformKernel } from "./platform-runtime.js";

export async function sendUserInvitationEmail(input: {
  tenantId: string;
  actorUserId: string;
  user: { id: string; email: string; fullName: string };
  temporaryPassword: string;
}, notificationService: NotificationServiceContract = platformKernel().container.get(NOTIFICATION_SERVICE)) {
  const [tenant] = await db.select({ companyName: schema.tenants.companyName })
    .from(schema.tenants).where(eq(schema.tenants.id, input.tenantId));
  if (!tenant) throw new Error("Invitation workspace was not found");
  const messageId = `user-invitation:${input.user.id}`;
  return notificationService.send({
    id: messageId,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    recipient: input.user.email,
    channel: "EMAIL",
    template: "security.user_invitation.v1",
    locale: "en-ZW",
    variables: {
      fullName: input.user.fullName,
      workspaceName: tenant.companyName,
      temporaryPassword: input.temporaryPassword,
      loginUrl: publicAppUrl(),
    },
    correlationId: input.user.id,
    sensitiveVariableKeys: ["temporaryPassword"],
    dedupeKey: messageId,
  });
}
