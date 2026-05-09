export const safeNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const toMoney = (value: number): number => Math.round(value * 100) / 100;
