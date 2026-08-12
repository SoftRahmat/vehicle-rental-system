import { randomBytes } from "crypto";
import { Prisma } from "../../generated/prisma/client";
import config from "../../config";
import { prisma } from "../../lib/prisma";

type Actor = { id: number; role: "admin" | "customer" | "driver" };
const appError = (message: string, status: number) =>
  Object.assign(new Error(message), { status });
const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const earningInclude = {
  ride: {
    select: {
      id: true,
      reference: true,
      serviceType: true,
      paymentMethod: true,
      paymentStatus: true,
      pickupAddress: true,
      dropoffAddress: true,
      completedAt: true,
    },
  },
} as const satisfies Prisma.DriverEarningInclude;
const payoutInclude = {
  driver: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  approvedBy: { select: { id: true, name: true } },
  items: {
    include: {
      earning: { include: { ride: { select: { id: true, reference: true } } } },
    },
  },
  adjustments: true,
} as const satisfies Prisma.DriverPayoutInclude;

const driverIdFor = async (actor: Actor): Promise<number> => {
  const driver = await prisma.driverProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!driver) throw appError("Driver profile not found", 404);
  return driver.id;
};

const syncRideEarning = async (rideId: number) => {
  const existing = await prisma.driverEarning.findUnique({ where: { rideId } });
  if (existing) return existing;
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (
    !ride ||
    ride.status !== "completed" ||
    !ride.driverId ||
    ride.finalFare === null
  )
    return null;
  if (!["paid", "cash_collected"].includes(ride.paymentStatus)) return null;
  const grossFare = Number(ride.finalFare);
  const toll = Number(ride.tollAmount);
  const commissionRate = Math.min(
    100,
    Math.max(0, config.driverCommissionPercent),
  );
  const platformCommission = money(
    Math.max(0, grossFare - toll) * (commissionRate / 100),
  );
  return prisma.driverEarning.create({
    data: {
      rideId: ride.id,
      driverId: ride.driverId,
      currency: ride.currency,
      grossFare,
      commissionRate,
      platformCommission,
      tollReimbursement: toll,
      netEarning: money(grossFare - platformCommission),
      settlementMethod:
        ride.paymentMethod === "cash" ? "cash_collected" : "card_payout",
      settlementStatus:
        ride.paymentMethod === "cash" ? "cash_settled" : "pending",
      earnedAt: ride.completedAt ?? new Date(),
    },
  });
};

const summary = async (actor: Actor) => {
  const driverId = await driverIdFor(actor);
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const week = new Date(today);
  week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const sum = async (where: Prisma.DriverEarningWhereInput) => {
    const result = await prisma.driverEarning.aggregate({
      where,
      _sum: {
        grossFare: true,
        platformCommission: true,
        adjustmentAmount: true,
        netEarning: true,
      },
      _count: { id: true },
    });
    return {
      trips: result._count.id,
      gross: Number(result._sum.grossFare ?? 0),
      commission: Number(result._sum.platformCommission ?? 0),
      adjustments: Number(result._sum.adjustmentAmount ?? 0),
      net: Number(result._sum.netEarning ?? 0),
    };
  };
  const [todayData, weekData, monthData, pending, cash, paid] =
    await Promise.all([
      sum({ driverId, earnedAt: { gte: today } }),
      sum({ driverId, earnedAt: { gte: week } }),
      sum({ driverId, earnedAt: { gte: month } }),
      sum({ driverId, settlementStatus: "pending" }),
      sum({ driverId, settlementStatus: "cash_settled" }),
      sum({ driverId, settlementStatus: "paid" }),
    ]);
  return {
    currency: "MYR",
    commissionPercent: config.driverCommissionPercent,
    today: todayData,
    week: weekData,
    month: monthData,
    pendingPayout: pending.net,
    cashCollected: cash.gross,
    paidOut: paid.net,
  };
};

