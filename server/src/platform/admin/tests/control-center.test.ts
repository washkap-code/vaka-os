import { describe, expect, it } from "vitest";
import {
  buildControlCenterSnapshot,
  CONTROL_CENTER_CATALOGUE,
  OPERATIONS_EVIDENCE_GATES,
} from "../control-center.js";

const FROZEN_PRODUCTS = [
  "VAKA OS",
  "VAKA Platform",
  "VAKA ERP",
  "VAKA Intelligence",
  "VAKA Network",
  "VAKA Verify",
  "VAKA Capital",
  "VAKA Mail",
  "VAKA Black Book",
  "VAKA Studio",
  "Platform Kernel",
];

const KERNEL_SERVICES = [
  "Identity",
  "Metadata",
  "Workflow",
  "Rules",
  "Policy",
  "Event Bus",
  "Documents",
  "Search",
  "AI Context",
  "Notifications",
  "Security",
  "Engineering Process",
];

describe("platform control centre", () => {
  it("contains every frozen product and kernel service exactly once", () => {
    const products = CONTROL_CENTER_CATALOGUE
      .filter((entry) => entry.group === "Frozen product")
      .map((entry) => entry.name);
    const services = CONTROL_CENTER_CATALOGUE
      .filter((entry) => entry.group === "Platform Kernel service")
      .map((entry) => entry.name);

    expect(products).toEqual(FROZEN_PRODUCTS);
    expect(services).toEqual(KERNEL_SERVICES);
    expect(new Set(CONTROL_CENTER_CATALOGUE.map((entry) => entry.id)).size)
      .toBe(CONTROL_CENTER_CATALOGUE.length);
  });

  it("never describes a planned capability as implemented", () => {
    for (const entry of CONTROL_CENTER_CATALOGUE) {
      if (entry.availability === "planned") {
        expect(entry.implementation).toBe("not-implemented");
      }
    }
  });

  it("builds privacy-minimised operational signals without manufacturing assurance", () => {
    const snapshot = buildControlCenterSnapshot({
      databaseObservedAt: "2026-07-11T12:00:00.000Z",
      activeSessions: 7,
      auditEvents24h: 19,
      pastDueTenants: 2,
      suspendedTenants: 1,
    });

    expect(snapshot.architecture.status).toBe("ACTIVE");
    expect(snapshot.runtime.database.observedAt).toBe("2026-07-11T12:00:00.000Z");
    expect(snapshot.signals).toEqual({
      activeSessions: 7,
      auditEvents24h: 19,
      pastDueTenants: 2,
      suspendedTenants: 1,
    });
    const serialized = JSON.stringify(snapshot).toLowerCase();
    expect(serialized).not.toContain("passwordhash");
    expect(serialized).not.toContain("accesstoken");
    expect(snapshot.limitations.some((item) => item.includes("not proof"))).toBe(true);
  });

  it("exposes backup and disaster-recovery gates without claiming unrecorded evidence", () => {
    const gateNames = OPERATIONS_EVIDENCE_GATES.map((gate) => gate.name);

    expect(gateNames).toEqual([
      "Backup policy and retention",
      "Automated backup execution",
      "Restore test evidence",
      "RPO/RTO acceptance",
      "Disaster recovery runbook",
      "Operational launch sign-off",
    ]);
    expect(OPERATIONS_EVIDENCE_GATES.some((gate) => gate.state === "recorded")).toBe(false);

    const snapshot = buildControlCenterSnapshot({
      databaseObservedAt: "2026-07-11T12:00:00.000Z",
      activeSessions: 0,
      auditEvents24h: 0,
      pastDueTenants: 0,
      suspendedTenants: 0,
    });

    expect(snapshot.operationsEvidence.summary).toEqual({
      "not-recorded": 4,
      recorded: 0,
      "requires-review": 2,
    });
  });
});
