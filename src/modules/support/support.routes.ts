import { Router } from "express";
import { authGate } from "../../middleware/auth";
import { supportController } from "./support.controller";

export const supportRouter = Router();

supportRouter.use(authGate.requireAuth);
supportRouter.use(authGate.requireAnyRole(["customer", "driver"]));
supportRouter.get("/options", supportController.options);
supportRouter.get("/tickets", supportController.getTickets);
supportRouter.post("/tickets", supportController.createTicket);
supportRouter.get("/tickets/:ticketId", supportController.getConversation);
supportRouter.post("/tickets/:ticketId/reopen", supportController.reopenTicket);
supportRouter.post(
  "/tickets/:ticketId/messages",
  supportController.sendMessage,
);
