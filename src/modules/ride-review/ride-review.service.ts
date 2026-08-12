import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

type Actor = { id: number; role: "admin" | "customer" | "driver" };
const tags = [
  "professional",
  "safe_driving",
  "clean_vehicle",
  "friendly",
  "easy_pickup",
  "late_arrival",
  "unsafe_driving",
  "vehicle_issue",
] as const;
const safetyTags = new Set(["unsafe_driving"]);
const moderationStatuses = ["visible", "under_review", "hidden", "resolved"];
const appError = (message: string, status: number) =>
  Object.assign(new Error(message), { status });
const include = {
  ride: {
    select: {
      id: true,
      reference: true,
      pickupAddress: true,
      dropoffAddress: true,
      completedAt: true,
    },
  },
  passenger: { select: { id: true, name: true, email: true } },
  driver: { include: { user: { select: { id: true, name: true } } } },
  moderatedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.RideReviewInclude;

const normalize = (payload: {
  rating?: unknown;
  comment?: unknown;
  tags?: unknown;
}) => {
  const rating = Number(payload.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw appError("Choose a rating from 1 to 5", 400);
  const comment =
    String(payload.comment ?? "")
      .trim()
      .slice(0, 1000) || null;
  const selectedTags = Array.isArray(payload.tags)
    ? [
        ...new Set(
          payload.tags
            .map(String)
            .filter((tag) => tags.includes(tag as (typeof tags)[number])),
        ),
      ]
    : [];
  return { rating, comment, tags: selectedTags };
};

const getForRide = async (rideId: number, actor: Actor) => {
  const review = await prisma.rideReview.findFirst({
    where: { rideId, passengerId: actor.id },
    include,
  });
  return review;
};

const create = async (
  rideId: number,
  payload: { rating?: unknown; comment?: unknown; tags?: unknown },
  actor: Actor,
) => {
  const ride = await prisma.ride.findFirst({
    where: { id: rideId, passengerId: actor.id },
    select: { id: true, status: true, driverId: true },
  });
  if (!ride) throw appError("Ride not found for this account", 404);
  if (ride.status !== "completed")
    throw appError("Feedback is available after the ride is completed", 400);
  if (!ride.driverId) throw appError("This ride has no driver to review", 400);
  const data = normalize(payload);
  const flagged = data.tags.some((tag) => safetyTags.has(tag));
  try {
    return await prisma.rideReview.create({
      data: {
        rideId,
        passengerId: actor.id,
        driverId: ride.driverId,
        ...data,
        moderationStatus: flagged ? "under_review" : "visible",
        flagReason: flagged ? "Safety-related customer feedback" : null,
      },
      include,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw appError("Feedback has already been submitted for this ride", 409);
    throw error;
  }
};

const update = async (
  rideId: number,
  payload: { rating?: unknown; comment?: unknown; tags?: unknown },
  actor: Actor,
) => {
  const review = await prisma.rideReview.findFirst({
    where: { rideId, passengerId: actor.id },
  });
  if (!review) throw appError("Feedback not found", 404);
  if (Date.now() - review.createdAt.getTime() > 24 * 60 * 60 * 1000)
    throw appError("Feedback can only be edited within 24 hours", 400);
  const data = normalize(payload);
  const flagged = data.tags.some((tag) => safetyTags.has(tag));
  return prisma.rideReview.update({
    where: { id: review.id },
    data: {
      ...data,
      moderationStatus: flagged ? "under_review" : "visible",
      flagReason: flagged ? "Safety-related customer feedback" : null,
      updatedAt: new Date(),
    },
    include,
  });
};

const driverSummary = async (actor: Actor) => {
  const driver = await prisma.driverProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!driver) throw appError("Driver profile not found", 404);
  const reviews = await prisma.rideReview.findMany({
    where: { driverId: driver.id, moderationStatus: { not: "hidden" } },
    select: { rating: true, tags: true },
  });
  const distribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: reviews.filter((review) => review.rating === rating).length,
  }));
  const tagCounts = new Map<string, number>();
  reviews.forEach((review) =>
    (review.tags as string[]).forEach((tag) =>
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1),
    ),
  );
  return {
    average: reviews.length
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0,
    total: reviews.length,
    distribution,
    topTags: [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count })),
  };
};

const driverReviews = async (query: Record<string, unknown>, actor: Actor) => {
  const driver = await prisma.driverProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!driver) throw appError("Driver profile not found", 404);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 15));
  const where: Prisma.RideReviewWhereInput = {
    driverId: driver.id,
    moderationStatus: { not: "hidden" },
    ...(query.rating ? { rating: Number(query.rating) } : {}),
  };
  const [records, total] = await prisma.$transaction([
    prisma.rideReview.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.rideReview.count({ where }),
  ]);
  return {
    items: records.map(({ passenger: _passenger, ...review }) => ({
      ...review,
      passenger: { name: "Roadly passenger" },
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

const adminReviews = async (query: Record<string, unknown>) => {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 15));
  const search = String(query.search ?? "").trim();
  const where: Prisma.RideReviewWhereInput = {
    ...(query.status ? { moderationStatus: String(query.status) } : {}),
    ...(query.rating ? { rating: Number(query.rating) } : {}),
    ...(query.flagged === "true" ? { flagReason: { not: null } } : {}),
    ...(search
      ? {
          OR: [
            { ride: { reference: { contains: search, mode: "insensitive" } } },
            { passenger: { name: { contains: search, mode: "insensitive" } } },
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
    prisma.rideReview.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.rideReview.count({ where }),
  ]);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

const moderate = async (
  reviewId: number,
  payload: { status?: unknown; note?: unknown },
  actor: Actor,
) => {
  const status = String(payload.status ?? "");
  if (!moderationStatuses.includes(status))
    throw appError("Select a valid moderation status", 400);
  return prisma.rideReview.update({
    where: { id: reviewId },
    data: {
      moderationStatus: status,
      moderationNote:
        String(payload.note ?? "")
          .trim()
          .slice(0, 1000) || null,
      moderatedById: actor.id,
      moderatedAt: new Date(),
      updatedAt: new Date(),
    },
    include,
  });
};

export const rideReviewService = {
  tags,
  getForRide,
  create,
  update,
  driverSummary,
  driverReviews,
  adminReviews,
  moderate,
};
