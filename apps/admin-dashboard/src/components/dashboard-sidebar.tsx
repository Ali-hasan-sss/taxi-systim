"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardBrandLogo } from "./dashboard-brand-logo";

type IconProps = React.SVGProps<SVGSVGElement>;

const HomeIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 10.75 12 4l9 6.75" />
    <path d="M5.5 9.75V20h13V9.75" />
    <path d="M9.5 20v-5.5h5V20" />
  </svg>
);

const UsersIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16.5 19.5v-1.2a3.8 3.8 0 0 0-3.8-3.8H8.8A3.8 3.8 0 0 0 5 18.3v1.2" />
    <circle cx="10.75" cy="8.25" r="3.25" />
    <path d="M19 19.5v-1a3.2 3.2 0 0 0-2.5-3.12" />
    <path d="M15.75 5.2a3 3 0 0 1 0 5.8" />
  </svg>
);

const MapPinIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

const WalletIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
    <path d="M4 8h14a2 2 0 0 1 2 2v1.5h-4a2 2 0 0 0 0 4h4V17" />
    <circle cx="16" cy="13.5" r=".6" fill="currentColor" stroke="none" />
  </svg>
);

const SettingsIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 8.25A3.75 3.75 0 1 0 12 15.75A3.75 3.75 0 1 0 12 8.25Z" />
    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.05.05a1.9 1.9 0 0 1-2.69 2.69l-.05-.05a1 1 0 0 0-1.1-.2 1 1 0 0 0-.61.91V20a1.9 1.9 0 0 1-3.8 0v-.07a1 1 0 0 0-.66-.94 1 1 0 0 0-1.06.23l-.05.05a1.9 1.9 0 1 1-2.69-2.69l.05-.05a1 1 0 0 0 .2-1.1 1 1 0 0 0-.91-.61H4a1.9 1.9 0 0 1 0-3.8h.07a1 1 0 0 0 .94-.66 1 1 0 0 0-.23-1.06l-.05-.05a1.9 1.9 0 1 1 2.69-2.69l.05.05a1 1 0 0 0 1.1.2h.04a1 1 0 0 0 .57-.91V4a1.9 1.9 0 0 1 3.8 0v.07a1 1 0 0 0 .61.91 1 1 0 0 0 1.1-.2l.05-.05a1.9 1.9 0 1 1 2.69 2.69l-.05.05a1 1 0 0 0-.2 1.1v.04a1 1 0 0 0 .91.57H20a1.9 1.9 0 0 1 0 3.8h-.07a1 1 0 0 0-.94.61Z" />
  </svg>
);

const ChatIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-5.2A8 8 0 1 1 21 12Z" />
  </svg>
);

const navItems = [
  { href: "/", label: "الرئيسية", mobileLabel: "الرئيسية", icon: HomeIcon },
  { href: "/chat", label: "المحادثات", mobileLabel: "المحادثات", icon: ChatIcon },
  { href: "/employees", label: "الموظفون", mobileLabel: "الموظفون", icon: UsersIcon },
  { href: "/drivers-distribution", label: "توزع السائقين", mobileLabel: "السائقون", icon: MapPinIcon },
  { href: "/finance", label: "المالية", mobileLabel: "المالية", icon: WalletIcon },
  { href: "/settings", label: "الإعدادات", mobileLabel: "الإعدادات", icon: SettingsIcon }
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
          <p className="dashboard-sidebar__subtitle">لوحة الإدارة</p>
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
                <Icon />
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
