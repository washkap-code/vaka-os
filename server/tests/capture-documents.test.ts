import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signupFinanceTenant } from "./finance/helpers.js";
import { db, schema } from "../src/lib.js";
import { eq } from "drizzle-orm";

const app = createApp();
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("mobile document capture intake", () => {
  it("stores tenant-scoped evidence without OCR or business posting", async () => {
    const tenant = await signupFinanceTenant("capture");
    const created = await request(app).post("/api/v1/captures").set(tenant.auth).send({
      documentType: "RECEIPT", fileName: "receipt from camera.png", dataUrl: png,
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ documentType: "RECEIPT", mediaType: "image/png", status: "CAPTURED" });
    expect(created.body).not.toHaveProperty("dataUrl");
    const [stored] = await db.select({ dataUrl: schema.captureDocuments.dataUrl })
      .from(schema.captureDocuments).where(eq(schema.captureDocuments.id, created.body.id));
    expect(stored.dataUrl).toMatch(/^v1\./);
    expect(stored.dataUrl).not.toContain(png);

    const list = await request(app).get("/api/v1/captures").set(tenant.auth);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    const detail = await request(app).get(`/api/v1/captures/${created.body.id}`).set(tenant.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.dataUrl).toBe(png);
    const reviewed = await request(app).post(`/api/v1/captures/${created.body.id}/review`).set(tenant.auth)
      .send({ status: "REVIEWED", note: "Readable source evidence." });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.status).toBe("REVIEWED");
    const reviewedList = await request(app).get("/api/v1/captures").set(tenant.auth);
    expect(reviewedList.body[0]).toMatchObject({ status: "REVIEWED", reviewNote: "Readable source evidence." });

    const other = await signupFinanceTenant("capture-other");
    const otherList = await request(app).get("/api/v1/captures").set(other.auth);
    expect(otherList.status).toBe(200);
    expect(otherList.body).toHaveLength(0);
    const otherDetail = await request(app).get(`/api/v1/captures/${created.body.id}`).set(other.auth);
    expect(otherDetail.status).toBe(404);
    const invalid = await request(app).post("/api/v1/captures").set(tenant.auth).send({
      documentType: "OTHER", fileName: "unsafe.txt", dataUrl: "data:text/plain;base64,SGk=",
    });
    expect(invalid.status).toBe(400);
    const second = await request(app).post("/api/v1/captures").set(tenant.auth).send({
      documentType: "OTHER", fileName: "second.png", dataUrl: png,
    });
    expect(second.status).toBe(200);
    const crossReview = await request(app).post(`/api/v1/captures/${second.body.id}/review`).set(other.auth)
      .send({ status: "REJECTED" });
    expect(crossReview.status).toBe(404);
  });
});
