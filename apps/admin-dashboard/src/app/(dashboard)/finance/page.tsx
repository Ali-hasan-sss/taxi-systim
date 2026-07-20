"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DriverFinesModal } from "../../../components/driver-fines-modal";
import { api, type Employee, type FinanceOrderRow, type FinancePaymentStatus, type FinanceOrderStatus } from "../../../lib/api";

const REPORT_PAGE_SIZE = 25;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
type ExportMode = "general" | "driver";

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

function shiftYmd(ymd: string, deltaDays: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + deltaDays, 12, 0, 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(dt);
}

function isValidYmd(value: string): boolean {
  return YMD_RE.test(value.trim());
}

function formatMoney(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("ar-SY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(n);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return iso;
  }
}

function paymentBadgeClass(status: FinancePaymentStatus): string {
  switch (status) {
    case "PAID":
      return "finance-badge finance-badge--success";
    case "PARTIAL":
      return "finance-badge finance-badge--warning";
    default:
      return "finance-badge finance-badge--danger";
  }
}

function orderBadgeClass(status: FinanceOrderStatus): string {
  switch (status) {
    case "COMPLETED":
      return "finance-badge finance-badge--success";
    case "CANCELLED":
      return "finance-badge finance-badge--danger";
    case "STUCK":
      return "finance-badge finance-badge--warning";
    default:
      return "finance-badge finance-badge--info";
  }
}

