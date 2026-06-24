"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { PanelRightOpen, Search, X } from "lucide-react";
import { api, getSocketOrigin, type AdminLiveDriver, type AdminOrderRoomRow, type LiveDriverSummary } from "../../../lib/api";
import styles from "./page.module.css";

const DriversDistributionMap = dynamic(() => import("../../../components/drivers-distribution-map"), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>جاري تحميل الخريطة…</div>
});

const DRIVER_PAGE_LIMIT = 120;

type SocketStatus = "connected" | "connecting" | "disconnected";
type SessionSnapshot = { accessToken: string; user?: { id?: string } };
type OrderModalMode = "choose" | "new" | "pending";

type OrderFormState = {
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  amount: string;
  notes: string;
};

const EMPTY_SUMMARY: LiveDriverSummary = {
  totalDrivers: 0,
  activeDrivers: 0,
  driversOnMap: 0
};

function formatVehicle(driver: AdminLiveDriver): string {
  const pieces = [
    driver.vehicleBrand?.trim(),
    driver.vehicleColor?.trim(),
    driver.vehicleKind === "PUBLIC" ? "عامة" : driver.vehicleKind === "PRIVATE" ? "خاصة" : driver.vehicleKind === "VIP" ? "VIP" : null
  ].filter(Boolean);
  return pieces.length > 0 ? pieces.join(" - ") : "لا توجد بيانات سيارة";
}

function formatStatus(driver: AdminLiveDriver): string {
  if (!driver.isOnline) return "غير نشط";
  return driver.isBusy ? "مشغول الآن" : "متاح الآن";
}

function getStatusClass(driver: AdminLiveDriver): string {
  if (!driver.isOnline) return styles.statusOffline;
  return driver.isBusy ? styles.statusBusy : styles.statusOnline;
}

function buildWhatsAppUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  return normalized ? `https://wa.me/${normalized}` : null;
}

function hasDriverLocation(driver: AdminLiveDriver): driver is AdminLiveDriver & { lat: number; lng: number } {
  return (
    typeof driver.lat === "number" &&
    Number.isFinite(driver.lat) &&
    typeof driver.lng === "number" &&
    Number.isFinite(driver.lng) &&
    Math.abs(driver.lat) <= 90 &&
    Math.abs(driver.lng) <= 180
  );
}

function formatOrderAmount(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return `${new Intl.NumberFormat("ar-SY", { maximumFractionDigits: 0 }).format(n)} ل.س`;
}

function vehicleRequirementLabel(requirement?: string | null): string {
  if (requirement === "PUBLIC") return "عامة";
  if (requirement === "PRIVATE") return "خاصة";
  if (requirement === "VIP") return "VIP";
  return "أي نوع";
}

function orderMatchesDriver(order: AdminOrderRoomRow, driver: AdminLiveDriver): boolean {
  const requirement = order.vehicleRequirement ?? "ANY";
  if (requirement === "ANY") return true;
  if (!driver.vehicleKind) return false;
  return driver.vehicleKind === requirement;
}

