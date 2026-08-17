/* -------------------------------------------------------------------------- */
/*                    SHARED VAMOSYS GPS PROVIDER CLIENT                      */
/* -------------------------------------------------------------------------- */
/* Single place for the third-party Vamosys fleet-GPS integration. Previously
   inlined (and duplicated) inside Adminordercontroller.js — extracted here so
   both the admin fleet-wide view and the new client per-order tracking share
   one implementation instead of drifting apart.

   getLiveLocationsForRegistrationNumbers() is the client-safe entry point: it
   never returns the raw Vamosys payload, which also carries driver contact
   details, device/SIM identifiers, fuel/voltage/temperature telemetry and
   subscription metadata that must never reach a customer. */

const VAMOSYS_USER_ID = "ADINN12";
const VAMOSYS_GROUP_ID = "ADINN12";

/* The key itself is valid 365 days server-side; caching an hour just avoids
   re-requesting it on every single poll. */
const API_KEY_TTL_MS = 60 * 60 * 1000;
const STALE_AFTER_MS = 10 * 60 * 1000;

let cachedApiKey = null;
let cachedApiKeyAt = 0;

async function fetchVamosysApiKey() {
  if (cachedApiKey && Date.now() - cachedApiKeyAt < API_KEY_TTL_MS) {
    return cachedApiKey;
  }

  const time = Math.floor(Date.now() / 1000);
  const url = `https://api.vamosys.com/getApiKey?userId=${VAMOSYS_USER_ID}&validDays=365&time=${time}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error((await response.text()) || "Vamosys API key request failed");
  }

  const data = await response.json();
  cachedApiKey = data.apiKey || "";
  cachedApiKeyAt = Date.now();

  return cachedApiKey;
}

async function fetchAllVehicleLocations() {
  const apiKey = await fetchVamosysApiKey();
  const url = `http://api.vamosys.com/apiMobile/getVehicleLocations?apiKey=${apiKey}&userId=${VAMOSYS_USER_ID}&groupId=${VAMOSYS_GROUP_ID}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error((await response.text()) || "Vamosys locations request failed");
  }

  const data = await response.json();
  return data?.[0]?.vehicleLocations || [];
}

const POSITION_LABEL = { M: "Moving", P: "Parked", S: "Idle" };

function toClientSafeLocation(entry) {
  const lastCommMs = Number(entry.lastComunicationTime) || 0;

  return {
    registrationNumber: entry.vehicleId || entry.regNo || "",
    latitude: Number(entry.latitude ?? entry.lat),
    longitude: Number(entry.longitude ?? entry.lng),
    address: entry.address || "",
    speedKmh: Number(entry.speed) || 0,
    status: POSITION_LABEL[entry.position] || "Unknown",
    distanceCoveredKm: Number(entry.distanceCovered) || 0,
    lastUpdatedAt: lastCommMs ? new Date(lastCommMs).toISOString() : null,
    isStale: lastCommMs ? Date.now() - lastCommMs > STALE_AFTER_MS : true,
  };
}

/**
 * Only the given order's own vehicles, mapped through the client-safe
 * allowlist above — never the fleet-wide raw response.
 */
async function getLiveLocationsForRegistrationNumbers(registrationNumbers) {
  if (!registrationNumbers || !registrationNumbers.length) return [];

  const wanted = new Set(registrationNumbers);
  const all = await fetchAllVehicleLocations();

  return all
    .filter((v) => wanted.has(v.vehicleId) || wanted.has(v.regNo))
    .map(toClientSafeLocation);
}

/* ── Day-wise driving summary (moving/parked/idle/no-data breakdown) ──── */
/* A DIFFERENT, heavier Vamosys endpoint (getVehicleHistory) than the live-
   position one above — a full day of raw GPS pings (multi-MB, ~1500+
   records for one vehicle/day). Only a handful of top-level aggregate
   fields are ever read out of it; the per-ping array is discarded. Cached
   server-side since re-fetching this on every live-location poll would be
   wasteful — this is deliberately its own, separately-polled endpoint. */

const HISTORY_CACHE_TTL_MS = 3 * 60 * 1000;
const historyCache = new Map(); // `${reg}:${day}` -> { at, data }

function dayWindowIST(dayKey) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const fromDateUTC = new Date(`${dayKey}T00:00:00+05:30`).getTime();
  const toDateUTC = fromDateUTC + DAY_MS - 1000;
  return { fromDateUTC, toDateUTC };
}

