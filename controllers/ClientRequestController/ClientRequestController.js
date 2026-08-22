const path = require("path");
const mongoose = require("mongoose");
const ClientRequest = require("../../Models/ClientRequestModel/Clientrequestmodel");
const GstDetail = require("../../Models/GstDetailsModel/gstdetails");

/* A public booking is raised into the orders collection as well, so it
   enters the same operations pipeline an admin-created order does. */
const Order = require("../../Models/AdminorderModel/Adminorder");
const Package = require("../../Models/PackageManagementModel/packagemanagement");
const CampaignType = require("../../Models/CampaignTypeModel/campaigntype");
const VehicleGroup = require("../../Models/vehicleDetails");
const VehicleType = require("../../Models/VehicleTypeSchema");
const {
  JOURNEY_STEPS,
  LIST_ORDER_SELECT,
  TRACKING_ORDER_SELECT,
  LIVE_LOCATION_ORDER_SELECT,
  deriveJourneyStage,
  buildSteps,
  buildActivity,
  deriveOnRoadDay,
  buildDayWiseReport,
  flattenPhotos,
  todayIndiaDateKey,
} = require("../../Utils/clientJourneyStages");
const {
  getLiveLocationsForRegistrationNumbers,
  getDrivingSummaryForDay,
  getRouteTrackId,
} = require("../../Utils/vamosysClient");
const {
  getVehicleHistory,
  resolveHistoryRange,
} = require("../../Utils/vamosysHistoryClient");
const { sendCampaignRequestMail } = require("../../Utils/campaignMailer");

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const getIndiaDateRange = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const year = values.year;
  const month = values.month;
  const day = values.day;
  const prefix = `${year}${month}${day}`;
  const start = new Date(`${year}-${month}-${day}T00:00:00+05:30`);
  const end = new Date(start.getTime() + MILLISECONDS_PER_DAY);

  return { prefix, start, end };
};

async function generateClientOrderId() {
  const { prefix, start, end } = getIndiaDateRange();

  const count = await ClientRequest.countDocuments({
    createdAt: { $gte: start, $lt: end },
  });

  return `${prefix}CRO#${count + 1}`;
}

const calculateTotalDays = (fromDate, toDate) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("A valid fromDate and toDate are required");
  }

  const fromUtc = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate()
  );
  const toUtc = Date.UTC(
    to.getUTCFullYear(),
    to.getUTCMonth(),
    to.getUTCDate()
  );

  if (fromUtc > toUtc) {
    throw new Error("fromDate cannot be after toDate");
  }

  return Math.floor((toUtc - fromUtc) / MILLISECONDS_PER_DAY) + 1;
};

const toNonNegativeNumber = (value) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const toStringArray = (value) =>
  Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

/**
 * Resolve a stored upload to a URL.
 *
 * Mirrors getFileUrl in the admin order controller: Spaces uploads carry an
 * absolute `location`, local disk uploads are served from /uploads.
 */
const getFileUrl = (file) => {
  if (!file) return null;
  if (file.location) return file.location;

  return `/uploads/${path.basename(file.path)}`;
};

/**
 * Campaign media for one vehicle line, keyed by position.
 *
 * The client posts `campaignImages_<index>` / `campaignVideos_<index>`, the
 * same convention admin order creation uses. Requests with no files at all
 * (the JSON path) get empty arrays and behave exactly as before.
 */
const collectMediaForIndex = (files, index) => {
  const uploaded = Array.isArray(files) ? files : [];

  return {
    campaignImages: uploaded
      .filter((file) => file.fieldname === `campaignImages_${index}`)
      .map(getFileUrl)
      .filter(Boolean),

    campaignVideos: uploaded
      .filter((file) => file.fieldname === `campaignVideos_${index}`)
      .map(getFileUrl)
      .filter(Boolean),
  };
};

/**
 * Normalizes the vehicle lines.
 *
 * Everything above the "campaign details" comment is unchanged from the
 * original implementation. The block below it is additive: each field falls
 * back to a neutral default, so a caller that sends none of them produces
 * exactly the same document it produced before.
 */
