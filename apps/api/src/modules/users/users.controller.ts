import type { Request, Response } from "express";
import type { Server } from "socket.io";
import { Role } from "@prisma/client";
import { resyncDriverOrderVehicleRooms } from "../../socket";
import { prisma } from "../../shared/prisma";
import { createUserDto, listUsersQueryDto, setStatusDto, updateUserDto } from "./users.dto";
import { usersService } from "./users.service";

export const usersController = {
  async list(req: Request, res: Response) {
    const query = listUsersQueryDto.parse(req.query);
    const users = await usersService.list({ role: query.role, isActive: query.isActive });
    res.json(users);
  },

  async create(req: Request, res: Response) {
    const dto = createUserDto.parse(req.body);
    const user = await usersService.create(dto);
    res.status(201).json(user);
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
  }
};
