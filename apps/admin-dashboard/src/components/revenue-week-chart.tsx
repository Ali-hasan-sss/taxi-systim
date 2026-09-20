"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { AdminDashboardDayRevenue } from "../lib/api";

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat("ar-SY", {
    maximumFractionDigits: 0
  }).format(value)} ل.س`;
}

function weekdayLabel(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return ymd;
  return new Intl.DateTimeFormat("ar-SY", {
    timeZone: "Asia/Damascus",
    weekday: "short",
    day: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}

type ChartRow = {
  date: string;
  label: string;
  revenue: number;
  commissions: number;
  fines: number;
  compensations: number;
};

function TooltipContent({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return (
    <div className="dashboard-chart__tooltip">
      <strong>{row.label}</strong>
      <p>
        الإيرادات: <b>{formatMoney(row.revenue)}</b>
      </p>
      <span>عمولات {formatMoney(row.commissions)}</span>
      <span>غرامات {formatMoney(row.fines)}</span>
      <span>تعويضات {formatMoney(row.compensations)}</span>
    </div>
  );
}

export function RevenueWeekChart({ days }: { days: AdminDashboardDayRevenue[] }) {
  const data: ChartRow[] = days.map((row) => ({
    date: row.date,
    label: weekdayLabel(row.date),
    revenue: Number(row.revenue) || 0,
    commissions: Number(row.commissions) || 0,
    fines: Number(row.fines) || 0,
    compensations: Number(row.compensations) || 0
  }));

  return (
    <article className="card dashboard-chart">
      <div className="dashboard-chart__head">
        <div>
          <h3 className="dashboard-panel__title">منحنى الإيرادات اليومية</h3>
          <p className="dashboard-panel__desc">آخر 7 أيام بتوقيت دمشق — عمولات + غرامات − تعويضات.</p>
        </div>
      </div>
      <div className="dashboard-chart__canvas">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="adminRevenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ea580c" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#ea580c" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="#fde68a" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#78716c", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(value: number) =>
                new Intl.NumberFormat("ar-SY", { notation: "compact" }).format(value)
              }
              tick={{ fill: "#78716c", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<TooltipContent />} />
            <Area
              type="monotone"
              dataKey="revenue"
              name="الإيرادات"
              stroke="#c2410c"
              strokeWidth={2.5}
              fill="url(#adminRevenueFill)"
              dot={{ r: 4, fill: "#ea580c", stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
