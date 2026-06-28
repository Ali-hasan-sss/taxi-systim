import type { OrderBroadcastTarget, OrderSource, OrderStatus, OrderVehicleRequirement, Prisma } from "@prisma/client";

const toNum = (d: Prisma.Decimal | number) => Number(d);

export function orderToSocketPayload(order: {
  id: string;
  coordinatorId: string;
  driverId: string | null;
  customerName: string;
  customerPhone: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  amount: Prisma.Decimal;
  status: OrderStatus;
  broadcastTarget: OrderBroadcastTarget;
  vehicleRequirement: OrderVehicleRequirement;
  source?: OrderSource;
  driversNotifiedAt?: Date | null;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    orderId: order.id,
    coordinatorId: order.coordinatorId,
    driverId: order.driverId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    pickupAddress: order.pickupAddress,
    dropoffAddress: order.dropoffAddress,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    amount: toNum(order.amount),
    status: order.status,
    broadcastTarget: order.broadcastTarget,
    vehicleRequirement: order.vehicleRequirement,
    source: order.source,
    driversNotifiedAt: order.driversNotifiedAt?.toISOString() ?? null,
    notes: order.notes,
    createdAt: order.createdAt.toISOString()
  };
}
