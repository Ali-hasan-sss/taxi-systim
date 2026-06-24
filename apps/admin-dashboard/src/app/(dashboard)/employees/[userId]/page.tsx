"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Bell } from "lucide-react";
import {
  api,
  type DriverCoordinatorOption,
  type EmployeeProfile,
  type FinanceOrderRow,
  type FinanceOrderStatus,
  type FinancePaymentStatus,
  type VehicleKind
} from "../../../../lib/api";
import styles from "./page.module.css";

const REPORT_PAGE_SIZE = 25;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const roleText: Record<EmployeeProfile["role"], string> = {
  ADMIN: "أدمن",
  COORDINATOR: "منسق",
  DRIVER: "سائق"
};

const vehicleKindText: Record<VehicleKind, string> = {
  PUBLIC: "عامة",
  PRIVATE: "خاصة",
  VIP: "VIP"
};

const ORDER_STATUS_LABELS: Record<FinanceOrderStatus, string> = {
  PENDING: "معلق",
  ACCEPTED: "مقبول",
  ARRIVED: "وصل",
  EN_ROUTE_TO_CUSTOMER: "في الطريق",
  STARTED: "بدأت الرحلة",
  STUCK: "متعثر",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى"
};

const PAYMENT_STATUS_LABELS: Record<FinancePaymentStatus, string> = {
  UNPAID: "غير مدفوعة",
  PARTIAL: "مدفوعة جزئيًا",
  PAID: "مدفوعة"
};

function syriaTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Damascus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function isValidYmd(value: string): boolean {
  return YMD_RE.test(value.trim());
}

