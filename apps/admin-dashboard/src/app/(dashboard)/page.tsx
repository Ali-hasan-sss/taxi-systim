"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type AdminDashboardStats } from "../../lib/api";

type KpiIconProps = React.SVGProps<SVGSVGElement>;

const ProfitIcon = (props: KpiIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2v20" />
    <path d="M17 7H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const CommissionIcon = (props: KpiIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 9h4" />
    <path d="M7 13h10" />
  </svg>
);

const DriversIcon = (props: KpiIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16.5 19.5v-1.2a3.8 3.8 0 0 0-3.8-3.8H8.8A3.8 3.8 0 0 0 5 18.3v1.2" />
    <circle cx="10.75" cy="8.25" r="3.25" />
    <path d="M19 19.5v-1a3.2 3.2 0 0 0-2.5-3.12" />
    <path d="M15.75 5.2a3 3 0 0 1 0 5.8" />
  </svg>
);

const TripsIcon = (props: KpiIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 12h3l2.5-7L14 20l2.5-7H21" />
  </svg>
);

const EmployeesIcon = (props: KpiIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const UsersManageIcon = (props: KpiIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6" />
    <path d="M16 11h6" />
  </svg>
);

const SettingsIcon = (props: KpiIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 8.25A3.75 3.75 0 1 0 12 15.75A3.75 3.75 0 1 0 12 8.25Z" />
    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.05.05a1.9 1.9 0 1 1-2.69 2.69l-.05-.05a1 1 0 0 0-1.1-.2 1 1 0 0 0-.61.91V20a1.9 1.9 0 0 1-3.8 0v-.07a1 1 0 0 0-.66-.94 1 1 0 0 0-1.06.23l-.05.05a1.9 1.9 0 1 1-2.69-2.69l.05-.05a1 1 0 0 0 .2-1.1 1 1 0 0 0-.91-.61H4a1.9 1.9 0 0 1 0-3.8h.07a1 1 0 0 0 .94-.66 1 1 0 0 0-.23-1.06l-.05-.05a1.9 1.9 0 1 1 2.69-2.69l.05.05a1 1 0 0 0 1.1.2h.04a1 1 0 0 0 .57-.91V4a1.9 1.9 0 0 1 3.8 0v.07a1 1 0 0 0 .61.91 1 1 0 0 0 1.1-.2l.05-.05a1.9 1.9 0 1 1 2.69 2.69l-.05.05a1 1 0 0 0-.2 1.1v.04a1 1 0 0 0 .91.57H20a1.9 1.9 0 0 1 0 3.8h-.07a1 1 0 0 0-.94.61Z" />
  </svg>
);

const FinanceIcon = (props: KpiIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
    <path d="M4 8h14a2 2 0 0 1 2 2v1.5h-4a2 2 0 0 0 0 4h4V17" />
  </svg>
);

const MapIcon = (props: KpiIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

const quickActions = [
  { href: "/orders-room", label: "غرفة الطلبات", icon: TripsIcon },
  { href: "/employees", label: "إدارة الموظفين", icon: UsersManageIcon },
  { href: "/settings", label: "إعدادات العمولة", icon: SettingsIcon },
  { href: "/finance", label: "التقارير المالية", icon: FinanceIcon },
  { href: "/drivers-distribution", label: "توزع السائقين", icon: MapIcon }
];

function formatSyrianMoney(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0 ل.س";
  const formatted = new Intl.NumberFormat("ar-SY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(n);
  return `${formatted} ل.س`;
}

function formatSyriaDate(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return ymd;
  return new Intl.DateTimeFormat("ar-SY", {
    timeZone: "Asia/Damascus",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}

function buildKpiCards(stats: AdminDashboardStats) {
  return [
    {
      title: "إيرادات اليوم",
      value: formatSyrianMoney(stats.revenueToday),
      diff: `${stats.completedOrdersToday} رحلة مكتملة · عمولة ${formatSyrianMoney(stats.commissionToday)}`,
      icon: ProfitIcon
    },
    {
      title: "العمولات غير المسددة",
      value: formatSyrianMoney(stats.dueCommission),
      diff: "مستحق على السائقين",
      icon: CommissionIcon
    },
    {
      title: "السائقون النشطون",
      value: String(stats.activeDriversOnline),
      diff: `من ${stats.totalDrivers} سائق مسجّل`,
      icon: DriversIcon
    },
    {
      title: "الموظفون",
      value: String(stats.employeesTotal),
      diff: `${stats.employeesByRole.coordinator} منسق · ${stats.employeesByRole.driver} سائق · ${stats.employeesByRole.admin} أدمن`,
      icon: EmployeesIcon
    },
    {
      title: "الرحلات النشطة",
      value: String(stats.activeTrips),
      diff: "قيد التنفيذ الآن",
      icon: TripsIcon
    }
  ];
}

export default function DashboardPage() {
  const router = useRouter();
  const [name, setName] = useState("المدير");
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      const raw = localStorage.getItem("taxi_admin_session");
      if (!raw) {
        router.replace("/login");
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { accessToken: string };
        const [me, dashboardStats] = await Promise.all([
          api.me(parsed.accessToken),
          api.getDashboardStats(parsed.accessToken)
        ]);
        setName(me.fullName);
        setStats(dashboardStats);
      } catch {
        localStorage.removeItem("taxi_admin_session");
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    };
    void restore();
  }, [router]);

  const welcome = useMemo(() => `مرحبًا، ${name}`, [name]);
  const kpi = useMemo(() => (stats ? buildKpiCards(stats) : []), [stats]);

  if (loading) {
    return (
      <div className="dashboard-page-loading">
        <span className="spinner" aria-hidden />
        جاري تحميل البيانات...
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <section className="card dashboard-welcome">
        <h2 className="dashboard-welcome__heading">{welcome}</h2>
        <p className="dashboard-welcome__text">
          مركز تحكم Taxi Bro — إحصائيات اليوم{" "}
          {stats ? `(${formatSyriaDate(stats.today)})` : ""} بتوقيت دمشق.
        </p>
      </section>

      <section className="dashboard-kpi-grid">
        {kpi.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title} className="card dashboard-kpi">
              <div className="dashboard-kpi__head">
                <p className="dashboard-kpi__label">{item.title}</p>
                <span className="dashboard-kpi__icon" aria-hidden>
                  <Icon />
                </span>
              </div>
              <h3 className="dashboard-kpi__value">{item.value}</h3>
              <p className="dashboard-kpi__diff">{item.diff}</p>
            </article>
          );
        })}
      </section>

      <section className="dashboard-two-col">
        <article className="card dashboard-panel">
          <h3 className="dashboard-panel__title">لمحة تشغيلية</h3>
          <p className="dashboard-panel__desc">ملخص سريع من البيانات الحية.</p>
          <ul className="dashboard-snapshot">
            <li>
              <span>إيرادات اليوم</span>
              <strong>{stats ? formatSyrianMoney(stats.revenueToday) : "—"}</strong>
            </li>
            <li>
              <span>عمولات غير مسددة</span>
              <strong>{stats ? formatSyrianMoney(stats.dueCommission) : "—"}</strong>
            </li>
            <li>
              <span>سائقون متصلون</span>
              <strong>{stats ? `${stats.activeDriversOnline} / ${stats.totalDrivers}` : "—"}</strong>
            </li>
            <li>
              <span>رحلات نشطة</span>
              <strong>{stats ? stats.activeTrips : "—"}</strong>
            </li>
          </ul>
          <Link href="/orders-room" className="btn btn-ghost dashboard-panel__link">
            فتح غرفة الطلبات
          </Link>
        </article>

        <article className="card dashboard-panel">
          <h3 className="dashboard-panel__title">إجراءات سريعة</h3>
          <p className="dashboard-panel__desc">انتقل مباشرة إلى أهم أقسام الإدارة.</p>
          <div className="dashboard-quick-action-grid">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} className="dashboard-quick-action-card">
                  <span className="dashboard-quick-action-card__icon" aria-hidden>
                    <Icon />
                  </span>
                  {action.label}
                </Link>
              );
            })}
          </div>
        </article>
      </section>
    </div>
  );
}
