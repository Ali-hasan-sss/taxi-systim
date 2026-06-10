"use client";

import { useRouter } from "next/navigation";
import { DashboardBrandLogo } from "./dashboard-brand-logo";

interface DashboardNavbarProps {
  title: string;
  subtitle?: string;
}

const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const DashboardNavbar = ({ title, subtitle }: DashboardNavbarProps) => {
  const router = useRouter();

  const logout = () => {
    localStorage.removeItem("taxi_admin_session");
    router.replace("/login");
  };

  return (
    <header className="dashboard-navbar">
      <div className="dashboard-navbar__identity">
        <div className="dashboard-navbar__brandMark" aria-hidden>
          <DashboardBrandLogo className="dashboard-navbar__brandLogoImage" />
        </div>
        <div className="dashboard-navbar__titles">
          <h1 className="dashboard-navbar__title">{title}</h1>
          {subtitle ? <p className="dashboard-navbar__subtitle">{subtitle}</p> : null}
        </div>
      </div>
      <div className="dashboard-navbar__actions">
        <button type="button" className="btn btn-ghost dashboard-navbar__logout" onClick={logout}>
          <LogoutIcon />
          تسجيل الخروج
        </button>
      </div>
    </header>
  );
};
