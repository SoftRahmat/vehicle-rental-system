import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { Prisma } from "../../generated/prisma/client";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { routingService } from "./routing.service";
import {
  rideServiceTypes,
  rideStatuses,
  type RideQuoteRequest,
  type RideQuoteToken,
  type RideStatus,
} from "./ride.types";
import { driverEarningService } from "../driver-earning/driver-earning.service";
import { driverSafetyService } from "../driver-safety/driver-safety.service";
import { currencyService } from "../currency/currency.service";

type Actor = { id: number; role: "admin" | "customer" | "driver" };
const appError = (message: string, status: number) =>
  Object.assign(new Error(message), { status });
const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const driverPresenceCutoff = () => new Date(Date.now() - 5 * 60 * 1000);
const terminalStatuses: RideStatus[] = [
  "completed",
  "customer_cancelled",
  "admin_cancelled",
  "no_driver_available",
];
const driverRejectionReasons = ["not_available", "too_far", "other"] as const;
type DriverRejectionReason = (typeof driverRejectionReasons)[number];

const rideInclude = {
  passenger: { select: { id: true, name: true, email: true, phone: true } },
  driver: {
    include: {
      user: { select: { id: true, name: true, phone: true, avatarUrl: true } },
    },
  },
  events: { orderBy: { createdAt: "asc" as const } },
  rejections: {
    orderBy: { createdAt: "desc" as const },
    take: 10,
    include: {
      driver: { include: { user: { select: { id: true, name: true } } } },
    },
  },
  offers: { orderBy: { offeredAt: "desc" as const }, take: 1 },
} as const satisfies Prisma.RideInclude;

const publicOptions = async () => {
  const [fareRules, zones] = await Promise.all([
    prisma.rideFareRule.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
    }),
    prisma.serviceZone.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return {
    city: "Kuala Lumpur",
    country: "Malaysia",
    currency: config.ridesCurrency,
    immediateOnly: true,
    routingConfigured: Boolean(config.googleMapsServerKey),
    services: fareRules.map((rule) => ({
      type: rule.serviceType,
      currency: rule.currency,
      baseFare: Number(rule.baseFare),
      perKmRate: Number(rule.perKmRate),
      perMinuteRate: Number(rule.perMinuteRate),
      bookingFee: Number(rule.bookingFee),
      minimumFare: Number(rule.minimumFare),
    })),
    zones: zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      center: { lat: Number(zone.centerLat), lng: Number(zone.centerLng) },
      radiusKm: Number(zone.radiusKm),
    })),
  };
};

const quote = async (payload: RideQuoteRequest, actor: Actor) => {
  if (!rideServiceTypes.includes(payload?.serviceType))
    throw appError("Choose Bike, Car, or XL", 400);
  if (!payload.pickup?.address?.trim() || !payload.dropoff?.address?.trim()) {
    throw appError("Pickup and drop-off addresses are required", 400);
  }
  const rule = await prisma.rideFareRule.findUnique({
    where: { serviceType: payload.serviceType },
  });
  if (!rule?.active)
    throw appError("This ride type is currently unavailable", 400);
  const route = await routingService.calculateRoute(
    payload.pickup,
    payload.dropoff,
    payload.serviceType,
  );
  const baseFare = Number(rule.baseFare);
  const distanceFare = money(
    (route.distanceMeters / 1_000) * Number(rule.perKmRate),
  );
  const timeFare = money(
    (route.durationSeconds / 60) * Number(rule.perMinuteRate),
  );
  const bookingFee = Number(rule.bookingFee);
  const subtotal = money(baseFare + distanceFare + timeFare + bookingFee);
  const normalizedPromo = payload.promoCode?.trim().toUpperCase();
  const promo = normalizedPromo
    ? await prisma.ridePromoCode.findFirst({
        where: {
          code: normalizedPromo,
          active: true,
          startsAt: { lte: new Date() },
          endsAt: { gte: new Date() },
          minimumFare: { lte: subtotal },
        },
      })
    : null;
  if (
    normalizedPromo &&
    (!promo ||
      (promo.usageLimit !== null && promo.usageCount >= promo.usageLimit))
  ) {
    throw appError(
      "Promo code is invalid, expired, or has reached its limit",
      400,
    );
  }
  const rawDiscount = promo
    ? promo.discountType === "percent"
      ? subtotal * (Number(promo.discountValue) / 100)
      : Number(promo.discountValue)
    : 0;
  const discountAmount = money(
    promo?.maximumDiscount
      ? Math.min(rawDiscount, Number(promo.maximumDiscount))
      : rawDiscount,
  );
  const estimatedFare = Math.max(
    Number(rule.minimumFare),
    money(subtotal - discountAmount),
  );
  const currencySnapshot = await currencyService.transactionSnapshot(
    estimatedFare,
    rule.currency,
    payload.displayCurrency,
  );
  const tokenPayload: RideQuoteToken = {
    purpose: "ride_quote",
    passengerId: actor.id,
    serviceType: payload.serviceType,
    pickup: { ...payload.pickup, address: payload.pickup.address.trim() },
    dropoff: { ...payload.dropoff, address: payload.dropoff.address.trim() },
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    currency: rule.currency,
    baseFare,
    distanceFare,
    timeFare,
    bookingFee,
    discountAmount,
    promoCodeId: promo?.id ?? null,
    estimatedFare,
    routingProvider: route.provider,
    paymentMethod: payload.paymentMethod === "cash" ? "cash" : "card",
    displayCurrency: currencySnapshot.displayCurrency,
    exchangeRate: currencySnapshot.exchangeRate,
    displayEstimatedFare: currencySnapshot.displayAmount,
    exchangeRateSource: currencySnapshot.exchangeRateSource,
    exchangeRateCapturedAt: currencySnapshot.exchangeRateCapturedAt.toISOString(),
  };
  const quoteToken = jwt.sign(tokenPayload, config.jwtSecret as string, {
    expiresIn: "5m",
  });
  return { ...tokenPayload, quoteToken };
};

