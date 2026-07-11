import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signupFinanceTenant } from "./finance/helpers.js";

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

    const list = await request(app).get("/api/v1/captures").set(tenant.auth);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    const detail = await request(app).get(`/api/v1/captures/${created.body.id}`).set(tenant.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.dataUrl).toBe(png);

    const other = await signupFinanceTenant("capture-other");
    const otherList = await request(app).get("/api/v1/captures").set(other.auth);
    expect(otherList.status).toBe(200);
    expect(otherList.body).toHaveLength(0);
    const invalid = await request(app).post("/api/v1/captures").set(tenant.auth).send({
      documentType: "OTHER", fileName: "unsafe.txt", dataUrl: "data:text/plain;base64,SGk=",
    });
    expect(invalid.status).toBe(400);
  });
});
