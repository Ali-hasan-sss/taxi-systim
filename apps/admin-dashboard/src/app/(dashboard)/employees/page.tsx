"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown } from "lucide-react";
import { api, type Employee, type VehicleKind } from "../../../lib/api";
import { useDebouncedSearch } from "../../../lib/use-debounced-value";
import {
  downloadDriversImportTemplate,
  parseDriversExcelBuffer,
  type ParsedDriverImportRow
} from "../../../lib/parse-drivers-excel";

type RoleFilter = "ALL" | "ADMIN" | "COORDINATOR" | "DRIVER";
type MoneyFormKind = "debt" | "credit" | "fine" | "deduction";

const roleText: Record<Employee["role"], string> = {
  ADMIN: "أدمن",
  COORDINATOR: "منسق",
  DRIVER: "سائق"
};

const vehicleKindText: Record<VehicleKind, string> = {
  PUBLIC: "عامة",
  PRIVATE: "خاصة",
  VIP: "VIP"
};

function formatDriverVehicleRow(item: Employee): string {
  if (item.role !== "DRIVER" || !item.driver) return "—";
  const d = item.driver;
  const parts: string[] = [];
  if (d.vehicleBrand?.trim()) parts.push(d.vehicleBrand.trim());
  if (d.vehicleKind) parts.push(vehicleKindText[d.vehicleKind]);
  if (d.vehicleColor?.trim()) parts.push(d.vehicleColor.trim());
  if (d.vehicleNumber?.trim()) parts.push(`لوحة: ${d.vehicleNumber.trim()}`);
  return parts.length ? parts.join(" · ") : "—";
}