const decodeQuote = (quoteToken: string, actor: Actor): RideQuoteToken => {
  try {
    const value = jwt.verify(
      quoteToken,
      config.jwtSecret as string,
    ) as RideQuoteToken;
    if (value.purpose !== "ride_quote" || value.passengerId !== actor.id)
      throw new Error();
    return value;
  } catch {
    throw appError(
      "This fare quote has expired. Please calculate it again",
      400,
    );
  }
};

const createRide = async (quoteToken: string, actor: Actor) => {
  if (!quoteToken) throw appError("A valid fare quote is required", 400);
  const quoteData = decodeQuote(quoteToken, actor);
  const activeRide = await prisma.ride.findFirst({
    where: { passengerId: actor.id, status: { notIn: terminalStatuses } },
    select: { reference: true },
  });
  if (activeRide)
    throw appError(
      `You already have an active ride (${activeRide.reference})`,
      409,
    );
  const reference = `RDE-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const created = await prisma.ride.create({
    data: {
      reference,
      passengerId: actor.id,
      serviceType: quoteData.serviceType,
      pickupAddress: quoteData.pickup.address,
      pickupLat: quoteData.pickup.lat,
      pickupLng: quoteData.pickup.lng,
      dropoffAddress: quoteData.dropoff.address,
      dropoffLat: quoteData.dropoff.lat,
      dropoffLng: quoteData.dropoff.lng,
      distanceMeters: quoteData.distanceMeters,
      durationSeconds: quoteData.durationSeconds,
      currency: quoteData.currency,
      displayCurrency: quoteData.displayCurrency,
      exchangeRate: quoteData.exchangeRate,
      displayEstimatedFare: quoteData.displayEstimatedFare,
      exchangeRateSource: quoteData.exchangeRateSource,
      exchangeRateCapturedAt: new Date(quoteData.exchangeRateCapturedAt),
      baseFare: quoteData.baseFare,
      distanceFare: quoteData.distanceFare,
      timeFare: quoteData.timeFare,
      bookingFee: quoteData.bookingFee,
      discountAmount: quoteData.discountAmount,
      promoCodeId: quoteData.promoCodeId,
      estimatedFare: quoteData.estimatedFare,
      routingProvider: quoteData.routingProvider,
      paymentMethod: quoteData.paymentMethod,
      paymentStatus:
        quoteData.paymentMethod === "cash"
          ? "cash_due"
          : "authorization_required",
      events: {
        create: {
          actorId: actor.id,
          toStatus: "requested",
          note: "Ride requested",
        },
      },
    },
    include: rideInclude,
  });
  if (quoteData.promoCodeId) {
    await prisma.ridePromoCode.update({
      where: { id: quoteData.promoCodeId },
      data: { usageCount: { increment: 1 }, updatedAt: new Date() },
    });
  }
  if (quoteData.paymentMethod === "card") return created;
  return (await autoAssignRide(created.id)) ?? created;
};

const myRides = (actor: Actor) =>
  prisma.ride.findMany({
    where: { passengerId: actor.id },
    include: rideInclude,
    orderBy: { requestedAt: "desc" },
  });

const cancelRide = async (rideId: number, reason: string, actor: Actor) => {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride || ride.passengerId !== actor.id)
    throw appError("Ride not found", 404);
  if (
    !["requested", "driver_assigned", "driver_arriving"].includes(ride.status)
  ) {
    throw appError("This ride can no longer be cancelled online", 400);
  }
  const fareRule = await prisma.rideFareRule.findUnique({
    where: { serviceType: ride.serviceType },
  });
  const cancellationFee =
    ride.status === "requested" ? 0 : Number(fareRule?.cancellationFee ?? 0);
  return prisma.$transaction(async (tx) => {
    await tx.rideOffer.updateMany({
      where: { rideId: ride.id, status: "pending" },
      data: { status: "cancelled", respondedAt: new Date() },
    });
    if (ride.driverId) {
      await tx.driverProfile.update({
        where: { id: ride.driverId },
        data: { availability: "available" },
      });
    }
    return tx.ride.update({
      where: { id: ride.id },
      data: {
        status: "customer_cancelled",
        cancellationReason: reason?.trim() || "Cancelled by customer",
        cancelledAt: new Date(),
        cancellationFee,
        finalFare: cancellationFee,
        paymentStatus:
          cancellationFee > 0
            ? ride.paymentMethod === "cash"
              ? "cash_due"
              : "pending"
            : "not_due",
        updatedAt: new Date(),
        events: {
          create: {
            actorId: actor.id,
            fromStatus: ride.status,
            toStatus: "customer_cancelled",
            note: reason?.trim() || "Cancelled by customer",
          },
        },
      },
      include: rideInclude,
    });
  });
};

const adminRides = async (query: {
  page?: number;
  pageSize?: number;
  status?: string;
  serviceType?: string;
  search?: string;
  attention?: string;
}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 15));
  const statuses = String(query.status || "")
    .split(",")
    .map((status) => status.trim())
    .filter((status) => rideStatuses.includes(status as RideStatus));
  const attentionWhere: Prisma.RideWhereInput =
    query.attention === "awaiting_card"
      ? {
          status: "requested",
          paymentMethod: "card",
          paymentStatus: { not: "authorized" },
        }
      : query.attention === "driver_rejected"
        ? { rejections: { some: {} } }
        : query.attention === "cash_confirmation"
          ? { status: "in_progress", paymentMethod: "cash" }
          : {};
  const baseWhere: Prisma.RideWhereInput = {
    AND: [attentionWhere],
    ...(query.serviceType ? { serviceType: query.serviceType } : {}),
    ...(query.search
      ? {
          OR: [
            { reference: { contains: query.search, mode: "insensitive" } },
            { pickupAddress: { contains: query.search, mode: "insensitive" } },
            { dropoffAddress: { contains: query.search, mode: "insensitive" } },
            {
              passenger: {
                name: { contains: query.search, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  };
  const where: Prisma.RideWhereInput = {
    ...baseWhere,
    ...(statuses.length ? { status: { in: statuses } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.ride.findMany({
      where,
      include: rideInclude,
      orderBy: { requestedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ride.count({ where }),
  ]);
  const groupedStatuses = await prisma.ride.groupBy({
    by: ["status"],
    where: baseWhere,
    orderBy: { status: "asc" },
    _count: { id: true },
  });
  const statusCount = (included: string[]) =>
    groupedStatuses
      .filter(({ status }) => included.includes(status))
      .reduce((sum, group) => sum + group._count.id, 0);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    statusCounts: {
      needsAction: statusCount(["requested"]),
      active: statusCount([
        "driver_assigned",
        "driver_arriving",
        "driver_arrived",
        "in_progress",
      ]),
      completed: statusCount(["completed"]),
      cancelled: statusCount(["customer_cancelled", "admin_cancelled"]),
      all: groupedStatuses.reduce((sum, group) => sum + group._count.id, 0),
    },
  };
};

const drivers = async () => {
  const profiles = await prisma.driverProfile.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const cutoff = driverPresenceCutoff();
  return profiles.map((profile) => ({
    ...profile,
    isOnline:
      profile.availability === "available" &&
      profile.currentLat !== null &&
      profile.currentLng !== null &&
      profile.lastLocationAt !== null &&
      profile.lastLocationAt >= cutoff,
  }));
};

const createDriver = async (payload: any) => {
  if (!rideServiceTypes.includes(payload?.serviceType))
    throw appError("Choose Bike, Car, or XL", 400);
  const user = await prisma.user.findUnique({
    where: { id: Number(payload.userId) },
  });
  if (!user) throw appError("User not found", 404);
  if (user.role === "admin")
    throw appError("An administrator account cannot become a driver", 400);
  return prisma.$transaction(async (tx) => {
    const profile = await tx.driverProfile.create({
      data: {
        userId: user.id,
        serviceType: payload.serviceType,
        licenseNumber: String(payload.licenseNumber || "").trim(),
        vehicleMake: String(payload.vehicleMake || "").trim(),
        vehicleModel: String(payload.vehicleModel || "").trim(),
        vehiclePlate: String(payload.vehiclePlate || "")
          .trim()
          .toUpperCase(),
        vehicleColor: String(payload.vehicleColor || "").trim(),
        seats: Number(payload.seats),
        approvalStatus:
          payload.approvalStatus === "approved" ? "approved" : "pending",
      },
      include: { user: true },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { role: "driver", updatedAt: new Date() },
    });
    return profile;
  });
};

const updateDriver = async (driverId: number, payload: any) => {
  const data: Prisma.DriverProfileUpdateInput = { updatedAt: new Date() };
  if (["pending", "approved", "suspended"].includes(payload.approvalStatus))
    data.approvalStatus = payload.approvalStatus;
  if (["offline", "available"].includes(payload.availability))
    data.availability = payload.availability;
  return prisma.driverProfile.update({
    where: { id: driverId },
    data,
    include: { user: true },
  });
};

const transitions: Record<string, RideStatus[]> = {
  requested: ["driver_assigned", "admin_cancelled", "no_driver_available"],
  driver_assigned: ["driver_arriving", "admin_cancelled"],
  driver_arriving: ["driver_arrived", "admin_cancelled"],
  driver_arrived: ["in_progress", "admin_cancelled"],
  in_progress: ["completed"],
};

const assignDriver = async (rideId: number, driverId: number, actor?: Actor) =>
  prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findUnique({ where: { id: rideId } });
    const driver = await tx.driverProfile.findUnique({
      where: { id: driverId },
    });
    if (!ride) throw appError("Ride not found", 404);
    if (ride.status !== "requested")
      throw appError("Only requested rides can be assigned", 400);
    if (ride.paymentMethod === "card" && ride.paymentStatus !== "authorized")
      throw appError("Card authorization is required before dispatch", 400);
    if (
      driver?.currentLat === null ||
      driver?.currentLng === null ||
      !driver?.lastLocationAt ||
      driver.lastLocationAt < driverPresenceCutoff()
    )
      throw appError(
        "Driver is not online. Wait for a fresh location heartbeat before assignment",
        400,
      );
    if (
      !driver ||
      driver.approvalStatus !== "approved" ||
      driver.availability !== "available"
    )
      throw appError("Driver is not available for dispatch", 400);
    if (driver.serviceType !== ride.serviceType)
      throw appError(
        "Driver vehicle does not match the requested ride type",
        400,
      );
    const reserved = await tx.driverProfile.updateMany({
      where: { id: driver.id, availability: "available" },
      data: { availability: "on_trip", updatedAt: new Date() },
    });
    if (reserved.count !== 1)
      throw appError("Driver was assigned another ride", 409);
    const assignedAt = new Date();
    const expiresAt = new Date(
      assignedAt.getTime() +
        Math.max(10, config.rideOfferTimeoutSeconds) * 1000,
    );
    const claimed = await tx.ride.updateMany({
      where: { id: ride.id, status: "requested", driverId: null },
      data: {
        driverId: driver.id,
        status: "driver_assigned",
        assignedAt,
        updatedAt: new Date(),
      },
    });
    if (claimed.count !== 1)
      throw appError("Ride was offered to another driver", 409);
    await tx.rideOffer.create({
      data: {
        rideId: ride.id,
        driverId: driver.id,
        offeredAt: assignedAt,
        expiresAt,
      },
    });
    await tx.rideStatusEvent.create({
      data: {
        rideId: ride.id,
        actorId: actor?.id ?? null,
        fromStatus: ride.status,
        toStatus: "driver_assigned",
        note: `Ride offered to driver #${driver.id}`,
      },
    });
    return tx.ride.findUniqueOrThrow({
      where: { id: ride.id },
      include: rideInclude,
    });
  });

