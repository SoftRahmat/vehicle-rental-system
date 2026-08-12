import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

type Actor = { id: number; role: "admin" | "customer" | "driver" };
type QueryInput = Record<string, unknown>;

const CATEGORIES = [
  "booking",
  "payment",
  "pickup",
  "return",
  "account",
  "driver",
  "earnings",
  "safety",
  "general",
];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
];

const ticketInclude = {
  customer: {
    select: { id: true, name: true, email: true, role: true, avatarUrl: true },
  },
  assignedAdmin: { select: { id: true, name: true } },
  booking: {
    select: {
      id: true,
      rentStartDate: true,
      rentEndDate: true,
      status: true,
      vehicle: { select: { vehicleName: true, registrationNumber: true } },
    },
  },
  ride: {
    select: {
      id: true,
      reference: true,
      serviceType: true,
      status: true,
      pickupAddress: true,
      dropoffAddress: true,
      requestedAt: true,
      estimatedFare: true,
      finalFare: true,
      paymentStatus: true,
    },
  },
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: {
      sender: { select: { id: true, name: true, role: true, avatarUrl: true } },
    },
  },
  _count: { select: { messages: true } },
} as const satisfies Prisma.SupportTicketInclude;

const messageInclude = {
  sender: { select: { id: true, name: true, role: true, avatarUrl: true } },
} as const satisfies Prisma.SupportMessageInclude;

type TicketRecord = Prisma.SupportTicketGetPayload<{
  include: typeof ticketInclude;
}>;
type MessageRecord = Prisma.SupportMessageGetPayload<{
  include: typeof messageInclude;
}>;

const appError = (
  message: string,
  status: number,
): Error & { status: number } => Object.assign(new Error(message), { status });

const text = (value: unknown, maximum = 5000): string =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

const positiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const toMessage = (message: MessageRecord) => ({
  id: message.id,
  ticket_id: message.ticketId,
  body: message.body,
  read_at: message.readAt,
  created_at: message.createdAt,
  sender: {
    id: message.sender.id,
    name: message.sender.name,
    role: message.sender.role,
    avatar_url: message.sender.avatarUrl,
  },
});

const toTicket = (ticket: TicketRecord) => ({
  id: ticket.id,
  reference: `SUP-${String(ticket.id).padStart(5, "0")}`,
  customer_id: ticket.customerId,
  booking_id: ticket.bookingId,
  ride_id: ticket.rideId,
  assigned_admin_id: ticket.assignedAdminId,
  subject: ticket.subject,
  category: ticket.category,
  priority: ticket.priority,
  status: ticket.status,
  last_message_at: ticket.lastMessageAt,
  created_at: ticket.createdAt,
  updated_at: ticket.updatedAt,
  message_count: ticket._count.messages,
  last_message: ticket.messages[0] ? toMessage(ticket.messages[0]) : null,
  customer: {
    id: ticket.customer.id,
    name: ticket.customer.name,
    email: ticket.customer.email,
    role: ticket.customer.role,
    avatar_url: ticket.customer.avatarUrl,
  },
  assigned_admin: ticket.assignedAdmin,
  booking: ticket.booking
    ? {
        id: ticket.booking.id,
        rent_start_date: ticket.booking.rentStartDate
          .toISOString()
          .slice(0, 10),
        rent_end_date: ticket.booking.rentEndDate.toISOString().slice(0, 10),
        status: ticket.booking.status,
        vehicle: ticket.booking.vehicle
          ? {
              vehicle_name: ticket.booking.vehicle.vehicleName,
              registration_number: ticket.booking.vehicle.registrationNumber,
            }
          : null,
      }
    : null,
  ride: ticket.ride
    ? {
        id: ticket.ride.id,
        reference: ticket.ride.reference,
        service_type: ticket.ride.serviceType,
        status: ticket.ride.status,
        pickup_address: ticket.ride.pickupAddress,
        dropoff_address: ticket.ride.dropoffAddress,
        requested_at: ticket.ride.requestedAt,
        estimated_fare: ticket.ride.estimatedFare,
        final_fare: ticket.ride.finalFare,
        payment_status: ticket.ride.paymentStatus,
      }
    : null,
});

const ensureTicketAccess = async (ticketId: number, actor: Actor) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
  });
  if (!ticket) throw appError("Support conversation not found", 404);
  if (actor.role !== "admin" && ticket.customerId !== actor.id) {
    throw appError("Forbidden", 403);
  }
  return ticket;
};

