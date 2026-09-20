export function formatSyrianAmount(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("ar-SY", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

export type RemainingBalanceKind = "owe" | "credit" | "zero";

export function remainingBalanceCopy(value: string | number): {
  kind: RemainingBalanceKind;
  title: string;
  amountText: string;
  sentence: string;
} {
  const n = typeof value === "number" ? value : Number(value);
  const amount = Number.isFinite(n) ? n : 0;
  const amountText = formatSyrianAmount(Math.abs(amount));
  if (amount > 0) {
    return {
      kind: "owe",
      title: "يترتب عليه مبلغ",
      amountText,
      sentence: `يترتب عليه مبلغ ${amountText}`
    };
  }
  if (amount < 0) {
    return {
      kind: "credit",
      title: "يجب إعطاؤه من المكتب مبلغ",
      amountText,
      sentence: `يجب إعطاؤه من المكتب مبلغ ${amountText}`
    };
  }
  return {
    kind: "zero",
    title: "لا يوجد مبلغ مترتب",
    amountText,
    sentence: "لا يوجد مبلغ مترتب"
  };
}