const normalizeVehicleTypes = (vehicleTypes, files) => {
  if (!Array.isArray(vehicleTypes) || vehicleTypes.length === 0) {
    throw new Error("vehicleTypes is required");
  }

  return vehicleTypes.map((vehicle, index) => {
    if (!vehicle.vehicleType) {
      throw new Error("Each vehicle requires vehicleType");
    }

    if (!vehicle.fromDate || !vehicle.toDate) {
      throw new Error("Each vehicle type must have fromDate and toDate");
    }

    const quantity = Number(vehicle.quantity);

    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new Error("Each vehicle quantity must be at least 1");
    }

    const totalDays = calculateTotalDays(vehicle.fromDate, vehicle.toDate);

    /* Freshly uploaded media wins; otherwise keep whatever the caller
       already had (an update replaying stored URLs, for instance). */
    const media = collectMediaForIndex(files, index);

    const needPromoter = Boolean(vehicle.needPromoter);

    return {
      vehicleId: vehicle.vehicleId || undefined,
      vehicleType: vehicle.vehicleType,
      vehicleName: String(vehicle.vehicleName || "").trim(),

      /* Carried so the order raised alongside this request can read its
         rates from the package rather than from the browser. Absent on
         callers that do not send it, which leaves it null. */
      packageId:
        vehicle.packageId &&
        mongoose.Types.ObjectId.isValid(vehicle.packageId)
          ? vehicle.packageId
          : null,
      vehicleModel: String(vehicle.vehicleModel || "").trim(),

      quantity: Math.floor(quantity),
      campaignLocation: String(vehicle.campaignLocation || "").trim(),
      fromDate: vehicle.fromDate,
      toDate: vehicle.toDate,
      totalDays,
      pricePerDay: Number(vehicle.pricePerDay || 0),
      lineTotal: Number(vehicle.lineTotal || 0),

      /* ── Campaign details (additive) ─────────────────────────────────── */
      campaignType: String(vehicle.campaignType || "").trim(),
      otherCampaignType: String(vehicle.otherCampaignType || "").trim(),
      campaignName: String(vehicle.campaignName || "").trim(),

      needPromoter,
      /* The toggle being off zeroes the promoter block outright, so a
         client that sends stale values cannot smuggle a charge through. */
      promoterType: needPromoter
        ? String(vehicle.promoterType || "").trim()
        : "",
      otherPromoterType: needPromoter
        ? String(vehicle.otherPromoterType || "").trim()
        : "",
      promoterGender: needPromoter
        ? String(vehicle.promoterGender || "").trim()
        : "",
      promoterLanguage: needPromoter
        ? toStringArray(vehicle.promoterLanguage)
        : [],
      promoterQuantity: needPromoter
        ? Math.floor(toNonNegativeNumber(vehicle.promoterQuantity))
        : 0,
      promoterChargePerDay: needPromoter
        ? toNonNegativeNumber(vehicle.promoterChargePerDay)
        : 0,
      promoterCost: needPromoter
        ? toNonNegativeNumber(vehicle.promoterCost)
        : 0,

      rentalCost: toNonNegativeNumber(vehicle.rentalCost),
      rtoCost: toNonNegativeNumber(vehicle.rtoCost),

      campaignImages: media.campaignImages.length
        ? media.campaignImages
        : toStringArray(vehicle.campaignImages),

      campaignVideos: media.campaignVideos.length
        ? media.campaignVideos
        : toStringArray(vehicle.campaignVideos),
    };
  });
};

const populateClientRequest = (query) =>
  query
    .populate("userId", "name email phone")
    .populate("vehicleTypes.vehicleType", "name");

/* Same as populateClientRequest, plus a client-safe slice of the linked
   Order (see Utils/clientJourneyStages LIST_ORDER_SELECT) so list rows can
   show the real pipeline stage without a second round trip per booking. */
const populateClientRequestForList = (query) =>
  populateClientRequest(query).populate("orderRef", LIST_ORDER_SELECT);

/* Best-effort representative photo per booked vehicle TYPE — a booking
   line only snapshots the vehicle's name as plain text at request time,
   it never links to one specific onboarded vehicle group, so this can
   only match on the shared VehicleType category, not the exact named
   vehicle. One batched query across every request being returned, never
   an N+1 lookup per row. Purely additive: adds `vehicleTypeImage` to each
   line, null when no onboarded vehicle of that type has a front-view
   photo yet. Mutates `requests` in place. */
const attachVehicleTypeImages = async (requests) => {
  const typeIds = new Set();

  for (const request of requests) {
    for (const line of request.vehicleTypes || []) {
      const typeId = line.vehicleType?._id || line.vehicleType;
      if (typeId) typeIds.add(String(typeId));
    }
  }

  if (!typeIds.size) return requests;

  const groups = await VehicleGroup.find({
    "basicInfo.vehicleType": { $in: [...typeIds] },
  }).select("basicInfo.vehicleType mediaFiles.frontViewImage");

  const imageByType = new Map();
  for (const group of groups) {
    const typeId = String(group.basicInfo?.vehicleType || "");
    if (typeId && !imageByType.has(typeId) && group.mediaFiles?.frontViewImage) {
      imageByType.set(typeId, group.mediaFiles.frontViewImage);
    }
  }

  for (const request of requests) {
    for (const line of request.vehicleTypes || []) {
      const typeId = String(line.vehicleType?._id || line.vehicleType || "");
      line.vehicleTypeImage = imageByType.get(typeId) || null;
    }
  }

  return requests;
};

/* bookingItems.vehicleType is an ObjectId ref into VehicleType — typeName
   is the descriptive display name (e.g. "4 Side LED Roadshow Vehicle").
   One batched query per call, not one per booking line. Used by
   getClientRequestLiveLocation to label a "pending assignment" vehicle
   card with something more useful than a bare package/model name. */
const resolveVehicleTypeNames = async (bookingItems) => {
  const typeIds = [
    ...new Set(
      (bookingItems || [])
        .map((item) => item.vehicleType && String(item.vehicleType))
        .filter(Boolean)
    ),
  ];

  if (!typeIds.length) return new Map();

  const types = await VehicleType.find({ _id: { $in: typeIds } }).select("typeName");

  return new Map(types.map((t) => [String(t._id), t.typeName]));
};

/* Attaches the derived journey stage to a plain (toObject()'d) client
   request. Purely additive — never removes/changes an existing field. */
const attachTrackingSummary = (request) => {
  const { stageIndex, isCancelled, vehicleUnavailable } = deriveJourneyStage(request.orderRef);
  const onRoad = deriveOnRoadDay(request.orderRef, request.vehicleTypes);

  return {
    ...request,
    journeyStage: { index: stageIndex, key: JOURNEY_STEPS[stageIndex].key },
    /* Per-milestone status + completedAt (null when not yet reached/logged —
       see buildSteps' own "never fabricates history" contract) so the
       client-facing timeline can show a real date under each stage. */
    steps: buildSteps(request.orderRef, request.createdAt),
    isCancelled,
    vehicleUnavailable,
    onRoad,
  };
};

