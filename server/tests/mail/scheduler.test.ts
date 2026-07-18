import { describe, expect, it, vi } from "vitest";
import { MailSyncScheduler } from "../../src/modules/mail/scheduler.js";
import type { MailService } from "../../src/modules/mail/service.js";

describe("Mail sync scheduler", () => {
  it("keeps runs single-flight and contains service failures", async () => {
    let release: (() => void) | undefined;
    const syncAll = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const scheduler = new MailSyncScheduler({ syncAll } as unknown as MailService, 30_000);
    const first = scheduler.runOnce();
    await scheduler.runOnce();
    expect(syncAll).toHaveBeenCalledTimes(1);
    release?.();
    await first;

    const failing = new MailSyncScheduler({
      syncAll: async () => { throw new Error("offline"); },
    } as unknown as MailService, 30_000);
    await expect(failing.runOnce()).resolves.toBeUndefined();
  });
});
