type NominatimReverse = {
  name?: string;
  address?: Record<string, string | undefined>;
};

function cleanPart(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length < 2) return null;
  if (/^[\d\s\-/]+$/.test(text)) return null;
  return text;
}

function joinUnique(parts: Array<string | null | undefined>): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const text = cleanPart(part);
    if (!text) continue;
    const key = text.toLocaleLowerCase("ar");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  if (out.length === 0) return null;
  return out.join("، ").slice(0, 180);
}

export function sanitizePlaceName(value: string | null | undefined): string | null {
  return joinUnique([value]);
}

type PhotonFeature = {
  properties?: {
    name?: string;
    street?: string;
    city?: string;
    district?: string;
    locality?: string;
    osm_key?: string;
  };
};

const LANDMARK_KEY_SET = new Set([
  "amenity",
  "shop",
  "tourism",
  "leisure",
  "office",
  "healthcare",
  "historic",
  "public_transport"
]);

function photonPlace(properties: PhotonFeature["properties"], includeArea: boolean): string | null {
  if (!properties) return null;
  const name = sanitizePlaceName(properties.name);
  const street = sanitizePlaceName(properties.street);
  const area = sanitizePlaceName(properties.locality || properties.district || properties.city);
  if (name) return joinUnique([name, street]);
  return joinUnique([street, includeArea ? area : null]);
}

async function nearestFromPhoton(lat: number, lng: number): Promise<string | null> {
  const url =
    `https://photon.komoot.io/reverse?lon=${encodeURIComponent(String(lng))}` +
    `&lat=${encodeURIComponent(String(lat))}&limit=8`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TaxiBro/1.0 (telegram-pickup-landmark)"
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const features = data.features ?? [];
  const landmark = features.find((feature) => {
    const key = feature.properties?.osm_key;
    return Boolean(key && LANDMARK_KEY_SET.has(key) && sanitizePlaceName(feature.properties?.name));
  });
  if (landmark) return photonPlace(landmark.properties, false);
  const street = features.find((feature) => photonPlace(feature.properties, true));
  return street ? photonPlace(street.properties, true) : null;
}

/** أقرب معلم مسمى لنقطة الزبون. لا يعيد إحداثيات. */
export async function nearestLandmarkName(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const photon = await nearestFromPhoton(lat, lng);
      if (photon) return photon;
    } catch {
      /* إعادة المحاولة مرة واحدة */
    }
  }
  return reverseGeocodePlace(lat, lng);
}

/** اسم المكان أو أقرب معلم من إحداثيات الخريطة. يفشل بصمت إن تعذر الاستنتاج. */
export async function reverseGeocodePlace(lat: number, lng: number): Promise<string | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lng))}&zoom=18&addressdetails=1&accept-language=ar`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "ar",
        "User-Agent": "TaxiBro/1.0 (driver-arrival-notice)"
      },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimReverse;
    const address = data.address ?? {};
    return joinUnique([
      data.name,
      address.amenity,
      address.shop,
      address.tourism,
      address.leisure,
      address.building,
      address.road,
      address.neighbourhood,
      address.suburb,
      address.quarter,
      address.city || address.town || address.village
    ]);
  } catch {
    return null;
  }
}
