import type { Server } from "socket.io";
import type { Order } from "@prisma/client";
import { OrderSource, Role } from "@prisma/client";
import { socketEvents } from "@taxi/config";
import { prisma } from "../../shared/prisma";
import { AppError } from "../../shared/app-error";
import { orderToSocketPayload } from "../orders/order-socket-payload";
import type { PublicTaxiRequestDto, PublishWebInquiryDto } from "./public.dto";

const ROOM_COORDINATORS = "coordinators";

async function getOrCreateWebCoordinatorId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
  if (!admin) {
    throw new AppError("لا يوجد حساب إدارة لاستقبال طلبات الويب", 503);
  }
  const coordinator = await prisma.coordinator.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id }
  });
  return coordinator.id;
}

function webInquiryWhere() {
  return {
    source: OrderSource.WEB_PUBLIC,
    driversNotifiedAt: null,
    status: "PENDING" as const,
    driverId: null
  };
}

export async function broadcastWebOrderRequest(io: Server, order: Order) {
  const payload = {
    ...orderToSocketPayload(order),
    source: order.source,
    driversNotifiedAt: order.driversNotifiedAt?.toISOString() ?? null
  };
  io.to(ROOM_COORDINATORS).emit(socketEvents.WEB_ORDER_REQUEST, payload);
}

export const publicBookingService = {
  async createWebRequest(payload: PublicTaxiRequestDto) {
    const coordinatorId = await getOrCreateWebCoordinatorId();
    const phone = payload.customerPhone.trim();
    const customerName = payload.customerName?.trim() || `زبون ${phone}`;

    return prisma.order.create({
      data: {
        customerName,
        customerPhone: phone,
        pickupAddress: payload.pickupAddress.trim(),
        dropoffAddress: payload.dropoffAddress.trim(),
        notes: payload.notes?.trim() || undefined,
        amount: 0,
        source: OrderSource.WEB_PUBLIC,
        coordinatorId
      }
    });
  },

  async listWebInquiries() {
    const rows = await prisma.order.findMany({
      where: webInquiryWhere(),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100
    });
    return rows.map((row) => ({
      id: row.id,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      pickupAddress: row.pickupAddress,
      dropoffAddress: row.dropoffAddress,
      notes: row.notes,
      amount: row.amount.toString(),
      status: row.status,
      source: row.source,
      driversNotifiedAt: row.driversNotifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString()
    }));
  },

  async countPendingWebInquiries(): Promise<number> {
    return prisma.order.count({ where: webInquiryWhere() });
  },

  async publishWebInquiry(publisherUserId: string, orderId: string, payload: PublishWebInquiryDto) {
    const order = await prisma.order.findFirst({ where: { id: orderId, ...webInquiryWhere() } });
    if (!order) throw new AppError("طلب الويب غير موجود أو تمت معالجته مسبقًا", 404);

    const amount = payload.amount ?? Number(order.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError("أدخل أجرة صالحة قبل الإرسال إلى السائقين", 400);
    }

    if (payload.broadcastTarget === "NEAREST_THREE") {
      if (payload.pickupLat === undefined || payload.pickupLng === undefined) {
        throw new AppError("إحداثيات الانطلاق مطلوبة لإرسال الطلب لأقرب 3 سائقين", 400);
      }
    }

    // إعادة إسناد الطلب للمنسّق الذي أرسله ليظهر في طلباته المعلّقة
    const publisher = await prisma.coordinator.upsert({
      where: { userId: publisherUserId },
      update: {},
      create: { userId: publisherUserId }
    });

    return prisma.order.update({
      where: { id: orderId },
      data: {
        amount,
        coordinatorId: publisher.id,
        vehicleRequirement: payload.vehicleRequirement ?? order.vehicleRequirement,
        broadcastTarget: payload.broadcastTarget ?? order.broadcastTarget,
        pickupLat: payload.pickupLat ?? order.pickupLat,
        pickupLng: payload.pickupLng ?? order.pickupLng,
        driversNotifiedAt: new Date()
      }
    });
  },

  async dismissWebInquiry(orderId: string) {
    const order = await prisma.order.findFirst({ where: { id: orderId, ...webInquiryWhere() } });
    if (!order) throw new AppError("طلب الويب غير موجود أو تمت معالجته مسبقًا", 404);

    return prisma.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledAt: new Date() }
    });
  }
};
