import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { paymentRouter } from "./payment.routes";
import { paymentService } from "./payment.service";

const app = express();
app.use(express.json());
app.use("/api/v1/payments", paymentRouter);
app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  res.status(error.status ?? 500).json({ message: error.message });
});

describe("mobile payment return", () => {
  it("creates only a validated Roadly custom-scheme destination", () => {
    expect(
      paymentService.mobileAppRedirectUrl({
        kind: "booking",
        status: "success",
        id: "42",
        session_id: "ignored-secret",
      }),
    ).toBe("roadly://payment/booking/success?id=42");
  });

  it.each([
    { kind: "admin", status: "success", id: "42" },
    { kind: "ride", status: "paid", id: "42" },
    { kind: "ride", status: "success", id: "-1" },
  ])("rejects invalid return input %#", (input) => {
    expect(() => paymentService.mobileAppRedirectUrl(input)).toThrow(
      "Invalid mobile payment return",
    );
  });

  it("redirects the public bridge without forwarding Stripe session data", async () => {
    const response = await request(app).get(
      "/api/v1/payments/mobile-return?kind=ride&status=success&id=7&session_id=secret",
    );
    expect(response.status).toBe(303);
    expect(response.headers.location).toBe(
      "roadly://payment/ride/success?id=7",
    );
  });
});
