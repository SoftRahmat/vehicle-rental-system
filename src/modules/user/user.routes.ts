import { Router } from "express";
import { userController } from "./user.controller";
import { authGate } from "../../middleware/auth";

export const userRouter = Router();

/**
 * GET /api/v1/users
 * Admin only
 */
userRouter.get("/", authGate.requireAuth, authGate.requireRole("admin"), userController.getAllUsers);

/**
 * PUT /api/v1/users/:userId
 * Admin or Own (owner check in controller)
 */
userRouter.put("/:userId", authGate.requireAuth, userController.updateUser);

/**
 * DELETE /api/v1/users/:userId
 * Admin only (controller enforces active-booking check)
 */
userRouter.delete("/:userId", authGate.requireAuth, authGate.requireRole("admin"), userController.deleteUser);