async function reverseGeocode(latLngRaw) {
  const [lat, lon] = String(latLngRaw || "").split(",").map((s) => s.trim());
  if (!lat || !lon) return "";

  try {
    /* Nominatim's usage policy rejects requests with no identifying
       User-Agent (confirmed live: a plain fetch() gets a 403) — Node's
       fetch sends none by default, unlike axios (used elsewhere in this
       backend for the same service), which is why this needs one explicitly. */
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { "User-Agent": "RoadshowAdmin-ClientTracking/1.0" } }
    );
    if (!response.ok) return "";
    const data = await response.json();
    return data?.display_name || "";
  } catch {
    return "";
  }
}

async function fetchVehicleDayHistoryRaw(registrationNumber, dayKey) {
  const { fromDateUTC, toDateUTC } = dayWindowIST(dayKey);
  const url =
    `https://gpsvtsprobend.vamosys.com/getVehicleHistory?userId=${VAMOSYS_USER_ID}` +
    `&vehicleId=${encodeURIComponent(registrationNumber)}` +
    `&fromDateUTC=${fromDateUTC}&toDateUTC=${toDateUTC}&interval=-1`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error((await response.text()) || "Vamosys history request failed");
  }

  return response.json();
}

/**
 * Client-safe, cached driving summary for one vehicle/day. Explicitly
 * excludes driver contact (driverName/driverMobile), fuel levels, odometer
 * readings, idle/parking event counts, and every other internal fleet field
 * the raw response carries — only the aggregate time/distance/speed figures
 * and the two (reverse-geocoded) location addresses survive.
 */
async function getDrivingSummaryForDay(registrationNumber, dayKey) {
  const cacheKey = `${registrationNumber}:${dayKey}`;
  const cached = historyCache.get(cacheKey);

  if (cached && Date.now() - cached.at < HISTORY_CACHE_TTL_MS) {
    return cached.data;
  }

  const raw = await fetchVehicleDayHistoryRaw(registrationNumber, dayKey);

  const [startAddress, endAddress] = await Promise.all([
    reverseGeocode(raw.startLocation),
    reverseGeocode(raw.endLocation),
  ]);

  const summary = {
    movingTimeMs: Number(raw.totalRunningTime) || 0,
    parkedTimeMs: Number(raw.totalParkedTime) || 0,
    idleTimeMs: Number(raw.totalIdleTime) || 0,
    noDataTimeMs: Number(raw.totalNoDataTime) || 0,
    tripDistanceKm: Number(raw.tripDistance) || 0,
    avgSpeedKmh: Number(raw.avgSpeed) || 0,
    topSpeedKmh: Number(raw.topSpeed) || 0,
    overSpeedInstances: Number(raw.overSpeedInstances) || 0,
    overSpeedLimitKmh: Number(raw.overSpeedLimit) || 0,
    startAddress,
    endAddress,
    vehicleMode: raw.vehicleMode || "",
  };

  historyCache.set(cacheKey, { at: Date.now(), data: summary });

  return summary;
}

/* ── Public animated-route embed (speedometer + moving marker) ─────────── */
/* Vamosys issues a short-lived "track" id per vehicle via getVehicleExp,
   which is then plugged into their own public embed URL
   (gpsvts.vamosys.com/gps/public/track) — the same widget the admin
   OnRoadTab iframes in directly. Moved server-side here (rather than
   calling getVehicleExp from the browser the way the admin page does) so
   the public client-tracking page never ships Vamosys account params
   (mailId/phone/userId) in its bundle — only the resulting track id, which
   is safe to embed. */
const ROUTE_TRACK_CACHE_TTL_MS = 5 * 60 * 1000;
const routeTrackCache = new Map(); // regNo -> { at, trackId }

async function getRouteTrackId(registrationNumber) {
  const cached = routeTrackCache.get(registrationNumber);

  if (cached && Date.now() - cached.at < ROUTE_TRACK_CACHE_TTL_MS) {
    return cached.trackId;
  }

  const url =
    `https://api.vamosys.com/getVehicleExp?vehicleId=${encodeURIComponent(registrationNumber)}` +
    `&fcode=VAM&days=30&mailId=vignesh032rk@gmail.com&phone=9345771779&userId=${VAMOSYS_USER_ID}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error((await response.text()) || "Vamosys route-track request failed");
  }

  const trackId = (await response.text()).trim().replace(/^"|"$/g, "");

  if (trackId) {
    routeTrackCache.set(registrationNumber, { at: Date.now(), trackId });
  }

  return trackId || null;
}

module.exports = {
  fetchVamosysApiKey,
  fetchAllVehicleLocations,
  getLiveLocationsForRegistrationNumbers,
  getDrivingSummaryForDay,
  getRouteTrackId,
};
