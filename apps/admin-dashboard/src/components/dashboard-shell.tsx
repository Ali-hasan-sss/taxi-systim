"use client";

import { usePathname } from "next/navigation";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardNavbar } from "./dashboard-navbar";

const titles: Record<string, { title: string; subtitle?: string }> = {
  "/": { title: "لوحة التحكم", subtitle: "نظرة عامة على العمليات والأداء" },
  "/employees": { title: "الموظفون", subtitle: "إدارة المستخدمين والأدوار" }
};

export const DashboardShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const meta =
    titles[pathname] ??
    (pathname.startsWith("/employees") ? titles["/employees"] : { title: "لوحة التحكم" });

  return (
    <div className="dashboard-layout">
      <DashboardSidebar />
      <div className="dashboard-layout__main">
        <DashboardNavbar title={meta.title} subtitle={meta.subtitle} />
        <div className="dashboard-content">{children}</div>
      </div>
    </div>
  );
};
