"use client";

import { usePathname } from "next/navigation";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardNavbar } from "./dashboard-navbar";

const titles: Record<string, { title: string; subtitle?: string }> = {
  "/": { title: "لوحة التحكم", subtitle: "نظرة عامة على العمليات والأداء" },
  "/orders-room": { title: "غرفة الطلبات", subtitle: "مراقبة مباشرة لحالات الطلبات والسائقين" },
  "/orders": { title: "جميع الطلبات", subtitle: "جدول الطلبات مع البحث والتعديل والحذف" },
  "/customers": { title: "الزبائن", subtitle: "قائمة الزبائن حسب النشاط والانقطاع" },
  "/promotions": { title: "العروض", subtitle: "خصومات الولاء وروابط الويب للزبائن" },
  "/chat": { title: "المحادثات", subtitle: "المحادثة العامة ومحادثات الطلبات" },
  "/employees": { title: "الموظفون", subtitle: "إدارة المستخدمين والأدوار" },
  "/drivers-distribution": { title: "توزع السائقين", subtitle: "خريطة مباشرة لمواقع السائقين وإجراءات سريعة" },
  "/finance": { title: "المالية", subtitle: "الطلبات والعمولات والتسديدات" },
  "/settings": { title: "الإعدادات", subtitle: "حساب الأدمن والعمولة وكلمة المرور" }
};

export const DashboardShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isImmersivePage =
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/drivers-distribution" ||
    pathname.startsWith("/drivers-distribution/");
  const meta =
    titles[pathname] ??
    (pathname.startsWith("/chat")
      ? titles["/chat"]
      : pathname.startsWith("/orders-room")
        ? titles["/orders-room"]
        : pathname === "/orders" || pathname.startsWith("/orders/")
          ? titles["/orders"]
      : pathname.startsWith("/customers")
        ? titles["/customers"]
      : pathname.startsWith("/promotions")
        ? titles["/promotions"]
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
        <div className={`dashboard-content${isImmersivePage ? " dashboard-content--immersive" : ""}`}>{children}</div>
      </div>
    </div>
  );
};
