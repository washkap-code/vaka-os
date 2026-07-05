import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = Date.now().toString(36);
const email = `forced-${uniq}@test.zw`;
const subdomain = `forced${uniq}`;
const temporaryPassword = "Temporary-Password-123!";
const replacementPassword = "Replacement-Password-456!";
let token: string;

beforeAll(async () => {
  const signup = await request(app).post("/api/v1/auth/signup").send({
    companyName: "Forced Password Test",
    subdomain,
    baseCurrency: "USD",
    ownerEmail: email,
    ownerPassword: "Initial-Password-123!",
    ownerName: "Security Test Owner",
    planName: "Starter",
  });
  expect(signup.status).toBe(200);

  await db.update(schema.users).set({
    passwordHash: await bcrypt.hash(temporaryPassword, 12),
    mustChangePassword: true,
  }).where(eq(schema.users.id, signup.body.user.id));

  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password: temporaryPassword,
    subdomain,
  });
  expect(login.status).toBe(200);
  expect(login.body.user.mustChangePassword).toBe(true);
  token = login.body.token;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe("forced password change", () => {
  it("allows account context but blocks business endpoints", async () => {
    const me = await request(app).get("/api/v1/me").set(auth());
    expect(me.status).toBe(200);
    expect(me.body.mustChangePassword).toBe(true);

    const contacts = await request(app).get("/api/v1/contacts").set(auth());
    expect(contacts.status).toBe(403);
    expect(contacts.body.message).toBe("Password change required before continuing");
  });

  it("rejects an incorrect temporary password", async () => {
    const response = await request(app).post("/api/v1/auth/change-password").set(auth()).send({
      currentPassword: "Not-The-Temporary-Password",
      newPassword: replacementPassword,
    });
    expect(response.status).toBe(401);
  });

  it("changes the password and clears the forced-change flag", async () => {
    const response = await request(app).post("/api/v1/auth/change-password").set(auth()).send({
      currentPassword: temporaryPassword,
      newPassword: replacementPassword,
    });
    expect(response.status).toBe(200);
    expect(response.body.changed).toBe(true);

    const oldLogin = await request(app).post("/api/v1/auth/login").send({
      email,
      password: temporaryPassword,
      subdomain,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/v1/auth/login").send({
      email,
      password: replacementPassword,
      subdomain,
    });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.user.mustChangePassword).toBe(false);
    token = newLogin.body.token;

    const contacts = await request(app).get("/api/v1/contacts").set(auth());
    expect(contacts.status).toBe(200);
  });
});
