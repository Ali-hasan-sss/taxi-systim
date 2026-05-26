"use client";

import { useRouter } from "next/navigation";
import { DashboardBrandLogo } from "./dashboard-brand-logo";

interface DashboardNavbarProps {
  title: string;
  subtitle?: string;
}

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
        <button type="button" className="btn btn-ghost" onClick={logout}>
          تسجيل الخروج
        </button>
      </div>
    </header>
  );
};
