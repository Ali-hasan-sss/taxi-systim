"use client";

import { usePathname } from "next/navigation";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardNavbar } from "./dashboard-navbar";

const titles: Record<string, { title: string; subtitle?: string }> = {
  "/": { title: "لوحة التحكم", subtitle: "نظرة عامة على العمليات والأداء" },
  "/chat": { title: "المحادثات", subtitle: "المحادثة العامة ومحادثات الطلبات" },
  "/employees": { title: "الموظفون", subtitle: "إدارة المستخدمين والأدوار" },
  "/drivers-distribution": { title: "توزع السائقين", subtitle: "خريطة مباشرة لمواقع السائقين وإجراءات سريعة" },
  "/finance": { title: "المالية", subtitle: "الطلبات والعمولات والتسديدات" },
  "/settings": { title: "الإعدادات", subtitle: "العمولة وكلمة مرور الأدمن" }
};

export const DashboardShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const meta =
    titles[pathname] ??
    (pathname.startsWith("/chat")
      ? titles["/chat"]
      : pathname.startsWith("/employees")
      ? titles["/employees"]
      : pathname.startsWith("/drivers-distribution")
        ? titles["/drivers-distribution"]
      : pathname.startsWith("/finance")
        ? titles["/finance"]
      : pathname.startsWith("/settings")
        ? titles["/settings"]
        : { title: "لوحة التحكم" });

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
