"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { api, type Employee, type VehicleKind } from "../../../lib/api";
import { useDebouncedSearch } from "../../../lib/use-debounced-value";
import {
  downloadDriversImportTemplate,
  parseDriversExcelBuffer,
  type ParsedDriverImportRow
} from "../../../lib/parse-drivers-excel";

type RoleFilter = "ALL" | "ADMIN" | "COORDINATOR" | "DRIVER";

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
    setShowModal(false);
  };

  const driverProfilePayload = () => ({
    vehicleBrand: vehicleBrand.trim() || null,
    vehicleKind: vehicleKind === "" ? null : vehicleKind,
    vehicleColor: vehicleColor.trim() || null,
    plateNumber: plateNumber.trim() || null
  });

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
          patch.driverProfile = driverProfilePayload();
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
          ...(role === "DRIVER" ? { driverProfile: driverProfilePayload() } : {})
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
        {loading ? (
          <p className="loading-row">
            <span className="spinner" aria-hidden />
            جاري تحميل الموظفين...
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>البريد</th>
                  <th>الهاتف</th>
                  <th>الدور</th>
                  <th>إشعارات</th>
                  <th>المركبة (سائق)</th>
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
                    <td>
                      <label className="switch-row">
                        <button
                          type="button"
                          className={`switch ${item.isActive ? "switch--on" : ""}`}
                          disabled={rowLoadingId === item.id}
                          onClick={() => void onToggleStatus(item)}
                          aria-pressed={item.isActive}
                        >
                          <span className="switch__thumb" />
                        </button>
                        {rowLoadingId === item.id ? <span className="spinner" aria-hidden /> : <span>{item.isActive ? "مفعل" : "معطل"}</span>}
                      </label>
                    </td>
                    <td className="cell-actions">
                      <button type="button" className="btn btn-sm" onClick={() => startEdit(item)}>
                        تعديل
                      </button>
                      <button type="button" className="btn btn-sm" disabled={rowLoadingId === item.id} onClick={() => void onDelete(item)}>
                        {rowLoadingId === item.id ? "جاري..." : "حذف"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}
