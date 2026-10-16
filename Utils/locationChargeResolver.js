/**
 * Shared location-charge resolver — used by both the admin order controller
 * and the client-request controller so RTO/Branding/Promoter charges are
 * resolved identically everywhere a booking line is priced.
 *
 * Supported states: Tamil Nadu, Kerala, Andhra Pradesh, Telangana, Karnataka.
 * Tamil Nadu additionally splits into two RTO/Branding buckets based on city:
 *   - city === "Chennai"        -> "chennai"
 *   - any other Tamil Nadu city -> "rotn" (Rest Of Tamil Nadu)
 * The other four states are a single bucket each, no city condition.
 *
 * All 6 RTO/Branding location buckets, and all 5 Promoter states, are
 * mandatory fields on their respective admin forms — there is no "General"
 * fallback and no hardcoded default. A booking line whose state/city does
 * not resolve to one of these buckets returns null everywhere below, and
 * callers must treat null as "not configured" rather than silently pricing
 * it as zero.
 */

const normalize = (value) => String(value || "").trim().toLowerCase();

const STATE_ALIASES = {
  "tamil nadu": "tamilnadu",
  tamilnadu: "tamilnadu",
  kerala: "kerala",
  "andhra pradesh": "andhra",
  andhra: "andhra",
  telangana: "telangana",
  karnataka: "karnataka",
};

/**
 * The 5 states this whole feature supports, as real display names — sourced
 * from whatever the existing dynamic Location collection (the same one
 * order-creation's State dropdown already reads) happens to call them.
 * Used only to FILTER that dynamic list down to "these 5", never as a
 * fixed/static enum of our own — Promoter charges store the real state
 * name string as-is, not an internal key.
 */
const TARGET_STATE_NAMES = ["tamil nadu", "kerala", "andhra pradesh", "telangana", "karnataka"];

const isTargetState = (state) => {
  const n = normalize(state);
  return TARGET_STATE_NAMES.some((target) => n === target || n === target.replace(" pradesh", ""));
};

/** Plain state key — used for the Package RTO/Branding Chennai/ROTN split. */
const resolveStateKey = (state) => STATE_ALIASES[normalize(state)] || null;

/** 6-bucket key — used by Package RTO/Branding charges. */
const resolveLocationBucket = (state, city) => {
  const stateKey = resolveStateKey(state);
  if (!stateKey) return null;
  if (stateKey !== "tamilnadu") return stateKey;
  return normalize(city) === "chennai" ? "chennai" : "rotn";
};

const resolveRtoCharge = (pkg, state, city) => {
  const bucket = resolveLocationBucket(state, city);
  if (!bucket) return null;
  const value = pkg?.locationCharges?.[bucket]?.rtoCharges;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const resolveBrandingCharge = (pkg, state, city) => {
  const bucket = resolveLocationBucket(state, city);
  if (!bucket) return null;
  const value = pkg?.locationCharges?.[bucket]?.brandingCost;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/**
 * `chargesByState` is a plain object keyed by the Promoter doc's own `state`
 * string, normalized (trim + lowercase) — built fresh from whatever rows
 * exist, no fixed key set. `state` here is the booking line's real state
 * name (the same dynamic string order-creation's State dropdown uses).
 */
const resolvePromoterCharge = (chargesByState, state) => {
  const key = normalize(state);
  if (!key) return null;
  const value = chargesByState?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

module.exports = {
  LOCATION_BUCKETS: ["chennai", "rotn", "kerala", "andhra", "telangana", "karnataka"],
  TARGET_STATE_NAMES,
  isTargetState,
  resolveStateKey,
  resolveLocationBucket,
  resolveRtoCharge,
  resolveBrandingCharge,
  resolvePromoterCharge,
};
