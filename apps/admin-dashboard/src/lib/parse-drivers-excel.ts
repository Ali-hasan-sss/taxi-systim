import * as XLSX from "xlsx";
import type { VehicleKind } from "./api";

export type ParsedDriverImportRow = {
  fullName: string;
  phone: string;
  password: string;
  vehicleBrand?: string | null;
  vehicleKind?: VehicleKind | null;
  vehicleColor?: string | null;
  plateNumber?: string | null;
};

export type ParseDriversExcelResult = {
  rows: ParsedDriverImportRow[];
  errors: string[];
};

const HEADER_ALIASES: Record<string, keyof ParsedDriverImportRow | "vehicleKind"> = {
  الاسم: "fullName",
  name: "fullName",
  fullname: "fullName",
  "الاسم الكامل": "fullName",
  الهاتف: "phone",
  phone: "phone",
  mobile: "phone",
  "رقم الهاتف": "phone",
  "نوع السيارة": "vehicleKind",
  vehiclekind: "vehicleKind",
  "vehicle kind": "vehicleKind",
  kind: "vehicleKind",
  "ماركة السيارة": "vehicleBrand",
  "براند السيارة": "vehicleBrand",
  vehiclebrand: "vehicleBrand",
  brand: "vehicleBrand",
  "لون السيارة": "vehicleColor",
  vehiclecolor: "vehicleColor",
  color: "vehicleColor",
  اللون: "vehicleColor",
  "رقم اللوحة": "plateNumber",
  platnumber: "plateNumber",
  platenumber: "plateNumber",
  plate: "plateNumber",
  "كلمة المرور": "password",
  password: "password",
  pass: "password"
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  return String(value).trim();
}

function parseVehicleKind(raw: string): VehicleKind | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === "1") return "PRIVATE";
  if (v === "2") return "PUBLIC";
  if (v === "public" || v === "عامة" || v === "عام") return "PUBLIC";
  if (v === "private" || v === "خاصة" || v === "خاص") return "PRIVATE";
  return null;
}

function mapHeaders(headerRow: unknown[]): Map<number, keyof ParsedDriverImportRow | "vehicleKind"> {
  const map = new Map<number, keyof ParsedDriverImportRow | "vehicleKind">();
  headerRow.forEach((cell, index) => {
    const key = HEADER_ALIASES[normalizeHeader(cell)];
    if (key) map.set(index, key);
  });
  return map;
}

export function parseDriversExcelBuffer(buffer: ArrayBuffer): ParseDriversExcelResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ["الملف لا يحتوي على أي ورقة عمل."] };
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { rows: [], errors: ["تعذر قراءة ورقة العمل الأولى."] };
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (matrix.length < 2) {
    return { rows: [], errors: ["يجب أن يحتوي الملف على صف عناوين وصف بيانات واحد على الأقل."] };
  }

  const headerMap = mapHeaders(matrix[0] ?? []);
  const required = ["fullName", "phone", "password"] as const;
  const missing = required.filter((field) => ![...headerMap.values()].includes(field));
  if (missing.length) {
    return {
      rows: [],
      errors: [
        "الأعمدة الإلزامية ناقصة: الاسم، الهاتف، كلمة المرور. تأكد من صف العناوين أو نزّل القالب الجاهز."
      ]
    };
  }

  const rows: ParsedDriverImportRow[] = [];
  const errors: string[] = [];

  for (let lineIndex = 1; lineIndex < matrix.length; lineIndex++) {
    const line = matrix[lineIndex] ?? [];
    const draft: Partial<ParsedDriverImportRow> & { vehicleKind?: VehicleKind | null } = {};
    let vehicleKindRaw = "";

    headerMap.forEach((field, colIndex) => {
      const text = cellText(line[colIndex]);
      if (!text) return;
      if (field === "vehicleKind") {
        vehicleKindRaw = text;
        draft.vehicleKind = parseVehicleKind(text);
        return;
      }
      draft[field] = text;
    });

    const fullName = draft.fullName?.trim() ?? "";
    const phone = draft.phone?.trim() ?? "";
    const password = draft.password?.trim() ?? "";

    if (!fullName && !phone && !password) continue;

    const rowNumber = lineIndex + 1;
    if (!fullName) {
      errors.push(`الصف ${rowNumber}: الاسم مطلوب.`);
      continue;
    }
    if (!phone) {
      errors.push(`الصف ${rowNumber}: الهاتف مطلوب.`);
      continue;
    }
    if (!password || password.length < 6) {
      errors.push(`الصف ${rowNumber}: كلمة المرور مطلوبة (6 أحرف على الأقل).`);
      continue;
    }
    if (vehicleKindRaw && draft.vehicleKind == null) {
      errors.push(`الصف ${rowNumber}: نوع السيارة غير صالح — استخدم 1 للخاصة أو 2 للعامة.`);
      continue;
    }

    rows.push({
      fullName,
      phone,
      password,
      vehicleBrand: draft.vehicleBrand?.trim() || null,
      vehicleKind: draft.vehicleKind ?? null,
      vehicleColor: draft.vehicleColor?.trim() || null,
      plateNumber: draft.plateNumber?.trim() || null
    });
  }

  if (!rows.length && !errors.length) {
    errors.push("لم يُعثر على صفوف سائقين صالحة في الملف.");
  }

  return { rows, errors };
}

export function downloadDriversImportTemplate() {
  const headers = ["الاسم", "الهاتف", "براند السيارة", "نوع السيارة", "لون السيارة", "رقم اللوحة", "كلمة المرور"];
  const sample = ["أحمد محمد", "0944123456", "تويوتا", "2", "أبيض", "123456", "driver123"];
  const sheet = XLSX.utils.aoa_to_sheet([headers, sample]);
  sheet["!cols"] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "السائقون");
  XLSX.writeFile(workbook, "drivers-import-template.xlsx");
}
