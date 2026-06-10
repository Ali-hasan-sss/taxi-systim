"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DashboardChatIcon,
  DashboardDriversIcon,
  DashboardEmployeesIcon,
  DashboardFinanceIcon,
  DashboardHomeIcon,
  DashboardOrdersRoomIcon,
  DashboardSettingsIcon
} from "./dashboard-nav-icons";
import { DashboardBrandLogo } from "./dashboard-brand-logo";

type NavIcon = typeof DashboardHomeIcon;

const navItems: {
  href: string;
  label: string;
  mobileLabel: string;
  icon: NavIcon;
}[] = [
  { href: "/", label: "الرئيسية", mobileLabel: "الرئيسية", icon: DashboardHomeIcon },
  { href: "/orders-room", label: "غرفة الطلبات", mobileLabel: "الطلبات", icon: DashboardOrdersRoomIcon },
  { href: "/chat", label: "المحادثات", mobileLabel: "المحادثات", icon: DashboardChatIcon },
  { href: "/employees", label: "الموظفون", mobileLabel: "الموظفون", icon: DashboardEmployeesIcon },
  { href: "/drivers-distribution", label: "توزع السائقين", mobileLabel: "السائقون", icon: DashboardDriversIcon },
  { href: "/finance", label: "المالية", mobileLabel: "المالية", icon: DashboardFinanceIcon },
  { href: "/settings", label: "الإعدادات", mobileLabel: "الإعدادات", icon: DashboardSettingsIcon }
];

export const DashboardSidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-sidebar__brand">
        <div className="dashboard-sidebar__logoBox">
          <DashboardBrandLogo className="dashboard-sidebar__logoImage" priority />
        </div>
        <div>
          <strong className="dashboard-sidebar__title">Taxi Bro</strong>
          <p className="dashboard-sidebar__subtitle">لوحة تحكم Taxi Bro</p>
        </div>
      </div>
      <nav className="dashboard-sidebar__nav" aria-label="القائمة الرئيسية">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`dashboard-sidebar__link${active ? " dashboard-sidebar__link--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="dashboard-sidebar__icon" aria-hidden>
                <Icon size={18} strokeWidth={2.1} />
              </span>
              <span className="dashboard-sidebar__label">{item.label}</span>
              <span className="dashboard-sidebar__mobile-label">{item.mobileLabel}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
