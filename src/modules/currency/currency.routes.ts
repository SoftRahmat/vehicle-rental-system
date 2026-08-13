import { Router } from "express";
import { currencyController } from "./currency.controller";

export const currencyRouter = Router();

currencyRouter.get("/", currencyController.options);
