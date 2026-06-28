import type { Request, Response } from "express";
import type { Server } from "socket.io";
import type { AuthRequest } from "../../shared/auth";
import { publicTaxiRequestDto, publishWebInquiryDto } from "./public.dto";
import { broadcastWebOrderRequest, publicBookingService } from "./public.service";
import { broadcastNewOrder } from "../../socket";
import { notifyCoordinatorsWebOrderRequestPush, notifyDriversNewOrderPush } from "../../shared/expo-push";

function getIo(req: Request): Server | null {
  return (req.app.get("io") as Server | undefined) ?? null;
}

export const publicController = {
  async createTaxiRequest(req: Request, res: Response) {
    const dto = publicTaxiRequestDto.parse(req.body);
    const order = await publicBookingService.createWebRequest(dto);
    const io = getIo(req);
    if (io) {
      await broadcastWebOrderRequest(io, order);
    }
    void notifyCoordinatorsWebOrderRequestPush(order);
    res.status(201).json({
      ok: true,
      message: "تم استلام طلبك. سيتواصل معك المنسق قريبًا.",
      orderId: order.id
    });
  },

  async listWebInquiries(_req: Request, res: Response) {
    const inquiries = await publicBookingService.listWebInquiries();
    res.json({ inquiries, count: inquiries.length });
  },

  async publishWebInquiry(req: AuthRequest, res: Response) {
    const dto = publishWebInquiryDto.parse(req.body ?? {});
    const order = await publicBookingService.publishWebInquiry(req.auth!.userId, req.params.orderId!, dto);
    const io = getIo(req);
    if (io) {
      await broadcastNewOrder(io, order);
    }
    void notifyDriversNewOrderPush(order);
    res.json({ ok: true, orderId: order.id });
  },

  async dismissWebInquiry(req: Request, res: Response) {
    const order = await publicBookingService.dismissWebInquiry(req.params.orderId!);
    res.json({ ok: true, orderId: order.id });
  }
};
