import { OrderVehicleRequirement, Prisma, VehicleKind } from "@prisma/client";

export function driverWhereMatchesOrderVehicle(
  requirement: OrderVehicleRequirement
): Prisma.DriverWhereInput {
  if (requirement === OrderVehicleRequirement.ANY) {
    return {};
  }
  const kind = requirement === OrderVehicleRequirement.PUBLIC ? VehicleKind.PUBLIC : VehicleKind.PRIVATE;
  return { vehicleKind: kind };
}

export function driverMatchesOrderVehicle(
  requirement: OrderVehicleRequirement,
  driverVehicleKind: VehicleKind | null
): boolean {
  if (requirement === OrderVehicleRequirement.ANY) return true;
  if (driverVehicleKind == null) return false;
  if (requirement === OrderVehicleRequirement.PUBLIC) return driverVehicleKind === VehicleKind.PUBLIC;
  return driverVehicleKind === VehicleKind.PRIVATE;
}
