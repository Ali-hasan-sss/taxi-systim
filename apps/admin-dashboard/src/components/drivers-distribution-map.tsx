"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type { AdminLiveDriver } from "../lib/api";
import styles from "./drivers-distribution-map.module.css";

const DEFAULT_CENTER: [number, number] = [34.8894, 35.8866];
const DEFAULT_ZOOM = 10;
const DRIVER_MARKER_ATTR = "data-driver-marker-id";

type MapDriver = AdminLiveDriver & { lat: number; lng: number };

function hasDriverLocation(driver: AdminLiveDriver): driver is MapDriver {
  return (
    typeof driver.lat === "number" &&
    Number.isFinite(driver.lat) &&
    typeof driver.lng === "number" &&
    Number.isFinite(driver.lng) &&
    Math.abs(driver.lat) <= 90 &&
    Math.abs(driver.lng) <= 180
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatVehicle(driver: AdminLiveDriver): string {
  const pieces = [driver.vehicleBrand, driver.vehicleColor, driver.vehicleKind === "PUBLIC" ? "عامة" : driver.vehicleKind === "PRIVATE" ? "خاصة" : driver.vehicleKind === "VIP" ? "VIP" : null]
    .map((item) => item?.trim())
    .filter(Boolean);
  return pieces.length > 0 ? pieces.join(" - ") : "لا توجد بيانات سيارة";
}

function statusLabel(driver: AdminLiveDriver): string {
  if (!driver.isOnline) return "غير نشط";
  return driver.isBusy ? "مشغول الآن" : "متاح الآن";
}

function estimateMarkerWidth(label: string): number {
  return Math.min(260, Math.max(96, label.length * 10 + 36));
}

function buildMarkerIcon(driver: AdminLiveDriver, selected: boolean) {
  const label = escapeHtml(driver.fullName?.trim() || "سائق");
  const toneClass = driver.status === "busy" ? styles.markerBusy : styles.markerOnline;
  const selectedClass = selected ? styles.markerSelected : "";
  const width = estimateMarkerWidth(driver.fullName?.trim() || "سائق");

  return L.divIcon({
    className: `driver-distribution-marker ${styles.markerIcon}`,
    html: `<button type="button" class="${styles.markerBubble} ${toneClass} ${selectedClass}" ${DRIVER_MARKER_ATTR}="${driver.driverId}" aria-label="${label}">${label}</button>`,
    iconSize: [width, 44],
    iconAnchor: [width / 2, 22]
  });
}

function DriverMapPopup(props: {
  driver: MapDriver;
  map: L.Map;
  onOpenWhatsApp: (driver: AdminLiveDriver) => void;
  onAssignOrder: (driver: AdminLiveDriver) => void;
  onClose: () => void;
}) {
  const { driver, map, onOpenWhatsApp, onAssignOrder, onClose } = props;
  const [position, setPosition] = useState({ x: 0, y: 0, flipBelow: false });

  useEffect(() => {
    const updatePosition = () => {
      const point = map.latLngToContainerPoint([driver.lat, driver.lng]);
      setPosition({
        x: point.x,
        y: point.y,
        flipBelow: point.y < 190
      });
    };

    updatePosition();
    map.on("move", updatePosition);
    map.on("zoom", updatePosition);
    map.on("resize", updatePosition);

    return () => {
      map.off("move", updatePosition);
      map.off("zoom", updatePosition);
      map.off("resize", updatePosition);
    };
  }, [driver.lat, driver.lng, map]);

  return (
    <div
      className={`${styles.mapPopup} ${position.flipBelow ? styles.mapPopupBelow : ""}`}
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-label={`معلومات السائق ${driver.fullName}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" className={styles.mapPopupClose} onClick={onClose} aria-label="إغلاق">
        ×
      </button>

      <div className={styles.popupCard}>
        <h3 className={styles.popupTitle}>{driver.fullName}</h3>

        <div className={styles.popupMeta}>
          <div className={styles.popupMetaRow}>
            <span className={styles.popupLabel}>الهاتف</span>
            <span className={styles.popupValue}>{driver.phone || "لا يوجد رقم"}</span>
          </div>
          <div className={styles.popupMetaRow}>
            <span className={styles.popupLabel}>السيارة</span>
            <span className={styles.popupValue}>{formatVehicle(driver)}</span>
          </div>
          <div className={styles.popupMetaRow}>
            <span className={styles.popupLabel}>رقم اللوحة</span>
            <span className={styles.popupValue}>{driver.vehicleNumber || "غير مسجل"}</span>
          </div>
        </div>

        <span
          className={`${styles.popupStatus} ${
            driver.status === "busy" ? styles.popupStatusBusy : styles.popupStatusOnline
          }`}
        >
          {statusLabel(driver)}
        </span>

        <div className={styles.popupActions}>
          <button
            type="button"
            className={`${styles.popupActionButton} ${styles.popupActionSecondary}`}
            onClick={() => onOpenWhatsApp(driver)}
            disabled={!driver.phone}
          >
            واتساب
          </button>
          <button
            type="button"
            className={`${styles.popupActionButton} ${styles.popupActionPrimary}`}
            onClick={() => {
              onClose();
              onAssignOrder(driver);
            }}
            disabled={!driver.isOnline || driver.isBusy}
          >
            إضافة طلب
          </button>
        </div>
      </div>

      <span className={styles.mapPopupTip} aria-hidden="true" />
    </div>
  );
}

export default function DriversDistributionMap(props: {
  drivers: AdminLiveDriver[];
  selectedDriverId: string | null;
  selectedDriverFocusKey: number;
  onOpenWhatsApp: (driver: AdminLiveDriver) => void;
  onAssignOrder: (driver: AdminLiveDriver) => void;
  fullscreen: boolean;
}) {
  const { drivers, selectedDriverId, selectedDriverFocusKey, onOpenWhatsApp, onAssignOrder, fullscreen } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const lastFocusKeyRef = useRef(0);
  const initialViewAppliedRef = useRef(false);
  const setPopupDriverIdRef = useRef<(driverId: string | null) => void>(() => undefined);
  const [popupDriverId, setPopupDriverId] = useState<string | null>(null);
  const mapDrivers = useMemo(() => drivers.filter(hasDriverLocation), [drivers]);
  const popupDriver = useMemo(
    () => mapDrivers.find((driver) => driver.driverId === popupDriverId) ?? null,
    [mapDrivers, popupDriverId]
  );

  setPopupDriverIdRef.current = setPopupDriverId;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const safeContainer = container as HTMLDivElement & { _leaflet_id?: number };
    if (safeContainer._leaflet_id) {
      delete safeContainer._leaflet_id;
      safeContainer.innerHTML = "";
    }

    const map = L.map(container, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false
    });

    mapRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    L.control.zoom({ position: "topleft" }).addTo(map);

    const handleContainerClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const markerButton = target?.closest(`[${DRIVER_MARKER_ATTR}]`);
      if (markerButton) {
        event.preventDefault();
        event.stopPropagation();
        const driverId = markerButton.getAttribute(DRIVER_MARKER_ATTR);
        if (driverId) {
          setPopupDriverIdRef.current(driverId);
        }
        return;
      }

      if (target?.closest(".leaflet-control")) return;
      setPopupDriverIdRef.current(null);
    };

    container.addEventListener("click", handleContainerClick, true);

    return () => {
      container.removeEventListener("click", handleContainerClick, true);
      markersRef.current.clear();
      markersLayerRef.current?.clearLayers();
      markersLayerRef.current = null;
      map.remove();
      mapRef.current = null;
      initialViewAppliedRef.current = false;
      safeContainer.innerHTML = "";
      delete safeContainer._leaflet_id;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const timer = window.setTimeout(() => map.invalidateSize(), 180);
    return () => window.clearTimeout(timer);
  }, [fullscreen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || initialViewAppliedRef.current || mapDrivers.length === 0) return;

    initialViewAppliedRef.current = true;
    const bounds = L.latLngBounds(mapDrivers.map((driver) => [driver.lat, driver.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [42, 42], maxZoom: 13, animate: false });
    if (mapDrivers.length === 1) {
      map.setZoom(Math.max(map.getZoom(), 16));
    }
  }, [mapDrivers]);

  useEffect(() => {
    const markersLayer = markersLayerRef.current;
    if (!markersLayer) return;

    const activeIds = new Set(mapDrivers.map((driver) => driver.driverId));

    for (const [driverId, marker] of markersRef.current) {
      if (!activeIds.has(driverId)) {
        markersLayer.removeLayer(marker);
        markersRef.current.delete(driverId);
      }
    }

    for (const driver of mapDrivers) {
      const isSelected = driver.driverId === selectedDriverId;
      let marker = markersRef.current.get(driver.driverId);

      if (!marker) {
        marker = L.marker([driver.lat, driver.lng], {
          icon: buildMarkerIcon(driver, isSelected),
          interactive: true
        });

        marker.addTo(markersLayer);
        markersRef.current.set(driver.driverId, marker);
      } else {
        marker.setLatLng([driver.lat, driver.lng]);
        marker.setIcon(buildMarkerIcon(driver, isSelected));
      }
    }
  }, [mapDrivers, selectedDriverId]);

  useEffect(() => {
    if (!popupDriverId) return;
    if (!mapDrivers.some((driver) => driver.driverId === popupDriverId)) {
      setPopupDriverId(null);
    }
  }, [mapDrivers, popupDriverId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedDriverFocusKey <= 0) return;

    const focusRequested = selectedDriverFocusKey > lastFocusKeyRef.current;
    lastFocusKeyRef.current = selectedDriverFocusKey;
    if (!focusRequested || !selectedDriverId) return;

    setPopupDriverId(null);

    const selected = mapDrivers.find((driver) => driver.driverId === selectedDriverId);
    if (!selected) return;

    map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 16), {
      animate: true,
      duration: 0.55
    });
  }, [mapDrivers, selectedDriverFocusKey, selectedDriverId]);

  return (
    <div className={`${styles.mapRoot} ${fullscreen ? styles.mapRootFullscreen : ""}`}>
      <div ref={containerRef} className={styles.mapCanvas} />

      <div className={styles.mapOverlay}>
        {popupDriver && mapRef.current ? (
          <DriverMapPopup
            driver={popupDriver}
            map={mapRef.current}
            onOpenWhatsApp={onOpenWhatsApp}
            onAssignOrder={onAssignOrder}
            onClose={() => setPopupDriverId(null)}
          />
        ) : null}
      </div>

      {mapDrivers.length === 0 ? (
        <div className={styles.emptyOverlay}>لا توجد مواقع مباشرة معروضة الآن. فعّل إظهار غير النشطين لمراجعة القائمة الكاملة.</div>
      ) : null}
    </div>
  );
}
