import { prisma } from "./prisma";

let enabled = true;
let checkedAt = 0;
let listener: ((enabled: boolean) => void) | null = null;

export function orderDraftPulseAllows(): boolean {
  return enabled;
}

export function bindOrderDraftPulseListener(next: (enabled: boolean) => void) {
  listener = next;
}

export async function refreshOrderDraftPulseEnabled(): Promise<boolean> {
  if (Date.now() - checkedAt < 4_000) return enabled;
  const row = await prisma.systemSettings.findFirst({
    where: { key: "commission" },
    select: { orderDraftPulseEnabled: true }
  });
  enabled = row?.orderDraftPulseEnabled !== false;
  checkedAt = Date.now();
  return enabled;
}

export function publishOrderDraftPulseEnabled(value: boolean) {
  enabled = value;
  checkedAt = Date.now();
  listener?.(value);
}
