import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

type PublicUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  created_at: Date | null;
  updated_at: Date | null;
};

type Actor = {
  id: number;
  role: "admin" | "customer";
};

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const toPublicUser = (user: SelectedUser): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  created_at: user.createdAt,
  updated_at: user.updatedAt,
});

const appError = (
  message: string,
  status: number,
): Error & { status: number } => Object.assign(new Error(message), { status });

const getAllUsers = async (): Promise<PublicUser[]> => {
  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: userSelect,
  });
  return users.map(toPublicUser);
};

const updateUser = async (
  userId: number,
  payload: Partial<{
    name: string;
    email: string;
    phone: string;
    role: string;
  }>,
  actor?: Actor,
): Promise<PublicUser> => {
  if (!actor) throw appError("Unauthorized", 401);
  const isAdmin = actor.role === "admin";
  if (!isAdmin && actor.id !== userId) throw appError("Forbidden", 403);
  if (!isAdmin && payload.role !== undefined) {
    throw appError("Forbidden: cannot change role", 403);
  }
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!existing) throw appError("User not found", 404);

  const data: Prisma.UserUpdateInput = { updatedAt: new Date() };
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.email !== undefined) data.email = payload.email.toLowerCase();
  if (payload.phone !== undefined) data.phone = payload.phone;
  if (payload.role !== undefined) data.role = payload.role;

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: userSelect,
    });
    return toPublicUser(updated);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw appError("Email already registered", 409);
    }
    throw error;
  }
};

const deleteUser = async (userId: number): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) throw appError("User not found", 404);
  const activeBookings = await prisma.booking.count({
    where: { customerId: userId, status: "active" },
  });
  if (activeBookings > 0)
    throw appError("Cannot delete user with active bookings", 400);
  await prisma.user.delete({ where: { id: userId } });
};

export const userService = { getAllUsers, updateUser, deleteUser };
