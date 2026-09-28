"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "../../../components/confirm-modal";
import {
  api,
  type CommissionPaymentMode,
  type DebtsDuesDriverRow,
  type DebtsDuesKind,
  type DebtsDuesSummary,
  type PaymentModeSettlement
} from "../../../lib/api";

type FormKind = "debt" | "credit";
type FilterKind = "all" | "debt" | "credit";
type PendingAction =
  | { kind: "settle"; row: DebtsDuesDriverRow }
  | { kind: "payout"; row: DebtsDuesDriverRow };

const modeLabels: Record<CommissionPaymentMode, string> = {
  POSTPAID: "ملحق الدفع",
  PREPAID: "مسبق الدفع"
};

const emptySummary: DebtsDuesSummary = {
  driverCount: 0,
  debtDriverCount: 0,
  creditDriverCount: 0,
  zeroDriverCount: 0,
  totalDebt: "0.00",
  totalCredit: "0.00"
};

function formatMoney(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("ar-SY", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function kindMeta(kind: DebtsDuesKind) {
  if (kind === "debt") return { label: "دين", className: "debts-badge debts-badge--debt" };
  if (kind === "credit") return { label: "مستحق", className: "debts-badge debts-badge--credit" };
  return { label: "صفر", className: "debts-badge debts-badge--zero" };
}

export default function DebtsDuesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<CommissionPaymentMode>("POSTPAID");
  const [summary, setSummary] = useState<DebtsDuesSummary>(emptySummary);
  const [rows, setRows] = useState<DebtsDuesDriverRow[]>([]);
  const [archives, setArchives] = useState<PaymentModeSettlement[]>([]);
  const [openArchiveId, setOpenArchiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [formOpen, setFormOpen] = useState<FormKind | null>(null);
  const [formDriverId, setFormDriverId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formDriverSearch, setFormDriverSearch] = useState("");
  const [formDriverDropdownOpen, setFormDriverDropdownOpen] = useState(false);
  const formDriverDropdownRef = useRef<HTMLDivElement | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [busyDriverId, setBusyDriverId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const token = useMemo(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("taxi_admin_session") : null;
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { accessToken: string }).accessToken;
    } catch {
      return null;
    }
  }, []);

  const handleSessionExpired = useCallback(() => {
    api.clearSession();
    router.replace("/login");
  }, [router]);

  const load = useCallback(async () => {
    if (!token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.listDebtsDues(token);
      setPaymentMode(data.paymentMode);
      setSummary(data.summary);
      setRows(data.rows);
      setArchives(data.archives);
      setOpenArchiveId((prev) => prev ?? data.archives[0]?.id ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل الديون والمستحقات";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [handleSessionExpired, router, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "all" && row.kind !== filter) return false;
      if (!q) return true;
      return row.fullName.toLowerCase().includes(q) || (row.phone ?? "").toLowerCase().includes(q);
    });
  }, [filter, rows, search]);

  const selectedFormDriver = rows.find((row) => row.driverId === formDriverId) ?? null;
  const selectedFormDriverLabel = selectedFormDriver
    ? selectedFormDriver.fullName
    : "اختر السائق";
  const filteredFormDrivers = useMemo(() => {
    const q = formDriverSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.fullName.toLowerCase().includes(q) || (row.phone ?? "").toLowerCase().includes(q)
    );
  }, [formDriverSearch, rows]);

  useEffect(() => {
    if (!formDriverDropdownOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!formDriverDropdownRef.current?.contains(event.target as Node)) {
        setFormDriverDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [formDriverDropdownOpen]);

  const openForm = (kind: FormKind) => {
    setFormOpen(kind);
    setFormDriverId("");
    setFormAmount("");
    setFormReason("");
    setFormDriverSearch("");
    setFormDriverDropdownOpen(false);
    setError(null);
  };

  const closeForm = () => {
    if (formSaving) return;
    setFormOpen(null);
    setFormDriverDropdownOpen(false);
    setFormDriverSearch("");
  };

  const submitForm = async () => {
    if (!token || !formOpen) return;
    if (!formDriverId) {
      setError("اختر السائق أولاً.");
      return;
    }
    const amount = Number(formAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل مبلغاً صالحاً أكبر من صفر.");
      return;
    }
    const reason = formReason.trim();
    if (formOpen !== "debt" && reason.length < 2) {
      setError("اكتب سبب إضافة المبلغ.");
      return;
    }
    setFormSaving(true);
    setError(null);
    try {
      if (formOpen === "debt") {
        const result = await api.recordDriverExtraDebt(token, {
          driverId: formDriverId,
          amount,
          reason: reason || undefined
        });
        if (result.paidFromCredit > 0 && result.remainingExtraDebt > 0) {
          setNotice(
            `تم دفع مبلغ ${formatMoney(result.paidFromCredit)} ل.س من الرصيد وبقي يترتب على السائق ${formatMoney(result.remainingExtraDebt)} ل.س.`
          );
        } else if (result.paidFromCredit > 0) {
          setNotice(`تم دفع مبلغ ${formatMoney(result.paidFromCredit)} ل.س من الرصيد ولم يبقَ دين.`);
        } else {
          setNotice(
            `تم إضافة دين بقيمة ${formatMoney(amount)} ل.س. باقي الديون ${formatMoney(result.remainingExtraDebt)} ل.س.`
          );
        }
      } else {
        await api.recordDriverDueCredit(token, { driverId: formDriverId, amount, reason });
        setNotice(`تم إضافة مبلغ ${formatMoney(amount)} ل.س ليُخصم من عمولات السائق.`);
      }
      setFormOpen(null);
      setFormDriverDropdownOpen(false);
      setFormDriverSearch("");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر حفظ العملية";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setFormSaving(false);
    }
  };

  const confirmPending = async () => {
    if (!token || !pendingAction) return;
    setBusyDriverId(pendingAction.row.driverId);
    setError(null);
    try {
      if (pendingAction.kind === "settle") {
        await api.settleDriverDebt(token, { driverId: pendingAction.row.driverId });
        setNotice(`تم تسديد دين ${pendingAction.row.fullName} وتصفير المبلغ المترتب عليه.`);
      } else {
        const result = await api.payoutDriverCredit(token, { driverId: pendingAction.row.driverId });
        setNotice(`تم تقبيض ${pendingAction.row.fullName} مبلغ ${formatMoney(result.amount)} ل.س وتصفير المستحق.`);
      }
      setPendingAction(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تنفيذ العملية";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setBusyDriverId(null);
    }
  };

  const exportReport = async () => {
    if (!token) return;
    setExporting(true);
    setError(null);
    try {
      const file = await api.downloadDebtsDuesExport(token);
      downloadBlobFile(file.blob, file.filename);
      setNotice("تم تصدير تقرير الديون والمستحقات بصيغة Excel.");
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

  const pendingConfirm = pendingAction
    ? pendingAction.kind === "settle"
      ? {
          title: "تأكيد تسديد الدين",
          description: "سيتم تسديد الدين بالكامل وتصفير المبلغ المترتب على السائق، مع تسوية العمولات والغرامات والخصومات والديون غير المسددة.",
          confirmLabel: "تسديد الدين",
          details: [
            { label: "السائق", value: pendingAction.row.fullName },
            { label: "الدين", value: `${formatMoney(pendingAction.row.remainingDebt)} ل.س` }
          ]
        }
      : {
          title: "تأكيد تقبيض المبلغ",
          description: "سيتم تقبيض المبلغ المستحق للسائق نقداً بدل خصمه من العمولات، ويُصفَّر المستحق من المترتب عليه.",
          confirmLabel: "تقبيض المبلغ",
          details: [
            { label: "السائق", value: pendingAction.row.fullName },
            { label: "المبلغ", value: `${formatMoney(Math.abs(Number(pendingAction.row.remainingDebt)))} ل.س` }
          ]
        }
    : null;

  return (
    <div className="dashboard-page">
      <section className="card finance-toolbar">
        <div>
          <h2 className="finance-toolbar__title">الديون والمستحقات</h2>
          <p className="finance-toolbar__hint">
            الدين يزيد على المبلغ المترتب على السائق. المبلغ المضاف يُخصم من عمولاته ويظهر كمستحق إذا تجاوز المترتب.
            الوضع الحالي: {modeLabels[paymentMode]}.
          </p>
        </div>
        <div className="finance-export-actions">
          <button type="button" className="btn btn-ghost" onClick={() => openForm("debt")}>
            إضافة دين لسائق
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => openForm("credit")}>
            إضافة مبلغ لسائق
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void exportReport()} disabled={exporting}>
            {exporting ? "جارٍ التصدير..." : "تصدير تقرير Excel"}
          </button>
        </div>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="settings-notice">{notice}</p> : null}

      <section className="debts-summary-grid">
        <article className="card finance-summary-card debts-summary-card debts-summary-card--debt">
          <p className="finance-summary-card__label">إجمالي الديون</p>
          <h3 className="finance-summary-card__value">{formatMoney(summary.totalDebt)} ل.س</h3>
          <p className="finance-summary-card__subvalue">مبالغ مترتبة على السائقين</p>
        </article>
        <article className="card finance-summary-card debts-summary-card">
          <p className="finance-summary-card__label">سائقون عليهم دين</p>
          <h3 className="finance-summary-card__value">{summary.debtDriverCount}</h3>
          <p className="finance-summary-card__subvalue">من أصل {summary.driverCount} سائق</p>
        </article>
        <article className="card finance-summary-card debts-summary-card debts-summary-card--credit">
          <p className="finance-summary-card__label">إجمالي المستحقات</p>
          <h3 className="finance-summary-card__value">{formatMoney(summary.totalCredit)} ل.س</h3>
          <p className="finance-summary-card__subvalue">مبالغ للسائقين تُخصم من العمولات أو تُقبَّض</p>
        </article>
        <article className="card finance-summary-card debts-summary-card">
          <p className="finance-summary-card__label">سائقون لهم مستحق</p>
          <h3 className="finance-summary-card__value">{summary.creditDriverCount}</h3>
          <p className="finance-summary-card__subvalue">رصيد صفري: {summary.zeroDriverCount}</p>
        </article>
      </section>

      <section className="card employees-table-card finance-table-card">
        <div className="employees-table-head debts-table-head">
          <div>
            <h3 className="employees-table-head__title">جدول السائقين</h3>
            <p className="finance-toolbar__hint">يظهر بجانب كل سائق إجراء التسديد أو التقبض حسب حالته.</p>
          </div>
          <div className="debts-table-tools">
            <div className="debts-filter-pills">
              {(
                [
                  ["all", "الكل"],
                  ["debt", "ديون"],
                  ["credit", "مستحقات"]
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`debts-filter-pill${filter === id ? " debts-filter-pill--active" : ""}`}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="input-styled finance-balance-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف"
            />
          </div>
        </div>

        {loading ? (
          <p className="loading-row">
            <span className="spinner" aria-hidden />
            جاري تحميل السجلات...
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="finance-empty">لا يوجد سائقون مطابقون للفلتر الحالي.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table debts-table">
              <thead>
                <tr>
                  <th>السائق</th>
                  <th>النوع</th>
                  <th>المبلغ</th>
                  <th>التفصيل</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const badge = kindMeta(row.kind);
                  const amount = Math.abs(Number(row.remainingDebt));
                  const busy = busyDriverId === row.driverId;
                  return (
                    <tr key={row.driverId} className={`debts-row debts-row--${row.kind}`}>
                      <td>
                        <strong>{row.fullName}</strong>
                        <div className="finance-balance-inactive">{row.phone ?? "بدون هاتف"}</div>
                        {!row.isActive ? <div className="finance-balance-inactive">معطل</div> : null}
                      </td>
                      <td>
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td>
                        <span className={`finance-balance-copy finance-balance-copy--${row.kind === "debt" ? "owe" : row.kind === "credit" ? "credit" : "zero"}`}>
                          {formatMoney(amount)} ل.س
                        </span>
                      </td>
                      <td>
                        <div className="debts-breakdown">
                          <span>عمولات {formatMoney(row.unpaidCommission)}</span>
                          <span>غرامات {formatMoney(row.unpaidFines)}</span>
                          <span>خصومات {formatMoney(row.unpaidDeductions)}</span>
                          <span>ديون {formatMoney(row.extraDebt)}</span>
                          <span>تعويض {formatMoney(row.unusedCompensation)}</span>
                        </div>
                      </td>
                      <td className="cell-actions">
                        {row.kind === "debt" ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busy}
                            onClick={() => setPendingAction({ kind: "settle", row })}
                          >
                            {busy ? "جارٍ التسديد..." : "تسديد الدين"}
                          </button>
                        ) : row.kind === "credit" && (paymentMode === "POSTPAID" || Number(row.unusedCompensation) > 0) ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() => setPendingAction({ kind: "payout", row })}
                          >
                            {busy ? "جارٍ التقبض..." : "تقبيض المبلغ"}
                          </button>
                        ) : (
                          <span className="finance-balance-inactive">
                            {row.kind === "credit" ? "رصيد مسبق — ليس مبلغاً مضافاً" : "لا يوجد إجراء"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {archives.length > 0 ? (
        <section className="card employees-table-card finance-table-card">
          <h3 className="employees-table-head__title">أرشيف تبديل وضع الدفع</h3>
          <p className="finance-toolbar__hint">سجلات الديون والمستحقات التي حُفظت عند تصفير الأرصدة لتبديل وضع العمل.</p>
          <div className="debts-archive-list">
            {archives.map((row) => {
              const open = openArchiveId === row.id;
              const totalDebt = row.items.reduce((sum, item) => sum + Math.max(0, Number(item.remainingDebt) || 0), 0);
              const totalCredit = row.items.reduce((sum, item) => sum + Math.max(0, -(Number(item.remainingDebt) || 0)), 0);
              return (
                <article key={row.id} className="debts-archive-card">
                  <button
                    type="button"
                    className="debts-archive-card__toggle"
                    onClick={() => setOpenArchiveId(open ? null : row.id)}
                  >
                    <span>
                      {formatDateTime(row.createdAt)} · من {modeLabels[row.fromMode]} إلى {modeLabels[row.toMode]}
                    </span>
                    <span>
                      ديون {formatMoney(totalDebt)} · مستحقات {formatMoney(totalCredit)} · {open ? "إخفاء" : "عرض"}
                    </span>
                  </button>
                  {open ? (
                    row.items.length === 0 ? (
                      <p className="finance-empty">لا توجد بنود لهذا التحويل.</p>
                    ) : (
                      <div className="table-scroll">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>السائق</th>
                              <th>الدين / المستحق</th>
                              <th>تعويض غير مستفاد</th>
                              <th>عمولات غير مسددة</th>
                              <th>غرامات غير مسددة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.items.map((item) => {
                              const n = Number(item.remainingDebt);
                              const label = n > 0 ? "دين" : n < 0 ? "مستحق" : "صفر";
                              return (
                                <tr key={item.id}>
                                  <td>{item.driverName}</td>
                                  <td>
                                    {label}: {formatMoney(Math.abs(n))} ل.س
                                  </td>
                                  <td>{formatMoney(item.unusedCompensation)} ل.س</td>
                                  <td>{formatMoney(item.unpaidCommission)} ل.س</td>
                                  <td>{formatMoney(item.unpaidFines)} ل.س</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {formOpen ? (
        <div className="finance-export-modal" role="dialog" aria-modal="true">
          <button type="button" className="finance-export-modal__backdrop" onClick={closeForm} aria-label="إغلاق" />
          <div className="card finance-export-modal__card">
            <div className="finance-export-modal__header">
              <div>
                <h3 className="finance-export-modal__title">
                  {formOpen === "debt" ? "إضافة دين لسائق" : "إضافة مبلغ لسائق"}
                </h3>
                <p className="finance-export-modal__hint">
                  {formOpen === "debt"
                    ? "إذا كان للسائق رصيد يُخصم أولاً، ويظهر المتبقي كباقي دين في خانة الديون. سبب الدين اختياري."
                    : "يُضاف المبلغ ليُخصم من عمولات السائق، ويظهر كمستحق إذا تجاوز المترتب، مع إشعار للسائق."}
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={closeForm} disabled={formSaving}>
                إغلاق
              </button>
            </div>

            <div className="finance-export-modal__grid">
              <div className="finance-export-modal__field finance-export-modal__field--full">
                <span>السائق</span>
                <div className="finance-driver-dropdown finance-driver-dropdown--full" ref={formDriverDropdownRef}>
                  <button
                    type="button"
                    className="input-styled finance-driver-dropdown__trigger"
                    onClick={() => !formSaving && setFormDriverDropdownOpen((prev) => !prev)}
                    disabled={formSaving}
                  >
                    <span>{selectedFormDriverLabel}</span>
                    <span className="finance-driver-dropdown__chevron" aria-hidden>
                      ▼
                    </span>
                  </button>
                  {formDriverDropdownOpen ? (
                    <div className="card finance-driver-dropdown__menu">
                      <input
                        className="input-styled finance-driver-dropdown__search"
                        value={formDriverSearch}
                        onChange={(e) => setFormDriverSearch(e.target.value)}
                        placeholder="ابحث باسم السائق أو الهاتف"
                        autoFocus
                      />
                      <div className="finance-driver-dropdown__options">
                        {filteredFormDrivers.map((row) => (
                          <button
                            key={row.driverId}
                            type="button"
                            className={`finance-driver-dropdown__option${
                              formDriverId === row.driverId ? " finance-driver-dropdown__option--active" : ""
                            }`}
                            onClick={() => {
                              setFormDriverId(row.driverId);
                              setFormDriverDropdownOpen(false);
                              setFormDriverSearch("");
                            }}
                          >
                            <span>{row.fullName}</span>
                            <small>{row.phone ?? "—"}</small>
                          </button>
                        ))}
                        {filteredFormDrivers.length === 0 ? (
                          <div className="finance-driver-dropdown__empty">لا يوجد سائق يطابق البحث.</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              {selectedFormDriver ? (
                <p className="finance-export-modal__hint">
                  المترتب الحالي: {formatMoney(selectedFormDriver.remainingDebt)} ل.س
                </p>
              ) : null}
              <label className="finance-export-modal__field">
                <span>{formOpen === "debt" ? "قيمة الدين" : "قيمة المبلغ"}</span>
                <input
                  className="input-styled"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="مثال: 25000"
                />
              </label>
              <label className="finance-export-modal__field finance-export-modal__field--full">
                <span>السبب</span>
                <input
                  className="input-styled"
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder={formOpen === "debt" ? "سبب الدين (اختياري)" : "سبب إضافة المبلغ"}
                />
              </label>
            </div>

            <div className="finance-export-modal__actions">
              <button type="button" className="btn btn-primary" onClick={() => void submitForm()} disabled={formSaving}>
                {formSaving ? "جارٍ الحفظ..." : formOpen === "debt" ? "حفظ الدين" : "حفظ المبلغ"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={closeForm} disabled={formSaving}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingAction && pendingConfirm ? (
        <ConfirmModal
          open
          title={pendingConfirm.title}
          description={pendingConfirm.description}
          details={pendingConfirm.details}
          confirmLabel={pendingConfirm.confirmLabel}
          busy={Boolean(busyDriverId)}
          busyLabel={pendingAction.kind === "settle" ? "جارٍ التسديد..." : "جارٍ التقبض..."}
          onConfirm={() => void confirmPending()}
          onCancel={() => {
            if (!busyDriverId) setPendingAction(null);
          }}
        />
      ) : null}
    </div>
  );
}