const acceptDriverRide = async (rideId: number, actor: Actor) => {
  const profile = await driverProfile(actor);
  return prisma.$transaction(async (tx) => {
    const offer = await tx.rideOffer.findFirst({
      where: { rideId, driverId: profile.id },
      orderBy: { offeredAt: "desc" },
    });
    if (!offer || offer.status !== "pending")
      throw appError("This ride offer is no longer available", 409);
    const now = new Date();
    if (offer.expiresAt <= now) throw appError("This ride offer expired", 409);
    const accepted = await tx.rideOffer.updateMany({
      where: { id: offer.id, status: "pending", expiresAt: { gt: now } },
      data: {
        status: "accepted",
        respondedAt: now,
        responseMs: now.getTime() - offer.offeredAt.getTime(),
      },
    });
    if (accepted.count !== 1)
      throw appError("This ride offer was already handled", 409);
    await tx.rideStatusEvent.create({
      data: {
        rideId,
        actorId: actor.id,
        fromStatus: "driver_assigned",
        toStatus: "driver_assigned",
        note: "Driver accepted ride offer",
      },
    });
    return tx.ride.findUniqueOrThrow({
      where: { id: rideId },
      include: rideInclude,
    });
  });
};

const distanceKm = (
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) => {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitude = radians(to.lat - from.lat);
  const longitude = radians(to.lng - from.lng);
  const value =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(from.lat)) *
      Math.cos(radians(to.lat)) *
      Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const autoAssignRide = async (rideId: number) => {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride || ride.status !== "requested") return null;
  if (ride.paymentMethod === "card" && ride.paymentStatus !== "authorized")
    return null;
  const rejectedDrivers = await prisma.driverRideRejection.findMany({
    where: { rideId },
    select: { driverId: true },
  });
  const drivers = await prisma.driverProfile.findMany({
    where: {
      id: { notIn: rejectedDrivers.map(({ driverId }) => driverId) },
      approvalStatus: "approved",
      availability: "available",
      serviceType: ride.serviceType,
      currentLat: { not: null },
      currentLng: { not: null },
      lastLocationAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
  });
  const nearest = drivers
    .map((driver) => ({
      driver,
      distance: distanceKm(
        { lat: Number(driver.currentLat), lng: Number(driver.currentLng) },
        { lat: Number(ride.pickupLat), lng: Number(ride.pickupLng) },
      ),
    }))
    .filter((candidate) => candidate.distance <= 15)
    .sort((left, right) => left.distance - right.distance)[0];
  if (!nearest) return null;
  try {
    return await assignDriver(ride.id, nearest.driver.id);
  } catch {
    return null;
  }
};

