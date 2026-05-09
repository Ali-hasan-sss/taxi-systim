"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Employee } from "../../../lib/api";

type RoleFilter = "ALL" | "ADMIN" | "COORDINATOR" | "DRIVER";

const roleText: Record<Employee["role"], string> = {
  ADMIN: "أدمن",
  COORDINATOR: "منسق",
  DRIVER: "سائق"
};

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowLoadingId, setRowLoadingId] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Employee["role"]>("COORDINATOR");

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
      const list = await api.listEmployees(token, roleFilter === "ALL" ? undefined : { role: roleFilter });
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
  }, [roleFilter]);

  const resetForm = () => {
    setEditId(null);
    setName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setRole("COORDINATOR");
    setShowModal(false);
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
          role
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
        <p className="employees-toolbar__hint">إضافة، تعديل، حذف، تفعيل وتعطيل حسب الدور</p>
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
            setRole("COORDINATOR");
            setShowModal(true);
          }}
        >
          + إضافة موظف
        </button>
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
              </div>

              <div className="select-wrap select-wrap--narrow">
                <select className="select-styled" value={role} onChange={(e) => setRole(e.target.value as Employee["role"])}>
                  <option value="ADMIN">أدمن</option>
                  <option value="COORDINATOR">منسق</option>
                  <option value="DRIVER">سائق</option>
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
    </div>
  );
}
