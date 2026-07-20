"use client";

import { Suspense } from "react";
import PublicBookPage from "./book-form";

export default function BookPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24, textAlign: "center" }}>جاري التحميل…</main>}>
      <PublicBookPage />
    </Suspense>
  );
}
