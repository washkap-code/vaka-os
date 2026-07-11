import { describe, expect, it } from "vitest";
import { WorkflowService } from "../service.js";

describe("WorkflowService", () => {
  it("executes a registered workflow with tenant context", async () => {
    const service = new WorkflowService();
    service.register({
      name: "test.echo",
      run: (input: { value: string }, context) => `${context.tenantId}:${input.value}`,
    });
    await expect(service.run("test.echo", { value: "ok" }, { tenantId: "tenant-1", actorUserId: "user-1" }))
      .resolves.toEqual({ workflow: "test.echo", result: "tenant-1:ok" });
  });
});
