/* -------------------------------------------------------------------------- */
/*   PRESENTATION-LAYER MAPPING: internal admin pipelines → client journey    */
/* -------------------------------------------------------------------------- */
/* Order.salesPipelineStatus and Order.pipelineStatus are two independent     */
/* internal pipelines with their own stage sets. A client only needs to know  */
/* one thing: how far along is MY campaign. This file collapses both into a   */
/* single 5-step funnel and is deliberately NOT a 1:1 mirror of the internal  */
/* stage keys — internal stages can be renamed/added without this file        */
/* changing, as long as the *tier* a stage belongs to stays correct here.     */

const JOURNEY_STEPS = [
  { key: "submitted", label: "Request Submitted" },
  { key: "confirmed", label: "Order Confirmed" },
  { key: "prepared", label: "Prepared for Campaign" },
  { key: "onRoad", label: "On Road" },
  { key: "completed", label: "Campaign Completed" },
];

const CANCELLED_STEP = { key: "cancelled", label: "Cancelled" };

/* Booking-line + order-total fields needed by applyOrderFieldOverrides /
   applyOrderTotalsOverride below — shared by both selects so the overlay
   never silently no-ops on one read path but not the other. */
const OVERLAY_ORDER_FIELDS =
  "bookingItems.fromDate bookingItems.toDate bookingItems.totalDays " +
  "bookingItems.vehicleType bookingItems.vehicleModel bookingItems.quantity bookingItems.perDayRentalCost " +
  "bookingItems.rentalCost bookingItems.rtoCost bookingItems.brandingCost " +
  "bookingItems.promoterCost bookingItems.promoterChargePerDay bookingItems.totalAmount " +
  "grandGst grandTotal";

/* Fields safe to pull from Order for the lightweight list view (booking row).
   Includes the same stage + timestamp only log fields TRACKING_ORDER_SELECT
   allows (never movedBy/handlerName/notes) so buildSteps() can attach a real
   completedAt date per milestone without a second, heavier query. */
const LIST_ORDER_SELECT =
  "salesPipelineStatus pipelineStatus onRoadExecutionArray.unavailableStatus onRoadExecutionArray.entryStatus " +
  "salesPipelineLogs.toStage salesPipelineLogs.movedAt pipelineLogs.toStage pipelineLogs.movedAt " +
  OVERLAY_ORDER_FIELDS;

/* Adds history-log fields (stage + timestamp only — never movedBy/handlerName/notes) and the
   day-wise campaign metrics (never driver contact/remarks/billing fields) for the tracking console */
const TRACKING_ORDER_SELECT =
  "salesPipelineStatus pipelineStatus onRoadExecutionArray.unavailableStatus onRoadExecutionArray.entryStatus " +
  "salesPipelineLogs.toStage salesPipelineLogs.movedAt pipelineLogs.toStage pipelineLogs.movedAt updatedAt " +
  "dailyHoursLogArray.day dailyHoursLogArray.distanceCoveredKm dailyHoursLogArray.activationsCount " +
  "dailyHoursLogArray.leadsCollected dailyHoursLogArray.peopleEngaged dailyHoursLogArray.routeNote " +
  "dailyHoursLogArray.photos dailyHoursLogArray.isAbsentDay " +
  OVERLAY_ORDER_FIELDS;

/* Fields safe to select for the lightweight, frequently-polled live-location
   lookup — just enough to resolve which vehicles belong to this order.
   bookingItems.{vehicleType,vehicleModel,quantity} and
   onRoadExecutionArray.vehicleIndex let getClientRequestLiveLocation match
   each booked vehicle slot to its assignment (or lack of one) — see the
   "pending" placeholder handling there. */
const LIVE_LOCATION_ORDER_SELECT =
  "pipelineStatus onRoadExecutionArray.vehicleIndex onRoadExecutionArray.vehicleRegistrationNumber " +
  "onRoadExecutionArray.entryStatus onRoadExecutionArray.unavailableStatus " +
  "onRoadExecutionArray.replacesEntryId " +
  "bookingItems.vehicleType bookingItems.vehicleModel bookingItems.quantity";

const SALES_TIER = {
  enquiry: 0,
  needAnalysis: 0,
  proposalPriceQuote: 0,
  negotiationReview: 0,
  closedWon: 1,
  projectCodeCreation: 1,
  salesFinalClosedWon: 1,
  invoiceGeneration: 1,
  closedLost: "cancelled",
};

const OPS_TIER = {
  todo: 0,
  projectCodeCreation: 0,
  projectExecution: 2,
  onRoad: 3,
  campaignRunning: 3,
  vehicleUnavailable: 3,
  clientClosure: 4,
  closedWon: 4,
  invoiceGeneration: 4,
  paymentStage2: 4,
  closedLost: "cancelled",
};

