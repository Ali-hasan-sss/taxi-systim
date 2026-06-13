"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DashboardChatIcon,
  DashboardDriversIcon,
  DashboardEmployeesIcon,
  DashboardFinanceIcon,
  DashboardHomeIcon,
  DashboardOrdersListIcon,
  DashboardOrdersRoomIcon,
  DashboardSettingsIcon
} from "./dashboard-nav-icons";
import { DashboardBrandLogo } from "./dashboard-brand-logo";

type NavIcon = typeof DashboardHomeIcon;

type NavItem = {
  href: string;
  label: string;
  mobileLabel: string;
  icon: NavIcon;
  nested?: boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "الرئيسية", mobileLabel: "الرئيسية", icon: DashboardHomeIcon },
  { href: "/orders-room", label: "غرفة الطلبات", mobileLabel: "الطلبات", icon: DashboardOrdersRoomIcon },
  { href: "/orders", label: "جميع الطلبات", mobileLabel: "الجدول", icon: DashboardOrdersListIcon, nested: true },
  { href: "/chat", label: "المحادثات", mobileLabel: "المحادثات", icon: DashboardChatIcon },
  { href: "/employees", label: "الموظفون", mobileLabel: "الموظفون", icon: DashboardEmployeesIcon },
  { href: "/drivers-distribution", label: "توزع السائقين", mobileLabel: "السائقون", icon: DashboardDriversIcon },
  { href: "/finance", label: "المالية", mobileLabel: "المالية", icon: DashboardFinanceIcon },
  { href: "/settings", label: "الإعدادات", mobileLabel: "الإعدادات", icon: DashboardSettingsIcon }
];

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/orders") {
    return pathname === "/orders" || pathname.startsWith("/orders/");
  }
  if (href === "/orders-room") {
    return pathname === "/orders-room" || pathname.startsWith("/orders-room/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`dashboard-sidebar__link${active ? " dashboard-sidebar__link--active" : ""}${item.nested ? " dashboard-sidebar__link--nested" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="dashboard-sidebar__icon" aria-hidden>
                <Icon size={item.nested ? 16 : 18} strokeWidth={2.1} />
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
