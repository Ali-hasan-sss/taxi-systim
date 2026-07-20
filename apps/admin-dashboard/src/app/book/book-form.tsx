"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import appLogo from "../../../../coordinator-app/assets/images/logo-removebg-preview.png";
import styles from "./book.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export default function PublicBookPage() {
  const searchParams = useSearchParams();
  const promoCode = useMemo(() => searchParams.get("promo")?.trim() || "", [searchParams]);
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/public/taxi-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: customerPhone.trim(),
          pickupAddress: pickupAddress.trim(),
          dropoffAddress: dropoffAddress.trim(),
          notes: notes.trim() || undefined,
          customerName: customerName.trim() || undefined,
          promoCode: promoCode || undefined
        })
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(body.message || "تعذر إرسال الطلب. حاول مجددًا.");
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال الطلب.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Image src={appLogo} alt="Taxi Bro" className={styles.logo} priority />
        </div>
        <h1 className={styles.title}>اطلب تاكسي من Taxi Bro</h1>
        <p className={styles.subtitle}>أدخل بياناتك وسيتواصل معك المنسق فورًا لتأكيد الطلب.</p>
        {promoCode ? <p className={styles.subtitle}>عرض مفعّل عبر الرابط: {promoCode}</p> : null}

        {done ? (
          <div className={styles.success}>
            <h2>تم استلام طلبك</h2>
            <p>سيتصل بك فريق التنسيق قريبًا على الرقم الذي أدخلته.</p>
          </div>
        ) : (
          <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
            <label className={styles.field}>
              <span>رقم الهاتف *</span>
              <input
                className={styles.input}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="09xxxxxxxx"
                inputMode="tel"
                required
              />
            </label>
            <label className={styles.field}>
              <span>الاسم (اختياري)</span>
              <input
                className={styles.input}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="الاسم"
              />
            </label>
            <label className={styles.field}>
              <span>من *</span>
              <input
                className={styles.input}
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder="موقع الانطلاق"
                required
              />
            </label>
            <label className={styles.field}>
              <span>إلى *</span>
              <input
                className={styles.input}
                value={dropoffAddress}
                onChange={(e) => setDropoffAddress(e.target.value)}
                placeholder="الوجهة"
                required
              />
            </label>
            <label className={styles.field}>
              <span>ملاحظات</span>
              <textarea
                className={styles.input}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="اختياري"
                rows={3}
              />
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? "جارٍ الإرسال..." : "إرسال الطلب"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