/**
 * Resolve the billing identity for a request.
 *
 * Company name, PAN and address are taken from the stored GST record, never
 * from the request body — the browser can claim a GST number, but only what
 * was actually verified gets persisted.
 */
const resolveBillingIdentity = async ({
  customerCategory,
  gstNumber,
  gstDetailId,
}) => {
  const isOrganization = customerCategory === "organization";

  if (!isOrganization) {
    return { customerCategory: "individual" };
  }

  let record = null;

  if (gstDetailId && mongoose.Types.ObjectId.isValid(gstDetailId)) {
    record = await GstDetail.findById(gstDetailId);
  }

  if (!record && gstNumber) {
    record = await GstDetail.findOne({
      gst_number: String(gstNumber).trim().toUpperCase(),
    });
  }

  if (!record) {
    throw new Error(
      "An organization request requires a verified GST number"
    );
  }

  if (record.status && record.status !== "Active") {
    throw new Error(
      `This GST registration is "${record.status}". An Active GSTIN is required.`
    );
  }

  return {
    customerCategory: "organization",
    gstDetailId: record._id,
    gstNumber: record.gst_number,
    companyName: record.business_name || "",
    panNumber: record.business_pan || "",
    address: record.business_address || "",
  };
};

/**
 * The request body, whether it arrived as JSON or multipart.
 *
 * Campaign media means the public flow now posts multipart/form-data, where
 * every value would otherwise be a string — so the whole body travels as one
 * JSON blob in a `payload` field. Requests without it (every existing caller,
 * including the admin panel and the previous review modal) fall straight
 * through to req.body untouched.
 */
const readRequestBody = (req) => {
  const payload = req.body?.payload;

  if (typeof payload !== "string") return req.body || {};

  try {
    return JSON.parse(payload);
  } catch {
    throw new Error("Invalid request payload");
  }
};

/* -------------------------------------------------------------------------- */
/*                    RAISING THE ORDER FOR A CLIENT REQUEST                  */
/* -------------------------------------------------------------------------- */
/*  A booking placed on the public site lands in the orders collection too,    */
/*  so it appears in the operations pipeline straight away instead of sitting  */
/*  on the client-request screen waiting to be retyped.                        */
/*                                                                            */
/*  Everything below deliberately mirrors createAdminOrder in                  */
/*  controllers/Adminordercontroller: same order-id format, same pricing       */
/*  formulas, same booking-item shape. That controller is NOT imported —       */
/*  it does not export these helpers — so a change to its pricing has to be    */
/*  mirrored here on purpose.                                                  */
/*                                                                            */
/*  Fields the public flow has no entry point for (designation, state, city,   */
/*  bookingFor, extraKm, extraHours, extraDays, additional charges) are left   */
/*  at their empty/zero defaults on purpose. Admin fills them in from the      */
/*  order-creation screen, where every one of them is already editable.        */

const ADMIN_ORDER_GST_RATE = 0.18;

/**
 * Prices one booking item from its package.
 *
 * Mirrors calcPricingBackend in the admin order controller. The extras that
 * controller supports — extra KM, extra hours, extra days and additional
 * charges — are always zero here because the public site cannot enter them,
 * so the arithmetic reduces to rental + promoter + RTO.
 */
const priceBookingItemFromPackage = (pkg, line) => {
  const totalDays = Number(line.totalDays) || 0;
  const quantity = Math.max(Number(line.quantity) || 1, 1);
  const needPromoter = Boolean(line.needPromoter);
  const promoterQuantity = needPromoter
    ? Math.max(Number(line.promoterQuantity) || 0, 0)
    : 0;

  /* Same env constant, same default, as the admin controller reads */
  const promoterChargePerDay = parseFloat(
    process.env.DEFAULT_PROMOTER_CHARGE || "1000"
  );

  const rentalCost = (pkg.perDayRentalCost || 0) * totalDays * quantity;
  const driverCost = (pkg.driverCharges || 0) * totalDays * quantity;

  const promoterCost = needPromoter
    ? promoterChargePerDay * totalDays * promoterQuantity
    : 0;

  /* RTO charges are not priced for now — kept at 0 rather than removed
     from the pricing shape, mirroring calcPricingBackend in the admin
     order controller. rtoCharges (the package's configured rate) is
     still returned below for reference; it just isn't multiplied in. */
  const rtoCost = 0;

  const subtotal = rentalCost + promoterCost + rtoCost;

  return {
    totalDays,
    perDayRentalCost: pkg.perDayRentalCost || 0,
    driverCharges: pkg.driverCharges || 0,
    promoterChargePerDay: needPromoter ? promoterChargePerDay : 0,
    rtoCharges: pkg.rtoCharges || 0,
    additionalHourCharges: pkg.additionalHourCharges || 0,
    dailyKmLimit: pkg.dailyKmLimit || 0,
    dailyKmcharges: pkg.perKmCharge || 0,
    rentalCost,
    driverCost,
    promoterCost,
    rtoCost,
    subtotal,
    totalAmount: subtotal,
  };
};

/** Escapes a value so it can sit inside a $regex without being read as one. */
const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Resolves a campaign type NAME to its record, creating it when new.
 *
 * The public site sends the name it read from GET admin/campaign-types (or
 * whatever was typed under "Others"), whereas admin order creation sends an
 * id — hence the lookup by name here.
 */
const resolveCampaignTypeByName = async (name) => {
  const trimmed = String(name || "").trim();

  if (!trimmed) return { campaignTypeRef: null, campaignTypeName: "" };

  let record = await CampaignType.findOne({
    name: { $regex: `^${escapeRegex(trimmed)}$`, $options: "i" },
  });

  if (!record) {
    record = await CampaignType.create({ name: trimmed });
  }

  return { campaignTypeRef: record._id, campaignTypeName: record.name };
};