const expireRideOffers = async () => {
  const expired = await prisma.rideOffer.findMany({
    where: { status: "pending", expiresAt: { lte: new Date() } },
    select: { id: true, rideId: true, driverId: true },
    take: 50,
  });
  const results = [];
  for (const offer of expired) {
    const released = await prisma.$transaction(async (tx) => {
      const changed = await tx.rideOffer.updateMany({
        where: {
          id: offer.id,
          status: "pending",
          expiresAt: { lte: new Date() },
        },
        data: { status: "expired", respondedAt: new Date() },
      });
      if (!changed.count) return null;
      await tx.driverRideRejection.create({
        data: {
          rideId: offer.rideId,
          driverId: offer.driverId,
          reason: "not_available",
          details: "Ride offer expired",
        },
      });
      await tx.driverProfile.updateMany({
        where: { id: offer.driverId, availability: "on_trip" },
        data: { availability: "available", updatedAt: new Date() },
      });
      await tx.ride.updateMany({
        where: {
          id: offer.rideId,
          driverId: offer.driverId,
          status: "driver_assigned",
        },
        data: {
          driverId: null,
          status: "requested",
          assignedAt: null,
          updatedAt: new Date(),
        },
      });
      await tx.rideStatusEvent.create({
        data: {
          rideId: offer.rideId,
          fromStatus: "driver_assigned",
          toStatus: "requested",
          note: "Driver offer expired; finding another driver",
        },
      });
      return tx.ride.findUnique({
        where: { id: offer.rideId },
        include: rideInclude,
      });
    });
    if (released)
      results.push((await autoAssignRide(offer.rideId)) ?? released);
  }
  return results;
};

