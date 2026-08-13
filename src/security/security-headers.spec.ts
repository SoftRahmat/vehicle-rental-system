import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../app";

describe("API security headers", () => {
  it("disables caching and applies browser hardening headers", async () => {
    const response = await request(app).get("/api/v1/not-a-real-route");

    expect(response.status).toBe(404);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["content-security-policy"]).toContain(
      "default-src 'none'",
    );
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
