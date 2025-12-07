import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { authService } from "./auth.service";

/**
 * Signup controller
 */
const signup = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, phone, role } = req.body;

  const created = await authService.signup({
    name,
    email,
    password,
    phone,
    role,
  });

  res.status(201).json({
    success: true,
    message: "User registered successfully",
    data: created,
  });
});

/**
 * Signin controller
 * Returns token + user (without password)
 */
const signin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await authService.signin({ email, password });

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: result,
  });
});

export const authController = {
  signup,
  signin
};