/**
 * Builds and saves the Order for a saved client request.
 *
 * Returns the created order, or null when it could not be built — a line
 * with no packageId, or a package that no longer exists. The caller treats
 * null as "leave it for admin to create by hand", never as a failure: the
 * customer's request is already saved and must not be rejected because the
 * back-office mirror of it could not be written.
 */
const createOrderForClientRequest = async (clientRequest) => {
  const lines = clientRequest.vehicleTypes || [];

  if (!lines.length) return null;

  const bookingItems = [];

  for (const line of lines) {
    if (!line.packageId) return null;

    const pkg = await Package.findById(line.packageId);

    if (!pkg) return null;

    const pricing = priceBookingItemFromPackage(pkg, line);

    const { campaignTypeRef, campaignTypeName } =
      await resolveCampaignTypeByName(line.campaignType);

    bookingItems.push({
      packageId: pkg._id,
      vehicleType: pkg.vehicleType,
      vehicleModel: pkg.vehicleModel,

      /* No public entry point — admin fills these in */
      bookingFor: "",
      gstNumber: "",
      state: "",
      city: "",
      fromLocation: "",
      toLocation: "",
      extraKm: 0,
      extraHours: 0,
      extraDays: 0,
      extraKmCost: 0,
      extraHourCost: 0,
      additionalNet: 0,
      additionalFields: [],

      campaignType: campaignTypeName,
      campaignTypeRef,
      otherCampaignType: String(line.otherCampaignType || "").trim(),
      campaignName: String(line.campaignName || "").trim(),
      campaignLocation: String(line.campaignLocation || "").trim(),

      fromDate: new Date(line.fromDate),
      toDate: new Date(line.toDate),
      totalDays: pricing.totalDays,
      quantity: Math.max(Number(line.quantity) || 1, 1),

      needPromoter: Boolean(line.needPromoter),
      promoterType: line.needPromoter ? line.promoterType || "" : "",
      otherPromoterType: line.needPromoter
        ? line.otherPromoterType || ""
        : "",
      promoterGender: line.needPromoter ? line.promoterGender || "" : "",
      promoterLanguage: line.needPromoter ? line.promoterLanguage || [] : [],
      promoterQuantity: line.needPromoter
        ? Number(line.promoterQuantity) || 0
        : 0,

      campaignImages: line.campaignImages || [],
      campaignVideos: line.campaignVideos || [],

      perDayRentalCost: pricing.perDayRentalCost,
      driverCharges: pricing.driverCharges,
      promoterChargePerDay: pricing.promoterChargePerDay,
      rtoCharges: pricing.rtoCharges,
      additionalHourCharges: pricing.additionalHourCharges,
      dailyKmcharges: pricing.dailyKmcharges,
      dailyKmLimit: pricing.dailyKmLimit,
      rentalCost: pricing.rentalCost,
      driverCost: pricing.driverCost,
      promoterCost: pricing.promoterCost,
      rtoCost: pricing.rtoCost,
      subtotal: pricing.subtotal,
      totalAmount: pricing.totalAmount,
    });
  }

  const taxableAmount = bookingItems.reduce(
    (total, item) => total + item.totalAmount,
    0
  );

  /* Same flat 18% and same flooring createAdminOrder applies, so a public
     order and an admin one of the same value carry the same total. */
  const grandGst = Math.floor(taxableAmount * ADMIN_ORDER_GST_RATE);
  const grandTotal = taxableAmount + grandGst;

  const isOrganization = clientRequest.customerCategory === "organization";

  /* The verified GST record behind this booking, read back rather than
     rebuilt from the request's own copies, so business_name / business_pan
     are exactly what verification returned.

     Keyed off gstDetailId alone — not off the category as well — because a
     request that carries a verified GSTIN should keep it on the order no
     matter how the customer was classified. */
  let gstVerifyDetails = [];

  if (clientRequest.gstDetailId) {
    const record = await GstDetail.findById(clientRequest.gstDetailId).catch(
      () => null
    );

    if (record) {
      gstVerifyDetails = [
        {
          gstDetailId: record._id,
          gst_number: record.gst_number,
          business_name: record.business_name || "",
          business_pan: record.business_pan || "",
          verifiedAt: new Date(),
        },
      ];
    }
  }

  /* A public booking keeps its OWN id — the CRO number the customer was
     shown on the thank-you page — instead of being given an AO number.
     AO#n means "raised by admin"; reusing it here made a client order
     indistinguishable from an admin one at a glance, and left the customer
     quoting a reference that appears nowhere in the back office.

     clientOrderId is already unique on the request, so no counter and no
     duplicate-key retry is needed. */
  const order = await Order.create({
    orderId: clientRequest.clientOrderId,
    userId: String(clientRequest.userId),
    customerId: clientRequest.userId,

    name: clientRequest.name,
    phone: clientRequest.phone,
    email: clientRequest.email || "",
    address: clientRequest.address || "",

    customerType: isOrganization ? 1 : 0,
    customerCategory: clientRequest.customerCategory,
    companyName: isOrganization ? clientRequest.companyName || "" : "",
    clientName: isOrganization ? clientRequest.name : "",
    /* Not collected on the public site — admin sets it */
    designation: "",
    gstNumber: isOrganization ? clientRequest.gstNumber || "" : "",
    panNumber: isOrganization ? clientRequest.panNumber || "" : "",
    gstVerifyDetails,

    /* The one field that tells the two apart downstream */
    isAdminCreated: false,

    bookingItems,
    grandGst,
    grandTotal,
    orderStatus: "Pending",
    pipelineStatus: "todo",
    pipelineLogs: [
      {
        fromStage: null,
        toStage: "todo",
        movedBy: "Client",
        movedAt: new Date(),
        notes: `Raised from client request ${clientRequest.clientOrderId}`,
      },
    ],
  });

  return order;
};

