import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("../lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("../lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));

import config from "../config";
import { authGate } from "../middleware/auth";

type Role = "customer" | "driver" | "admin";

const userRecord = (id: number, role: Role) => ({
  id,
  name: `${role} user`,
  email: `${role}@roadly.test`,
  role,
});

const bearer = (id: number, claimedRole: Role) =>
  `Bearer ${jwt.sign({ id, role: claimedRole }, config.jwtSecret as string, {
    algorithm: "HS256",
    expiresIn: "15m",
    issuer: "roadly-api",
    audience: "roadly-web",
  })}`;

const app = express();
app.get(
  "/customer",
  authGate.requireAuth,
  authGate.requireRole("customer"),
  (_req, res) => res.sendStatus(204),
);
app.get(
  "/driver",
  authGate.requireAuth,
  authGate.requireRole("driver"),
  (_req, res) => res.sendStatus(204),
);
app.get(
  "/admin",
  authGate.requireAuth,
  authGate.requireRole("admin"),
  (_req, res) => res.sendStatus(204),
);
app.get("/users/:id", authGate.requireAuth, (req, res) => {
  if (req.user?.id !== Number(req.params.id) && req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  return res.sendStatus(204);
});

describe("Roadly authorization route matrix", () => {
  beforeEach(() => {
    mocks.getSession.mockReset().mockResolvedValue(null);
    mocks.findUnique.mockReset();
  });

  it("rejects anonymous access", async () => {
    expect((await request(app).get("/customer")).status).toBe(401);
  });

  it.each([
    ["customer", "/customer"],
    ["driver", "/driver"],
    ["admin", "/admin"],
  ] as const)(
    "allows the current %s role on its route",
    async (role, route) => {
      mocks.findUnique.mockResolvedValue(userRecord(7, role));
      expect(
        (await request(app).get(route).set("Authorization", bearer(7, role)))
          .status,
      ).toBe(204);
    },
  );

  it("prevents a customer from accessing driver and admin routes", async () => {
    mocks.findUnique.mockResolvedValue(userRecord(7, "customer"));
    const token = bearer(7, "customer");
    expect(
      (await request(app).get("/driver").set("Authorization", token)).status,
    ).toBe(403);
    expect(
      (await request(app).get("/admin").set("Authorization", token)).status,
    ).toBe(403);
  });

  it("enforces ownership while allowing an admin override", async () => {
    mocks.findUnique.mockResolvedValueOnce(userRecord(7, "customer"));
    expect(
      (
        await request(app)
          .get("/users/8")
          .set("Authorization", bearer(7, "customer"))
      ).status,
    ).toBe(403);
    mocks.findUnique.mockResolvedValueOnce(userRecord(1, "admin"));
    expect(
      (
        await request(app)
          .get("/users/8")
          .set("Authorization", bearer(1, "admin"))
      ).status,
    ).toBe(204);
  });

  it("uses the database role after demotion instead of the JWT role", async () => {
    mocks.findUnique.mockResolvedValue(userRecord(1, "customer"));
    expect(
      (
        await request(app)
          .get("/admin")
          .set("Authorization", bearer(1, "admin"))
      ).status,
    ).toBe(403);
  });

  it("rejects a valid token after its user is removed", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(
      (
        await request(app)
          .get("/customer")
          .set("Authorization", bearer(99, "customer"))
      ).status,
    ).toBe(401);
  });
});