const updateStatus = async (
  rideId: number,
  status: RideStatus,
  note: string,
  actor: Actor,
  completion?: { tollAmount?: unknown; cashCollected?: unknown },
) => {
  if (!rideStatuses.includes(status))
    throw appError("Unsupported ride status", 400);
  return prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw appError("Ride not found", 404);
    if (
      actor.role === "admin" &&
      [
        "driver_arriving",
        "driver_arrived",
        "in_progress",
        "completed",
      ].includes(status)
    )
      throw appError(
        "Only the assigned driver can update operational trip status",
        403,
      );
    if (!transitions[ride.status]?.includes(status))
      throw appError(
        `A ride cannot move from ${ride.status} to ${status}`,
        400,
      );
    const now = new Date();
    let waitingData: {
      startedAt: Date;
      waitMinutes: number;
      waitingFee: number;
      finalFare: number;
    } | null = null;
    if (status === "in_progress") {
      if (!ride.arrivedAt)
        throw appError("The driver must arrive before starting the trip", 400);
      const rule = await tx.rideFareRule.findUnique({
        where: { serviceType: ride.serviceType },
      });
      const waitMinutes = Math.max(
        0,
        Math.floor((now.getTime() - ride.arrivedAt.getTime()) / 60_000),
      );
      const chargeableMinutes = Math.max(
        0,
        waitMinutes - Number(rule?.includedWaitMinutes ?? 0),
      );
      const waitingFee = money(
        chargeableMinutes * Number(rule?.waitPerMinuteRate ?? 0),
      );
      waitingData = {
        startedAt: now,
        waitMinutes,
        waitingFee,
        finalFare: money(
          Number(ride.estimatedFare) + waitingFee + Number(ride.tollAmount),
        ),
      };
    }
    const requestedCompletionToll = money(
      Math.max(
        0,
        Math.min(
          500,
          completion?.tollAmount === undefined
            ? Number(ride.tollAmount)
            : Number(completion.tollAmount) || 0,
        ),
      ),
    );
    if (status === "completed" && ride.paymentMethod === "card") {
      if (ride.paymentStatus !== "authorized")
        throw appError(
          "The card must be authorized before completing this ride",
          400,
        );
      const authorization = await tx.ridePayment.findFirst({
        where: {
          rideId: ride.id,
          provider: "stripe",
          status: "authorized",
          paymentIntentId: { not: null },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!authorization)
        throw appError("The card authorization could not be found", 400);
      const maximumToll = money(
        Math.max(
          0,
          Number(authorization.amount) -
            Number(ride.estimatedFare) -
            Number(ride.waitingFee),
        ),
      );
      if (requestedCompletionToll > maximumToll) {
        throw appError(
          `Tolls exceed the card authorization. Enter RM ${maximumToll.toFixed(2)} or less`,
          400,
        );
      }
    }
    const completionToll = requestedCompletionToll;
    const completedFare = money(
      Number(ride.estimatedFare) + Number(ride.waitingFee) + completionToll,
    );
    const cashCollected =
      status === "completed" && ride.paymentMethod === "cash";
    if (
      cashCollected &&
      (actor.role !== "driver" || completion?.cashCollected !== true)
    ) {
      throw appError(
        "The assigned driver must confirm that cash was received before completing this ride",
        400,
      );
    }
    const updated = await tx.ride.update({
      where: { id: ride.id },
      data: {
        status,
        updatedAt: now,
        ...(status === "driver_arrived" ? { arrivedAt: now } : {}),
        ...(waitingData ?? {}),
        ...(status === "completed"
          ? {
              completedAt: now,
              tollAmount: completionToll,
              finalFare: completedFare,
              ...(ride.paymentMethod === "card"
                ? { paymentStatus: "capture_pending" }
                : {}),
              ...(cashCollected
                ? {
                    paymentStatus: "cash_collected",
                    cashCollectedAt: now,
                    payments: {
                      create: {
                        provider: "cash",
                        status: "paid",
                        currency: ride.currency,
                        amount: completedFare,
                        paidAt: now,
                      },
                    },
                  }
                : {}),
            }
          : {}),
        ...(["admin_cancelled", "no_driver_available"].includes(status)
          ? { cancelledAt: now, cancellationReason: note || status }
          : {}),
        events: {
          create: {
            actorId: actor.id,
            fromStatus: ride.status,
            toStatus: status,
            note: note?.trim() || null,
          },
        },
      },
      include: rideInclude,
    });
    if (ride.driverId && terminalStatuses.includes(status)) {
      await tx.driverProfile.update({
        where: { id: ride.driverId },
        data: { availability: "available", updatedAt: now },
      });
    }
    return updated;
  });
};

