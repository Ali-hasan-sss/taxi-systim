"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type CustomerRow, type CustomersListResponse } from "../../../lib/api";
import { useDebouncedSearch } from "../../../lib/use-debounced-value";

type CustomerFilter = "all" | "most_orders" | "inactive";

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SY", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Damascus"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function CustomersPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const { query: searchQuery } = useDebouncedSearch(searchDraft);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CustomersListResponse | null>(null);

  const handleSessionExpired = useCallback(() => {
    localStorage.removeItem("taxi_admin_session");
    router.replace("/login");
  }, [router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listCustomers(token, {
        filter,
        q: searchQuery || undefined,
        page,
        limit: 30
      });
      setData(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل الزبائن";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filter, handleSessionExpired, page, searchQuery, token]);

  useEffect(() => {
    const raw = localStorage.getItem("taxi_admin_session");
    if (!raw) {
      router.replace("/login");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { accessToken: string };
      setToken(parsed.accessToken);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    setPage(1);
  }, [filter, searchQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const customers: CustomerRow[] = data?.customers ?? [];

  return (
    <div className="dashboard-page">
      <section className="card employees-toolbar">
        <div className="employees-toolbar__row">
          <input
            className="input"
            placeholder="بحث بالاسم أو الرقم…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
          <div className="orders-room-filters__row" style={{ flexWrap: "wrap", gap: 8 }}>
            {(
              [
                { key: "all" as const, label: "الكل" },
                { key: "most_orders" as const, label: "الأكثر طلباً" },
                { key: "inactive" as const, label: "المنقطعون" }
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                className={`orders-room-filter${filter === item.key ? " orders-room-filter--active" : ""}`}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
                {item.key === "inactive" && data ? (
                  <span className="orders-room-filter__count">{data.inactiveCount}</span>
                ) : null}
                {item.key === "all" && data ? (
                  <span className="orders-room-filter__count">{data.totalAll}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
        <p className="orders-room-toolbar__hint" style={{ marginTop: 10 }}>
          المنقطع: لم يطلب منذ أسبوعين فأكثر ولديه أكثر من 10 طلبات في سجله.
        </p>
      </section>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="card employees-table-card">
        {loading ? (
          <p className="loading-row">
            <span className="spinner" aria-hidden />
            جاري تحميل الزبائن...
          </p>
        ) : customers.length === 0 ? (
          <p className="orders-room-empty">لا يوجد زبائن مطابقون.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الهاتف</th>
                  <th>عدد الطلبات</th>
                  <th>آخر طلب</th>
                  <th>تاريخ الإضافة</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name?.trim() || "—"}</td>
                    <td dir="ltr">{row.phoneDisplay}</td>
                    <td>{row.ordersCount}</td>
                    <td>{formatDateTime(row.lastOrderAt)}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > data.limit ? (
          <div className="orders-room-load-more" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              السابق
            </button>
            <span style={{ marginInline: 12 }}>
              صفحة {data.page} · {data.total} زبون
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!data.hasMore || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              التالي
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