const salesTierOf = (stage) => SALES_TIER[stage];
const opsTierOf = (stage) => OPS_TIER[stage];

const isActiveOnRoadEntry = (entry) => entry && entry.entryStatus === "active";

/**
 * Current position in the client journey, derived from the Order's LIVE
 * status fields — authoritative, not from log history (which can have gaps
 * for orders that skipped a logged transition, e.g. admin-created mid-pipeline).
 */
function deriveJourneyStage(order) {
  if (!order) {
    return { stageIndex: 0, isCancelled: false, vehicleUnavailable: false };
  }

  const salesTier = salesTierOf(order.salesPipelineStatus);
  const opsTier = opsTierOf(order.pipelineStatus);
  const isCancelled = salesTier === "cancelled" || opsTier === "cancelled";

  const numericTiers = [salesTier, opsTier].filter((t) => typeof t === "number");
  const stageIndex = numericTiers.length ? Math.max(...numericTiers) : 0;

  const vehicleUnavailable =
    stageIndex === 3 &&
    !isCancelled &&
    (order.onRoadExecutionArray || []).some(
      (e) => isActiveOnRoadEntry(e) && e.unavailableStatus === true
    );

  return { stageIndex, isCancelled, vehicleUnavailable };
}

/**
 * Best-effort timestamp per milestone, filled from pipeline log history.
 * A milestone with no matching log entry is left null rather than guessed
 * at — the step still renders as done, just without a date. Never fabricates
 * history that didn't happen.
 */
function deriveMilestoneTimestamps(order, stageIndex, isCancelled) {
  const timestamps = new Array(JOURNEY_STEPS.length).fill(null);
  let cancelledAt = null;

  const merged = [
    ...(order.salesPipelineLogs || []).map((l) => ({
      toStage: l.toStage,
      movedAt: l.movedAt,
      tierOf: salesTierOf,
    })),
    ...(order.pipelineLogs || []).map((l) => ({
      toStage: l.toStage,
      movedAt: l.movedAt,
      tierOf: opsTierOf,
    })),
  ].sort((a, b) => new Date(a.movedAt) - new Date(b.movedAt));

  for (const log of merged) {
    const tier = log.tierOf(log.toStage);
    if (tier === "cancelled") {
      if (isCancelled && !cancelledAt) cancelledAt = log.movedAt;
      continue;
    }
    if (typeof tier === "number" && tier <= stageIndex && !timestamps[tier]) {
      timestamps[tier] = log.movedAt;
    }
  }

  return { timestamps, cancelledAt };
}

/**
 * Dynamically generated done/current/upcoming steps — never hardcodes a
 * fake pre-completed step. On cancellation, prior progress is frozen as
 * done and a single terminal Cancelled step replaces the remainder.
 */
function buildSteps(order, submittedAt) {
  const { stageIndex, isCancelled } = deriveJourneyStage(order);
  const { timestamps, cancelledAt } = order
    ? deriveMilestoneTimestamps(order, stageIndex, isCancelled)
    : { timestamps: new Array(JOURNEY_STEPS.length).fill(null), cancelledAt: null };

  timestamps[0] = timestamps[0] || submittedAt || null;

  const steps = JOURNEY_STEPS.map((step, index) => ({
    key: step.key,
    label: step.label,
    status:
      index < stageIndex ? "done" : index === stageIndex && !isCancelled ? "current" : "upcoming",
    completedAt: index <= stageIndex ? timestamps[index] : null,
  }));

  if (isCancelled) {
    const frozen = steps.slice(0, stageIndex + 1).map((s) => ({ ...s, status: "done" }));
    frozen.push({
      key: CANCELLED_STEP.key,
      label: CANCELLED_STEP.label,
      status: "current",
      completedAt: cancelledAt,
    });
    return frozen;
  }

  return steps;
}

const ACTIVITY_LABEL = {
  submitted: "Booking request submitted",
  confirmed: "Order confirmed",
  prepared: "Vehicle prepared for campaign",
  onRoad: "Campaign started — vehicle on road",
  completed: "Campaign completed",
  cancelled: "Booking cancelled",
};

/**
 * Deduped, milestone-only activity feed — one line per funnel tier the
 * order has actually reached, not a raw dump of every internal log entry.
 * Never includes movedBy/handlerName/notes.
 */
function buildActivity(order, submittedAt) {
  return buildSteps(order, submittedAt)
    .filter((s) => s.status === "done" || s.status === "current")
    .map((s) => ({ label: ACTIVITY_LABEL[s.key] || s.label, at: s.completedAt }))
    .filter((entry) => entry.at);
}

