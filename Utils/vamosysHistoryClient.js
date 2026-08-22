/* gpsvts.vamosys.com/gps/public/getVehicleHistory (the "public" path a human
   uses after logging in at gpsvts.net/gps/public/login) requires a browser
   session — a stateless server-side fetch to it just gets 302-redirected to
   /login every time, regardless of vehicle or date, and this history panel
   would silently render "no history" forever as a result.

   gpsvtsprobend.vamosys.com/getVehicleHistory is the actual stateless JSON
   API behind it — no login required. Utils/vamosysClient.js already calls
   this same host successfully for the driving-summary feature. */
const HISTORY_URL = "https://gpsvtsprobend.vamosys.com/getVehicleHistory";
const VAMOSYS_USER_ID = "ADINN12";

const CACHE_TTL_MS = 60 * 1000;
const historyCache = new Map();

function compactRegistrationNumber(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstDefined(object, keys, fallback = null) {
  for (const key of keys) {
    if (
      object &&
      Object.prototype.hasOwnProperty.call(object, key) &&
      object[key] !== undefined &&
      object[key] !== null
    ) {
      return object[key];
    }
  }

  return fallback;
}

function indiaParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return parts;
}

function indiaDateKey(date = new Date()) {
  const parts = indiaParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function indiaTimeKey(date = new Date()) {
  const parts = indiaParts(date);
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

function addDaysToIndiaDate(dateKey, amount) {
  const date = new Date(`${dateKey}T00:00:00+05:30`);
  date.setUTCDate(date.getUTCDate() + amount);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toEpoch(dateKey, timeKey) {
  const date = new Date(`${dateKey}T${timeKey}+05:30`);
  const time = date.getTime();

  if (!Number.isFinite(time)) {
    throw new Error("Invalid history date/time.");
  }

  return time;
}

function fromEpochToIndiaKeys(epoch) {
  const date = new Date(epoch);

  return {
    date: indiaDateKey(date),
    time: indiaTimeKey(date),
  };
}

function normalizeTime(value, fallback) {
  const raw = String(value || fallback || "").trim();
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  return fallback;
}

function resolveHistoryRange(query = {}) {
  const preset = ["6h", "12h", "today", "yesterday", "custom"].includes(
    String(query.preset || "")
  )
    ? String(query.preset)
    : "today";

  const now = Date.now();
  const today = indiaDateKey();

  if (preset === "6h" || preset === "12h") {
    const hours = preset === "6h" ? 6 : 12;
    const from = now - hours * 60 * 60 * 1000;
    const fromKeys = fromEpochToIndiaKeys(from);
    const toKeys = fromEpochToIndiaKeys(now);

    return {
      preset,
      fromDate: fromKeys.date,
      fromTime: fromKeys.time,
      toDate: toKeys.date,
      toTime: toKeys.time,
      fromDateUTC: from,
      toDateUTC: now,
    };
  }

  if (preset === "yesterday") {
    const day = addDaysToIndiaDate(today, -1);
    const fromTime = "00:00:00";
    const toTime = "23:59:59";

    return {
      preset,
      fromDate: day,
      fromTime,
      toDate: day,
      toTime,
      fromDateUTC: toEpoch(day, fromTime),
      toDateUTC: toEpoch(day, toTime),
    };
  }

  if (preset === "custom") {
    const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(String(query.fromDate || ""))
      ? String(query.fromDate)
      : today;
    const toDate = /^\d{4}-\d{2}-\d{2}$/.test(String(query.toDate || ""))
      ? String(query.toDate)
      : fromDate;

    const fromTime = normalizeTime(query.fromTime, "00:00:00");
    const toTime = normalizeTime(query.toTime, "23:59:59");

    const fromDateUTC = toEpoch(fromDate, fromTime);
    const toDateUTC = toEpoch(toDate, toTime);

    if (fromDateUTC > toDateUTC) {
      throw new Error("History start date/time cannot be after end date/time.");
    }

    const maximumRangeMs = 7 * 24 * 60 * 60 * 1000;

    if (toDateUTC - fromDateUTC > maximumRangeMs) {
      throw new Error("Custom GPS history is limited to 7 days per request.");
    }

    return {
      preset,
      fromDate,
      fromTime,
      toDate,
      toTime,
      fromDateUTC,
      toDateUTC,
    };
  }

  const fromTime = "00:00:00";
  const toTime = indiaTimeKey();

  return {
    preset: "today",
    fromDate: today,
    fromTime,
    toDate: today,
    toTime,
    fromDateUTC: toEpoch(today, fromTime),
    toDateUTC: toEpoch(today, toTime),
  };
}

function extractHistoryRows(payload) {
  if (Array.isArray(payload)) return payload;

  const candidates = [
    /* gpsvtsprobend's real shape — every other candidate below is a guess
       kept only as a fallback in case Vamosys ever changes the key. */
    payload?.vehicleLocations,
    payload?.data,
    payload?.result,
    payload?.history,
    payload?.vehicleHistory,
    payload?.vehicleHistoryList,
    payload?.list,
    payload?.rows,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;

    if (candidate && typeof candidate === "object") {
      const nested = [
        candidate.rows,
        candidate.list,
        candidate.history,
        candidate.vehicleHistory,
        candidate.data,
      ].find(Array.isArray);

      if (nested) return nested;
    }
  }

  return [];
}

function parseAt(row) {
  const raw = firstDefined(row, [
    "dateTime",
    "datetime",
    "gpsDateTime",
    "gpsDatetime",
    "packetDateTime",
    "timestamp",
    "timeStamp",
    "createdAt",
  ]);

  if (raw) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  /* gpsvtsprobend's vehicleLocations rows carry `date` as a raw epoch-ms
     number (e.g. 1786978207000), not a formatted string — the datePart/
     timePart branch below never matches it. */
  const epochCandidate = firstDefined(row, ["date", "gpsDate", "packetDate"]);

  if (
    typeof epochCandidate === "number" ||
    /^\d{10,}$/.test(String(epochCandidate ?? ""))
  ) {
    const date = new Date(Number(epochCandidate));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const datePart = String(
    firstDefined(row, ["date", "gpsDate", "packetDate"], "")
  ).trim();
  const timePart = String(
    firstDefined(row, ["time", "gpsTime", "packetTime"], "")
  ).trim();

  if (datePart && timePart) {
    const isoDate = /^\d{2}-\d{2}-\d{4}$/.test(datePart)
      ? datePart.split("-").reverse().join("-")
      : datePart;

    const date = new Date(`${isoDate}T${timePart}+05:30`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  /* Fallback: Vamosys also sends a pre-formatted `lastSeen` string, e.g.
     "17-8-2026 20:20:07" (Asia/Kolkata, no leading zeros on day/month). */
  const lastSeen = String(firstDefined(row, ["lastSeen"], "")).trim();
  const match = lastSeen.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/
  );

  if (match) {
    const [, day, month, year, hour, minute, second] = match;
    const date = new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour}:${minute}:${second}+05:30`
    );
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return null;
}

const POSITION_LABEL = { M: "Moving", P: "Parked", S: "Idle" };

function normalizeMovementStatus(row, speed, ignitionStatus) {
  /* gpsvtsprobend's own movement code — check this first. Its rows also
     carry a `status` field, but that's the ignition ON/OFF state, not
     movement; treating it as movement (the old fallback list below did)
     showed "ON"/"OFF" instead of Moving/Parked/Idle. */
  const positionCode = String(firstDefined(row, ["position"], ""))
    .trim()
    .toUpperCase();

  if (POSITION_LABEL[positionCode]) return POSITION_LABEL[positionCode];

  const explicit = String(
    firstDefined(row, [
      "movementStatus",
      "vehicleStatus",
      "motionStatus",
      "state",
    ], "")
  ).trim();

  if (explicit) return explicit;

  if ((speed || 0) > 0) return "Moving";

  if (String(ignitionStatus).toLowerCase() === "on") return "Idle";

  return "Parked";
}

function normalizeHistoryRow(row, index) {
  const latitude = numberOrNull(
    firstDefined(row, ["latitude", "lat", "gpsLat", "gpsLatitude"])
  );
  const longitude = numberOrNull(
    firstDefined(row, ["longitude", "lng", "lon", "gpsLng", "gpsLongitude"])
  );

  const maxSpeedKmh = numberOrNull(
    firstDefined(row, [
      "maxSpeed",
      "maxspeed",
      "speed",
      "speedKmph",
      "speedKmh",
      "velocity",
    ])
  );

  const ignitionStatus = String(
    firstDefined(row, [
      "ignitionStatus",
      "ignition",
      "ignitionState",
      "ignition_status",
    ], "")
  ).trim();

  const at = parseAt(row);

  let date = "";
  let time = "";

  if (at) {
    const parts = indiaParts(new Date(at));
    date = `${parts.year}-${parts.month}-${parts.day}`;
    time = `${parts.hour}:${parts.minute}:${parts.second}`;
  }

  const googleMapUrl =
    latitude !== null && longitude !== null
      ? `https://www.google.com/maps?q=${latitude},${longitude}`
      : null;

  return {
    id: String(
      firstDefined(
        row,
        ["rowId", "id", "_id", "packetId"],
        `${at || "row"}-${index}`
      )
    ),
    at,
    date,
    time,
    latitude,
    longitude,
    maxSpeedKmh,
    /* isOutOfOrder is gpsvtsprobend's real field for this column — confirmed
       against Vamosys' own UI, which shows the same "No" this vehicle's rows
       carry as isOutOfOrder: "no". */
    out: String(
      firstDefined(
        row,
        ["isOutOfOrder", "out", "output", "digitalOut", "outStatus"],
        ""
      )
    ).trim(),
    address: String(
      firstDefined(row, [
        "address",
        "location",
        "locationName",
        "formattedAddress",
        "landmark",
      ], "")
    ).trim(),
    direction: String(
      firstDefined(row, [
        "direction",
        "directionName",
        "course",
        "heading",
      ], "")
    ).trim(),
    googleMapUrl,
    cumulativeDistanceKm: numberOrNull(
      firstDefined(row, [
        "distanceCovered",
        "cumulativeDistance",
        "cDist",
        "cdist",
        "distance",
        "tripDistance",
        "distanceKm",
      ])
    ),
    odometerKm: numberOrNull(
      firstDefined(row, [
        "odoDistance",
        "odometer",
        "odo",
        "odometerReading",
        "odoReading",
      ])
    ),
    /* fuelLitre (singular) is the real reading (confirmed: 1.29 matching
       Vamosys' own UI for this vehicle). gpsvtsprobend also sends a
       same-shaped but always-"0.00" decoy field, fuelLitres (plural) —
       deliberately not in this list, or it would shadow real data. */
    fuelLitres: numberOrNull(
      firstDefined(row, [
        "fuelLitre",
        "fuel",
        "fuelLtr",
        "fuelLevel",
      ])
    ),
    ignitionStatus,
    movementStatus: normalizeMovementStatus(
      row,
      maxSpeedKmh,
      ignitionStatus
    ),
  };
}

function buildSummary(rows) {
  const validDistances = rows
    .map((row) => row.cumulativeDistanceKm)
    .filter((value) => Number.isFinite(value));

  let distanceKm = 0;

  if (validDistances.length >= 2) {
    distanceKm = Math.max(
      0,
      validDistances[validDistances.length - 1] - validDistances[0]
    );
  } else if (validDistances.length === 1) {
    distanceKm = Math.max(0, validDistances[0]);
  }

  const movement = rows.map((row) =>
    String(row.movementStatus || "").toLowerCase()
  );

  return {
    pointCount: rows.length,
    distanceKm: Number(distanceKm.toFixed(2)),
    maxSpeedKmh: Math.max(
      0,
      ...rows
        .map((row) => Number(row.maxSpeedKmh || 0))
        .filter(Number.isFinite)
    ),
    movingCount: movement.filter((value) => value.includes("mov")).length,
    parkedCount: movement.filter((value) => value.includes("park")).length,
    idleCount: movement.filter((value) => value.includes("idle")).length,
    ignitionOnCount: rows.filter(
      (row) => String(row.ignitionStatus).toLowerCase() === "on"
    ).length,
    startAddress: rows.find((row) => row.address)?.address || "",
    endAddress: [...rows].reverse().find((row) => row.address)?.address || "",
  };
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Adinn-Roadshow-Tracking/1.0",
      },
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Vamosys history request failed with status ${response.status}.`
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Vamosys history returned a non-JSON response.");
    }
  } finally {
    clearTimeout(timer);
  }
}

async function getVehicleHistory(registrationNumber, range) {
  const vehicleId = compactRegistrationNumber(registrationNumber);

  if (!vehicleId) {
    throw new Error("Vehicle registration number is required.");
  }

  /* gpsvtsprobend keys off userId + fromDateUTC/toDateUTC + interval, not
     the fromDate/fromTime/toDate/toTime strings the old (session-gated)
     host used — those are still returned to the frontend for display via
     resolveHistoryRange's `range`, just no longer sent to Vamosys. */
  const params = new URLSearchParams({
    userId: VAMOSYS_USER_ID,
    vehicleId,
    fromDateUTC: String(range.fromDateUTC),
    toDateUTC: String(range.toDateUTC),
    interval: "-1",
  });

  const cacheKey = `${vehicleId}|${params.toString()}`;
  const cached = historyCache.get(cacheKey);

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const payload = await fetchJson(`${HISTORY_URL}?${params.toString()}`);
  const rows = extractHistoryRows(payload)
    .map(normalizeHistoryRow)
    .sort((a, b) => {
      const aTime = a.at ? new Date(a.at).getTime() : 0;
      const bTime = b.at ? new Date(b.at).getTime() : 0;
      return aTime - bTime;
    });

  const value = {
    registrationNumber: vehicleId,
    unavailable: false,
    rows,
    summary: buildSummary(rows),
  };

  historyCache.set(cacheKey, {
    at: Date.now(),
    value,
  });

  return value;
}

module.exports = {
  getVehicleHistory,
  resolveHistoryRange,
};
