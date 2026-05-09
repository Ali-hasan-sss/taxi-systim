# Taxi Office Management System

Production-oriented monorepo starter for:

- API: Node.js + Express + TypeScript + Prisma + PostgreSQL + Redis + Socket.IO + Swagger
- Admin Dashboard: Next.js App Router + TypeScript + TanStack Query + Zustand + Recharts
- Driver App: Expo Router + React Query + Socket.IO + Maps
- Coordinator App: Expo Router + React Query + Socket.IO + Maps

## Monorepo Structure

- `apps/api`
- `apps/admin-dashboard`
- `apps/driver-app`
- `apps/coordinator-app`
- `packages/types`
- `packages/utils`
- `packages/config`
- `packages/ui`

## API Highlights

- JWT auth + refresh token table
- RBAC middleware (`ADMIN`, `COORDINATOR`, `DRIVER`)
- Zod DTO validation
- Rate limiting, helmet, centralized error middleware
- Socket events for live driver status/location
- Accounting flow with atomic Prisma transactions:
  - auto commission creation on order completion
  - driver balance updates
  - commission payments (partial/full)
  - financial transaction log

## Setup

1. Copy `.env.example` to `.env`
2. Start infra:
   - `docker compose up -d`
3. Install:
   - `pnpm install`
4. Prisma:
   - `pnpm --filter @taxi/api prisma:generate`
   - `pnpm --filter @taxi/api prisma:migrate`
   - `pnpm --filter @taxi/api prisma:seed`
5. Run:
   - `pnpm dev`

## Context Rule

Project context source of truth is `cursor-context.json`.
Always align any future additions/changes with this file.
