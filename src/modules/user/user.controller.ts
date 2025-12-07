import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { userService } from "./user.service";

/**
 * GET /api/v1/users
 */
const getAllUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await userService.getAllUsers();
  res.status(200).json(
    {
      success: true,
      message: "Users retrieved successfully",
      data: users
    }
  );
});

/**
 * PUT /api/v1/users/:userId
 * Admin may update any user. Customer may update own profile only.
 */
const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const actor = req.user;
 
  const payload = req.body;

  const updated = await userService.updateUser(Number(userId), payload, actor);
  res.status(200).json(
    {
      success: true,
      message: "User updated successfully",
      data: updated
    }
  );
});

/**
 * DELETE /api/v1/users/:userId
 * Admin only (middleware ensures admin)
 */
const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  await userService.deleteUser(Number(userId));
  res.status(200).json(
    {
      success: true,
      message: "User deleted successfully"
    }
  );
});

export const userController = {
  getAllUsers,
  updateUser,
  deleteUser
}