/**
 * Campaign-day counter — gated on the LIVE backend status, never on date
 * math alone. A campaign whose dates have started but that the backend
 * hasn't marked onRoad yet must not show a running day counter.
 */
function deriveOnRoadDay(order, vehicleTypes) {
  if (!order || order.pipelineStatus !== "onRoad") return null;

  const first = (vehicleTypes || [])[0];
  if (!first || !first.fromDate || !first.totalDays) return null;

  const from = new Date(first.fromDate);
  from.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today - from) / 86400000) + 1;
  const day = Math.min(Math.max(diffDays, 1), first.totalDays);

  return { day, totalDays: first.totalDays };
}

/**
 * Overlays booking-line fields from the linked Order onto the client's own
 * vehicleTypes copy, matched by array index — bookingItems is built by
 * iterating vehicleTypes in that same order (see createOrderForClientRequest),
 * so index-matching is safe. A vehicleTypes[i] with no matching bookingItems[i]
 * (admin removed that line) keeps its last-known frozen values untouched,
 * same as an order with no bookingItems at all — never crashes, never nulls
 * out real data.
 *
 * Once an order exists, admin can edit it independently (e.g. updateAdminOrder)
 * without ever touching the originating ClientRequest — those edits must be
 * what the customer sees, not the copy frozen at submission time. Everything
 * overlaid here has a live counterpart on the Order; things that don't
 * (media, campaign details, promoter contact info) still come from the
 * client's own request.
 *
 * vehicleType is deliberately NOT overlaid as a field itself: on ClientRequest
 * it's a populated {_id, name} object (ref VehicleType), on Order it's a raw
 * stringified ObjectId — overlaying it directly would replace the populated
 * object the frontend reads (vehicle.vehicleType?.name) with a bare id string.
 * It IS used, indirectly, to resolve vehicleName — see below.
 *
 * vehicleName is overlaid from the Order line's VehicleType typeName (via
 * vehicleTypeNameById, a Map<string typeId, string typeName> the caller
 * builds with resolveVehicleTypeNames() before calling this), NOT from
 * Order's own vehicleModel field. Package.vehicleModel is unreliable — the
 * admin Package Management form's "Vehicle Model" input is currently
 * disabled/commented out, so every package's vehicleModel is stuck at the
 * literal placeholder "Non-Customizable Vehicle" regardless of the real
 * vehicle. VehicleType.typeName (e.g. "2 Sided", "3 Sided") is the real,
 * human-readable identifier admin actually picks when editing an order, and
 * is the same source getClientRequestLiveLocation already uses for this.
 *
 * lineTotal maps from Order's totalAmount, not subtotal: subtotal is
 * pre-discount/pre-extras, totalAmount is the final saved line charge.
 */
function applyOrderFieldOverrides(vehicleTypes, order, vehicleTypeNameById) {
  const bookingItems = order?.bookingItems || [];
  if (!bookingItems.length) return vehicleTypes || [];

  return (vehicleTypes || []).map((vehicle, index) => {
    const item = bookingItems[index];
    if (!item) return vehicle;

    const resolvedVehicleName = item.vehicleType
      ? vehicleTypeNameById?.get(String(item.vehicleType))
      : null;

    return {
      ...vehicle,
      fromDate: item.fromDate ?? vehicle.fromDate,
      toDate: item.toDate ?? vehicle.toDate,
      totalDays: item.totalDays ?? vehicle.totalDays,
      vehicleModel: item.vehicleModel ?? vehicle.vehicleModel,
      vehicleName: resolvedVehicleName ?? vehicle.vehicleName,
      quantity: item.quantity ?? vehicle.quantity,
      pricePerDay: item.perDayRentalCost ?? vehicle.pricePerDay,
      lineTotal: item.totalAmount ?? vehicle.lineTotal,
      rentalCost: item.rentalCost ?? vehicle.rentalCost,
      rtoCost: item.rtoCost ?? vehicle.rtoCost,
      brandingCost: item.brandingCost ?? vehicle.brandingCost,
      promoterCost: item.promoterCost ?? vehicle.promoterCost,
      promoterChargePerDay: item.promoterChargePerDay ?? vehicle.promoterChargePerDay,
    };
  });
}

/**
 * Overlays order-level pricing totals onto the client's own ClientRequest
 * totals, sourced from the same grandTotal/grandGst that updateAdminOrder
 * already recalculates and saves — no GST-rate logic is duplicated here.
 * cgstAmount/sgstAmount/igstAmount have no live Order-level equivalent (they'd
 * need re-deriving the customer's GST state split) and are intentionally left
 * un-synced; estimatedTotal/gstAmount/subtotal (the figures that actually
 * drive what the customer is shown as owing) are what this corrects.
 */