function formatMoney(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("ar-SY", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function EmployeeDetailPage() {
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const today = useMemo(() => syriaTodayYmd(), []);

  const token = useMemo(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("taxi_admin_session") : null;
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { accessToken: string }).accessToken;
    } catch {
      return null;
    }
  }, []);

  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [rows, setRows] = useState<FinanceOrderRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    completedOrdersCount: 0,
    completedOrdersAmount: "0.00",
    totalCommissionAmount: "0.00",
    dueCommissionAmount: "0.00"
  });
  const [draftFrom, setDraftFrom] = useState(today);
  const [draftTo, setDraftTo] = useState(today);
  const [draftCoordinatorId, setDraftCoordinatorId] = useState("");
  const [filters, setFilters] = useState({ from: today, to: today, coordinatorId: "" });
  const [driverCoordinators, setDriverCoordinators] = useState<DriverCoordinatorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rowLoading, setRowLoading] = useState(false);
  const [settlingOrderId, setSettlingOrderId] = useState<string | null>(null);
  const [settlingAll, setSettlingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [compensationOpen, setCompensationOpen] = useState(false);
  const [compensationAmount, setCompensationAmount] = useState("");
  const [compensationNotes, setCompensationNotes] = useState("");
  const [recordingCompensation, setRecordingCompensation] = useState(false);

  const canViewOrders = profile?.role === "DRIVER" || profile?.role === "COORDINATOR";
  const driverId = profile?.driver?.id ?? null;
  const coordinatorId = profile?.coordinator?.id ?? null;
  const reportCoordinatorId =
    profile?.role === "DRIVER" ? filters.coordinatorId || null : coordinatorId;

  const handleSessionExpired = useCallback(() => {
    api.clearSession();
    router.replace("/login");
  }, [router]);

  const loadProfile = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getEmployeeProfile(token, userId);
      setProfile(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل تفاصيل الموظف";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [handleSessionExpired, token, userId]);

  const loadDriverCoordinators = useCallback(async () => {
    if (!token || !userId) return;
    try {
      const rows = await api.listDriverCoordinators(token, userId);
      setDriverCoordinators(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل قائمة المنسقين";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setDriverCoordinators([]);
    }
  }, [handleSessionExpired, token, userId]);

  const loadReport = useCallback(
    async (opts?: { cursor?: string | null; append?: boolean }) => {
      if (!token || !canViewOrders) return;
      if (!driverId && !coordinatorId) return;

      const append = opts?.append === true;
      if (append) setLoadingMore(true);
      else setLoadingReport(true);
      setError(null);

      try {
        const page = await api.financeReport(token, {
          from: filters.from,
          to: filters.to,
          driverId,
          coordinatorId: reportCoordinatorId,
          cursor: opts?.cursor ?? null,
          limit: REPORT_PAGE_SIZE
        });
        setRows((prev) => (append ? [...prev, ...page.rows] : page.rows));
        setNextCursor(page.nextCursor);
        setSummary({
          completedOrdersCount: page.summary.completedOrdersCount,
          completedOrdersAmount: page.summary.completedOrdersAmount,
          totalCommissionAmount: page.summary.totalCommissionAmount,
          dueCommissionAmount: page.summary.adjustedDueCommissionAmount
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "تعذر تحميل تقرير الطلبات";
        if (message === "SESSION_EXPIRED") {
          handleSessionExpired();
          return;
        }
        setError(message);
      } finally {
        setLoadingMore(false);
        setLoadingReport(false);
      }
    },
    [canViewOrders, coordinatorId, driverId, filters.coordinatorId, filters.from, filters.to, handleSessionExpired, reportCoordinatorId, token]
  );

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    void loadProfile();
  }, [loadProfile, router, token]);

  useEffect(() => {
    if (!profile || profile.role !== "DRIVER") return;
    void loadDriverCoordinators();
  }, [loadDriverCoordinators, profile]);

  useEffect(() => {
    if (!profile || !canViewOrders) return;
    void loadReport();
  }, [canViewOrders, filters.coordinatorId, filters.from, filters.to, loadReport, profile]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    if (!isValidYmd(draftFrom) || !isValidYmd(draftTo)) {
      setError("صيغة التاريخ يجب أن تكون YYYY-MM-DD.");
      return;
    }
    if (draftFrom > draftTo) {
      setError("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية.");
      return;
    }
    setError(null);
    setFilters({ from: draftFrom, to: draftTo, coordinatorId: draftCoordinatorId });
  };

  const onToggleStatus = async () => {
    if (!token || !profile) return;
    setRowLoading(true);
    setError(null);
    try {
      await api.toggleEmployeeStatus(token, profile.id, !profile.isActive);
      setNotice(profile.isActive ? "تم تعطيل الحساب." : "تم تفعيل الحساب.");
      await loadProfile();
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحديث الحالة";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setRowLoading(false);
    }
  };

  const onDelete = async () => {
    if (!token || !profile) return;
    if (!confirm(`هل أنت متأكد من حذف ${profile.fullName}؟`)) return;
    setRowLoading(true);
    try {
      await api.deleteEmployee(token, profile.id);
      router.replace("/employees");
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل حذف الموظف";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setRowLoading(false);
    }
  };

  const exportReport = async () => {
    if (!token || !canViewOrders) return;
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const file = await api.downloadFinanceExport(token, {
        from: filters.from,
        to: filters.to,
        driverId,
        coordinatorId: reportCoordinatorId
      });
      downloadBlobFile(file.blob, file.filename);
      setNotice("تم تصدير التقرير بصيغة Excel.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تصدير التقرير";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setExporting(false);
    }
  };

  const settleSingleOrder = async (row: FinanceOrderRow) => {
    if (!token || !row.commission) return;
    setSettlingOrderId(row.id);
    setError(null);
    try {
      await api.settleOrderCommission(token, { orderId: row.id });
      setNotice("تم تسديد عمولة الطلب.");
      await Promise.all([loadProfile(), loadReport()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تسديد العمولة";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setSettlingOrderId(null);
    }
  };

  const settleAllInPeriod = async () => {
    if (!token || !driverId) return;
    if (!confirm("تسديد كل العمولات المستحقة ضمن الفترة المحددة؟")) return;
    setSettlingAll(true);
    setError(null);
    try {
      await api.settleFilteredCommissions(token, {
        from: filters.from,
        to: filters.to,
        driverId,
        coordinatorId: reportCoordinatorId || undefined
      });
      setNotice("تم تنفيذ التسديد الجماعي للفترة.");
      await Promise.all([loadProfile(), loadReport()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر التسديد الجماعي";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setSettlingAll(false);
    }
  };

  const submitCompensation = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !driverId) return;
    const amount = Number(compensationAmount.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل قيمة تعويض صالحة.");
      return;
    }
    setRecordingCompensation(true);
    setError(null);
    try {
      await api.recordDriverCompensation(token, {
        driverId,
        amount,
        notes: compensationNotes.trim() || undefined
      });
      setNotice("تم تسجيل التعويض.");
      setCompensationOpen(false);
      setCompensationAmount("");
      setCompensationNotes("");
      await Promise.all([loadProfile(), loadReport()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تسجيل التعويض";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setRecordingCompensation(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="dashboard-page">
        <p className="loading-row">
          <span className="spinner" aria-hidden />
          جاري تحميل تفاصيل الموظف...
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="dashboard-page">
        <Link href="/employees" className={styles.backLink}>
          <ArrowRight size={18} aria-hidden />
          العودة إلى الموظفين
        </Link>
        <p className="form-error">{error ?? "الموظف غير موجود."}</p>
      </div>
    );
  }

  const vehicleLine =
    profile.role === "DRIVER" && profile.driver
      ? [
          profile.driver.vehicleBrand,
          profile.driver.vehicleKind ? vehicleKindText[profile.driver.vehicleKind] : null,
          profile.driver.vehicleColor,
          profile.driver.vehicleNumber ? `لوحة: ${profile.driver.vehicleNumber}` : null
        ]
          .filter(Boolean)
          .join(" · ") || "—"
      : "—";

  return (
    <div className={`dashboard-page ${styles.page}`}>
      <div className={styles.topBar}>
        <Link href="/employees" className={styles.backLink}>
          <ArrowRight size={18} aria-hidden />
          العودة إلى الموظفين
        </Link>
      </div>

      {notice ? <p className={styles.feedback}>{notice}</p> : null}
      {error ? <p className={`${styles.feedback} ${styles.feedbackError}`}>{error}</p> : null}

      <section className={`card ${styles.heroCard}`}>
        <div className={styles.heroHead}>
          <div>
            <h1 className={styles.heroTitle}>{profile.fullName}</h1>
            <div className={styles.heroMeta}>
              <span className={`${styles.badge} ${styles.badgeRole}`}>{roleText[profile.role]}</span>
              <span className={`${styles.badge} ${profile.isActive ? styles.badgeActive : styles.badgeInactive}`}>
                {profile.isActive ? "مفعل" : "معطل"}
              </span>
              {profile.hasPushToken ? (
                <span className={`${styles.badge} ${styles.badgeOnline}`}>
                  <Bell size={14} aria-hidden /> إشعارات مسجّلة
                </span>
              ) : null}
              {profile.driver?.isOnline ? (
                <span className={`${styles.badge} ${styles.badgeOnline}`}>متصل الآن</span>
              ) : null}
              {profile.driver?.isBusy ? <span className={`${styles.badge} ${styles.badgeBusy}`}>مشغول</span> : null}
            </div>
          </div>

          <div className={styles.actionsRow}>
            <button type="button" className="btn btn-sm" disabled={rowLoading} onClick={() => void onToggleStatus()}>
              {profile.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
            </button>
            <button type="button" className="btn btn-sm" disabled={rowLoading} onClick={() => void onDelete()}>
              حذف
            </button>
            {profile.role === "DRIVER" && driverId ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setCompensationOpen(true)}>
                إضافة تعويض
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className={styles.grid2}>
        <section className={`card ${styles.infoCard}`}>
          <h2 className={styles.sectionTitle}>البيانات الأساسية</h2>
          <div className={styles.infoList}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>البريد</span>
              <span className={styles.infoValue}>{profile.email ?? "—"}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>الهاتف</span>
              <span className={styles.infoValue}>{profile.phone ?? "—"}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>تاريخ الإنشاء</span>
              <span className={styles.infoValue}>{formatDateTime(profile.createdAt)}</span>
            </div>
            {profile.role === "DRIVER" ? (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>المركبة</span>
                <span className={styles.infoValue}>{vehicleLine}</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className={`card ${styles.statsCard}`}>
          <h2 className={styles.sectionTitle}>إحصائيات الطلبات</h2>
          <div className={styles.statsGrid}>
            <div className={styles.statTile}>
              <span className={styles.statValue}>{profile.stats.completedOrders}</span>
              <span className={styles.statLabel}>طلبات مكتملة (الإجمالي)</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statValue}>{profile.stats.pendingOrders}</span>
              <span className={styles.statLabel}>طلبات معلقة</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statValue}>{profile.stats.inProgressOrders}</span>
              <span className={styles.statLabel}>طلبات قيد التنفيذ</span>
            </div>
            {profile.role === "DRIVER" ? (
              <>
                <div className={styles.statTile}>
                  <span className={styles.statValue}>{formatMoney(profile.stats.dueCommissionAmount)}</span>
                  <span className={styles.statLabel}>عمولة مستحقة (الإجمالي)</span>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statValue}>{formatMoney(profile.stats.totalPaidCommissions)}</span>
                  <span className={styles.statLabel}>عمولات مسدّدة (الإجمالي)</span>
                </div>
              </>
            ) : null}
          </div>
        </section>
      </div>

      {canViewOrders && (driverId || coordinatorId) ? (
        <section className={`card ${styles.reportCard}`}>
          <h2 className={styles.sectionTitle}>
            {profile.role === "DRIVER" ? "طلبات السائق المنفذة" : "طلبات المنسق المنفذة"}
          </h2>

          <form className={styles.filtersRow} onSubmit={applyFilters}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>من</span>
              <input className="input-styled" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>إلى</span>
              <input className="input-styled" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
            </label>
            {profile.role === "DRIVER" && driverCoordinators.length > 0 ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>المنسق</span>
                <select
                  className="input-styled"
                  value={draftCoordinatorId}
                  onChange={(e) => setDraftCoordinatorId(e.target.value)}
                >
                  <option value="">جميع المنسقين</option>
                  {driverCoordinators.map((coordinator) => (
                    <option key={coordinator.id} value={coordinator.id}>
                      {coordinator.fullName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={loadingReport}>
              {loadingReport ? "جاري التحميل..." : "عرض الطلبات"}
            </button>
            <button type="button" className="btn" disabled={exporting} onClick={() => void exportReport()}>
              {exporting ? "جاري التصدير..." : "تصدير Excel"}
            </button>
            {profile.role === "DRIVER" && driverId ? (
              <button type="button" className="btn btn-ghost" disabled={settlingAll} onClick={() => void settleAllInPeriod()}>
                {settlingAll ? "جارٍ التسديد..." : "تسديد عمولات الفترة"}
              </button>
            ) : null}
          </form>

          <div className={styles.statsGrid}>
            <div className={styles.statTile}>
              <span className={styles.statValue}>{summary.completedOrdersCount}</span>
              <span className={styles.statLabel}>مكتملة ضمن الفترة</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statValue}>{formatMoney(summary.completedOrdersAmount)}</span>
              <span className={styles.statLabel}>قيمة الطلبات</span>
            </div>
            {profile.role === "DRIVER" ? (
              <>
                <div className={styles.statTile}>
                  <span className={styles.statValue}>{formatMoney(summary.totalCommissionAmount)}</span>
                  <span className={styles.statLabel}>إجمالي العمولة</span>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statValue}>{formatMoney(summary.dueCommissionAmount)}</span>
                  <span className={styles.statLabel}>عمولة مستحقة (بعد التعويض)</span>
                </div>
              </>
            ) : null}
          </div>

          {loadingReport ? (
            <p className="loading-row">
              <span className="spinner" aria-hidden />
              جاري تحميل الطلبات...
            </p>
          ) : rows.length === 0 ? (
            <p className={styles.emptyState}>لا توجد طلبات ضمن هذه الفترة.</p>
          ) : (
            <>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>الزبون</th>
                      <th>المسار</th>
                      {profile.role === "COORDINATOR" ? <th>السائق</th> : <th>المنسق</th>}
                      <th>حالة الطلب</th>
                      <th>المبلغ</th>
                      {profile.role === "DRIVER" ? <th>العمولة</th> : null}
                      {profile.role === "DRIVER" ? <th>إجراء</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDateTime(row.completedAt ?? row.createdAt)}</td>
                        <td>
                          <strong>{row.customerName}</strong>
                          <br />
                          <span>{row.customerPhone ?? "—"}</span>
                        </td>
                        <td>
                          من: {row.pickupAddress}
                          <br />
                          إلى: {row.dropoffAddress}
                        </td>
                        <td>
                          {profile.role === "COORDINATOR"
                            ? row.driver?.fullName ?? "غير مسند"
                            : row.coordinator?.fullName ?? "—"}
                        </td>
                        <td>{ORDER_STATUS_LABELS[row.status] ?? row.status}</td>
                        <td>{formatMoney(row.amount)}</td>
                        {profile.role === "DRIVER" ? (
                          <td>
                            {row.commission ? (
                              <>
                                <div>المتبقي: {formatMoney(row.commission.remainingAmount)}</div>
                                <span>{PAYMENT_STATUS_LABELS[row.commission.paymentStatus]}</span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        ) : null}
                        {profile.role === "DRIVER" ? (
                          <td className="cell-actions">
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={
                                !row.commission ||
                                Number(row.commission.remainingAmount) <= 0 ||
                                settlingOrderId === row.id
                              }
                              onClick={() => void settleSingleOrder(row)}
                            >
                              {settlingOrderId === row.id ? "جارٍ..." : "تسديد"}
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nextCursor ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={loadingMore}
                  onClick={() => void loadReport({ cursor: nextCursor, append: true })}
                >
                  {loadingMore ? "جارٍ تحميل المزيد..." : "تحميل المزيد"}
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {compensationOpen && driverId ? (
        <div className="modal-backdrop" onClick={() => !recordingCompensation && setCompensationOpen(false)} role="presentation">
          <div className="card modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-panel__header">
              <h3>إضافة تعويض للسائق</h3>
              <button type="button" className="btn btn-ghost" onClick={() => setCompensationOpen(false)}>
                إغلاق
              </button>
            </div>
            <form className="modal-form" onSubmit={submitCompensation}>
              <input
                className="input-styled"
                value={compensationAmount}
                onChange={(e) => setCompensationAmount(e.target.value)}
                placeholder="قيمة التعويض"
                inputMode="decimal"
                required
              />
              <textarea
                className="input-styled"
                value={compensationNotes}
                onChange={(e) => setCompensationNotes(e.target.value)}
                placeholder="ملاحظات (اختياري)"
                rows={3}
              />
              <div className="modal-form__actions">
                <button type="submit" className="btn btn-primary" disabled={recordingCompensation}>
                  {recordingCompensation ? "جاري الحفظ..." : "تسجيل التعويض"}
                </button>
                <button type="button" className="btn" onClick={() => setCompensationOpen(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
