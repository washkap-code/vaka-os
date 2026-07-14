import assert from "node:assert/strict";
import test from "node:test";
import { isLightBrandColour, warehouseSettingsAccess } from "../src/settings/warehouse-settings-model.ts";

test("warehouse settings access preserves server permission intent and read-only lifecycle", () => {
  assert.deepEqual(warehouseSettingsAccess(["settings.manage"], false), { canView: true, canManage: true });
  assert.deepEqual(warehouseSettingsAccess(["inventory.write"], false), { canView: true, canManage: true });
  assert.deepEqual(warehouseSettingsAccess(["inventory.read"], false), { canView: true, canManage: false });
  assert.deepEqual(warehouseSettingsAccess(["settings.manage"], true), { canView: true, canManage: false });
  assert.deepEqual(warehouseSettingsAccess(["crm.read"], false), { canView: false, canManage: false });
});

test("brand preview chooses a readable text mode from a valid six-digit colour", () => {
  assert.equal(isLightBrandColour("#FFFFFF"), true);
  assert.equal(isLightBrandColour("#F2C94C"), true);
  assert.equal(isLightBrandColour("#102A43"), false);
  assert.equal(isLightBrandColour("invalid"), false);
});