function formatMoney(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("ar-SY", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function prepaidCredit(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n) || n >= 0) return 0;
  return Math.round(-n * 100) / 100;
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

function EmployeeRowActions({
  item,
  open,
  deleting,
  showTopup,
  onToggle,
  onEdit,
  onDelete,
  onTopup,
  onAddDebt,
  onAddCredit,
  onAddFine,
  onAddDeduction
}: {
  item: Employee;
  open: boolean;
  deleting: boolean;
  showTopup: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTopup: () => void;
  onAddDebt: () => void;
  onAddCredit: () => void;
  onAddFine: () => void;
  onAddDeduction: () => void;
}) {
  const isDriver = item.role === "DRIVER" && Boolean(item.driver?.id);
  return (
    <div className={`employees-actions${open ? " employees-actions--open" : ""}`}>
      <button
        type="button"
        className="btn btn-sm employees-actions__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`إجراءات ${item.fullName}`}
        onClick={onToggle}
      >
        إجراءات
        <ChevronDown
          size={16}
          className={`employees-actions__chevron${open ? " employees-actions__chevron--open" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="employees-actions__menu" role="menu">
          <Link href={`/employees/${item.id}`} className="employees-actions__item" role="menuitem">
            عرض التفاصيل
          </Link>
          <button type="button" className="employees-actions__item" role="menuitem" onClick={onEdit}>
            تعديل
          </button>
          {isDriver ? (
            <>
              <div className="employees-actions__sep" />
              {showTopup ? (
                <button type="button" className="employees-actions__item" role="menuitem" onClick={onTopup}>
                  شحن رصيد
                </button>
              ) : null}
              <button type="button" className="employees-actions__item" role="menuitem" onClick={onAddDebt}>
                إضافة دين
              </button>
              <button type="button" className="employees-actions__item" role="menuitem" onClick={onAddDeduction}>
                إضافة خصم
              </button>
              <button type="button" className="employees-actions__item" role="menuitem" onClick={onAddFine}>
                إضافة غرامة
              </button>
              <button type="button" className="employees-actions__item" role="menuitem" onClick={onAddCredit}>
                إضافة مبلغ
              </button>
            </>
          ) : null}
          <div className="employees-actions__sep" />
          <button
            type="button"
            className="employees-actions__item employees-actions__item--danger"
            role="menuitem"
            disabled={deleting}
            onClick={onDelete}
          >
            {deleting ? "جاري..." : "حذف"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EmployeeStatusControl({
  item,
  loading,
  onToggle
}: {
  item: Employee;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="switch-row">
      <button
        type="button"
        className={`switch ${item.isActive ? "switch--on" : ""}`}
        disabled={loading}
        onClick={onToggle}
        aria-pressed={item.isActive}
      >
        <span className="switch__thumb" />
      </button>
      {loading ? <span className="spinner" aria-hidden /> : <span>{item.isActive ? "مفعل" : "معطل"}</span>}
    </label>
  );
}

function PushTokenBell({ item }: { item: Employee }) {
  const registered = item.hasPushToken === true;
  const label = registered ? "إشعارات الجوال: مسجّل" : "إشعارات الجوال: غير مسجّل";
  return (
    <span
      className={`employees-push-bell ${registered ? "employees-push-bell--on" : "employees-push-bell--off"}`}
      title={label}
      aria-label={label}
    >
      <Bell size={18} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [searchDraft, setSearchDraft] = useState("");
  const { query: searchQuery, isPending: searchPending } = useDebouncedSearch(searchDraft);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importRows, setImportRows] = useState<ParsedDriverImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{
    createdCount: number;
    failed: { row: number; fullName: string; reason: string }[];
  } | null>(null);
  const [rowLoadingId, setRowLoadingId] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Employee["role"]>("DRIVER");
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleKind, setVehicleKind] = useState<"" | VehicleKind>("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [commissionDebtLimit, setCommissionDebtLimit] = useState("");
  const [globalDebtLimit, setGlobalDebtLimit] = useState("2000");
  const [paymentMode, setPaymentMode] = useState<"POSTPAID" | "PREPAID">("POSTPAID");
  const [topupDriver, setTopupDriver] = useState<Employee | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupNotes, setTopupNotes] = useState("");
  const [topupSaving, setTopupSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [moneyForm, setMoneyForm] = useState<{ kind: MoneyFormKind; employee: Employee } | null>(null);
  const [moneyAmount, setMoneyAmount] = useState("");
  const [moneyReason, setMoneyReason] = useState("");
  const [moneySaving, setMoneySaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const token = useMemo(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("taxi_admin_session") : null;
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { accessToken: string }).accessToken;
    } catch {
      return null;
    }
  }, []);

  const loadEmployees = async () => {
    if (!token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await api.listEmployees(token, {
        role: roleFilter === "ALL" ? undefined : roleFilter,
        q: searchQuery || undefined
      });
      setEmployees(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل الموظفين";
      if (message === "SESSION_EXPIRED") {
        localStorage.removeItem("taxi_admin_session");
        router.replace("/login");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, searchQuery]);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!(target instanceof Element) || !target.closest(".employees-actions")) {
        setOpenMenuId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (!token) return;
    void api.getCommissionSettings(token).then((setting) => {
      if (setting?.commissionDebtLimit != null) setGlobalDebtLimit(String(setting.commissionDebtLimit));
      if (setting?.paymentMode === "PREPAID" || setting?.paymentMode === "POSTPAID") {
        setPaymentMode(setting.paymentMode);
      }
    }).catch(() => {
      /* يبقى التلميح على القيمة الافتراضية */
    });
  }, [token]);

  const resetForm = () => {
    setEditId(null);
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setRole("DRIVER");
    setVehicleBrand("");
    setVehicleKind("");
    setVehicleColor("");
    setPlateNumber("");
    setCommissionDebtLimit("");
    setShowModal(false);
  };

  const driverProfilePayload = () => {
    const trimmedLimit = commissionDebtLimit.trim().replace(",", ".");
    let parsedLimit: number | null = null;
    if (editId && role === "DRIVER" && trimmedLimit) {
      const value = Number(trimmedLimit);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("الحد الأعلى للمبلغ المترتب يجب أن يكون رقمًا صالحًا غير سالب، أو فارغًا لاستخدام الحد العام.");
      }
      parsedLimit = value;
    }
    return {
      vehicleBrand: vehicleBrand.trim() || null,
      vehicleKind: vehicleKind === "" ? null : vehicleKind,
      vehicleColor: vehicleColor.trim() || null,
      plateNumber: plateNumber.trim() || null,
      ...(editId && role === "DRIVER" ? { commissionDebtLimit: parsedLimit } : {})
    };
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (role === "ADMIN" && !email.trim()) {
      setError("البريد مطلوب لحساب الأدمن");
      return;
    }
    if ((role === "COORDINATOR" || role === "DRIVER") && !phone.trim()) {
      setError("رقم الهاتف إلزامي للمنسق والسائق");
      return;
    }
    setSaving(true);
    setError(null);
    let profile: ReturnType<typeof driverProfilePayload>;
    try {
      profile = driverProfilePayload();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "حد المبلغ المترتب غير صالح.");
      return;
    }
    try {
      if (editId) {
        const patch: Parameters<typeof api.updateEmployee>[2] = {
          fullName: name || undefined,
          password: password || undefined,
          role
        };
        if (role === "ADMIN") {
          patch.email = email.trim() || undefined;
          patch.phone = phone.trim() || undefined;
        } else {
          patch.phone = phone.trim();
        }
        if (role === "DRIVER") {
          patch.driverProfile = profile;
        }
        await api.updateEmployee(token, editId, patch);
      } else if (role === "ADMIN") {
        await api.createEmployee(token, {
          fullName: name,
          email: email.trim(),
          phone: phone.trim() || undefined,
          password,
          role
        });
      } else {
        await api.createEmployee(token, {
          fullName: name,
          phone: phone.trim(),
          password,
          role,
          ...(role === "DRIVER" ? { driverProfile: profile } : {})
        });
      }
      resetForm();
      await loadEmployees();
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل حفظ بيانات الموظف";
      if (message === "SESSION_EXPIRED") {
        localStorage.removeItem("taxi_admin_session");
        router.replace("/login");
        return;
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: Employee) => {
    setOpenMenuId(null);
    setEditId(item.id);
    setName(item.fullName);
    setEmail(item.email ?? "");
    setPhone(item.phone ?? "");
    setPassword("");
    setRole(item.role);
    const d = item.driver;
    setVehicleBrand(d?.vehicleBrand?.trim() ?? "");
    setVehicleKind(d?.vehicleKind ?? "");
    setVehicleColor(d?.vehicleColor?.trim() ?? "");
    setPlateNumber(d?.vehicleNumber?.trim() ?? "");
    setCommissionDebtLimit(
      d?.commissionDebtLimit == null || d.commissionDebtLimit === "" ? "" : String(d.commissionDebtLimit)
    );
    setShowModal(true);
  };

  const onToggleStatus = async (item: Employee) => {
    if (!token) return;
    setRowLoadingId(item.id);
    try {
      await api.toggleEmployeeStatus(token, item.id, !item.isActive);
      await loadEmployees();
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل تغيير حالة الموظف";
      if (message === "SESSION_EXPIRED") {
        localStorage.removeItem("taxi_admin_session");
        router.replace("/login");
        return;
      }
      setError(message);
    } finally {
      setRowLoadingId(null);
    }
  };

  const resetImportModal = () => {
    setShowImportModal(false);
    setImportRows([]);
    setImportErrors([]);
    setImportResult(null);
  };

  const onImportFile = async (file: File | null) => {
    if (!file) return;
    setImportResult(null);
    setImportErrors([]);
    setImportRows([]);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseDriversExcelBuffer(buffer);
      setImportErrors(parsed.errors);
      setImportRows(parsed.rows);
    } catch {
      setImportErrors(["تعذر قراءة ملف Excel."]);
    }
  };

  const onExportEmployees = async () => {
    if (!token) return;
    setExporting(true);
    setError(null);
    try {
      const file = await api.downloadEmployeesExport(token);
      downloadBlobFile(file.blob, file.filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل تصدير الموظفين";
      if (message === "SESSION_EXPIRED") {
        localStorage.removeItem("taxi_admin_session");
        router.replace("/login");
        return;
      }
      setError(message);
    } finally {
      setExporting(false);
    }
  };

  const onSubmitImport = async () => {
    if (!token || !importRows.length) return;
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const result = await api.bulkCreateDrivers(token, importRows);
      setImportResult(result);
      await loadEmployees();
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل استيراد السائقين";
      if (message === "SESSION_EXPIRED") {
        localStorage.removeItem("taxi_admin_session");
        router.replace("/login");
        return;
      }
      setError(message);
    } finally {
      setImporting(false);
    }
  };

  const onDelete = async (item: Employee) => {
    if (!token) return;
    setOpenMenuId(null);
    if (!confirm(`هل أنت متأكد من حذف الموظف ${item.fullName}؟`)) return;
    setRowLoadingId(item.id);
    try {
      await api.deleteEmployee(token, item.id);
      await loadEmployees();
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل حذف الموظف";
      if (message === "SESSION_EXPIRED") {
        localStorage.removeItem("taxi_admin_session");
        router.replace("/login");
        return;
      }
      setError(message);
    } finally {
      setRowLoadingId(null);
    }
  };

  const resetTopup = () => {
    setTopupDriver(null);
    setTopupAmount("");
    setTopupNotes("");
    setTopupSaving(false);
  };

  const openMoneyForm = (kind: MoneyFormKind, employee: Employee) => {
    setOpenMenuId(null);
    setError(null);
    setNotice(null);
    setMoneyAmount("");
    setMoneyReason("");
    setMoneyForm({ kind, employee });
  };

  const resetMoneyForm = () => {
    if (moneySaving) return;
    setMoneyForm(null);
    setMoneyAmount("");
    setMoneyReason("");
  };

  const submitMoneyForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !moneyForm?.employee.driver?.id) return;
    const amount = Number(moneyAmount.trim().replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل مبلغاً صالحاً أكبر من صفر.");
      return;
    }
    const reason = moneyReason.trim();
    if (moneyForm.kind === "deduction" && reason.length < 2) {
      setError("اكتب سبب الخصم.");
      return;
    }
    if (moneyForm.kind === "credit" && reason.length < 2) {
      setError("اكتب سبب إضافة المبلغ.");
      return;
    }
    setMoneySaving(true);
    setError(null);
    try {
      if (moneyForm.kind === "debt") {
        const result = await api.recordDriverExtraDebt(token, {
          driverId: moneyForm.employee.driver.id,
          amount,
          reason: reason || undefined
        });
        if (result.paidFromCredit > 0 && result.remainingExtraDebt > 0) {
          setNotice(
            `تم دفع مبلغ ${formatMoney(result.paidFromCredit)} ل.س من رصيد ${moneyForm.employee.fullName} وبقي يترتب عليه ${formatMoney(result.remainingExtraDebt)} ل.س.`
          );
        } else if (result.paidFromCredit > 0) {
          setNotice(
            `تم دفع مبلغ ${formatMoney(result.paidFromCredit)} ل.س من رصيد ${moneyForm.employee.fullName} ولم يبقَ دين.`
          );
        } else {
          setNotice(
            `تم إضافة دين بقيمة ${formatMoney(amount)} ل.س على ${moneyForm.employee.fullName}. باقي الديون ${formatMoney(result.remainingExtraDebt)} ل.س.`
          );
        }
      } else if (moneyForm.kind === "fine") {
        await api.recordDriverFine(token, {
          driverId: moneyForm.employee.driver.id,
          amount,
          notes: reason || undefined
        });
        setNotice(`تم تسجيل غرامة بقيمة ${formatMoney(amount)} ل.س على ${moneyForm.employee.fullName}.`);
      } else if (moneyForm.kind === "deduction") {
        await api.recordDriverDeduction(token, {
          driverId: moneyForm.employee.driver.id,
          amount,
          reason
        });
        setNotice(`تم خصم ${formatMoney(amount)} ل.س من ${moneyForm.employee.fullName}.`);
      } else {
        await api.recordDriverDueCredit(token, {
          driverId: moneyForm.employee.driver.id,
          amount,
          reason
        });
        setNotice(`تم إضافة مبلغ ${formatMoney(amount)} ل.س لـ ${moneyForm.employee.fullName} ليُخصم من العمولات.`);
      }
      setMoneyForm(null);
      setMoneyAmount("");
      setMoneyReason("");
      await loadEmployees();
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر حفظ العملية";
      if (message === "SESSION_EXPIRED") {
        localStorage.removeItem("taxi_admin_session");
        router.replace("/login");
        return;
      }
      setError(message);
    } finally {
      setMoneySaving(false);
    }
  };

  const submitTopup = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !topupDriver?.driver?.id) return;
    const amount = Number(topupAmount.trim().replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل مبلغ شحن صالحًا أكبر من صفر.");
      return;
    }
    setTopupSaving(true);
    setError(null);
    try {
      await api.prepaidTopup(token, {
        driverId: topupDriver.driver.id,
        amount,
        notes: topupNotes.trim() || undefined
      });
      resetTopup();
      await loadEmployees();
    } catch (err) {
      const message = err instanceof Error ? err.message : "فشل شحن رصيد السائق";
      if (message === "SESSION_EXPIRED") {
        localStorage.removeItem("taxi_admin_session");
        router.replace("/login");
        return;
      }
      setError(message);
    } finally {
      setTopupSaving(false);
    }
  };

  const renderEmployeeActions = (item: Employee) => (
    <EmployeeRowActions
      item={item}
      open={openMenuId === item.id}
      deleting={rowLoadingId === item.id}
      showTopup={paymentMode === "PREPAID"}
      onToggle={() => setOpenMenuId((prev) => (prev === item.id ? null : item.id))}
      onEdit={() => startEdit(item)}
      onDelete={() => void onDelete(item)}
      onTopup={() => {
        setOpenMenuId(null);
        setError(null);
        setTopupDriver(item);
      }}
      onAddDebt={() => openMoneyForm("debt", item)}
      onAddCredit={() => openMoneyForm("credit", item)}
      onAddFine={() => openMoneyForm("fine", item)}
      onAddDeduction={() => openMoneyForm("deduction", item)}
    />
  );

  return (
    <div className="dashboard-page employees-page">
      <div className="card employees-toolbar">
        <div className="employees-toolbar__main">
          <p className="employees-toolbar__hint">إضافة، تعديل، حذف، تفعيل وتعطيل حسب الدور</p>
          <div className="employees-search">
            <input
              className="input-styled employees-search__input"
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="بحث بالاسم، البريد، الهاتف، أو بيانات المركبة…"
              aria-label="بحث الموظفين"
            />
            {searchPending || (loading && searchDraft.trim()) ? (
              <span className="employees-search__pending">جاري البحث…</span>
            ) : null}
          </div>
        </div>
        <div className="employees-toolbar__actions">
          <button type="button" className="btn btn-ghost" disabled={exporting} onClick={() => void onExportEmployees()}>
            {exporting ? "جاري التصدير…" : "تصدير الموظفين (Excel)"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setError(null);
              resetImportModal();
              setShowImportModal(true);
            }}
          >
            استيراد سائقين (Excel)
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setError(null);
              setEditId(null);
              setName("");
              setEmail("");
              setPhone("");
              setPassword("");
              setRole("DRIVER");
              setVehicleBrand("");
              setVehicleKind("");
              setVehicleColor("");
              setPlateNumber("");
              setShowModal(true);
            }}
          >
            + إضافة موظف
          </button>
        </div>
      </div>

      <section className="card employees-table-card">
        <div className="employees-table-head">
          <h3 className="employees-table-head__title">قائمة الموظفين</h3>
          <div className="select-wrap">
            <select
              className="select-styled"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            >
              <option value="ALL">كل الأدوار</option>
              <option value="ADMIN">أدمن</option>
              <option value="COORDINATOR">منسق</option>
              <option value="DRIVER">سائق</option>
            </select>
            <span className="select-wrap__chevron" aria-hidden>
              ▼
            </span>
          </div>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="employees-notice">{notice}</p> : null}
        {loading ? (
          <p className="loading-row">
            <span className="spinner" aria-hidden />
            جاري تحميل الموظفين...
          </p>
        ) : (
          <>
            <div className="table-scroll employees-table-desktop">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>البريد</th>
                    <th>الهاتف</th>
                    <th>الدور</th>
                    <th>إشعارات</th>
                    <th>المركبة (سائق)</th>
                    {paymentMode === "PREPAID" ? <th>الرصيد المسبق</th> : null}
                    <th>الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((item) => (
                    <tr key={item.id}>
                      <td>{item.fullName}</td>
                      <td>{item.email ?? "—"}</td>
                      <td>{item.phone ?? "—"}</td>
                      <td>{roleText[item.role]}</td>
                      <td className="employees-push-cell">
                        <PushTokenBell item={item} />
                      </td>
                      <td className="employees-vehicle-cell">{formatDriverVehicleRow(item)}</td>
                      {paymentMode === "PREPAID" ? (
                        <td>
                          {item.role === "DRIVER"
                            ? `${formatMoney(prepaidCredit(item.driver?.remainingDebt))} ل.س`
                            : "—"}
                        </td>
                      ) : null}
                      <td>
                        <EmployeeStatusControl
                          item={item}
                          loading={rowLoadingId === item.id}
                          onToggle={() => void onToggleStatus(item)}
                        />
                      </td>
                      <td className="cell-actions">{renderEmployeeActions(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="employees-cards">
              {employees.map((item) => (
                <article key={item.id} className="employees-card">
                  <div className="employees-card__top">
                    <div className="employees-card__identity">
                      <h4 className="employees-card__name">{item.fullName}</h4>
                      <span className="employees-card__role">{roleText[item.role]}</span>
                    </div>
                    <PushTokenBell item={item} />
                  </div>
                  <dl className="employees-card__fields">
                    <div className="employees-card__field">
                      <dt>البريد</dt>
                      <dd>{item.email ?? "—"}</dd>
                    </div>
                    <div className="employees-card__field">
                      <dt>الهاتف</dt>
                      <dd>{item.phone ?? "—"}</dd>
                    </div>
                    {item.role === "DRIVER" ? (
                      <div className="employees-card__field">
                        <dt>المركبة</dt>
                        <dd>{formatDriverVehicleRow(item)}</dd>
                      </div>
                    ) : null}
                    {paymentMode === "PREPAID" && item.role === "DRIVER" ? (
                      <div className="employees-card__field">
                        <dt>الرصيد المسبق</dt>
                        <dd>{formatMoney(prepaidCredit(item.driver?.remainingDebt))} ل.س</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="employees-card__foot">
                    <EmployeeStatusControl
                      item={item}
                      loading={rowLoadingId === item.id}
                      onToggle={() => void onToggleStatus(item)}
                    />
                    {renderEmployeeActions(item)}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {showModal ? (
        <div className="modal-backdrop" onClick={resetForm} role="presentation">
          <div className="card modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-panel__header">
              <h3>{editId ? "تعديل موظف" : "إضافة موظف جديد"}</h3>
              <button type="button" className="btn btn-ghost" onClick={resetForm}>
                إغلاق
              </button>
            </div>

            <form className="modal-form" onSubmit={onSubmit}>
              <div className="modal-form__grid">
                <input
                  className="input-styled"
                  placeholder="الاسم الكامل"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                {role === "ADMIN" ? (
                  <input
                    className="input-styled"
                    type="email"
                    autoComplete="email"
                    placeholder="البريد الإلكتروني (إلزامي للأدمن)"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                ) : null}
                <input
                  className="input-styled"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={role === "ADMIN" ? "رقم الهاتف (اختياري)" : "رقم الهاتف (إلزامي)"}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required={role === "COORDINATOR" || role === "DRIVER"}
                />
                <input
                  className="input-styled"
                  placeholder={editId ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!editId}
                />
                {role === "DRIVER" ? (
                  <>
                    <input
                      className="input-styled"
                      placeholder="ماركة السيارة"
                      value={vehicleBrand}
                      onChange={(e) => setVehicleBrand(e.target.value)}
                    />
                    <div className="select-wrap select-wrap--narrow">
                      <select
                        className="select-styled"
                        value={vehicleKind}
                        onChange={(e) => setVehicleKind(e.target.value as "" | VehicleKind)}
                      >
                        <option value="">نوع السيارة (اختياري)</option>
                        <option value="PUBLIC">عامة</option>
                        <option value="PRIVATE">خاصة</option>
                        <option value="VIP">VIP</option>
                      </select>
                      <span className="select-wrap__chevron" aria-hidden>
                        ▼
                      </span>
                    </div>
                    <input
                      className="input-styled"
                      placeholder="لون السيارة"
                      value={vehicleColor}
                      onChange={(e) => setVehicleColor(e.target.value)}
                    />
                    {editId && paymentMode === "POSTPAID" ? (
                      <label className="settings-field" style={{ gridColumn: "1 / -1" }}>
                        <span>الحد الأعلى للمبلغ المترتب قبل الإيقاف</span>
                        <input
                          className="input-styled"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={`فارغ = الحد العام (${globalDebtLimit})`}
                          value={commissionDebtLimit}
                          onChange={(e) => setCommissionDebtLimit(e.target.value)}
                        />
                        <span className="settings-card__hint">
                          اتركه فارغًا ليُستخدم الحد العام من إعدادات المنصة ({globalDebtLimit} ل.س). أي رقم هنا يرفع أو يخفض حد هذا السائق فقط.
                          عند تجاوز الحد يُوقف فورًا، ويعود للعمل مباشرة بعد التسديد.
                        </span>
                      </label>
                    ) : null}
                    <input
                      className="input-styled"
                      placeholder="رقم اللوحة"
                      value={plateNumber}
                      onChange={(e) => setPlateNumber(e.target.value)}
                    />
                  </>
                ) : null}
              </div>

              <div className="select-wrap select-wrap--narrow">
                <select className="select-styled" value={role} onChange={(e) => setRole(e.target.value as Employee["role"])}>
                  <option value="DRIVER">سائق</option>
                  <option value="COORDINATOR">منسق</option>
                  <option value="ADMIN">أدمن</option>
                </select>
                <span className="select-wrap__chevron" aria-hidden>
                  ▼
                </span>
              </div>

              <div className="modal-form__actions">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? (
                    <span className="loading-row">
                      <span className="spinner" aria-hidden />
                      جاري الحفظ...
                    </span>
                  ) : editId ? (
                    "حفظ التعديل"
                  ) : (
                    "إضافة الموظف"
                  )}
                </button>
                <button className="btn" type="button" onClick={resetForm} disabled={saving}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showImportModal ? (
        <div className="modal-backdrop" onClick={resetImportModal} role="presentation">
          <div className="card modal-panel modal-panel--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-panel__header">
              <h3>استيراد سائقين من Excel</h3>
              <button type="button" className="btn btn-ghost" onClick={resetImportModal}>
                إغلاق
              </button>
            </div>

            <div className="import-drivers">
              <p className="import-drivers__hint">
                ارفع ملف Excel يحتوي الأعمدة: الاسم، الهاتف، براند السيارة، نوع السيارة (1 = خاصة، 2 = عامة، 3 = VIP)، لون
                السيارة، رقم اللوحة، كلمة المرور.
              </p>
              <div className="import-drivers__actions">
                <button type="button" className="btn btn-ghost" onClick={downloadDriversImportTemplate}>
                  تنزيل قالب Excel
                </button>
                <label className="btn btn-primary import-drivers__fileBtn">
                  اختيار ملف Excel
                  <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="import-drivers__fileInput"
                    onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {importErrors.length ? (
                <ul className="import-drivers__errors">
                  {importErrors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              ) : null}

              {importRows.length ? (
                <>
                  <p className="import-drivers__summary">جاهز للاستيراد: {importRows.length} سائق</p>
                  <div className="table-scroll import-drivers__preview">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>الاسم</th>
                          <th>الهاتف</th>
                          <th>البراند</th>
                          <th>نوع السيارة</th>
                          <th>اللون</th>
                          <th>اللوحة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 8).map((row, index) => (
                          <tr key={`${row.phone}-${index}`}>
                            <td>{row.fullName}</td>
                            <td>{row.phone}</td>
                            <td>{row.vehicleBrand || "—"}</td>
                            <td>{row.vehicleKind ? vehicleKindText[row.vehicleKind] : "—"}</td>
                            <td>{row.vehicleColor || "—"}</td>
                            <td>{row.plateNumber || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRows.length > 8 ? (
                    <p className="import-drivers__more">… و{importRows.length - 8} سائقين إضافيين</p>
                  ) : null}
                </>
              ) : null}

              {importResult ? (
                <div className="import-drivers__result">
                  <p>تم إنشاء {importResult.createdCount} سائق بنجاح.</p>
                  {importResult.failed.length ? (
                    <ul className="import-drivers__errors">
                      {importResult.failed.map((item) => (
                        <li key={`${item.row}-${item.fullName}`}>
                          الصف {item.row} ({item.fullName}): {item.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="modal-form__actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={importing || !importRows.length}
                  onClick={() => void onSubmitImport()}
                >
                  {importing ? "جاري الاستيراد…" : `استيراد ${importRows.length || ""} سائق`}
                </button>
                <button type="button" className="btn" onClick={resetImportModal} disabled={importing}>
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {topupDriver ? (
        <div className="modal-backdrop" onClick={resetTopup} role="presentation">
          <div className="card modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-panel__header">
              <h3>شحن رصيد {topupDriver.fullName}</h3>
              <button type="button" className="btn btn-ghost" onClick={resetTopup}>
                إغلاق
              </button>
            </div>
            <form className="modal-form" onSubmit={submitTopup}>
              <p className="settings-card__hint">
                الرصيد الحالي: {formatMoney(prepaidCredit(topupDriver.driver?.remainingDebt))} ل.س. الشحن يُخزَّن كعمولة
                سالبة ويظهر للسائق كرصيد موجب، وينقص مع كل عمولة حتى يصل إلى 0 فيُوقف عن العمل.
              </p>
              <input
                className="input-styled"
                inputMode="decimal"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                placeholder="مبلغ الشحن"
                required
              />
              <textarea
                className="input-styled"
                value={topupNotes}
                onChange={(e) => setTopupNotes(e.target.value)}
                placeholder="ملاحظات (اختياري)"
                rows={3}
              />
              <div className="modal-form__actions">
                <button className="btn btn-primary" type="submit" disabled={topupSaving}>
                  {topupSaving ? "جاري الشحن..." : "شحن الرصيد"}
                </button>
                <button className="btn" type="button" onClick={resetTopup} disabled={topupSaving}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {moneyForm ? (
        <div className="modal-backdrop" onClick={resetMoneyForm} role="presentation">
          <div className="card modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-panel__header">
              <h3>
                {moneyForm.kind === "debt"
                  ? `إضافة دين لـ ${moneyForm.employee.fullName}`
                  : moneyForm.kind === "fine"
                    ? `إضافة غرامة لـ ${moneyForm.employee.fullName}`
                    : moneyForm.kind === "deduction"
                      ? `إضافة خصم لـ ${moneyForm.employee.fullName}`
                      : `إضافة مبلغ لـ ${moneyForm.employee.fullName}`}
              </h3>
              <button type="button" className="btn btn-ghost" onClick={resetMoneyForm} disabled={moneySaving}>
                إغلاق
              </button>
            </div>
            <form className="modal-form" onSubmit={submitMoneyForm}>
              <p className="settings-card__hint">
                {moneyForm.kind === "debt"
                  ? "إذا كان للسائق رصيد يُخصم أولاً، ويظهر المتبقي كباقي دين في خانة الديون. سبب الدين اختياري."
                  : moneyForm.kind === "fine"
                    ? "تُضاف الغرامة إلى المترتب على السائق، ويصل إشعار إليه. الملاحظات اختيارية."
                    : moneyForm.kind === "deduction"
                      ? "يُضاف الخصم إلى المترتب على السائق مع سبب واضح، ويصل إشعار إليه."
                      : "يُضاف المبلغ ليُخصم من عمولات السائق، ويظهر كمستحق إذا تجاوز المترتب، مع إشعار للسائق."}
                {moneyForm.employee.driver?.remainingDebt != null
                  ? ` المترتب الحالي: ${formatMoney(moneyForm.employee.driver.remainingDebt)} ل.س.`
                  : ""}
              </p>
              {error ? <p className="form-error">{error}</p> : null}
              <input
                className="input-styled"
                inputMode="decimal"
                value={moneyAmount}
                onChange={(e) => setMoneyAmount(e.target.value)}
                placeholder={
                  moneyForm.kind === "debt"
                    ? "قيمة الدين"
                    : moneyForm.kind === "fine"
                      ? "قيمة الغرامة"
                      : moneyForm.kind === "deduction"
                        ? "قيمة الخصم"
                        : "قيمة المبلغ"
                }
                required
              />
              <textarea
                className="input-styled"
                value={moneyReason}
                onChange={(e) => setMoneyReason(e.target.value)}
                placeholder={
                  moneyForm.kind === "debt"
                    ? "سبب الدين (اختياري)"
                    : moneyForm.kind === "fine"
                      ? "سبب الغرامة (اختياري)"
                      : moneyForm.kind === "deduction"
                        ? "سبب الخصم"
                        : "سبب إضافة المبلغ"
                }
                rows={3}
                required={moneyForm.kind === "credit" || moneyForm.kind === "deduction"}
              />
              <div className="modal-form__actions">
                <button className="btn btn-primary" type="submit" disabled={moneySaving}>
                  {moneySaving
                    ? "جارٍ الحفظ..."
                    : moneyForm.kind === "debt"
                      ? "حفظ الدين"
                      : moneyForm.kind === "fine"
                        ? "حفظ الغرامة"
                        : moneyForm.kind === "deduction"
                          ? "حفظ الخصم"
                          : "حفظ المبلغ"}
                </button>
                <button className="btn" type="button" onClick={resetMoneyForm} disabled={moneySaving}>
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