const driverProfile = async (actor: Actor) => {
  let profile = await prisma.driverProfile.findUnique({
    where: { userId: actor.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatarUrl: true,
        },
      },
    },
  });
  if (!profile) throw appError("Driver profile not found", 404);
  const hasActiveRide = Boolean(
    await prisma.ride.findFirst({
      where: { driverId: profile.id, status: { notIn: terminalStatuses } },
      select: { id: true },
    }),
  );
  const reconciledAvailability = hasActiveRide
    ? "on_trip"
    : profile.availability === "on_trip"
      ? "offline"
      : profile.availability;
  if (reconciledAvailability !== profile.availability) {
    profile = await prisma.driverProfile.update({
      where: { id: profile.id },
      data: { availability: reconciledAvailability, updatedAt: new Date() },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });
  }
  return profile;
};

const updateDriverAvailability = async (availability: string, actor: Actor) => {
  const profile = await driverProfile(actor);
  if (profile.approvalStatus !== "approved")
    throw appError("Driver account is not approved", 403);
  if (availability === "available") {
    if (profile.riskStatus === "suspended")
      throw appError(
        profile.suspensionReason || "Driver account is suspended",
        403,
      );
    const eligibility = await driverSafetyService.compliance(profile.id);
    if (!eligibility.eligible)
      throw appError(
        `Compliance required: ${eligibility.missingOrInvalid.join(", ").replaceAll("_", " ")}`,
        403,
      );
  }
  if (!["offline", "available"].includes(availability))
    throw appError("Choose available or offline", 400);
  if (profile.availability === "on_trip")
    throw appError("Complete the active ride before going offline", 400);
  return prisma.$transaction(async (tx) => {
    if (availability === "available") {
      const openShift = await tx.driverShift.findFirst({
        where: { driverId: profile.id, endedAt: null },
      });
      if (!openShift)
        await tx.driverShift.create({
          data: { driverId: profile.id, startedAt: new Date() },
        });
    } else {
      await tx.driverShift.updateMany({
        where: { driverId: profile.id, endedAt: null },
        data: { endedAt: new Date() },
      });
    }
    return tx.driverProfile.update({
      where: { id: profile.id },
      data: { availability, updatedAt: new Date() },
      include: { user: true },
    });
  });
};

