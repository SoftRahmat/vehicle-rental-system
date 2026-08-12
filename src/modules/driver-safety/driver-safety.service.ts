import { randomBytes } from "crypto";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
type Actor = { id: number };
const appError = (message: string, status: number) =>
  Object.assign(new Error(message), { status });
const incidentInclude = {
  driver: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  ride: {
    select: {
      id: true,
      reference: true,
      pickupAddress: true,
      dropoffAddress: true,
    },
  },
  assignedTo: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.DriverIncidentInclude;
const driverFor = async (actor: Actor) => {
  const value = await prisma.driverProfile.findUnique({
    where: { userId: actor.id },
  });
  if (!value) throw appError("Driver profile not found", 404);
  return value;
};
const compliance = async (driverId: number) => {
  const required = ["driving_licence", "vehicle_insurance", "road_tax"];
  const docs = await prisma.driverDocument.findMany({
    where: { driverId, type: { in: required } },
  });
  const now = new Date();
  const invalid = required.filter((type) => {
    const doc = docs.find((item) => item.type === type);
    return (
      !doc ||
      doc.status !== "approved" ||
      Boolean(doc.expiresAt && doc.expiresAt < now)
    );
  });
  return { eligible: !invalid.length, missingOrInvalid: invalid };
};
const mine = async (actor: Actor) =>
  prisma.driverIncident.findMany({
    where: { driverId: (await driverFor(actor)).id },
    include: incidentInclude,
    orderBy: { createdAt: "desc" },
  });
const create = async (input: Record<string, unknown>, actor: Actor) => {
  const driver = await driverFor(actor);
  const category = String(input.category ?? ""),
    priority = String(input.priority ?? "normal"),
    description = String(input.description ?? "").trim();
  if (
    ![
      "accident",
      "passenger_issue",
      "vehicle_damage",
      "safety_concern",
      "lost_item",
      "other",
    ].includes(category) ||
    !["normal", "high", "emergency"].includes(priority) ||
    description.length < 10
  )
    throw appError("Choose a category and provide at least 10 characters", 400);
  const rideId = input.rideId ? Number(input.rideId) : null;
  if (
    rideId &&
    !(await prisma.ride.findFirst({
      where: { id: rideId, driverId: driver.id },
    }))
  )
    throw appError("Related ride not found", 404);
  const urls = Array.isArray(input.evidenceUrls)
    ? input.evidenceUrls
        .map(String)
        .filter((value) => {
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        })
        .slice(0, 5)
    : [];
  return prisma.driverIncident.create({
    data: {
      reference: `INC-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`,
      driverId: driver.id,
      rideId,
      category,
      priority,
      description: description.slice(0, 2000),
      evidenceUrls: urls,
    },
    include: incidentInclude,
  });
};
const performanceFor = async (driverId: number) => {
  const [
    completed,
    cancelled,
    rejections,
    reviews,
    earnings,
    shifts,
    incidents,
    offerCounts,
  ] = await Promise.all([
    prisma.ride.count({ where: { driverId, status: "completed" } }),
    prisma.ride.count({
      where: { driverId, status: { in: ["driver_cancelled", "cancelled"] } },
    }),
    prisma.driverRideRejection.count({ where: { driverId } }),
    prisma.rideReview.aggregate({
      where: { driverId, moderationStatus: { not: "hidden" } },
      _avg: { rating: true },
      _count: { id: true },
    }),
    prisma.driverEarning.aggregate({
      where: { driverId },
      _sum: { netEarning: true },
      _avg: { netEarning: true },
    }),
    prisma.driverShift.findMany({ where: { driverId } }),
    prisma.driverIncident.count({
      where: { driverId, status: { in: ["open", "investigating"] } },
    }),
    prisma.rideOffer.groupBy({
      by: ["status"],
      where: { driverId },
      _count: { id: true },
    }),
  ]);
  const onlineMinutes = Math.round(
    shifts.reduce(
      (sum, shift) =>
        sum +
        ((shift.endedAt ?? new Date()).getTime() - shift.startedAt.getTime()) /
          60000,
      0,
    ),
  );
  const offered = offerCounts.reduce((sum, item) => sum + item._count.id, 0);
  const accepted =
    offerCounts.find((item) => item.status === "accepted")?._count.id ?? 0;
  return {
    completed,
    cancelled,
    rejections,
    acceptanceRate: offered ? Math.round((accepted / offered) * 100) : 0,
    averageRating: Number(reviews._avg.rating ?? 0),
    reviewCount: reviews._count.id,
    netEarnings: Number(earnings._sum.netEarning ?? 0),
    averageEarning: Number(earnings._avg.netEarning ?? 0),
    onlineMinutes,
    openIncidents: incidents,
  };
};
const performance = async (actor: Actor) =>
  performanceFor((await driverFor(actor)).id);
const adminList = async (query: Record<string, unknown>) => {
  const page = Math.max(1, Number(query.page) || 1),
    pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 15)),
    search = String(query.search ?? "").trim();
  const where: Prisma.DriverIncidentWhereInput = {
    ...(query.status ? { status: String(query.status) } : {}),
    ...(query.priority ? { priority: String(query.priority) } : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" } },
            {
              driver: {
                user: { name: { contains: search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.driverIncident.findMany({
      where,
      include: incidentInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.driverIncident.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};
const review = async (
  id: number,
  input: Record<string, unknown>,
  actor: Actor,
) => {
  const status = String(input.status ?? ""),
    note = String(input.resolutionNote ?? "").trim();
  if (!["investigating", "resolved", "dismissed"].includes(status))
    throw appError("Choose a valid investigation status", 400);
  if (["resolved", "dismissed"].includes(status) && !note)
    throw appError("A resolution note is required", 400);
  return prisma.driverIncident.update({
    where: { id },
    data: {
      status,
      ...(status === "investigating" ? { assignedToId: actor.id } : {}),
      ...(note ? { resolutionNote: note } : {}),
      ...(["resolved", "dismissed"].includes(status)
        ? { resolvedById: actor.id, resolvedAt: new Date() }
        : {}),
      updatedAt: new Date(),
    },
    include: incidentInclude,
  });
};
const risk = async (
  driverId: number,
  input: Record<string, unknown>,
  actor: Actor,
) => {
  const action = String(input.action ?? ""),
    reason = String(input.reason ?? "").trim();
  if (!["flag", "suspend", "clear"].includes(action) || !reason)
    throw appError("Choose an action and enter a reason", 400);
  const status =
    action === "flag"
      ? "flagged"
      : action === "suspend"
        ? "suspended"
        : "clear";
  return prisma.$transaction(async (tx) => {
    await tx.driverRiskAction.create({
      data: {
        driverId,
        action,
        reason: reason.slice(0, 500),
        createdById: actor.id,
      },
    });
    return tx.driverProfile.update({
      where: { id: driverId },
      data: {
        riskStatus: status,
        suspensionReason: status === "clear" ? null : reason.slice(0, 500),
        suspendedAt: status === "suspended" ? new Date() : null,
        ...(status === "suspended" ? { availability: "offline" } : {}),
        updatedAt: new Date(),
      },
      include: { user: true },
    });
  });
};
export const driverSafetyService = {
  compliance,
  mine,
  create,
  performance,
  performanceFor,
  adminList,
  review,
  risk,
};
