import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = Date.now().toString(36);

async function signup(label: string) {
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Import ${label}`,
    subdomain: `import${uniq}${label}`,
    baseCurrency: "USD",
    ownerEmail: `import-${uniq}-${label}@test.zw`,
    ownerPassword: "Import-Password-123!",
    ownerName: "Import Owner",
    planName: "Growth",
  });
  expect(response.status).toBe(200);
  return response.body;
}

describe("contact CSV imports", () => {
  it("previews, validates, deduplicates and commits only valid rows", async () => {
    const tenant = await signup("a");
    const auth = { Authorization: `Bearer ${tenant.token}` };
    const csvText = [
      "name,email,phone,type,is_customer,is_vendor,tax_number,tags",
      "Harare Retail,accounts@harareretail.co.zw,+263771000001,COMPANY,yes,no,BP-100,priority;retail",
      "Harare Retail,duplicate@example.com,+263771000002,COMPANY,yes,no,,",
      "Unsafe Formula,=IMPORTXML(example),,COMPANY,yes,no,,",
      "Mbare Supplier,sales@mbaresupplier.co.zw,+263771000003,COMPANY,no,yes,BP-200,supplier",
    ].join("\n");

    const preview = await request(app).post("/api/v1/imports/contacts/preview")
      .set(auth).send({ csvText });
    expect(preview.status).toBe(200);
    expect(preview.body.batch).toMatchObject({
      totalRows: 4,
      validRows: 2,
      duplicateRows: 1,
      invalidRows: 1,
      status: "PREVIEW",
    });

    const other = await signup("b");
    const crossTenant = await request(app)
      .post(`/api/v1/imports/contacts/${preview.body.batch.id}/commit`)
      .set({ Authorization: `Bearer ${other.token}` }).send({});
    expect(crossTenant.status).toBe(409);

    const committed = await request(app)
      .post(`/api/v1/imports/contacts/${preview.body.batch.id}/commit`)
      .set(auth).send({});
    expect(committed.status).toBe(200);
    expect(committed.body.importedRows).toBe(2);

    const contacts = await db.select().from(schema.contacts)
      .where(eq(schema.contacts.tenantId, tenant.tenant.id));
    expect(contacts.map((contact) => contact.name).sort()).toEqual([
      "Harare Retail",
      "Mbare Supplier",
    ]);

    const retry = await request(app)
      .post(`/api/v1/imports/contacts/${preview.body.batch.id}/commit`)
      .set(auth).send({});
    expect(retry.status).toBe(409);
  });
});
