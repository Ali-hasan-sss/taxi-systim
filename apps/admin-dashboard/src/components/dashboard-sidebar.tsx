"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "الرئيسية", icon: "⌂" },
  { href: "/employees", label: "الموظفون", icon: "👥" }
];

export const DashboardSidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-sidebar__brand">
        <span className="dashboard-sidebar__logo">🚕</span>
        <div>
          <strong className="dashboard-sidebar__title">شركة التكسي</strong>
          <p className="dashboard-sidebar__subtitle">لوحة الإدارة</p>
        </div>
      </div>
      <nav className="dashboard-sidebar__nav" aria-label="القائمة الرئيسية">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`dashboard-sidebar__link${active ? " dashboard-sidebar__link--active" : ""}`}
            >
              <span className="dashboard-sidebar__icon" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