const getRelatedReferences = async (actor: Actor) => {
  if (actor.role === "driver") {
    const driver = await prisma.driverProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!driver) return [];

    const rides = await prisma.ride.findMany({
      where: {
        OR: [
          { driverId: driver.id },
          { rejections: { some: { driverId: driver.id } } },
        ],
      },
      select: {
        id: true,
        reference: true,
        pickupAddress: true,
        dropoffAddress: true,
        status: true,
        requestedAt: true,
      },
      orderBy: { requestedAt: "desc" },
      take: 50,
    });

    return rides.map((ride) => ({
      type: "ride" as const,
      id: ride.id,
      reference: ride.reference,
      label: `${ride.pickupAddress} to ${ride.dropoffAddress}`,
      status: ride.status,
      occurred_at: ride.requestedAt,
    }));
  }

  const [bookings, rides] = await Promise.all([
    prisma.booking.findMany({
      where: { customerId: actor.id },
      select: {
        id: true,
        status: true,
        createdAt: true,
        vehicle: { select: { vehicleName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.ride.findMany({
      where: { passengerId: actor.id },
      select: {
        id: true,
        reference: true,
        pickupAddress: true,
        dropoffAddress: true,
        status: true,
        requestedAt: true,
      },
      orderBy: { requestedAt: "desc" },
      take: 50,
    }),
  ]);

  return [
    ...bookings.map((booking) => ({
      type: "booking" as const,
      id: booking.id,
      reference: `Booking #${booking.id}`,
      label: booking.vehicle?.vehicleName ?? "Vehicle rental",
      status: booking.status,
      occurred_at: booking.createdAt,
    })),
    ...rides.map((ride) => ({
      type: "ride" as const,
      id: ride.id,
      reference: ride.reference,
      label: `${ride.pickupAddress} to ${ride.dropoffAddress}`,
      status: ride.status,
      occurred_at: ride.requestedAt,
    })),
  ].sort(
    (left, right) =>
      (right.occurred_at?.getTime() ?? 0) - (left.occurred_at?.getTime() ?? 0),
  );
};

const getTickets = async (actor: Actor) => {
  const records = await prisma.supportTicket.findMany({
    ...(actor.role === "admin" ? {} : { where: { customerId: actor.id } }),
    include: ticketInclude,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
  });
  return records.map(toTicket);
};

const createTicket = async (
  input: {
    subject?: unknown;
    category?: unknown;
    booking_id?: unknown;
    ride_id?: unknown;
    message?: unknown;
  },
  actor: Actor,
) => {
  if (!["customer", "driver"].includes(actor.role))
    throw appError("Only customers and drivers can open support requests", 403);
  const subject = text(input.subject, 160);
  const message = text(input.message);
  const category = text(input.category, 40) || "general";
  const bookingId = input.booking_id ? Number(input.booking_id) : null;
  const rideId = input.ride_id ? Number(input.ride_id) : null;
  if (subject.length < 5)
    throw appError("Describe the issue in at least 5 characters", 400);
  if (message.length < 2)
    throw appError("Add a message for the support team", 400);
  if (!CATEGORIES.includes(category))
    throw appError("Invalid support category", 400);
  if (actor.role === "driver" && bookingId)
    throw appError("Drivers cannot attach customer rental bookings", 400);
  if (bookingId && rideId)
    throw appError("Choose either a vehicle booking or a ride", 400);
  if (bookingId) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, customerId: actor.id },
      select: { id: true },
    });
    if (!booking) throw appError("Booking not found for this account", 404);
  }
  if (rideId) {
    const ride = await prisma.ride.findFirst({
      where: {
        id: rideId,
        ...(actor.role === "driver"
          ? {
              OR: [
                { driver: { is: { userId: actor.id } } },
                {
                  rejections: {
                    some: { driver: { is: { userId: actor.id } } },
                  },
                },
              ],
            }
          : { passengerId: actor.id }),
      },
      select: { id: true },
    });
    if (!ride) throw appError("Ride not found for this account", 404);
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        customerId: actor.id,
        bookingId,
        rideId,
        subject,
        category,
      },
    });
    await tx.supportMessage.create({
      data: { ticketId: created.id, senderId: actor.id, body: message },
    });
    return tx.supportTicket.findUniqueOrThrow({
      where: { id: created.id },
      include: ticketInclude,
    });
  });
  return toTicket(ticket);
};

