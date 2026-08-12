import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

type Actor = { id: number };
const types = [
  "driving_licence",
  "vehicle_insurance",
  "road_tax",
  "vehicle_permit",
];
const statuses = ["pending", "approved", "rejected"];
const appError = (message: string, status: number) =>
  Object.assign(new Error(message), { status });
const include = {
  driver: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  reviewedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.DriverDocumentInclude;

const driverIdFor = async (actor: Actor) => {
  const profile = await prisma.driverProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!profile) throw appError("Driver profile not found", 404);
  return profile.id;
};

const mine = async (actor: Actor) =>
  prisma.driverDocument.findMany({
    where: { driverId: await driverIdFor(actor) },
    include,
    orderBy: { type: "asc" },
  });

const save = async (input: Record<string, unknown>, actor: Actor) => {
  const driverId = await driverIdFor(actor);
  const type = String(input.type ?? "");
  const documentUrl = String(input.documentUrl ?? "").trim();
  if (!types.includes(type))
    throw appError("Choose a valid document type", 400);
  try {
    new URL(documentUrl);
  } catch {
    throw appError("Enter a valid document URL", 400);
  }
  const expiresAt = input.expiresAt ? new Date(String(input.expiresAt)) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime()))
    throw appError("Enter a valid expiry date", 400);
  return prisma.driverDocument.upsert({
    where: { driverId_type: { driverId, type } },
    create: {
      driverId,
      type,
      documentUrl,
      documentNumber: String(input.documentNumber ?? "").trim() || null,
      issuedAt: input.issuedAt ? new Date(String(input.issuedAt)) : null,
      expiresAt,
    },
    update: {
      documentUrl,
      documentNumber: String(input.documentNumber ?? "").trim() || null,
      issuedAt: input.issuedAt ? new Date(String(input.issuedAt)) : null,
      expiresAt,
      status: "pending",
      rejectionReason: null,
      reviewedById: null,
      reviewedAt: null,
      updatedAt: new Date(),
    },
    include,
  });
};

const adminList = async (query: Record<string, unknown>) => {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 15));
  const search = String(query.search ?? "").trim();
  const where: Prisma.DriverDocumentWhereInput = {
    ...(query.status && statuses.includes(String(query.status))
      ? { status: String(query.status) }
      : {}),
    ...(query.type && types.includes(String(query.type))
      ? { type: String(query.type) }
      : {}),
    ...(search
      ? {
          OR: [
            { documentNumber: { contains: search, mode: "insensitive" } },
            {
              driver: {
                user: { name: { contains: search, mode: "insensitive" } },
              },
            },
            {
              driver: {
                user: { email: { contains: search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.driverDocument.findMany({
      where,
      include,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.driverDocument.count({ where }),
  ]);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

const review = async (
  id: number,
  input: Record<string, unknown>,
  actor: Actor,
) => {
  const status = String(input.status ?? "");
  const reason = String(input.rejectionReason ?? "").trim();
  if (!["approved", "rejected"].includes(status))
    throw appError("Choose approved or rejected", 400);
  if (status === "rejected" && !reason)
    throw appError("A rejection reason is required", 400);
  const document = await prisma.driverDocument.findUnique({ where: { id } });
  if (!document) throw appError("Driver document not found", 404);
  return prisma.driverDocument.update({
    where: { id },
    data: {
      status,
      rejectionReason: status === "rejected" ? reason.slice(0, 500) : null,
      reviewedById: actor.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    },
    include,
  });
};

export const driverDocumentService = { mine, save, adminList, review };
