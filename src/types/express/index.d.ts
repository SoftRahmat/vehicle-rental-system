/**
 * AuthUser describes what we attach to req.user after successful auth.
 */
export type AuthUser = {
  id: number;
  role: "admin" | "customer" | "driver";
  name?: string;
  email?: string;
};

declare global {
  namespace Express {
    // request.user will be AuthUser | undefined
    interface Request {
      user?: AuthUser;
    }
  }
}
