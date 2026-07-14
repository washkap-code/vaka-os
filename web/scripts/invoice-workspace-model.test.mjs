import assert from "node:assert/strict";
import test from "node:test";
import { invoiceRecordActions } from "../src/invoices/invoice-workspace-model.ts";

test("read-only invoice records expose documents without financial or sharing writes", () => {
  assert.deepEqual(invoiceRecordActions("DRAFT", false), []);
  assert.deepEqual(invoiceRecordActions("ISSUED", false), ["preview", "download"]);
  assert.deepEqual(invoiceRecordActions("VOID", false), ["preview", "download"]);
});

test("authorised invoice actions follow lifecycle boundaries", () => {
  assert.deepEqual(invoiceRecordActions("DRAFT", true), ["issue", "void"]);
  assert.deepEqual(invoiceRecordActions("ISSUED", true), [
    "preview", "download", "sendEmail", "createShareLink", "manageShareLinks",
    "emailLink", "whatsAppLink", "recordPayment", "void",
  ]);
  assert.deepEqual(invoiceRecordActions("PAID", true), [
    "preview", "download", "createShareLink", "manageShareLinks", "emailLink", "whatsAppLink",
  ]);
  assert.deepEqual(invoiceRecordActions("VOID", true), ["preview", "download"]);
});
