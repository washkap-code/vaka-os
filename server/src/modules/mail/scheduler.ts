import { logEvent } from "../../observability.js";
import type { MailService } from "./service.js";

export class MailSyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly service: MailService,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.runOnce(); }, this.intervalMs);
    this.timer.unref?.();
    void this.runOnce();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.service.syncAll();
    } catch (error) {
      logEvent("mail.scheduler_failed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      }, "warn");
    } finally {
      this.running = false;
    }
  }
}
