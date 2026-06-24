import type { Request, Response } from "express";
import type { Server } from "socket.io";
import { Role } from "@prisma/client";
import { resyncDriverOrderVehicleRooms } from "../../socket";
import { prisma } from "../../shared/prisma";
import { createUserDto, bulkCreateDriversDto, listUsersQueryDto, setStatusDto, updateUserDto } from "./users.dto";
import { usersService } from "./users.service";

function buildSafeContentDisposition(filename: string): string {
  const asciiFallback = filename
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const fallback = asciiFallback || "employees-export.xlsx";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const usersController = {
  async list(req: Request, res: Response) {
    const query = listUsersQueryDto.parse(req.query);
    const users = await usersService.list({ role: query.role, isActive: query.isActive, q: query.q });
    res.json(
      users.map(({ expoPushToken, ...user }) => ({
        ...user,
        hasPushToken: Boolean(expoPushToken?.trim())
      }))
    );
  },

  async create(req: Request, res: Response) {
    const dto = createUserDto.parse(req.body);
    const user = await usersService.create(dto);
    res.status(201).json(user);
  },

  async bulkCreateDrivers(req: Request, res: Response) {
    const dto = bulkCreateDriversDto.parse(req.body);
    const result = await usersService.bulkCreateDrivers(dto.drivers);
    res.status(result.createdCount > 0 ? 201 : 200).json(result);
  },

  async update(req: Request, res: Response) {
    const dto = updateUserDto.parse(req.body);
    const user = await usersService.update(req.params.userId, dto);
    if (dto.driverProfile && user.role === Role.DRIVER) {
      const io = req.app.get("io") as Server | undefined;
      if (io) {
        const row = await prisma.driver.findUnique({ where: { userId: user.id }, select: { id: true } });
        if (row?.id) void resyncDriverOrderVehicleRooms(io, row.id);
      }
    }
    res.json(user);
  },

  async remove(req: Request, res: Response) {
    const result = await usersService.remove(req.params.userId);
    res.json(result);
  },

  async setStatus(req: Request, res: Response) {
    const dto = setStatusDto.parse(req.body);
    const user = await usersService.setStatus(req.params.userId, dto.isActive);
    res.json(user);
  },

  async getProfile(req: Request, res: Response) {
    const profile = await usersService.getProfile(req.params.userId);
    res.json(profile);
  },

  async listDriverCoordinators(req: Request, res: Response) {
    const rows = await usersService.listCoordinatorsForDriverUser(req.params.userId);
    res.json(rows);
  },

  async exportXlsx(_req: Request, res: Response) {
    const file = await usersService.buildEmployeesExportXlsx();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", buildSafeContentDisposition(file.filename));
    res.setHeader("Cache-Control", "no-store");
    res.status(200).end(file.buffer);
  }
};