const getConversation = async (ticketId: number, actor: Actor) => {
  await ensureTicketAccess(ticketId, actor);
  await prisma.supportMessage.updateMany({
    where: { ticketId, senderId: { not: actor.id }, readAt: null },
    data: { readAt: new Date() },
  });
  const [ticket, messages] = await Promise.all([
    prisma.supportTicket.findUniqueOrThrow({
      where: { id: ticketId },
      include: ticketInclude,
    }),
    prisma.supportMessage.findMany({
      where: { ticketId },
      include: messageInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  return { ticket: toTicket(ticket), messages: messages.map(toMessage) };
};

const sendMessage = async (
  ticketId: number,
  bodyValue: unknown,
  actor: Actor,
) => {
  const ticket = await ensureTicketAccess(ticketId, actor);
  const body = text(bodyValue);
  if (body.length < 1) throw appError("Message cannot be empty", 400);
  if (["resolved", "closed"].includes(ticket.status)) {
    throw appError(
      ticket.status === "resolved"
        ? "Reopen this resolved request before sending another message"
        : "This conversation is closed",
      400,
    );
  }
  const status = actor.role === "admin" ? "waiting_customer" : "open";
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: { ticketId, senderId: actor.id, body },
      include: messageInclude,
    });
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: {
        status,
        lastMessageAt: created.createdAt,
        updatedAt: new Date(),
        ...(actor.role === "admin" && !ticket.assignedAdminId
          ? { assignedAdminId: actor.id }
          : {}),
      },
    });
    return created;
  });
  return toMessage(message);
};

const reopenTicket = async (ticketId: number, actor: Actor) => {
  if (!["customer", "driver"].includes(actor.role))
    throw appError("Only request owners can reopen resolved requests", 403);
  const ticket = await ensureTicketAccess(ticketId, actor);
  if (ticket.status === "closed")
    throw appError("Closed requests cannot be reopened", 400);
  if (ticket.status !== "resolved")
    throw appError("Only resolved requests can be reopened", 400);
  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: "open", updatedAt: new Date() },
    include: ticketInclude,
  });
  return toTicket(updated);
};

const getAdminTickets = async (query: QueryInput) => {
  const page = positiveInteger(query.page, 1);
  const pageSize = Math.min(positiveInteger(query.pageSize, 15), 100);
  const search = text(query.search, 100);
  const status = text(query.status, 30);
  const category = text(query.category, 40);
  const priority = text(query.priority, 20);
  const where: Prisma.SupportTicketWhereInput = {
    ...(search
      ? {
          OR: [
            { subject: { contains: search, mode: "insensitive" as const } },
            {
              customer: {
                name: { contains: search, mode: "insensitive" as const },
              },
            },
            {
              customer: {
                email: { contains: search, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(priority ? { priority } : {}),
  };
  const [records, total] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where,
      include: ticketInclude,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return {
    items: records.map(toTicket),
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
};

const updateTicket = async (
  ticketId: number,
  input: { status?: unknown; priority?: unknown; assigned_admin_id?: unknown },
  actor: Actor,
) => {
  if (actor.role !== "admin") throw appError("Forbidden", 403);
  await ensureTicketAccess(ticketId, actor);
  const status = input.status === undefined ? "" : text(input.status, 30);
  const priority = input.priority === undefined ? "" : text(input.priority, 20);
  const assignedAdminId =
    input.assigned_admin_id === undefined
      ? undefined
      : Number(input.assigned_admin_id) || null;
  if (status && !STATUSES.includes(status))
    throw appError("Invalid support status", 400);
  if (priority && !PRIORITIES.includes(priority))
    throw appError("Invalid support priority", 400);
  if (assignedAdminId) {
    const admin = await prisma.user.findFirst({
      where: { id: assignedAdminId, role: "admin" },
      select: { id: true },
    });
    if (!admin) throw appError("Assigned administrator not found", 404);
  }
  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(assignedAdminId !== undefined ? { assignedAdminId } : {}),
      updatedAt: new Date(),
    },
    include: ticketInclude,
  });
  return toTicket(updated);
};

export const supportService = {
  categories: CATEGORIES,
  priorities: PRIORITIES,
  statuses: STATUSES,
  getRelatedReferences,
  getTickets,
  createTicket,
  getConversation,
  sendMessage,
  reopenTicket,
  getAdminTickets,
  updateTicket,
};
