import type { Request, Response } from "express";
import { currencyService } from "./currency.service";

export const currencyController = {
  async options(_req: Request, res: Response) {
    res.json({
      success: true,
      message: "Currency options retrieved",
      data: await currencyService.publicConfig(),
    });
  },
};
