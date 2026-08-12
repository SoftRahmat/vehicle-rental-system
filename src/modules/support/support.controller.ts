import type { Request, Response } from "express";
import type { AuthUser } from "../../types/express";
import { asyncHandler } from "../../utils/asyncHandler";
import { supportService } from "./support.service";

const actor = (req: Request): AuthUser => req.user as AuthUser;
const ticketId = (req: Request): number => Number(req.params["ticketId"]);

const options = asyncHandler(async (req: Request, res: Response) => {
  const relatedReferences = await supportService.getRelatedReferences(
    actor(req),
  );
  res.status(200).json({
    success: true,
    message: "Support options retrieved",
    data: {
      categories: supportService.categories,
      priorities: supportService.priorities,
      statuses: supportService.statuses,
      related_references: relatedReferences,
    },
  });
});

const getTickets = asyncHandler(async (req: Request, res: Response) => {
  const data = await supportService.getTickets(actor(req));
  res
    .status(200)
    .json({ success: true, message: "Support requests retrieved", data });
});

const createTicket = asyncHandler(async (req: Request, res: Response) => {
  const data = await supportService.createTicket(req.body ?? {}, actor(req));
  res
    .status(201)
    .json({ success: true, message: "Support request opened", data });
});

const getConversation = asyncHandler(async (req: Request, res: Response) => {
  const data = await supportService.getConversation(ticketId(req), actor(req));
  res
    .status(200)
    .json({ success: true, message: "Conversation retrieved", data });
});

const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const data = await supportService.sendMessage(
    ticketId(req),
    req.body?.message,
    actor(req),
  );
  res.status(201).json({ success: true, message: "Message sent", data });
});

const reopenTicket = asyncHandler(async (req: Request, res: Response) => {
  const data = await supportService.reopenTicket(ticketId(req), actor(req));
  res.status(200).json({
    success: true,
    message: "Support request reopened",
    data,
  });
});

const getAdminTickets = asyncHandler(async (req: Request, res: Response) => {
  const data = await supportService.getAdminTickets(
    req.query as Record<string, unknown>,
  );
  res
    .status(200)
    .json({ success: true, message: "Support inbox retrieved", data });
});

const updateTicket = asyncHandler(async (req: Request, res: Response) => {
  const data = await supportService.updateTicket(
    ticketId(req),
    req.body ?? {},
    actor(req),
  );
  res
    .status(200)
    .json({ success: true, message: "Support request updated", data });
});

export const supportController = {
  options,
  getTickets,
  createTicket,
  getConversation,
  sendMessage,
  reopenTicket,
  getAdminTickets,
  updateTicket,
};