const earnings = async (query: Record<string, unknown>, actor: Actor) => {
  const driverId = await driverIdFor(actor);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 15));
  const search = String(query.search ?? "").trim();
  const where: Prisma.DriverEarningWhereInput = {
    driverId,
    ...(query.status ? { settlementStatus: String(query.status) } : {}),
    ...(query.method ? { settlementMethod: String(query.method) } : {}),
    ...(search
      ? { ride: { reference: { contains: search, mode: "insensitive" } } }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.driverEarning.findMany({
      where,
      include: earningInclude,
      orderBy: { earnedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.driverEarning.count({ where }),
  ]);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

const payouts = async (query: Record<string, unknown>, actor: Actor) => {
  const driverId = await driverIdFor(actor);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 15));
  const where = {
    driverId,
    ...(query.status ? { status: String(query.status) } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.driverPayout.findMany({
      where,
      include: payoutInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.driverPayout.count({ where }),
  ]);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

const adminPayouts = async (query: Record<string, unknown>) => {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 15));
  const search = String(query.search ?? "").trim();
  const where: Prisma.DriverPayoutWhereInput = {
    ...(query.status ? { status: String(query.status) } : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" } },
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
    prisma.driverPayout.findMany({
      where,
      include: payoutInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.driverPayout.count({ where }),
  ]);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

const balances = async () => {
  const rows = await prisma.driverEarning.groupBy({
    by: ["driverId"],
    where: { settlementStatus: "pending", settlementMethod: "card_payout" },
    _sum: {
      grossFare: true,
      platformCommission: true,
      adjustmentAmount: true,
      netEarning: true,
    },
    _count: { id: true },
  });
  const drivers = await prisma.driverProfile.findMany({
    where: { id: { in: rows.map((row) => row.driverId) } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((row) => ({
    driver: drivers.find((driver) => driver.id === row.driverId),
    trips: row._count.id,
    gross: Number(row._sum.grossFare ?? 0),
    commission: Number(row._sum.platformCommission ?? 0),
    adjustments: Number(row._sum.adjustmentAmount ?? 0),
    payable: Number(row._sum.netEarning ?? 0),
  }));
};

const createPayout = async (input: {
  driverId?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
}) => {
  const driverId = Number(input.driverId);
  if (!driverId) throw appError("Choose a driver", 400);
  const periodStart = input.periodStart
    ? new Date(String(input.periodStart))
    : new Date("2000-01-01");
  const periodEnd = input.periodEnd
    ? new Date(String(input.periodEnd))
    : new Date();
  periodEnd.setHours(23, 59, 59, 999);
  const earnings = await prisma.driverEarning.findMany({
    where: {
      driverId,
      settlementMethod: "card_payout",
      settlementStatus: "pending",
      earnedAt: { gte: periodStart, lte: periodEnd },
      payoutItem: null,
    },
    orderBy: { earnedAt: "asc" },
  });
  if (!earnings.length)
    throw appError(
      "No pending card earnings are available for this payout period",
      400,
    );
  const gross = money(
    earnings.reduce((sum, item) => sum + Number(item.grossFare), 0),
  );
  const commission = money(
    earnings.reduce((sum, item) => sum + Number(item.platformCommission), 0),
  );
  const adjustments = money(
    earnings.reduce((sum, item) => sum + Number(item.adjustmentAmount), 0),
  );
  const net = money(
    earnings.reduce((sum, item) => sum + Number(item.netEarning), 0),
  );
  const reference = `PAY-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
  return prisma.$transaction(async (tx) => {
    const payout = await tx.driverPayout.create({
      data: {
        reference,
        driverId,
        periodStart,
        periodEnd,
        grossEarnings: gross,
        commissionAmount: commission,
        adjustmentAmount: adjustments,
        netAmount: net,
        items: {
          create: earnings.map((earning) => ({
            earningId: earning.id,
            amount: earning.netEarning,
          })),
        },
      },
    });
    await tx.driverEarning.updateMany({
      where: { id: { in: earnings.map((earning) => earning.id) } },
      data: { settlementStatus: "processing", updatedAt: new Date() },
    });
    return tx.driverPayout.findUniqueOrThrow({
      where: { id: payout.id },
      include: payoutInclude,
    });
  });
};

const updatePayout = async (
  payoutId: number,
  input: { status?: unknown; paymentReference?: unknown },
  actor: Actor,
) => {
  const status = String(input.status ?? "");
  if (!["approved", "paid", "failed"].includes(status))
    throw appError("Select approved, paid, or failed", 400);
  const payout = await prisma.driverPayout.findUnique({
    where: { id: payoutId },
    include: { items: true },
  });
  if (!payout) throw appError("Payout not found", 404);
  const allowed: Record<string, string[]> = {
    draft: ["approved", "failed"],
    approved: ["paid", "failed"],
  };
  if (!allowed[payout.status]?.includes(status))
    throw appError(`A ${payout.status} payout cannot move to ${status}`, 400);
  const paymentReference =
    String(input.paymentReference ?? "")
      .trim()
      .slice(0, 120) || null;
  if (status === "paid" && !paymentReference)
    throw appError("Enter the bank or payment reference", 400);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.driverEarning.updateMany({
      where: { id: { in: payout.items.map((item) => item.earningId) } },
      data: {
        settlementStatus:
          status === "paid"
            ? "paid"
            : status === "failed"
              ? "pending"
              : "processing",
        updatedAt: now,
      },
    });
    return tx.driverPayout.update({
      where: { id: payout.id },
      data: {
        status,
        paymentReference,
        ...(status === "approved"
          ? { approvedById: actor.id, approvedAt: now }
          : {}),
        ...(status === "paid" ? { paidAt: now } : {}),
        updatedAt: now,
      },
      include: payoutInclude,
    });
  });
};

const addAdjustment = async (
  earningId: number,
  input: { amount?: unknown; reason?: unknown },
  actor: Actor,
) => {
  const amount = money(Number(input.amount));
  const reason = String(input.reason ?? "")
    .trim()
    .slice(0, 240);
  if (!amount || !reason)
    throw appError("Enter a non-zero amount and reason", 400);
  const earning = await prisma.driverEarning.findUnique({
    where: { id: earningId },
    include: { payoutItem: true },
  });
  if (!earning) throw appError("Earning not found", 404);
  if (earning.settlementStatus !== "pending" || earning.payoutItem)
    throw appError("Only pending earnings can be adjusted", 400);
  return prisma.$transaction(async (tx) => {
    await tx.driverAdjustment.create({
      data: {
        driverId: earning.driverId,
        earningId: earning.id,
        amount,
        reason,
        createdById: actor.id,
      },
    });
    return tx.driverEarning.update({
      where: { id: earning.id },
      data: {
        adjustmentAmount: { increment: amount },
        netEarning: { increment: amount },
        updatedAt: new Date(),
      },
      include: earningInclude,
    });
  });
};

export const driverEarningService = {
  syncRideEarning,
  summary,
  earnings,
  payouts,
  adminPayouts,
  balances,
  createPayout,
  updatePayout,
  addAdjustment,
};