export default function DriversDistributionPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [socketRegisterId, setSocketRegisterId] = useState("admin-dashboard");
  const [drivers, setDrivers] = useState<AdminLiveDriver[]>([]);
  const [summary, setSummary] = useState<LiveDriverSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [liveTracking, setLiveTracking] = useState(true);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("connecting");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedDriverFocusKey, setSelectedDriverFocusKey] = useState(0);
  const [fullscreenMap, setFullscreenMap] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalDriver, setModalDriver] = useState<AdminLiveDriver | null>(null);
  const [orderModalMode, setOrderModalMode] = useState<OrderModalMode>("choose");
  const [pendingOrders, setPendingOrders] = useState<AdminOrderRoomRow[]>([]);
  const [loadingPendingOrders, setLoadingPendingOrders] = useState(false);
  const [selectedPendingOrderId, setSelectedPendingOrderId] = useState<string | null>(null);
  const [form, setForm] = useState<OrderFormState>({
    customerName: "",
    customerPhone: "",
    pickupAddress: "",
    dropoffAddress: "",
    amount: "",
    notes: ""
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const raw = localStorage.getItem("taxi_admin_session");
    if (!raw) {
      router.replace("/login");
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SessionSnapshot;
      if (!parsed.accessToken) throw new Error("SESSION_EXPIRED");
      setAccessToken(parsed.accessToken);
      setSocketRegisterId(parsed.user?.id ?? "admin-dashboard");
    } catch {
      api.clearSession();
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!fullscreenMap) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreenMap]);

  const handleSessionExpired = useCallback(() => {
    api.clearSession();
    router.replace("/login");
  }, [router]);

  const loadDrivers = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!accessToken) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      setError(null);
      try {
        const page = await api.liveDrivers(accessToken, {
          q: debouncedSearch,
          limit: DRIVER_PAGE_LIMIT,
          includeInactive
        });

        setDrivers(page.drivers);
        setSummary(page.summary);
        setSelectedDriverId((current) =>
          current && page.drivers.some((driver) => driver.driverId === current) ? current : null
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "تعذر تحميل مواقع السائقين";
        if (message === "SESSION_EXPIRED") {
          handleSessionExpired();
          return;
        }
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, debouncedSearch, handleSessionExpired, includeInactive]
  );

  useEffect(() => {
    setSelectedDriverFocusKey(0);
  }, [debouncedSearch, includeInactive]);

  useEffect(() => {
    if (!accessToken) return;
    void loadDrivers("initial");
  }, [accessToken, loadDrivers]);

  useEffect(() => {
    if (!modalDriver) return;
    const current = drivers.find((driver) => driver.driverId === modalDriver.driverId);
    if (!current) {
      setModalDriver(null);
      return;
    }
    setModalDriver(current);
  }, [drivers, modalDriver]);

  useEffect(() => {
    if (!accessToken || !liveTracking) {
      setSocketStatus("disconnected");
      return;
    }

    setSocketStatus("connecting");
    const socket: Socket = io(getSocketOrigin(), { transports: ["websocket"] });

    const onConnect = () => {
      setSocketStatus("connected");
      socket.emit("coordinator:register", socketRegisterId);
    };

    const onDisconnect = (reason: string) => {
      if (reason === "io client disconnect") {
        setSocketStatus("disconnected");
        return;
      }
      setSocketStatus(reason === "io server disconnect" ? "disconnected" : "connecting");
    };

    const onReconnectAttempt = () => setSocketStatus("connecting");
    const onReconnectFailed = () => setSocketStatus("disconnected");

    const onDriverLocationUpdated = (payload: { driverId?: string; lat?: number; lng?: number; isBusy?: boolean }) => {
      if (typeof payload.driverId !== "string" || !payload.driverId) return;

      let found = false;
      let mapCountDelta = 0;

      setDrivers((current) =>
        current.map((driver) => {
          if (driver.driverId !== payload.driverId) return driver;
          found = true;

          const nextLat =
            typeof payload.lat === "number" && Number.isFinite(payload.lat) && Math.abs(payload.lat) <= 90 ? payload.lat : driver.lat;
          const nextLng =
            typeof payload.lng === "number" && Number.isFinite(payload.lng) && Math.abs(payload.lng) <= 180 ? payload.lng : driver.lng;

          if (!hasDriverLocation(driver) && typeof nextLat === "number" && typeof nextLng === "number") {
            mapCountDelta = 1;
          }

          const busy = typeof payload.isBusy === "boolean" ? payload.isBusy : driver.isBusy;
          return {
            ...driver,
            lat: nextLat,
            lng: nextLng,
            isOnline: true,
            isBusy: busy,
            status: busy ? "busy" : "online"
          };
        })
      );

      if (!found) {
        void loadDrivers("refresh");
        return;
      }

      if (mapCountDelta > 0) {
        setSummary((current) => ({ ...current, driversOnMap: current.driversOnMap + mapCountDelta }));
      }
    };

    const refreshOnPresenceChange = () => {
      void loadDrivers("refresh");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect_failed", onReconnectFailed);
    socket.on("DRIVER_LOCATION_UPDATED", onDriverLocationUpdated);
    socket.on("DRIVER_ONLINE", refreshOnPresenceChange);
    socket.on("DRIVER_OFFLINE", refreshOnPresenceChange);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect_failed", onReconnectFailed);
      socket.off("DRIVER_LOCATION_UPDATED", onDriverLocationUpdated);
      socket.off("DRIVER_ONLINE", refreshOnPresenceChange);
      socket.off("DRIVER_OFFLINE", refreshOnPresenceChange);
      socket.disconnect();
    };
  }, [accessToken, liveTracking, loadDrivers, socketRegisterId]);

  const selectedDriver = useMemo(
    () => drivers.find((driver) => driver.driverId === selectedDriverId) ?? null,
    [drivers, selectedDriverId]
  );

  const socketStatusLabel =
    socketStatus === "connected" ? "التتبع المباشر متصل" : socketStatus === "connecting" ? "جاري الاتصال..." : "التتبع متوقف";
  const socketStatusClass =
    socketStatus === "connected"
      ? styles.socketConnected
      : socketStatus === "connecting"
        ? styles.socketConnecting
        : styles.socketDisconnected;

  const openWhatsApp = (driver: AdminLiveDriver) => {
    const url = buildWhatsAppUrl(driver.phone);
    if (!url) {
      setNotice("لا يوجد رقم هاتف مرتبط بهذا السائق.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const focusDriverFromSidebar = (driver: AdminLiveDriver) => {
    const driverName = driver.fullName;
    setSelectedDriverId(driver.driverId);
    setSelectedDriverFocusKey((current) => current + 1);

    const hasLocation = hasDriverLocation(driver);
    if (!hasLocation) {
      setNotice(`تم تحديد ${driverName}، لكن لم يصل موقعه المباشر بعد.`);
    } else {
      setNotice(null);
    }

    if (window.matchMedia("(max-width: 960px)").matches) {
      setSidebarOpen(false);
    }
  };

  useEffect(() => {
    if (!sidebarOpen) return;
    const mq = window.matchMedia("(max-width: 960px)");
    if (!mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const openOrderModal = (driver: AdminLiveDriver) => {
    if (!driver.isOnline) {
      setNotice("لا يمكن إضافة طلب لسائق غير نشط حاليًا.");
      return;
    }
    if (driver.isBusy) {
      setNotice("السائق مشغول الآن. انتظر حتى يصبح متاحًا.");
      return;
    }

    setNotice(null);
    setModalDriver(driver);
    setOrderModalMode("choose");
    setPendingOrders([]);
    setSelectedPendingOrderId(null);
    setForm({
      customerName: "",
      customerPhone: "",
      pickupAddress: "",
      dropoffAddress: "",
      amount: "",
      notes: ""
    });
  };

  const closeOrderModal = () => {
    if (submittingOrder) return;
    setModalDriver(null);
    setOrderModalMode("choose");
    setPendingOrders([]);
    setSelectedPendingOrderId(null);
  };

  const openNewOrderForm = () => {
    setOrderModalMode("new");
    setSelectedPendingOrderId(null);
    setForm({
      customerName: "",
      customerPhone: "",
      pickupAddress: "",
      dropoffAddress: "",
      amount: "",
      notes: ""
    });
  };

  const loadPendingOrders = useCallback(async () => {
    if (!accessToken) return;
    setLoadingPendingOrders(true);
    setError(null);
    try {
      const result = await api.listOrdersRoom(accessToken, "pending", { limit: 80 });
      setPendingOrders(result.orders);
      setSelectedPendingOrderId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل الطلبات المعلقة";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setLoadingPendingOrders(false);
    }
  }, [accessToken, handleSessionExpired]);

  const openPendingOrdersForm = () => {
    setOrderModalMode("pending");
    void loadPendingOrders();
  };

  const assignPendingOrder = async () => {
    if (!accessToken || !modalDriver || !selectedPendingOrderId) return;

    const order = pendingOrders.find((item) => item.id === selectedPendingOrderId);
    if (!order) {
      setError("اختر طلبًا معلقًا أولًا.");
      return;
    }
    if (!orderMatchesDriver(order, modalDriver)) {
      setError("نوع سيارة السائق لا يطابق متطلب هذا الطلب.");
      return;
    }

    setSubmittingOrder(true);
    setError(null);
    setNotice(null);

    try {
      await api.assignOrder(accessToken, selectedPendingOrderId, modalDriver.driverId);
      setNotice(`تم إسناد الطلب المعلق إلى ${modalDriver.fullName}.`);
      setModalDriver(null);
      setOrderModalMode("choose");
      setPendingOrders([]);
      setSelectedPendingOrderId(null);
      await loadDrivers("refresh");
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر إسناد الطلب المعلق";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setSubmittingOrder(false);
    }
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken || !modalDriver) return;

    const amount = Number(form.amount.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل مبلغًا صالحًا أكبر من صفر.");
      return;
    }
    if (!form.pickupAddress.trim() || !form.dropoffAddress.trim()) {
      setError("أدخل موقع الانطلاق والوجهة.");
      return;
    }
    if (!form.customerName.trim() && form.customerPhone.trim().length < 3) {
      setError("أدخل اسم الزبون أو رقم هاتف لا يقل عن 3 خانات.");
      return;
    }

    setSubmittingOrder(true);
    setError(null);
    setNotice(null);

    try {
      const created = await api.createOrder(accessToken, {
        customerName: form.customerName.trim() || undefined,
        customerPhone: form.customerPhone.trim() || undefined,
        pickupAddress: form.pickupAddress.trim(),
        dropoffAddress: form.dropoffAddress.trim(),
        amount,
        notes: form.notes.trim() || undefined,
        broadcastTarget: "ALL"
      });
      await api.assignOrder(accessToken, created.id, modalDriver.driverId);
      setNotice(`تم إنشاء الطلب وإسناده إلى ${modalDriver.fullName}.`);
      setModalDriver(null);
      setOrderModalMode("choose");
      setPendingOrders([]);
      setSelectedPendingOrderId(null);
      await loadDrivers("refresh");
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر إنشاء الطلب وإسناده";
      if (message === "SESSION_EXPIRED") {
        handleSessionExpired();
        return;
      }
      setError(message);
    } finally {
      setSubmittingOrder(false);
    }
  };

  const sidebarPanel = (
    <>
      <section className={`card ${styles.panel}`}>
        <div className={styles.panelHeader}>
          <div>
            <h3 className={styles.panelTitle}>السائقون والخيارات</h3>
            <p className={styles.panelHint}>ابحث، فلتر، واختر سائقًا لتمييزه على الخريطة.</p>
          </div>
          <div className={styles.panelHeaderActions}>
            <span className={styles.countChip}>{drivers.length}</span>
            <button
              type="button"
              className={styles.sidebarCloseBtn}
              onClick={() => setSidebarOpen(false)}
              aria-label="إغلاق القائمة"
            >
              <X size={18} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        </div>

        <div className={styles.switchColumn}>
          <label className={styles.switchRow}>
            <span>تتبع مباشر</span>
            <input
              className={styles.switchInput}
              type="checkbox"
              checked={liveTracking}
              onChange={(event) => setLiveTracking(event.target.checked)}
            />
          </label>
          <label className={styles.switchRow}>
            <span>عرض غير النشطين</span>
            <input
              className={styles.switchInput}
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
            />
          </label>
        </div>

        <div className={styles.searchBox}>
          <Search className={styles.searchIconSvg} size={18} strokeWidth={2.2} aria-hidden />
          <input
            className={styles.searchInput}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث عن سائق بالاسم أو الهاتف"
          />
        </div>

        <div className={styles.driverList}>
          {loading ? (
            <p className={styles.emptyState}>جاري تحميل بيانات السائقين…</p>
          ) : drivers.length === 0 ? (
            <p className={styles.emptyState}>لا يوجد سائقون مطابقون للفلاتر الحالية.</p>
          ) : (
            drivers.map((driver) => {
              const active = driver.driverId === selectedDriverId;
              return (
                <article
                  key={driver.driverId}
                  className={`${styles.driverItem} ${active ? styles.driverItemActive : ""}`}
                >
                  <button
                    type="button"
                    className={styles.driverItemButton}
                    onClick={() => focusDriverFromSidebar(driver)}
                  >
                    <div className={styles.driverHeading}>
                      <div>
                        <h4 className={styles.driverName}>{driver.fullName}</h4>
                        <p className={styles.driverVehicle}>{formatVehicle(driver)}</p>
                      </div>
                      <span className={`${styles.statusBadge} ${getStatusClass(driver)}`}>{formatStatus(driver)}</span>
                    </div>

                    <div className={styles.driverSubRow}>
                      <span className={styles.driverPhone}>{driver.phone || "لا يوجد رقم هاتف"}</span>
                      <span className={styles.driverPhone}>
                        {hasDriverLocation(driver) ? "له موقع ظاهر على الخريطة" : "لا يوجد موقع مباشر"}
                      </span>
                    </div>
                  </button>

                  <div className={styles.driverActions}>
                    <button
                      type="button"
                      className={`${styles.driverActionButton} ${styles.driverActionSecondary}`}
                      onClick={() => openWhatsApp(driver)}
                      disabled={!driver.phone}
                    >
                      واتساب
                    </button>
                    <button
                      type="button"
                      className={`${styles.driverActionButton} ${styles.driverActionPrimary}`}
                      onClick={() => openOrderModal(driver)}
                      disabled={!driver.isOnline || driver.isBusy}
                    >
                      إضافة طلب
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className={`card ${styles.statsCard}`}>
        <div className={styles.statsHeader}>
          <h3 className={styles.statsTitle}>إحصائيات سريعة</h3>
          <span className={`${styles.socketBadge} ${socketStatusClass}`}>{socketStatusLabel}</span>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>إجمالي السائقين</span>
            <span className={`${styles.statValue} ${styles.statValuePrimary}`}>{summary.totalDrivers}</span>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>السائقون النشطون</span>
            <span className={`${styles.statValue} ${styles.statValueSuccess}`}>{summary.activeDrivers}</span>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>على الخريطة</span>
            <span className={`${styles.statValue} ${styles.statValueInfo}`}>{summary.driversOnMap}</span>
          </div>
        </div>
      </section>
    </>
  );

  return (
    <div className={styles.page}>
      <section className={`card ${styles.introCard}`}>
        <h2 className={styles.introTitle}>الخريطة الحية لتوزع السائقين</h2>
        <p className={styles.introText}>
          اعرض مواقع السائقين الحقيقية على خريطة OpenStreetMap المجانية، وتابع حالتهم الحالية، وتواصل معهم عبر واتساب أو
          أنشئ طلبًا جديدًا وتسنده مباشرة من نفس الصفحة.
        </p>
      </section>

      {notice ? <p className={styles.feedback}>{notice}</p> : null}
      {error ? <p className={`${styles.feedback} ${styles.feedbackError}`}>{error}</p> : null}

      <div className={`${styles.layoutGrid}${sidebarOpen ? ` ${styles.layoutSidebarOpen}` : ""}`}>
        <section className={`card ${styles.mapCard} ${fullscreenMap ? styles.mapCardFullscreen : ""}`}>
          <div className={styles.mapHeader}>
            <div className={styles.mapHeaderMain}>
              <button
                type="button"
                className={styles.sidebarToggleBtn}
                onClick={() => setSidebarOpen(true)}
                aria-label="فتح قائمة السائقين والخيارات"
                aria-expanded={sidebarOpen}
              >
                <PanelRightOpen size={20} strokeWidth={2.2} aria-hidden />
              </button>
              <div>
                <h3 className={styles.mapTitle}>خريطة التوزع المباشر</h3>
                <p className={styles.mapHint}>
                  تُعرض جميع السائقين على الخريطة. انقر سائقًا من القائمة للتركيز على موقعه، أو انقر اسمه على الخريطة لعرض
                  بياناته.
                </p>
                {selectedDriver ? (
                  <span className={styles.selectedBadge}>
                    المحدد الآن: {selectedDriver.fullName}{" "}
                    {hasDriverLocation(selectedDriver) ? "• موقع ظاهر" : "• بدون موقع"}
                  </span>
                ) : null}
              </div>
            </div>

            <div className={styles.mapActions}>
              <button
                type="button"
                className={`${styles.mapButton} ${styles.mapButtonPrimary}`}
                onClick={() => void loadDrivers("refresh")}
                disabled={refreshing}
              >
                {refreshing ? "جاري التحديث..." : "تحديث البيانات"}
              </button>
              <button
                type="button"
                className={`${styles.mapButton} ${styles.mapButtonSecondary}`}
                onClick={() => setFullscreenMap((current) => !current)}
              >
                {fullscreenMap ? "إغلاق ملء الشاشة" : "ملء الشاشة"}
              </button>
            </div>
          </div>

          <div className={styles.mapBody}>
            <DriversDistributionMap
              drivers={drivers.filter((driver) => driver.isOnline)}
              selectedDriverId={selectedDriverId}
              selectedDriverFocusKey={selectedDriverFocusKey}
              onSelectDriver={setSelectedDriverId}
              onOpenWhatsApp={openWhatsApp}
              onAssignOrder={openOrderModal}
              fullscreen={fullscreenMap}
            />
          </div>
        </section>

        {sidebarOpen ? (
          <button
            type="button"
            className={styles.sidebarBackdrop}
            onClick={() => setSidebarOpen(false)}
            aria-label="إغلاق قائمة السائقين"
          />
        ) : null}

        <aside className={styles.sidebarColumn}>{sidebarPanel}</aside>
      </div>

      {modalDriver ? (
        <div className={styles.modalBackdrop} onClick={closeOrderModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>
                  {orderModalMode === "choose"
                    ? "إسناد طلب للسائق"
                    : orderModalMode === "new"
                      ? "طلب جديد وإسناده مباشرة"
                      : "إسناد طلب معلق"}
                </h3>
                <p className={styles.modalSubtitle}>
                  السائق المحدد: {modalDriver.fullName} — {formatVehicle(modalDriver)}
                </p>
              </div>
              <button type="button" className={styles.modalClose} onClick={closeOrderModal} aria-label="إغلاق">
                ×
              </button>
            </div>

            {orderModalMode === "choose" ? (
              <>
                <p className={styles.modalIntro}>اختر نوع الإسناد قبل المتابعة:</p>
                <div className={styles.modeChoices}>
                  <button type="button" className={styles.modeChoiceCard} onClick={openNewOrderForm}>
                    <span className={styles.modeChoiceTitle}>طلب جديد</span>
                    <span className={styles.modeChoiceHint}>إنشاء طلب جديد وإسناده مباشرة لهذا السائق.</span>
                  </button>
                  <button type="button" className={styles.modeChoiceCard} onClick={openPendingOrdersForm}>
                    <span className={styles.modeChoiceTitle}>طلب معلق</span>
                    <span className={styles.modeChoiceHint}>اختيار طلب معلق من غرفة الطلبات وإسناده للسائق.</span>
                  </button>
                </div>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelButton} onClick={closeOrderModal}>
                    إلغاء
                  </button>
                </div>
              </>
            ) : orderModalMode === "new" ? (
              <form onSubmit={submitOrder}>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.label}>اسم الزبون</span>
                    <input
                      className={styles.input}
                      value={form.customerName}
                      onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
                      placeholder="اختياري إذا كان رقم الهاتف موجودًا"
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>هاتف الزبون</span>
                    <input
                      className={styles.input}
                      value={form.customerPhone}
                      onChange={(event) => setForm((current) => ({ ...current, customerPhone: event.target.value }))}
                      placeholder="مثال: 0944xxxxxx"
                    />
                  </label>

                  <label className={styles.fieldWide}>
                    <span className={styles.label}>عنوان الانطلاق</span>
                    <input
                      className={styles.input}
                      required
                      value={form.pickupAddress}
                      onChange={(event) => setForm((current) => ({ ...current, pickupAddress: event.target.value }))}
                      placeholder="أدخل موقع الانطلاق"
                    />
                  </label>

                  <label className={styles.fieldWide}>
                    <span className={styles.label}>الوجهة</span>
                    <input
                      className={styles.input}
                      required
                      value={form.dropoffAddress}
                      onChange={(event) => setForm((current) => ({ ...current, dropoffAddress: event.target.value }))}
                      placeholder="أدخل الوجهة"
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>الأجرة</span>
                    <input
                      className={styles.input}
                      required
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                      placeholder="0"
                    />
                  </label>

                  <label className={styles.fieldWide}>
                    <span className={styles.label}>ملاحظات</span>
                    <textarea
                      className={styles.textarea}
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="ملاحظات إضافية للسائق أو للطلب"
                    />
                  </label>
                </div>

                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelButton} onClick={() => setOrderModalMode("choose")}>
                    رجوع
                  </button>
                  <button type="button" className={styles.cancelButton} onClick={closeOrderModal}>
                    إلغاء
                  </button>
                  <button type="submit" className={styles.submitButton} disabled={submittingOrder}>
                    {submittingOrder ? "جاري الإنشاء والإسناد..." : "إنشاء الطلب وإسناده"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className={styles.pendingToolbar}>
                  <p className={styles.pendingHint}>اختر طلبًا معلقًا من القائمة لإسناده إلى السائق المحدد.</p>
                  <button
                    type="button"
                    className={`${styles.mapButton} ${styles.mapButtonSecondary}`}
                    onClick={() => void loadPendingOrders()}
                    disabled={loadingPendingOrders}
                  >
                    {loadingPendingOrders ? "جاري التحديث..." : "تحديث القائمة"}
                  </button>
                </div>

                <div className={styles.pendingList}>
                  {loadingPendingOrders ? (
                    <p className={styles.emptyState}>جاري تحميل الطلبات المعلقة…</p>
                  ) : pendingOrders.length === 0 ? (
                    <p className={styles.emptyState}>لا توجد طلبات معلقة حاليًا.</p>
                  ) : (
                    pendingOrders.map((order) => {
                      const compatible = orderMatchesDriver(order, modalDriver);
                      const selected = order.id === selectedPendingOrderId;
                      return (
                        <button
                          key={order.id}
                          type="button"
                          className={`${styles.pendingItem} ${selected ? styles.pendingItemSelected : ""} ${
                            !compatible ? styles.pendingItemDisabled : ""
                          }`}
                          onClick={() => {
                            if (!compatible) return;
                            setSelectedPendingOrderId(order.id);
                          }}
                          disabled={!compatible || submittingOrder}
                        >
                          <div className={styles.pendingItemHead}>
                            <span className={styles.pendingItemCustomer}>
                              {order.customerName?.trim() || "زبون"}
                            </span>
                            <span className={styles.pendingItemAmount}>{formatOrderAmount(order.amount)}</span>
                          </div>
                          <p className={styles.pendingItemRoute}>
                            من: {order.pickupAddress}
                            <br />
                            إلى: {order.dropoffAddress}
                          </p>
                          <div className={styles.pendingItemMeta}>
                            <span>المنسق: {order.coordinatorName}</span>
                            <span>السيارة: {vehicleRequirementLabel(order.vehicleRequirement)}</span>
                          </div>
                          {!compatible ? (
                            <span className={styles.pendingItemWarning}>لا يطابق نوع سيارة السائق</span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelButton} onClick={() => setOrderModalMode("choose")}>
                    رجوع
                  </button>
                  <button type="button" className={styles.cancelButton} onClick={closeOrderModal}>
                    إلغاء
                  </button>
                  <button
                    type="button"
                    className={styles.submitButton}
                    disabled={submittingOrder || !selectedPendingOrderId}
                    onClick={() => void assignPendingOrder()}
                  >
                    {submittingOrder ? "جاري الإسناد..." : "إسناد الطلب المحدد"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