function applyOrderTotalsOverride(clientRequest, order) {
  if (!order?.bookingItems?.length) {
    return {
      subtotal: clientRequest?.subtotal,
      gstAmount: clientRequest?.gstAmount,
      estimatedTotal: clientRequest?.estimatedTotal,
    };
  }

  const estimatedTotal = order.grandTotal ?? clientRequest?.estimatedTotal;
  const gstAmount = order.grandGst ?? clientRequest?.gstAmount;

  return {
    subtotal:
      typeof estimatedTotal === "number" && typeof gstAmount === "number"
        ? estimatedTotal - gstAmount
        : clientRequest?.subtotal,
    gstAmount,
    estimatedTotal,
  };
}

function toDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function todayIndiaDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function eachDateKeyInRange(startKey, endKey) {
  const days = [];
  if (!startKey || !endKey) return days;

  const cursor = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(`${endKey}T00:00:00.000Z`);

  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

const PHOTOS_GALLERY_LIMIT = 24;

/* On Road (index 3) or later — see JOURNEY_STEPS. Below this, every day is
   "upcoming" regardless of the calendar date: the backend stage always
   takes priority over date math, never the other way around. */
const CAMPAIGN_STARTED_STAGE_INDEX = 3;

/**
 * One row per calendar day in the campaign range, built entirely from the
 * order's admin-logged dailyHoursLogArray (summed across vehicles for
 * multi-vehicle campaigns) — never invents a day that wasn't actually
 * logged. `status` is derived per call, never stored.
 */
function buildDayWiseReport(order, campaignStartRaw, campaignEndRaw, stageIndex) {
  const startKey = toDateKey(campaignStartRaw);
  const endKey = toDateKey(campaignEndRaw);
  if (!startKey || !endKey) return [];

  const logsByDay = {};
  for (const log of order?.dailyHoursLogArray || []) {
    if (!log.day) continue;

    if (!logsByDay[log.day]) {
      logsByDay[log.day] = {
        distanceCoveredKm: 0,
        activationsCount: 0,
        leadsCollected: 0,
        peopleEngaged: 0,
        routeNote: "",
        photos: [],
        isAbsentDay: false,
      };
    }

    const row = logsByDay[log.day];
    row.distanceCoveredKm += log.distanceCoveredKm || 0;
    row.activationsCount += log.activationsCount || 0;
    row.leadsCollected += log.leadsCollected || 0;
    row.peopleEngaged += log.peopleEngaged || 0;
    if (log.routeNote) {
      row.routeNote = row.routeNote ? `${row.routeNote}; ${log.routeNote}` : log.routeNote;
    }
    if (log.photos?.length) row.photos.push(...log.photos);
    if (log.isAbsentDay) row.isAbsentDay = true;
  }

  const todayKey = todayIndiaDateKey();
  const campaignStarted = stageIndex >= CAMPAIGN_STARTED_STAGE_INDEX;

  return eachDateKeyInRange(startKey, endKey).map((day) => {
    const logged = logsByDay[day];

    let status;
    if (!campaignStarted) {
      status = "upcoming";
    } else if (day === todayKey) {
      status = "ongoing";
    } else if (logged) {
      status = "completed";
    } else if (day < todayKey) {
      status = "not_reported";
    } else {
      status = "upcoming";
    }

    return {
      day,
      status,
      distanceCoveredKm: logged?.distanceCoveredKm || 0,
      activationsCount: logged?.activationsCount || 0,
      leadsCollected: logged?.leadsCollected || 0,
      peopleEngaged: logged?.peopleEngaged || 0,
      routeNote: logged?.routeNote || "",
      photos: logged?.photos || [],
      isAbsentDay: logged?.isAbsentDay || false,
    };
  });
}

/** Most-recent-first flattened photo list for the gallery, capped. */
function flattenPhotos(dayWiseReport) {
  const flat = [];

  for (const row of dayWiseReport || []) {
    for (const url of row.photos || []) {
      flat.push({ url, day: row.day });
    }
  }

  return flat.reverse().slice(0, PHOTOS_GALLERY_LIMIT);
}

module.exports = {
  JOURNEY_STEPS,
  CANCELLED_STEP,
  LIST_ORDER_SELECT,
  TRACKING_ORDER_SELECT,
  LIVE_LOCATION_ORDER_SELECT,
  deriveJourneyStage,
  applyOrderFieldOverrides,
  applyOrderTotalsOverride,
  buildSteps,
  buildActivity,
  deriveOnRoadDay,
  buildDayWiseReport,
  flattenPhotos,
  todayIndiaDateKey,
};