exports.createClientRequest = async (req, res) => {
  try {
    const body = readRequestBody(req);

    const {
      name,
      email,
      phone,
      userId,
      vehicleTypes,
      campaignType,
      location,
      route,
      addOns,
      subtotal,
      gstPercentage,
      gstAmount,
      estimatedTotal,
      customerCategory,
      gstNumber,
      gstDetailId,
      cgstAmount,
      sgstAmount,
      igstAmount,
      promoterTotal,
    } = body;

    /* The route is customer-authenticated, so the owner comes from the
       token, not the body. Taking it from the body let any caller file a
       request in someone else's name — and then read it back, since the
       owner is what GET /:id checks against. The body value is still
       accepted as a fallback for callers that predate the guard. */
    const ownerId = req.clientUser ? String(req.clientUser._id) : userId;

    // Validation
    if (!name || !phone || !ownerId) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId",
      });
    }

    const processedVehicleTypes = normalizeVehicleTypes(
      vehicleTypes,
      req.files
    );

    const billing = await resolveBillingIdentity({
      customerCategory,
      gstNumber,
      gstDetailId,
    });

    let clientRequest = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clientOrderId = await generateClientOrderId();

      try {
        clientRequest = await ClientRequest.create({
          clientOrderId,
          name: String(name).trim(),
          email: String(email || "").trim().toLowerCase(),
          phone: String(phone).replace(/\D/g, ""),
          userId: ownerId,
          campaignType:
            String(campaignType || "Roadshow Campaign").trim() ||
            "Roadshow Campaign",
          location: String(location || "").trim(),
          route: String(route || "").trim(),
          addOns: Array.isArray(addOns)
            ? addOns
                .filter((item) => typeof item === "string")
                .map((item) => item.trim())
                .filter(Boolean)
            : [],
          vehicleTypes: processedVehicleTypes,
          subtotal: Number(subtotal || 0),
          gstPercentage: Number(gstPercentage || 0),
          gstAmount: Number(gstAmount || 0),
          estimatedTotal: Number(estimatedTotal || 0),

          /* Presentation split of the same gstAmount above — see the model.
             Absent on requests from older callers, which keeps them at 0. */
          cgstAmount: toNonNegativeNumber(cgstAmount),
          sgstAmount: toNonNegativeNumber(sgstAmount),
          igstAmount: toNonNegativeNumber(igstAmount),

          /* Falls back to the sum of the lines when not sent explicitly */
          promoterTotal:
            toNonNegativeNumber(promoterTotal) ||
            processedVehicleTypes.reduce(
              (total, vehicle) => total + (vehicle.promoterCost || 0),
              0
            ),

          ...billing,
        });

        break;
      } catch (error) {
        if (error.code !== 11000 || attempt === 4) {
          throw error;
        }
      }
    }

    /* ── Mirror it into the orders collection ─────────────────────────────
       Deliberately non-fatal. The customer's request is already saved and
       must not be rejected because the back-office copy could not be
       written — admin can still create the order by hand from the
       client-request screen, exactly as before this existed. */
    try {
      const order = await createOrderForClientRequest(clientRequest);

      if (order) {
        clientRequest.orderRef = order._id;
        clientRequest.orderId = order.orderId;

        await clientRequest.save();

        /* Same non-fatal contract as the order mirror above — the
           customer's request is already saved either way. */
        try {
          await sendCampaignRequestMail(order);
        } catch (mailError) {
          console.error(
            `Client request ${clientRequest.clientOrderId}: campaign request mail not sent —`,
            mailError.message
          );
        }
      }
    } catch (orderError) {
      console.error(
        `Client request ${clientRequest.clientOrderId}: order not raised —`,
        orderError.message
      );
    }

    await clientRequest.populate([
      { path: "userId", select: "name email phone" },
      { path: "vehicleTypes.vehicleType", select: "name" },
    ]);

    return res.status(201).json({
      success: true,
      data: clientRequest.toObject(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllClientRequests = async (req, res) => {
  try {
    const { status, userId, search } = req.query;
    const filter = {};

    if (status !== undefined) filter.status = Number(status);
    if (userId) filter.userId = userId;

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { clientOrderId: regex },
      ];
    }

    const requests = await populateClientRequest(
      ClientRequest.find(filter).sort({ createdAt: -1 })
    );

    return res.status(200).json({
      success: true,
      data: requests.map((request) => request.toObject()),
      count: requests.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Every request belonging to the signed-in customer.
 *
 * Exists so the public "My Bookings" screen no longer has to pull the
 * staff-facing listing — the whole collection, every customer's contact
 * details and prices included — and filter it in the browser.
 */
exports.getMyClientRequests = async (req, res) => {
  try {
    const requests = await populateClientRequestForList(
      ClientRequest.find({ userId: req.clientUser._id }).sort({
        createdAt: -1,
      })
    );

    const plain = requests.map((request) => request.toObject());
    await attachVehicleTypeImages(plain);

    return res.status(200).json({
      success: true,
      data: plain.map((request) => attachTrackingSummary(request)),
      count: requests.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get by ID
exports.getClientRequestById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client request ID",
      });
    }

    const request = await populateClientRequestForList(
      ClientRequest.findById(req.params.id)
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    /* A customer may only read their own. Answered as "not found" rather
       than "not yours", because confirming that a given id exists is
       itself something a stranger should not be able to learn. Staff
       (no req.clientUser) fall straight through and see everything. */
    if (
      req.clientUser &&
      String(request.userId?._id || request.userId) !==
        String(req.clientUser._id)
    ) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    const plain = request.toObject();
    await attachVehicleTypeImages([plain]);

    return res.status(200).json({
      success: true,
      data: attachTrackingSummary(plain),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * The client-safe campaign tracking console payload for one booking:
 * current stage, a dynamically generated progress timeline, a deduped
 * milestone activity feed, and (only once the backend says the campaign is
 * actually on road) a day-of-N counter. Deliberately excludes everything
 * internal — handler names, notes, project codes, costing, driver contact
 * details — the caller only ever gets what Utils/clientJourneyStages and
 * TRACKING_ORDER_SELECT explicitly allow through.
 */
exports.getClientRequestTracking = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client request ID",
      });
    }

    const request = await ClientRequest.findById(req.params.id).populate(
      "orderRef",
      TRACKING_ORDER_SELECT
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    /* Same ownership rule as getClientRequestById — see comment there. */
    if (
      req.clientUser &&
      String(request.userId) !== String(req.clientUser._id)
    ) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    const order = request.orderRef || null;
    const submittedAt = request.createdAt;
    const { stageIndex, isCancelled, vehicleUnavailable } = deriveJourneyStage(order);

    const campaignStart = request.vehicleTypes?.[0]?.fromDate || null;
    const campaignEnd = request.vehicleTypes?.[0]?.toDate || null;
    const dayWiseReport = buildDayWiseReport(order, campaignStart, campaignEnd, stageIndex);

    return res.status(200).json({
      success: true,
      data: {
        clientOrderId: request.clientOrderId,
        bookingSummary: {
          campaignName: request.vehicleTypes?.[0]?.campaignName || "",
          location: request.location || request.vehicleTypes?.[0]?.campaignLocation || "",
          startDate: campaignStart,
          endDate: campaignEnd,
          totalDays: request.vehicleTypes?.[0]?.totalDays || null,
          vehicleTypeCount: request.vehicleTypes?.length || 0,
          vehicleCount: (request.vehicleTypes || []).reduce(
            (sum, v) => sum + (v.quantity || 0),
            0
          ),
        },
        journeyStage: { index: stageIndex, key: JOURNEY_STEPS[stageIndex].key },
        isCancelled,
        vehicleUnavailable,
        onRoad: deriveOnRoadDay(order, request.vehicleTypes),
        steps: buildSteps(order, submittedAt),
        activity: buildActivity(order, submittedAt),
        dayWiseReport,
        photos: flattenPhotos(dayWiseReport),
        lastUpdatedAt: order?.updatedAt || request.updatedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Lightweight, frequently-polled live GPS lookup for one booking. Kept
 * separate from getClientRequestTracking (and its own populate select) so a
 * live-tracking poll never has to pull the whole order — see Utils/
 * clientJourneyStages LIVE_LOCATION_ORDER_SELECT. Returns an empty vehicle
 * list (still 200, not an error) whenever the campaign isn't actually on
 * road — no Vamosys call is made in that case at all.
 */
exports.getClientRequestLiveLocation = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client request ID",
      });
    }

    const request = await ClientRequest.findById(req.params.id).populate(
      "orderRef",
      LIVE_LOCATION_ORDER_SELECT
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    /* Same ownership rule as getClientRequestById — see comment there. */
    if (
      req.clientUser &&
      String(request.userId) !== String(req.clientUser._id)
    ) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    const order = request.orderRef || null;

    if (!order || order.pipelineStatus !== "onRoad") {
      return res.status(200).json({
        success: true,
        data: { vehicles: [] },
      });
    }

    const activeEntries = (order.onRoadExecutionArray || []).filter(
      (e) => e.entryStatus !== "removed" && e.vehicleRegistrationNumber
    );

    /* A vehicle marked unavailable by operations must still be reported to
       the client — just as "unavailable", not silently dropped. Only the
       still-available registrations are worth a Vamosys lookup. */
    const availableRegistrationNumbers = activeEntries
      .filter((e) => !e.unavailableStatus)
      .map((e) => e.vehicleRegistrationNumber);

    const liveVehicleData = await getLiveLocationsForRegistrationNumbers(
      availableRegistrationNumbers
    );
    const liveByReg = new Map(
      liveVehicleData.map((v) => [v.registrationNumber, v])
    );

    const typeNameMap = await resolveVehicleTypeNames(order.bookingItems);

    /* Every booked vehicle SLOT is reported, not just the ones operations
       has already assigned a driver + registration number to. A booking
       line with quantity 2 is 2 slots; onRoadExecutionArray only grows an
       entry per slot as admin fills it in (submitOnRoadDetails), so any
       slot with no matching entry yet is reported "pending" instead of
       being silently omitted — otherwise a customer who booked 2 vehicle
       types but only has 1 assigned sees just 1 vehicle card with no
       indication the 2nd one even exists. */
    const vehicles = [];

    (order.bookingItems || []).forEach((item, vehicleIndex) => {
      const vehicleName =
        typeNameMap.get(item.vehicleType && String(item.vehicleType)) ||
        item.vehicleModel ||
        "Vehicle";

      const slots = Math.max(Number(item.quantity) || 1, 1);
      const entriesForLine = activeEntries.filter(
        (e) => e.vehicleIndex === vehicleIndex
      );

      for (let slot = 0; slot < slots; slot += 1) {
        const entry = entriesForLine[slot];

        if (!entry) {
          vehicles.push({
            vehicleIndex,
            vehicleName,
            registrationNumber: null,
            pending: true,
            unavailable: false,
            message: "Driver & vehicle not yet assigned",
          });
          continue;
        }

        if (entry.unavailableStatus) {
          vehicles.push({
            vehicleIndex,
            vehicleName,
            registrationNumber: entry.vehicleRegistrationNumber,
            pending: false,
            unavailable: true,
          });
          continue;
        }

        const live = liveByReg.get(entry.vehicleRegistrationNumber);

        vehicles.push({
          vehicleIndex,
          vehicleName,
          pending: false,
          unavailable: false,
          registrationNumber: entry.vehicleRegistrationNumber,
          ...(live || {}),
        });
      }
    });

    return res.status(200).json({
      success: true,
      data: { vehicles },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Today's driving-time breakdown (moving/parked/idle/no-data) and trip
 * stats per vehicle — a much heavier, server-cached Vamosys call than
 * live-location, so it's deliberately its own endpoint polled on a slower
 * interval by the frontend. Same empty-fleet short-circuit when the
 * campaign isn't on road.
 */
exports.getClientRequestDrivingSummary = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client request ID",
      });
    }

    const request = await ClientRequest.findById(req.params.id).populate(
      "orderRef",
      LIVE_LOCATION_ORDER_SELECT
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    /* Same ownership rule as getClientRequestById — see comment there. */
    if (
      req.clientUser &&
      String(request.userId) !== String(req.clientUser._id)
    ) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    const order = request.orderRef || null;

    if (!order || order.pipelineStatus !== "onRoad") {
      return res.status(200).json({
        success: true,
        data: { vehicles: [] },
      });
    }

    const activeEntries = (order.onRoadExecutionArray || []).filter(
      (e) => e.entryStatus !== "removed" && e.vehicleRegistrationNumber
    );

    /* Frontend (useDrivingSummary.ts) already sends ?day=YYYY-MM-DD when the
       client picks a past campaign day from the history tabs — honor it
       instead of always defaulting to today, otherwise every day selection
       silently returns today's summary. */
    const requestedDay = String(req.query.day || "").trim();
    const day = requestedDay || todayIndiaDateKey();

    const vehicles = await Promise.all(
      activeEntries.map(async (entry) => {
        const registrationNumber = entry.vehicleRegistrationNumber;

        /* Unavailable vehicles are reported as such, not omitted — see
           getClientRequestLiveLocation for the same rule. */
        if (entry.unavailableStatus) {
          return { registrationNumber, drivingSummary: null };
        }

        try {
          const drivingSummary = await getDrivingSummaryForDay(registrationNumber, day);
          return { registrationNumber, drivingSummary };
        } catch {
          return { registrationNumber, drivingSummary: null };
        }
      })
    );

    return res.status(200).json({
      success: true,
      data: { vehicles },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Track id for Vamosys's own public animated-route embed (moving marker +
 * speedometer) per vehicle — same short-circuit rules as live-location.
 * A vehicle's track id is best-effort: if Vamosys fails for one
 * registration the others still come back, with that entry's trackId null
 * (the frontend falls back to its own map for that vehicle only).
 */
exports.getClientRequestRouteTrack = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client request ID",
      });
    }

    const request = await ClientRequest.findById(req.params.id).populate(
      "orderRef",
      LIVE_LOCATION_ORDER_SELECT
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    /* Same ownership rule as getClientRequestById — see comment there. */
    if (
      req.clientUser &&
      String(request.userId) !== String(req.clientUser._id)
    ) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    const order = request.orderRef || null;

    if (!order || order.pipelineStatus !== "onRoad") {
      return res.status(200).json({
        success: true,
        data: { vehicles: [] },
      });
    }

    const activeEntries = (order.onRoadExecutionArray || []).filter(
      (e) => e.entryStatus !== "removed" && e.vehicleRegistrationNumber
    );

    const vehicles = await Promise.all(
      activeEntries.map(async (entry) => {
        const registrationNumber = entry.vehicleRegistrationNumber;

        /* Unavailable vehicles are reported as such, not omitted — see
           getClientRequestLiveLocation for the same rule. */
        if (entry.unavailableStatus) {
          return { registrationNumber, trackId: null };
        }

        try {
          const trackId = await getRouteTrackId(registrationNumber);
          return { registrationNumber, trackId };
        } catch {
          return { registrationNumber, trackId: null };
        }
      })
    );

    return res.status(200).json({
      success: true,
      data: { vehicles },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update
exports.updateClientRequest = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client request ID",
      });
    }

    const updateData = { ...readRequestBody(req) };
    delete updateData.clientOrderId;
    /* Never persisted — it is only the multipart envelope */
    delete updateData.payload;

    if (Array.isArray(updateData.vehicleTypes)) {
      updateData.vehicleTypes = normalizeVehicleTypes(
        updateData.vehicleTypes,
        req.files
      );
    }

    if (updateData.phone) {
      updateData.phone = String(updateData.phone).replace(/\D/g, "");
    }

    if (updateData.email) {
      updateData.email = String(updateData.email).trim().toLowerCase();
    }

    const updated = await ClientRequest.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      {
        new: true,
        runValidators: true
      }
    );
    
    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        message: 'Client request not found' 
      });
    }

    await updated.populate([
      { path: "userId", select: "name email phone" },
      { path: "vehicleTypes.vehicleType", select: "name" },
    ]);

    return res.status(200).json({
      success: true,
      data: updated.toObject(),
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Update status
exports.updateStatus = async (req, res) => {
  try {
    const status = Number(req.body.status);

    if (![0, 1, 2].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status value' 
      });
    }

    const updated = await ClientRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        message: 'Client request not found' 
      });
    }

    return res.status(200).json({
      success: true,
      data: updated.toObject(),
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Delete
exports.deleteClientRequest = async (req, res) => {
  try {
    const deleted = await ClientRequest.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Client request not found'
      });
    }
    res.status(200).json({
      success: true,
      message: 'Deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Detailed Vamosys vehicle history for the logged-in client's booking.
 *
 * Supports:
 * - last 6 hours
 * - last 12 hours
 * - today
 * - yesterday
 * - custom date/time range
 *
 * Security:
 * - Client can only access their own booking.
 * - Vehicle number must exist inside onRoadExecutionArray.
 * - Unavailable vehicles remain visible but are not queried from Vamosys.
 */
exports.getClientRequestVehicleHistory = async (req, res) => {
  try {
    /* =====================================================
       VALIDATE BOOKING ID
    ===================================================== */

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client request ID",
      });
    }

    /* =====================================================
       GET REQUEST + CLIENT SAFE ORDER FIELDS
    ===================================================== */

    const request = await ClientRequest.findById(req.params.id).populate(
      "orderRef",
      LIVE_LOCATION_ORDER_SELECT
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    /* =====================================================
       OWNERSHIP VALIDATION

       Staff has no req.clientUser.
       Client must own this booking.
    ===================================================== */

    if (
      req.clientUser &&
      String(request.userId) !== String(req.clientUser._id)
    ) {
      return res.status(404).json({
        success: false,
        message: "Client request not found",
      });
    }

    const order = request.orderRef || null;

    /* =====================================================
       RESOLVE REQUESTED HISTORY RANGE
    ===================================================== */

    let range;

    try {
      range = resolveHistoryRange(req.query);
    } catch (rangeError) {
      return res.status(400).json({
        success: false,
        message:
          rangeError.message ||
          "Invalid vehicle history date/time range",
      });
    }

    /* =====================================================
       ONLY ON-ROAD CAMPAIGNS HAVE GPS HISTORY
    ===================================================== */

    if (!order || order.pipelineStatus !== "onRoad") {
      return res.status(200).json({
        success: true,

        data: {
          range,
          vehicles: [],
        },
      });
    }

    /* =====================================================
       ACTIVE ON-ROAD VEHICLES
    ===================================================== */

    const activeEntries = (
      order.onRoadExecutionArray || []
    ).filter(
      (entry) =>
        entry.entryStatus !== "removed" &&
        entry.vehicleRegistrationNumber
    );

    /* =====================================================
       OPTIONAL VEHICLE FILTER

       Frontend can send:

       ?vehicle=TN58BF3736

       But backend verifies that it belongs to this order.
    ===================================================== */

    const requestedVehicle = String(
      req.query.vehicle || ""
    )
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();

    let requestedEntries = activeEntries;

    if (requestedVehicle) {
      requestedEntries = activeEntries.filter(
        (entry) => {
          const registrationNumber = String(
            entry.vehicleRegistrationNumber || ""
          )
            .trim()
            .replace(/\s+/g, "")
            .toUpperCase();

          return (
            registrationNumber === requestedVehicle
          );
        }
      );

      if (!requestedEntries.length) {
        return res.status(400).json({
          success: false,
          message:
            "This vehicle is not assigned to this booking.",
        });
      }
    }

    /* =====================================================
       FETCH HISTORY VEHICLE BY VEHICLE
    ===================================================== */

    const vehicles = await Promise.all(
      requestedEntries.map(async (entry) => {
        const registrationNumber = String(
          entry.vehicleRegistrationNumber || ""
        )
          .trim()
          .replace(/\s+/g, "")
          .toUpperCase();

        /* -----------------------------------------------
           VEHICLE MARKED UNAVAILABLE BY OPERATIONS
        ------------------------------------------------ */

        if (entry.unavailableStatus) {
          return {
            registrationNumber,

            unavailable: true,

            message:
              "Vehicle is marked unavailable in On Road operations.",

            rows: [],

            summary: {
              pointCount: 0,
              distanceKm: 0,
              maxSpeedKmh: 0,
              movingCount: 0,
              parkedCount: 0,
              idleCount: 0,
              ignitionOnCount: 0,
              startAddress: "",
              endAddress: "",
            },
          };
        }

        /* -----------------------------------------------
           AVAILABLE VEHICLE → FETCH VAMOSYS HISTORY
        ------------------------------------------------ */

        try {
          return await getVehicleHistory(
            registrationNumber,
            range
          );
        } catch (historyError) {
          console.error(
            `Vehicle history failed for ${registrationNumber}:`,
            historyError.message
          );

          /*
           One failed vehicle must NOT break history
           for every other vehicle.
          */
          return {
            registrationNumber,

            unavailable: false,

            message:
              historyError.message ||
              "Vehicle history is temporarily unavailable.",

            rows: [],

            summary: {
              pointCount: 0,
              distanceKm: 0,
              maxSpeedKmh: 0,
              movingCount: 0,
              parkedCount: 0,
              idleCount: 0,
              ignitionOnCount: 0,
              startAddress: "",
              endAddress: "",
            },
          };
        }
      })
    );

    /* =====================================================
       RESPONSE
    ===================================================== */

    return res.status(200).json({
      success: true,

      data: {
        range,

        vehicles: vehicles.filter(Boolean),
      },
    });
  } catch (error) {
    console.error(
      "getClientRequestVehicleHistory error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to load vehicle history",
    });
  }
};