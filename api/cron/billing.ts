// Vercel Cron entry — monthly billing run (see vercel.json "crons").
// Vercel invokes this with GET + "Authorization: Bearer <CRON_SECRET>".
// Replaces wiring POST /api/v1/platform/billing/run to an external cron.
import type { IncomingMessage, ServerResponse } from "node:http";
import { runBillingCycle } from "../../server/src/billing.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
    return;
  }
  const result = await runBillingCycle(new Date());
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(result));
}