export default function FinancePage() {
  const router = useRouter();
  const today = useMemo(() => syriaTodayYmd(), []);
  const driverDropdownRef = useRef<HTMLDivElement | null>(null);
  const compensationDriverDropdownRef = useRef<HTMLDivElement | null>(null);
  const fineDriverDropdownRef = useRef<HTMLDivElement | null>(null);
  const exportDriverDropdownRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [settlingAll, setSettlingAll] = useState(false);
  const [settlingOrderId, setSettlingOrderId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [recordingCompensation, setRecordingCompensation] = useState(false);
  const [recordingFine, setRecordingFine] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<FinanceOrderRow[]>([]);
  const [drivers, setDrivers] = useState<Employee[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    completedOrdersCount: 0,
    completedOrdersAmount: "0.00",
    totalCommissionAmount: "0.00",
    dueCommissionAmount: "0.00",
    compensationAmount: "0.00",
    fineAmount: "0.00",
    adjustedDueCommissionAmount: "0.00",
    from: today,
    to: today
  });

  const [draftFrom, setDraftFrom] = useState(today);
  const [draftTo, setDraftTo] = useState(today);
  const [draftDriverId, setDraftDriverId] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [driverDropdownOpen, setDriverDropdownOpen] = useState(false);
  const [filters, setFilters] = useState({ from: today, to: today, driverId: "" });
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("general");
  const [exportFrom, setExportFrom] = useState(today);
  const [exportTo, setExportTo] = useState(today);
  const [exportDriverId, setExportDriverId] = useState("");
  const [exportDriverSearch, setExportDriverSearch] = useState("");
  const [exportDriverDropdownOpen, setExportDriverDropdownOpen] = useState(false);
  const [compensationModalOpen, setCompensationModalOpen] = useState(false);
  const [compensationDriverId, setCompensationDriverId] = useState("");
  const [compensationDriverSearch, setCompensationDriverSearch] = useState("");
  const [compensationDriverDropdownOpen, setCompensationDriverDropdownOpen] = useState(false);
  const [compensationAmount, setCompensationAmount] = useState("");
  const [compensationNotes, setCompensationNotes] = useState("");
  const [fineModalOpen, setFineModalOpen] = useState(false);
  const [fineDriverId, setFineDriverId] = useState("");
  const [fineDriverSearch, setFineDriverSearch] = useState("");
  const [fineDriverDropdownOpen, setFineDriverDropdownOpen] = useState(false);
  const [fineAmount, setFineAmount] = useState("");
  const [fineNotes, setFineNotes] = useState("");
  const [finesLedgerOpen, setFinesLedgerOpen] = useState(false);

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

  const loadDrivers = useCallback(async () => {
    if (!token) {
      handleSessionExpired();
      return;
    }
    setLoadingDrivers(true);
    try {
      const list = await api.listEmployees(token, { role: "DRIVER" });
      setDrivers(list.filter((item) => item.role === "DRIVER"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل السائقين";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setLoadingDrivers(false);
    }
  }, [handleSessionExpired, token]);

  const loadReport = useCallback(
    async (opts?: { cursor?: string | null; append?: boolean }) => {
      if (!token) {
        handleSessionExpired();
        return;
      }
      const append = opts?.append === true;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await api.financeReport(token, {
          from: filters.from,
          to: filters.to,
          driverId: filters.driverId || null,
          cursor: opts?.cursor ?? null,
          limit: REPORT_PAGE_SIZE
        });
        setRows((prev) => {
          if (!append) return page.rows;
          const seen = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          for (const item of page.rows) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          }
          return merged;
        });
        setSummary(page.summary);
        setNextCursor(page.nextCursor);
      } catch (err) {
        const message = err instanceof Error ? err.message : "تعذر تحميل التقرير المالي";
        if (message === "SESSION_EXPIRED") {
          handleSessionExpired();
          return;
        }
        setError(message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters, handleSessionExpired, token]
  );

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

  useEffect(() => {
    if (!driverDropdownOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!driverDropdownRef.current?.contains(event.target as Node)) {
        setDriverDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [driverDropdownOpen]);

  useEffect(() => {
    if (!exportDriverDropdownOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!exportDriverDropdownRef.current?.contains(event.target as Node)) {
        setExportDriverDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [exportDriverDropdownOpen]);

  useEffect(() => {
    if (!compensationDriverDropdownOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!compensationDriverDropdownRef.current?.contains(event.target as Node)) {
        setCompensationDriverDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [compensationDriverDropdownOpen]);

  useEffect(() => {
    if (!fineDriverDropdownOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!fineDriverDropdownRef.current?.contains(event.target as Node)) {
        setFineDriverDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [fineDriverDropdownOpen]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const driverOptions = useMemo(
    () => drivers.filter((item) => item.role === "DRIVER" && item.driver?.id),
    [drivers]
  );

  const filteredDriverOptions = useMemo(() => {
    const q = driverSearch.trim().toLowerCase();
    if (!q) return driverOptions;
    return driverOptions.filter((item) => {
      const fullName = item.fullName.toLowerCase();
      const phone = (item.phone ?? "").toLowerCase();
      return fullName.includes(q) || phone.includes(q);
    });
  }, [driverOptions, driverSearch]);

  const exportFilteredDriverOptions = useMemo(() => {
    const q = exportDriverSearch.trim().toLowerCase();
    if (!q) return driverOptions;
    return driverOptions.filter((item) => {
      const fullName = item.fullName.toLowerCase();
      const phone = (item.phone ?? "").toLowerCase();
      return fullName.includes(q) || phone.includes(q);
    });
  }, [driverOptions, exportDriverSearch]);

  const compensationFilteredDriverOptions = useMemo(() => {
    const q = compensationDriverSearch.trim().toLowerCase();
    if (!q) return driverOptions;
    return driverOptions.filter((item) => {
      const fullName = item.fullName.toLowerCase();
      const phone = (item.phone ?? "").toLowerCase();
      return fullName.includes(q) || phone.includes(q);
    });
  }, [compensationDriverSearch, driverOptions]);

  const fineFilteredDriverOptions = useMemo(() => {
    const q = fineDriverSearch.trim().toLowerCase();
    if (!q) return driverOptions;
    return driverOptions.filter((item) => {
      const fullName = item.fullName.toLowerCase();
      const phone = (item.phone ?? "").toLowerCase();
      return fullName.includes(q) || phone.includes(q);
    });
  }, [fineDriverSearch, driverOptions]);

  const selectedDriverLabel = useMemo(() => {
    if (!draftDriverId) return "كل السائقين";
    const match = driverOptions.find((item) => item.driver?.id === draftDriverId);
    return match?.fullName ?? "كل السائقين";
  }, [draftDriverId, driverOptions]);

  const exportSelectedDriverLabel = useMemo(() => {
    if (!exportDriverId) return "اختر السائق";
    const match = driverOptions.find((item) => item.driver?.id === exportDriverId);
    return match?.fullName ?? "اختر السائق";
  }, [driverOptions, exportDriverId]);

  const compensationSelectedDriverLabel = useMemo(() => {
    if (!compensationDriverId) return "اختر السائق";
    const match = driverOptions.find((item) => item.driver?.id === compensationDriverId);
    return match?.fullName ?? "اختر السائق";
  }, [compensationDriverId, driverOptions]);

  const fineSelectedDriverLabel = useMemo(() => {
    if (!fineDriverId) return "اختر السائق";
    const match = driverOptions.find((item) => item.driver?.id === fineDriverId);
    return match?.fullName ?? "اختر السائق";
  }, [fineDriverId, driverOptions]);

  const applyFilters = () => {
    const from = draftFrom.trim() || today;
    const to = draftTo.trim() || from;
    if (!isValidYmd(from) || !isValidYmd(to)) {
      setError("صيغة التاريخ يجب أن تكون YYYY-MM-DD.");
      return;
    }
    if (from > to) {
      setError("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية.");
      return;
    }
    setError(null);
    setNotice(null);
    setFilters({ from, to, driverId: draftDriverId });
    setDriverDropdownOpen(false);
  };

  const setPresetRange = (days: 1 | 7 | 30) => {
    const to = today;
    const from = days === 1 ? to : shiftYmd(to, -(days - 1));
    setDraftFrom(from);
    setDraftTo(to);
    setError(null);
    setNotice(null);
    setFilters({ from, to, driverId: draftDriverId });
  };

  const onLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    await loadReport({ cursor: nextCursor, append: true });
  };

  const settleSingleOrder = async (row: FinanceOrderRow) => {
    if (!token || !row.commission || Number(row.commission.remainingAmount) <= 0) return;
    if (!window.confirm(`تأكيد تسديد عمولة الطلب ${row.id.slice(0, 8)}؟`)) return;
    setSettlingOrderId(row.id);
    setError(null);
    setNotice(null);
    try {
      const result = await api.settleOrderCommission(token, { orderId: row.id });
      setNotice(`تم تسديد ${result.paidCount} عمولة بمجموع ${formatMoney(result.totalPaid)}.`);
      await loadReport();
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل تسديد عمولة الطلب";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setSettlingOrderId(null);
    }
  };

  const settleCurrentFilter = async () => {
    const dueCommissions = Number(summary.dueCommissionAmount);
    const dueFines = Number(summary.fineAmount);
    if (!token || (dueCommissions <= 0 && dueFines <= 0)) return;
    const confirmMessage = filters.driverId
      ? "سيتم تسديد جميع العمولات والغرامات غير المسددة للسائق المحدد ضمن الفترة الحالية. هل تريد المتابعة؟"
      : "سيتم تسديد جميع العمولات والغرامات غير المسددة ضمن الفترة الحالية. هل تريد المتابعة؟";
    if (!window.confirm(confirmMessage)) return;
    setSettlingAll(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.settleFilteredCommissions(token, {
        from: filters.from,
        to: filters.to,
        driverId: filters.driverId || null
      });
      const finesPaidCount = result.finesPaidCount ?? 0;
      const finesTotalPaid = result.finesTotalPaid ?? 0;
      setNotice(
        `تم تسديد ${result.paidCount} عمولة بمجموع ${formatMoney(result.totalPaid)}` +
          (finesPaidCount > 0 ? `، و${finesPaidCount} غرامة بمجموع ${formatMoney(finesTotalPaid)}` : "") +
          "."
      );
      await loadReport();
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل التسديد الجماعي";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setSettlingAll(false);
    }
  };

  const openCompensationModal = () => {
    setCompensationDriverId(filters.driverId || "");
    setCompensationDriverSearch("");
    setCompensationDriverDropdownOpen(false);
    setCompensationAmount("");
    setCompensationNotes("");
    setCompensationModalOpen(true);
    setError(null);
    setNotice(null);
  };

  const closeCompensationModal = () => {
    if (recordingCompensation) return;
    setCompensationModalOpen(false);
    setCompensationDriverDropdownOpen(false);
    setCompensationDriverSearch("");
  };

  const saveCompensation = async () => {
    if (!token) {
      handleSessionExpired();
      return;
    }
    if (!compensationDriverId) {
      setError("اختر السائق الذي تريد تسجيل تعويض له.");
      return;
    }
    const amount = Number(compensationAmount.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل قيمة تعويض صحيحة أكبر من صفر.");
      return;
    }

    setRecordingCompensation(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.recordDriverCompensation(token, {
        driverId: compensationDriverId,
        amount,
        notes: compensationNotes.trim() || undefined
      });
      setCompensationModalOpen(false);
      setCompensationDriverDropdownOpen(false);
      setCompensationDriverSearch("");
      setNotice(`تم تسجيل تعويض بقيمة ${formatMoney(result.amount)} للسائق المحدد.`);
      await loadReport();
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

  const openFineModal = () => {
    setFineDriverId(filters.driverId || "");
    setFineDriverSearch("");
    setFineDriverDropdownOpen(false);
    setFineAmount("");
    setFineNotes("");
    setFineModalOpen(true);
    setError(null);
    setNotice(null);
  };

  const closeFineModal = () => {
    if (recordingFine) return;
    setFineModalOpen(false);
    setFineDriverDropdownOpen(false);
    setFineDriverSearch("");
  };

  const saveFine = async () => {
    if (!token) {
      handleSessionExpired();
      return;
    }
    if (!fineDriverId) {
      setError("اختر السائق الذي تريد تسجيل غرامة له.");
      return;
    }
    const amount = Number(fineAmount.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل قيمة غرامة صحيحة أكبر من صفر.");
      return;
    }

    setRecordingFine(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.recordDriverFine(token, {
        driverId: fineDriverId,
        amount,
        notes: fineNotes.trim() || undefined
      });
      setFineModalOpen(false);
      setFineDriverDropdownOpen(false);
      setFineDriverSearch("");
      setNotice(`تم تسجيل غرامة بقيمة ${formatMoney(result.amount)} للسائق المحدد.`);
      await loadReport();
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تسجيل الغرامة";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setRecordingFine(false);
    }
  };

  const openExportModal = (mode: ExportMode) => {
    setExportMode(mode);
    setExportFrom(filters.from || today);
    setExportTo(filters.to || today);
    setExportDriverId(mode === "driver" ? filters.driverId || "" : "");
    setExportDriverSearch("");
    setExportDriverDropdownOpen(false);
    setExportModalOpen(true);
    setError(null);
    setNotice(null);
  };

  const closeExportModal = () => {
    if (exporting) return;
    setExportModalOpen(false);
    setExportDriverDropdownOpen(false);
    setExportDriverSearch("");
  };

  const downloadBlobFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const exportReport = async () => {
    if (!token) {
      handleSessionExpired();
      return;
    }

    const from = exportFrom.trim() || today;
    const to = exportTo.trim() || from;
    if (!isValidYmd(from) || !isValidYmd(to)) {
      setError("صيغة تاريخ التصدير يجب أن تكون YYYY-MM-DD.");
      return;
    }
    if (from > to) {
      setError("تاريخ بداية التصدير يجب أن يكون قبل أو يساوي تاريخ النهاية.");
      return;
    }
    if (exportMode === "driver" && !exportDriverId) {
      setError("اختر السائق المطلوب لتصدير تقريره.");
      return;
    }

    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const file = await api.downloadFinanceExport(token, {
        from,
        to,
        driverId: exportMode === "driver" ? exportDriverId : null
      });
      downloadBlobFile(file.blob, file.filename);
      setExportModalOpen(false);
      setExportDriverDropdownOpen(false);
      setExportDriverSearch("");
      setNotice(
        exportMode === "driver" ? "تم تصدير تقرير السائق بصيغة Excel." : "تم تصدير التقرير العام بصيغة Excel."
      );
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

  return (
    <div className="dashboard-page">
      <section className="card finance-toolbar">
        <div>
          <h2 className="finance-toolbar__title">التقارير المالية</h2>
          <p className="finance-toolbar__hint">
            اعرض جميع الطلبات مع فلترة حسب الفترة أو السائق، وتتبع العمولة غير المسددة مع إمكان التسديد الفردي أو الجماعي.
          </p>
        </div>

        <div className="finance-presets">
          <button type="button" className="btn btn-ghost" onClick={() => setPresetRange(1)}>
            آخر يوم
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPresetRange(7)}>
            آخر 7 أيام
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPresetRange(30)}>
            آخر 30 يومًا
          </button>
        </div>

        <div className="finance-export-actions">
          <button type="button" className="btn btn-ghost" onClick={openCompensationModal}>
            إضافة تعويض لسائق
          </button>
          <button type="button" className="btn btn-ghost" onClick={openFineModal}>
            إضافة غرامة لسائق
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => openExportModal("general")}>
            تصدير Excel عام
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => openExportModal("driver")}>
            تصدير Excel لسائق
          </button>
        </div>

        <div className="finance-filters">
          <label className="finance-filter-field">
            <span>من</span>
            <input
              type="date"
              className="input-styled finance-date-input"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
            />
          </label>
          <label className="finance-filter-field">
            <span>إلى</span>
            <input
              type="date"
              className="input-styled finance-date-input"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
            />
          </label>
          <div className="finance-driver-dropdown" ref={driverDropdownRef}>
            <button
              type="button"
              className="input-styled finance-driver-dropdown__trigger"
              onClick={() => !loadingDrivers && setDriverDropdownOpen((prev) => !prev)}
              disabled={loadingDrivers}
            >
              <span>{loadingDrivers ? "جارٍ تحميل السائقين..." : selectedDriverLabel}</span>
              <span className="finance-driver-dropdown__chevron" aria-hidden>
                ▼
              </span>
            </button>
            {driverDropdownOpen ? (
              <div className="card finance-driver-dropdown__menu">
                <input
                  className="input-styled finance-driver-dropdown__search"
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                  placeholder="ابحث باسم السائق أو الهاتف"
                />
                <div className="finance-driver-dropdown__options">
                  <button
                    type="button"
                    className={`finance-driver-dropdown__option${draftDriverId === "" ? " finance-driver-dropdown__option--active" : ""}`}
                    onClick={() => {
                      setDraftDriverId("");
                      setDriverDropdownOpen(false);
                      setDriverSearch("");
                    }}
                  >
                    كل السائقين
                  </button>
                  {filteredDriverOptions.map((driver) => (
                    <button
                      key={driver.id}
                      type="button"
                      className={`finance-driver-dropdown__option${
                        draftDriverId === (driver.driver?.id ?? "") ? " finance-driver-dropdown__option--active" : ""
                      }`}
                      onClick={() => {
                        setDraftDriverId(driver.driver?.id ?? "");
                        setDriverDropdownOpen(false);
                        setDriverSearch("");
                      }}
                    >
                      <span>{driver.fullName}</span>
                      <small>{driver.phone ?? "—"}</small>
                    </button>
                  ))}
                  {filteredDriverOptions.length === 0 ? (
                    <div className="finance-driver-dropdown__empty">لا يوجد سائق يطابق البحث.</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <button type="button" className="btn btn-primary" onClick={applyFilters}>
            تطبيق الفلاتر
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void settleCurrentFilter()}
            disabled={
              settlingAll ||
              (Number(summary.dueCommissionAmount) <= 0 && Number(summary.fineAmount) <= 0)
            }
          >
            {settlingAll ? "جارٍ التسديد..." : "تسديد جميع العمولات ضمن الفلتر"}
          </button>
        </div>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="settings-notice">{notice}</p> : null}

      <section className={`finance-summary-grid${filters.driverId ? " finance-summary-grid--with-fines" : ""}`}>
        <article className="card finance-summary-card">
          <p className="finance-summary-card__label">الطلبات المكتملة</p>
          <h3 className="finance-summary-card__value">{summary.completedOrdersCount}</h3>
        </article>
        <article className="card finance-summary-card">
          <p className="finance-summary-card__label">مبلغ الطلبات المكتملة</p>
          <h3 className="finance-summary-card__value">{formatMoney(summary.completedOrdersAmount)}</h3>
        </article>
        <article className="card finance-summary-card">
          <p className="finance-summary-card__label">إجمالي العمولة المخزنة</p>
          <h3 className="finance-summary-card__value">{formatMoney(summary.totalCommissionAmount)}</h3>
        </article>
        <article className="card finance-summary-card">
          <p className="finance-summary-card__label">المبلغ المترتب</p>
          <h3 className="finance-summary-card__value">{formatMoney(summary.adjustedDueCommissionAmount)}</h3>
          <p className="finance-summary-card__subvalue">
            عمولات: {formatMoney(summary.dueCommissionAmount)} | تعويضات: {formatMoney(summary.compensationAmount)} | غرامات:{" "}
            {formatMoney(summary.fineAmount)}
          </p>
        </article>
        {filters.driverId ? (
          <button
            type="button"
            className="card finance-summary-card finance-summary-card--clickable"
            onClick={() => setFinesLedgerOpen(true)}
            aria-label="عرض سجل الغرامات"
          >
            <p className="finance-summary-card__label">مجموع الغرامات</p>
            <h3 className="finance-summary-card__value">{formatMoney(summary.fineAmount)}</h3>
            <p className="finance-summary-card__hint">اضغط لعرض السجل</p>
          </button>
        ) : null}
      </section>

      <section className="card employees-table-card finance-table-card">
        <div className="employees-table-head">
          <h3 className="employees-table-head__title">قائمة الطلبات</h3>
          <p className="finance-period-label">
            الفترة الحالية: {summary.from} إلى {summary.to}
          </p>
        </div>

        {loading ? (
          <p className="loading-row">
            <span className="spinner" aria-hidden />
            جاري تحميل الطلبات...
          </p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الزبون</th>
                    <th>المسار</th>
                    <th>السائق</th>
                    <th>حالة الطلب</th>
                    <th>مبلغ الطلب</th>
                    <th>العمولة</th>
                    <th>الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const remaining = Number(row.commission?.remainingAmount ?? 0);
                    const canSettle = Boolean(row.commission) && remaining > 0;
                    return (
                      <tr key={row.id}>
                        <td>
                          <div className="finance-cell-stack">
                            <strong>{formatDateTime(row.createdAt)}</strong>
                            <span>إكمال: {formatDateTime(row.completedAt)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="finance-cell-stack">
                            <strong>{row.customerName}</strong>
                            <span>{row.customerPhone ?? "—"}</span>
                          </div>
                        </td>
                        <td>
                          <div className="finance-route-cell">
                            <strong>من:</strong> {row.pickupAddress}
                            <br />
                            <strong>إلى:</strong> {row.dropoffAddress}
                          </div>
                        </td>
                        <td>
                          <div className="finance-cell-stack">
                            <strong>{row.driver?.fullName ?? "غير مسند"}</strong>
                            <span>{row.driver?.phone ?? "—"}</span>
                          </div>
                        </td>
                        <td>
                          <span className={orderBadgeClass(row.status)}>{ORDER_STATUS_LABELS[row.status] ?? row.status}</span>
                        </td>
                        <td>{formatMoney(row.amount)}</td>
                        <td>
                          {row.commission ? (
                            <div className="finance-cell-stack">
                              <strong>المحسوبة: {formatMoney(row.commission.calculatedCommission)}</strong>
                              <span>المدفوع: {formatMoney(row.commission.paidAmount)}</span>
                              <span>المتبقي: {formatMoney(row.commission.remainingAmount)}</span>
                              <span className={paymentBadgeClass(row.commission.paymentStatus)}>
                                {PAYMENT_STATUS_LABELS[row.commission.paymentStatus]}
                              </span>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="cell-actions">
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={!canSettle || settlingOrderId === row.id}
                            onClick={() => void settleSingleOrder(row)}
                          >
                            {settlingOrderId === row.id ? "جارٍ..." : "تسديد العمولة"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rows.length === 0 ? <p className="finance-empty">لا توجد طلبات ضمن هذه الفلاتر.</p> : null}

            {nextCursor ? (
              <div className="finance-load-more">
                <button type="button" className="btn btn-ghost" onClick={() => void onLoadMore()} disabled={loadingMore}>
                  {loadingMore ? "جارٍ تحميل المزيد..." : "تحميل المزيد"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {compensationModalOpen ? (
        <div className="finance-export-modal" role="dialog" aria-modal="true">
          <button type="button" className="finance-export-modal__backdrop" onClick={closeCompensationModal} aria-label="إغلاق" />
          <div className="card finance-export-modal__card">
            <div className="finance-export-modal__header">
              <div>
                <h3 className="finance-export-modal__title">إضافة تعويض لسائق</h3>
                <p className="finance-export-modal__hint">
                  سجّل تعويضًا يدويًا ليُخصم من مجموع العمولة المستحقة لهذا السائق ضمن التقارير والملخصات.
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={closeCompensationModal} disabled={recordingCompensation}>
                إغلاق
              </button>
            </div>

            <div className="finance-export-modal__grid">
              <div className="finance-export-modal__field finance-export-modal__field--full">
                <span>السائق</span>
                <div className="finance-driver-dropdown finance-driver-dropdown--full" ref={compensationDriverDropdownRef}>
                  <button
                    type="button"
                    className="input-styled finance-driver-dropdown__trigger"
                    onClick={() => !loadingDrivers && setCompensationDriverDropdownOpen((prev) => !prev)}
                    disabled={loadingDrivers}
                  >
                    <span>{loadingDrivers ? "جارٍ تحميل السائقين..." : compensationSelectedDriverLabel}</span>
                    <span className="finance-driver-dropdown__chevron" aria-hidden>
                      ▼
                    </span>
                  </button>
                  {compensationDriverDropdownOpen ? (
                    <div className="card finance-driver-dropdown__menu">
                      <input
                        className="input-styled finance-driver-dropdown__search"
                        value={compensationDriverSearch}
                        onChange={(e) => setCompensationDriverSearch(e.target.value)}
                        placeholder="ابحث باسم السائق أو الهاتف"
                      />
                      <div className="finance-driver-dropdown__options">
                        {compensationFilteredDriverOptions.map((driver) => (
                          <button
                            key={driver.id}
                            type="button"
                            className={`finance-driver-dropdown__option${
                              compensationDriverId === (driver.driver?.id ?? "") ? " finance-driver-dropdown__option--active" : ""
                            }`}
                            onClick={() => {
                              setCompensationDriverId(driver.driver?.id ?? "");
                              setCompensationDriverDropdownOpen(false);
                              setCompensationDriverSearch("");
                            }}
                          >
                            <span>{driver.fullName}</span>
                            <small>{driver.phone ?? "—"}</small>
                          </button>
                        ))}
                        {compensationFilteredDriverOptions.length === 0 ? (
                          <div className="finance-driver-dropdown__empty">لا يوجد سائق يطابق البحث.</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <label className="finance-export-modal__field">
                <span>قيمة التعويض</span>
                <input
                  className="input-styled"
                  value={compensationAmount}
                  onChange={(e) => setCompensationAmount(e.target.value)}
                  placeholder="مثال: 25000"
                />
              </label>

              <label className="finance-export-modal__field finance-export-modal__field--full">
                <span>ملاحظات</span>
                <input
                  className="input-styled"
                  value={compensationNotes}
                  onChange={(e) => setCompensationNotes(e.target.value)}
                  placeholder="سبب التعويض أو أي ملاحظة إضافية"
                />
              </label>
            </div>

            <div className="finance-export-modal__actions">
              <button type="button" className="btn btn-ghost" onClick={closeCompensationModal} disabled={recordingCompensation}>
                إلغاء
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveCompensation()} disabled={recordingCompensation}>
                {recordingCompensation ? "جارٍ الحفظ..." : "حفظ التعويض"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {fineModalOpen ? (
        <div className="finance-export-modal" role="dialog" aria-modal="true">
          <button type="button" className="finance-export-modal__backdrop" onClick={closeFineModal} aria-label="إغلاق" />
          <div className="card finance-export-modal__card">
            <div className="finance-export-modal__header">
              <div>
                <h3 className="finance-export-modal__title">إضافة غرامة لسائق</h3>
                <p className="finance-export-modal__hint">
                  سجّل غرامة يدوية لتُضاف إلى المبلغ المترتب على السائق (عمولات + غرامات − تعويضات) في التقارير والملخصات.
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={closeFineModal} disabled={recordingFine}>
                إغلاق
              </button>
            </div>

            <div className="finance-export-modal__grid">
              <div className="finance-export-modal__field finance-export-modal__field--full">
                <span>السائق</span>
                <div className="finance-driver-dropdown finance-driver-dropdown--full" ref={fineDriverDropdownRef}>
                  <button
                    type="button"
                    className="input-styled finance-driver-dropdown__trigger"
                    onClick={() => !loadingDrivers && setFineDriverDropdownOpen((prev) => !prev)}
                    disabled={loadingDrivers}
                  >
                    <span>{loadingDrivers ? "جارٍ تحميل السائقين..." : fineSelectedDriverLabel}</span>
                    <span className="finance-driver-dropdown__chevron" aria-hidden>
                      ▼
                    </span>
                  </button>
                  {fineDriverDropdownOpen ? (
                    <div className="card finance-driver-dropdown__menu">
                      <input
                        className="input-styled finance-driver-dropdown__search"
                        value={fineDriverSearch}
                        onChange={(e) => setFineDriverSearch(e.target.value)}
                        placeholder="ابحث باسم السائق أو الهاتف"
                      />
                      <div className="finance-driver-dropdown__options">
                        {fineFilteredDriverOptions.map((driver) => (
                          <button
                            key={driver.id}
                            type="button"
                            className={`finance-driver-dropdown__option${
                              fineDriverId === (driver.driver?.id ?? "") ? " finance-driver-dropdown__option--active" : ""
                            }`}
                            onClick={() => {
                              setFineDriverId(driver.driver?.id ?? "");
                              setFineDriverDropdownOpen(false);
                              setFineDriverSearch("");
                            }}
                          >
                            <span>{driver.fullName}</span>
                            <small>{driver.phone ?? "—"}</small>
                          </button>
                        ))}
                        {fineFilteredDriverOptions.length === 0 ? (
                          <div className="finance-driver-dropdown__empty">لا يوجد سائق يطابق البحث.</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <label className="finance-export-modal__field">
                <span>قيمة الغرامة</span>
                <input
                  className="input-styled"
                  value={fineAmount}
                  onChange={(e) => setFineAmount(e.target.value)}
                  placeholder="مثال: 15000"
                />
              </label>

              <label className="finance-export-modal__field finance-export-modal__field--full">
                <span>ملاحظات</span>
                <input
                  className="input-styled"
                  value={fineNotes}
                  onChange={(e) => setFineNotes(e.target.value)}
                  placeholder="سبب الغرامة أو أي ملاحظة إضافية"
                />
              </label>
            </div>

            <div className="finance-export-modal__actions">
              <button type="button" className="btn btn-ghost" onClick={closeFineModal} disabled={recordingFine}>
                إلغاء
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void saveFine()} disabled={recordingFine}>
                {recordingFine ? "جارٍ الحفظ..." : "حفظ الغرامة"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {exportModalOpen ? (
        <div className="finance-export-modal" role="dialog" aria-modal="true">
          <button type="button" className="finance-export-modal__backdrop" onClick={closeExportModal} aria-label="إغلاق" />
          <div className="card finance-export-modal__card">
            <div className="finance-export-modal__header">
              <div>
                <h3 className="finance-export-modal__title">
                  {exportMode === "driver" ? "تصدير تقرير سائق" : "تصدير التقرير العام"}
                </h3>
                <p className="finance-export-modal__hint">
                  {exportMode === "driver"
                    ? "حدد السائق والفترة الزمنية ليتم تصدير جميع الطلبات المكتملة الخاصة به مع اسم المنسق وكامل تفاصيل الطلب."
                    : "حدد الفترة الزمنية ليتم تصدير جميع الطلبات المكتملة مع السائق والمنسق وقيمة الطلب والعمولة."}
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={closeExportModal} disabled={exporting}>
                إغلاق
              </button>
            </div>

            <div className="finance-export-modal__grid">
              <label className="finance-export-modal__field">
                <span>من</span>
                <input
                  type="date"
                  className="input-styled"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                />
              </label>

              <label className="finance-export-modal__field">
                <span>إلى</span>
                <input
                  type="date"
                  className="input-styled"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                />
              </label>

              {exportMode === "driver" ? (
                <div className="finance-export-modal__field finance-export-modal__field--full">
                  <span>السائق</span>
                  <div className="finance-driver-dropdown finance-driver-dropdown--full" ref={exportDriverDropdownRef}>
                    <button
                      type="button"
                      className="input-styled finance-driver-dropdown__trigger"
                      onClick={() => !loadingDrivers && setExportDriverDropdownOpen((prev) => !prev)}
                      disabled={loadingDrivers}
                    >
                      <span>{loadingDrivers ? "جارٍ تحميل السائقين..." : exportSelectedDriverLabel}</span>
                      <span className="finance-driver-dropdown__chevron" aria-hidden>
                        ▼
                      </span>
                    </button>
                    {exportDriverDropdownOpen ? (
                      <div className="card finance-driver-dropdown__menu">
                        <input
                          className="input-styled finance-driver-dropdown__search"
                          value={exportDriverSearch}
                          onChange={(e) => setExportDriverSearch(e.target.value)}
                          placeholder="ابحث باسم السائق أو الهاتف"
                        />
                        <div className="finance-driver-dropdown__options">
                          {exportFilteredDriverOptions.map((driver) => (
                            <button
                              key={driver.id}
                              type="button"
                              className={`finance-driver-dropdown__option${
                                exportDriverId === (driver.driver?.id ?? "") ? " finance-driver-dropdown__option--active" : ""
                              }`}
                              onClick={() => {
                                setExportDriverId(driver.driver?.id ?? "");
                                setExportDriverDropdownOpen(false);
                                setExportDriverSearch("");
                              }}
                            >
                              <span>{driver.fullName}</span>
                              <small>{driver.phone ?? "—"}</small>
                            </button>
                          ))}
                          {exportFilteredDriverOptions.length === 0 ? (
                            <div className="finance-driver-dropdown__empty">لا يوجد سائق يطابق البحث.</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="finance-export-modal__actions">
              <button type="button" className="btn btn-ghost" onClick={closeExportModal} disabled={exporting}>
                إلغاء
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void exportReport()} disabled={exporting}>
                {exporting ? "جارٍ تجهيز الملف..." : "تصدير الملف"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {finesLedgerOpen && token && filters.driverId ? (
        <DriverFinesModal
          open={finesLedgerOpen}
          token={token}
          driverId={filters.driverId}
          from={filters.from}
          to={filters.to}
          onClose={() => setFinesLedgerOpen(false)}
          onSessionExpired={handleSessionExpired}
          onSettled={() => void loadReport()}
        />
      ) : null}
    </div>
  );
}