const updateDriverLocation = async (lat: number, lng: number, actor: Actor) => {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  )
    throw appError("Valid GPS coordinates are required", 400);
  const profile = await driverProfile(actor);
  return prisma.driverProfile.update({
    where: { id: profile.id },
    data: {
      currentLat: lat,
      currentLng: lng,
      lastLocationAt: new Date(),
      updatedAt: new Date(),
    },
    include: { user: true },
  });
};

const driverActiveRide = async (actor: Actor) => {
  const profile = await driverProfile(actor);
  return prisma.ride.findFirst({
    where: { driverId: profile.id, status: { notIn: terminalStatuses } },
    include: rideInclude,
    orderBy: { requestedAt: "desc" },
  });
};

const driverRideHistory = async (
  query: {
    page?: unknown;
    pageSize?: unknown;
    search?: unknown;
    status?: unknown;
    serviceType?: unknown;
    paymentMethod?: unknown;
    from?: unknown;
    to?: unknown;
    sortBy?: unknown;
    sortOrder?: unknown;
  },
  actor: Actor,
) => {
  const profile = await driverProfile(actor);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 15));
  const search = String(query.search ?? "")
    .trim()
    .slice(0, 120);
  const status = String(query.status ?? "").trim();
  const serviceType = String(query.serviceType ?? "").trim();
  const paymentMethod = String(query.paymentMethod ?? "").trim();
  const from = query.from ? new Date(String(query.from)) : null;
  const to = query.to ? new Date(String(query.to)) : null;
  if (from && Number.isNaN(from.getTime()))
    throw appError("Enter a valid start date", 400);
  if (to && Number.isNaN(to.getTime()))
    throw appError("Enter a valid end date", 400);
  if (to) to.setHours(23, 59, 59, 999);

  const where: Prisma.RideWhereInput = {
    driverId: profile.id,
    ...(status ? { status } : {}),
    ...(serviceType ? { serviceType } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(from || to
      ? {
          requestedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" } },
            { pickupAddress: { contains: search, mode: "insensitive" } },
            { dropoffAddress: { contains: search, mode: "insensitive" } },
            {
              passenger: {
                name: { contains: search, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  };
  const sortFields = {
    requestedAt: "requestedAt",
    reference: "reference",
    status: "status",
    serviceType: "serviceType",
    finalFare: "finalFare",
  } as const;
  const requestedSort = String(
    query.sortBy ?? "requestedAt",
  ) as keyof typeof sortFields;
  const sortBy = sortFields[requestedSort] ?? "requestedAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  const [items, total] = await prisma.$transaction([
    prisma.ride.findMany({
      where,
      include: rideInclude,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ride.count({ where }),
  ]);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

const updateDriverRideStatus = async (
  rideId: number,
  status: RideStatus,
  payload: { tollAmount?: unknown; cashCollected?: unknown },
  actor: Actor,
) => {
  const profile = await driverProfile(actor);
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: { driverId: true },
  });
  if (!ride || ride.driverId !== profile.id)
    throw appError("Ride not found", 404);
  const acceptedOffer = await prisma.rideOffer.findFirst({
    where: { rideId, driverId: profile.id, status: "accepted" },
    orderBy: { offeredAt: "desc" },
  });
  if (!acceptedOffer)
    throw appError("Accept this ride before starting the trip", 409);
  if (
    !["driver_arriving", "driver_arrived", "in_progress", "completed"].includes(
      status,
    )
  )
    throw appError("Drivers cannot apply this status", 403);
  const updated = await updateStatus(
    rideId,
    status,
    "Updated by driver",
    actor,
    payload,
  );
  if (
    updated.status === "completed" &&
    updated.paymentStatus === "cash_collected"
  ) {
    await driverEarningService.syncRideEarning(updated.id);
  }
  return updated;
};

const rejectDriverRide = async (
  rideId: number,
  payload: { reason?: DriverRejectionReason; details?: unknown },
  actor: Actor,
) => {
  const reason = payload?.reason;
  const details = String(payload?.details ?? "").trim();
  if (!reason || !driverRejectionReasons.includes(reason))
    throw appError("Select a valid ride rejection reason", 400);
  if (reason === "other" && !details)
    throw appError("Explain why you cannot accept this ride", 400);
  if (details.length > 240)
    throw appError("Rejection details cannot exceed 240 characters", 400);

  const profile = await driverProfile(actor);
  const releasedRide = await prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findUnique({ where: { id: rideId } });
    if (!ride || ride.driverId !== profile.id)
      throw appError("Assigned ride not found", 404);
    if (
      !(["driver_assigned", "driver_arriving"] as string[]).includes(
        ride.status,
      )
    )
      throw appError("This ride can no longer be rejected", 400);

    await tx.driverRideRejection.create({
      data: {
        rideId,
        driverId: profile.id,
        reason,
        details: details || null,
      },
    });
    const now = new Date();
    const latestOffer = await tx.rideOffer.findFirst({
      where: { rideId, driverId: profile.id },
      orderBy: { offeredAt: "desc" },
    });
    if (latestOffer?.status === "pending")
      await tx.rideOffer.update({
        where: { id: latestOffer.id },
        data: {
          status: "rejected",
          respondedAt: now,
          responseMs: now.getTime() - latestOffer.offeredAt.getTime(),
        },
      });
    await tx.driverProfile.update({
      where: { id: profile.id },
      data: {
        availability: reason === "not_available" ? "offline" : "available",
        updatedAt: new Date(),
      },
    });
    return tx.ride.update({
      where: { id: rideId },
      data: {
        driverId: null,
        status: "requested",
        assignedAt: null,
        updatedAt: new Date(),
        events: {
          create: {
            actorId: actor.id,
            fromStatus: ride.status,
            toStatus: "requested",
            note: `Driver rejected ride: ${reason}${details ? ` - ${details}` : ""}`,
          },
        },
      },
      include: rideInclude,
    });
  });

  return (await autoAssignRide(rideId)) ?? releasedRide;
};

const adjustRideCharges = async (
  rideId: number,
  payload: { tollAmount?: number },
) => {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) throw appError("Ride not found", 404);
  if (!["driver_arrived", "in_progress"].includes(ride.status)) {
    throw appError(
      "Charges can be adjusted after driver arrival and before ride completion",
      400,
    );
  }
  const tollAmount = money(
    Math.max(0, Math.min(500, Number(payload.tollAmount) || 0)),
  );
  const waitingFee = Number(ride.waitingFee);
  if (ride.paymentMethod === "card") {
    const authorization = await prisma.ridePayment.findFirst({
      where: { rideId, provider: "stripe", status: "authorized" },
      orderBy: { createdAt: "desc" },
    });
    const maximumToll = money(
      Math.max(
        0,
        Number(authorization?.amount ?? 0) -
          Number(ride.estimatedFare) -
          waitingFee,
      ),
    );
    if (tollAmount > maximumToll)
      throw appError(
        `Tolls exceed the card authorization. Enter RM ${maximumToll.toFixed(2)} or less`,
        400,
      );
  }
  const finalFare = money(Number(ride.estimatedFare) + waitingFee + tollAmount);
  return prisma.ride.update({
    where: { id: ride.id },
    data: { tollAmount, finalFare, updatedAt: new Date() },
    include: rideInclude,
  });
};

export const rideService = {
  publicOptions,
  quote,
  createRide,
  myRides,
  cancelRide,
  adminRides,
  drivers,
  createDriver,
  updateDriver,
  assignDriver,
  updateStatus,
  driverProfile,
  updateDriverAvailability,
  updateDriverLocation,
  driverActiveRide,
  driverRideHistory,
  updateDriverRideStatus,
  rejectDriverRide,
  acceptDriverRide,
  expireRideOffers,
  adjustRideCharges,
  activateAuthorizedRide: autoAssignRide,
};
