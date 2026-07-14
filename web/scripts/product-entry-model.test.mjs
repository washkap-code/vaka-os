import assert from "node:assert/strict";
import test from "node:test";
import { isNonNegativeMoney, isPositiveMoney, isPositiveStockQuantity, suggestProductSku } from "../src/inventory/product-entry-model.ts";

test("suggestProductSku creates readable tenant-local candidates and avoids loaded collisions", () => {
  assert.equal(suggestProductSku("Maize Meal 10kg", []), "MAIZE-MEAL-10KG");
  assert.equal(suggestProductSku("Maize Meal 10kg", ["maize-meal-10kg"]), "MAIZE-MEAL-10KG-002");
  assert.equal(suggestProductSku("Crème brûlée", []), "CREME-BRULE");
  assert.equal(suggestProductSku("", []), "ITEM");
});

test("opening stock values accept positive quantities and exact cent money only", () => {
  assert.equal(isPositiveStockQuantity("12"), true);
  assert.equal(isPositiveStockQuantity("0.125"), true);
  assert.equal(isPositiveStockQuantity("0"), false);
  assert.equal(isPositiveStockQuantity("-1"), false);
  assert.equal(isPositiveStockQuantity("1.2345"), false);
  assert.equal(isNonNegativeMoney("0"), true);
  assert.equal(isNonNegativeMoney("12.50"), true);
  assert.equal(isNonNegativeMoney("12.505"), false);
  assert.equal(isNonNegativeMoney("-1"), false);
  assert.equal(isPositiveMoney("0"), false);
  assert.equal(isPositiveMoney("0.01"), true);
});
