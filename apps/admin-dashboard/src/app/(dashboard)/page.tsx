"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

const kpi = [
  { title: "إجمالي أرباح الشركة", value: "$18,420", diff: "+12.4%" },
  { title: "العمولات غير المسددة", value: "$2,190", diff: "-4.2%" },
  { title: "السائقون النشطون", value: "37", diff: "+5 سائقين" },
  { title: "الرحلات النشطة", value: "14", diff: "مباشر الآن" }
];

export default function DashboardPage() {
  const router = useRouter();
  const [name, setName] = useState("المدير");
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
        const me = await api.me(parsed.accessToken);
        setName(me.fullName);
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

  if (loading) {
    return (
      <div className="dashboard-page-loading">
        <span className="spinner-inline" aria-hidden />
        جاري تحميل البيانات...
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <section className="card dashboard-welcome">
        <h2 className="dashboard-welcome__heading">{welcome}</h2>
        <p className="dashboard-welcome__text">مركز تحكم شركة التكسي — تابع الطلبات والسائقين والعمولات من مكان واحد.</p>
      </section>

      <section className="dashboard-kpi-grid">
        {kpi.map((item) => (
          <article key={item.title} className="card dashboard-kpi">
            <p className="dashboard-kpi__label">{item.title}</p>
            <h3 className="dashboard-kpi__value">{item.value}</h3>
            <p className="dashboard-kpi__diff">{item.diff}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-two-col">
        <article className="card dashboard-panel">
          <h3 className="dashboard-panel__title">العمليات المباشرة</h3>
          <p className="dashboard-panel__desc">خريطة حية، تدفق الطلبات المعلقة، ومتابعة الرحلات النشطة.</p>
          <div className="dashboard-panel__placeholder" />
        </article>

        <article className="card dashboard-panel">
          <h3 className="dashboard-panel__title">إجراءات سريعة</h3>
          <div className="dashboard-quick-actions">
            <Link href="/employees" className="btn btn-primary dashboard-quick-actions__link">
              إدارة الموظفين
            </Link>
            <Link href="/settings" className="btn btn-primary dashboard-quick-actions__link">
              إعدادات العمولة
            </Link>
            <Link href="/finance" className="btn btn-primary dashboard-quick-actions__link">
              التقارير المالية
            </Link>
            <button type="button" className="btn btn-primary">
              إضافة منسق
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}
