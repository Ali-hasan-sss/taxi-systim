import { OrderVehicleRequirement, Prisma, VehicleKind } from "@prisma/client";

const REQUIREMENT_TO_KIND: Partial<Record<OrderVehicleRequirement, VehicleKind>> = {
  [OrderVehicleRequirement.PUBLIC]: VehicleKind.PUBLIC,
  [OrderVehicleRequirement.PRIVATE]: VehicleKind.PRIVATE,
  [OrderVehicleRequirement.VIP]: VehicleKind.VIP
};

export function driverWhereMatchesOrderVehicle(
  requirement: OrderVehicleRequirement
): Prisma.DriverWhereInput {
  if (requirement === OrderVehicleRequirement.ANY) {
    return {};
  }
  const kind = REQUIREMENT_TO_KIND[requirement];
  return kind ? { vehicleKind: kind } : {};
}

export function driverMatchesOrderVehicle(
  requirement: OrderVehicleRequirement,
  driverVehicleKind: VehicleKind | null
): boolean {
  if (requirement === OrderVehicleRequirement.ANY) return true;
  if (driverVehicleKind == null) return false;
  const expected = REQUIREMENT_TO_KIND[requirement];
  return expected != null && driverVehicleKind === expected;
}
