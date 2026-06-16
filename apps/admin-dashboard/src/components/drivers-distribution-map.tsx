"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import type { AdminLiveDriver } from "../lib/api";
import styles from "./drivers-distribution-map.module.css";

const DEFAULT_CENTER: [number, number] = [34.8894, 35.8866];
const DEFAULT_ZOOM = 10;

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

function buildMarkerIcon(driver: AdminLiveDriver, selected: boolean) {
  const label = escapeHtml(driver.fullName?.trim() || "سائق");
  const toneClass = driver.status === "busy" ? styles.markerBusy : styles.markerOnline;
  const selectedClass = selected ? styles.markerSelected : "";

  return L.divIcon({
    className: "",
    html: `<div class="${styles.markerBubble} ${toneClass} ${selectedClass}">${label}</div>`,
    iconSize: [86, 40],
    iconAnchor: [43, 20],
    popupAnchor: [0, -18]
  });
}

function createPopupContent(
  driver: AdminLiveDriver,
  onOpenWhatsApp: (driver: AdminLiveDriver) => void,
  onAssignOrder: (driver: AdminLiveDriver) => void
) {
  const root = document.createElement("div");
  root.className = styles.popupCard;

  const title = document.createElement("h3");
  title.className = styles.popupTitle;
  title.textContent = driver.fullName;
  root.appendChild(title);

  const meta = document.createElement("div");
  meta.className = styles.popupMeta;

  const rows: Array<[string, string]> = [
    ["الهاتف", driver.phone || "لا يوجد رقم"],
    ["السيارة", formatVehicle(driver)],
    ["رقم اللوحة", driver.vehicleNumber || "غير مسجل"]
  ];

  for (const [labelText, valueText] of rows) {
    const row = document.createElement("div");
    row.className = styles.popupMetaRow;

    const label = document.createElement("span");
    label.className = styles.popupLabel;
    label.textContent = labelText;

    const value = document.createElement("span");
    value.className = styles.popupValue;
    value.textContent = valueText;

    row.appendChild(label);
    row.appendChild(value);
    meta.appendChild(row);
  }

  root.appendChild(meta);

  const status = document.createElement("span");
  status.className = `${styles.popupStatus} ${
    driver.status === "busy" ? styles.popupStatusBusy : styles.popupStatusOnline
  }`;
  status.textContent = statusLabel(driver);
  root.appendChild(status);

  const actions = document.createElement("div");
  actions.className = styles.popupActions;

  const whatsAppButton = document.createElement("button");
  whatsAppButton.type = "button";
  whatsAppButton.className = `${styles.popupActionButton} ${styles.popupActionSecondary}`;
  whatsAppButton.textContent = "واتساب";
  whatsAppButton.disabled = !driver.phone;
  whatsAppButton.addEventListener("click", () => onOpenWhatsApp(driver));

  const assignButton = document.createElement("button");
  assignButton.type = "button";
  assignButton.className = `${styles.popupActionButton} ${styles.popupActionPrimary}`;
  assignButton.textContent = "إضافة طلب";
  assignButton.disabled = !driver.isOnline || driver.isBusy;
  assignButton.addEventListener("click", () => onAssignOrder(driver));

  actions.appendChild(whatsAppButton);
  actions.appendChild(assignButton);
  root.appendChild(actions);

  return root;
}

export default function DriversDistributionMap(props: {
  drivers: AdminLiveDriver[];
  selectedDriverId: string | null;
  selectedDriverFocusKey: number;
  onSelectDriver: (driverId: string) => void;
  onOpenWhatsApp: (driver: AdminLiveDriver) => void;
  onAssignOrder: (driver: AdminLiveDriver) => void;
  fullscreen: boolean;
}) {
  const { drivers, selectedDriverId, selectedDriverFocusKey, onSelectDriver, onOpenWhatsApp, onAssignOrder, fullscreen } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const mapDrivers = useMemo(() => drivers.filter(hasDriverLocation), [drivers]);

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

    return () => {
      markersLayerRef.current?.clearLayers();
      markersLayerRef.current = null;
      map.remove();
      mapRef.current = null;
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
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    for (const driver of mapDrivers) {
      const marker = L.marker([driver.lat, driver.lng], {
        icon: buildMarkerIcon(driver, driver.driverId === selectedDriverId)
      });

      marker.on("click", () => onSelectDriver(driver.driverId));
      marker.bindPopup(createPopupContent(driver, onOpenWhatsApp, onAssignOrder));
      marker.addTo(markersLayer);

      if (driver.driverId === selectedDriverId) {
        marker.openPopup();
      }
    }

    const selected = mapDrivers.find((driver) => driver.driverId === selectedDriverId);
    if (selected) {
      map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 16), {
        animate: true,
        duration: 0.55
      });
      return;
    }

    if (mapDrivers.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    const bounds = L.latLngBounds(mapDrivers.map((driver) => [driver.lat, driver.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [42, 42], maxZoom: 13 });
    if (mapDrivers.length === 1) {
      map.setZoom(Math.max(map.getZoom(), 16));
    }
  }, [mapDrivers, onAssignOrder, onOpenWhatsApp, onSelectDriver, selectedDriverFocusKey, selectedDriverId]);

  return (
    <div className={styles.mapRoot}>
      <div ref={containerRef} className={styles.mapCanvas} />

      {mapDrivers.length === 0 ? (
        <div className={styles.emptyOverlay}>لا توجد مواقع مباشرة معروضة الآن. فعّل إظهار غير النشطين لمراجعة القائمة الكاملة.</div>
      ) : null}
    </div>
  );
}
