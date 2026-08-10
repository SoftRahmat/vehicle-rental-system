import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

type Actor = { id: number; role: "admin" | "customer" };
type QueryInput = Record<string, unknown>;

const CATEGORIES = [
  "booking",
  "payment",
  "pickup",
  "return",
  "account",
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
  customer: { select: { id: true, name: true, email: true, avatarUrl: true } },
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
    message?: unknown;
  },
  actor: Actor,
) => {
  if (actor.role !== "customer")
    throw appError("Only customers can open support requests", 403);
  const subject = text(input.subject, 160);
  const message = text(input.message);
  const category = text(input.category, 40) || "general";
  const bookingId = input.booking_id ? Number(input.booking_id) : null;
  if (subject.length < 5)
    throw appError("Describe the issue in at least 5 characters", 400);
  if (message.length < 2)
    throw appError("Add a message for the support team", 400);
  if (!CATEGORIES.includes(category))
    throw appError("Invalid support category", 400);
  if (bookingId) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, customerId: actor.id },
      select: { id: true },
    });
    if (!booking) throw appError("Booking not found for this account", 404);
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: { customerId: actor.id, bookingId, subject, category },
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
  if (ticket.status === "closed")
    throw appError("This conversation is closed", 400);
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
  getTickets,
  createTicket,
  getConversation,
  sendMessage,
  getAdminTickets,
  updateTicket,
};
