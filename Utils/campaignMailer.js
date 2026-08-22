require("dotenv").config();
const axios = require("axios");
const VehicleType = require("../Models/VehicleTypeSchema");

/* Mirrors Utils/focMailer.js and the mail block in
   controllers/roadshowQuotation/roadshowQuotationController.js — same
   env-configured API URL / TO / CC pattern, same non-fatal-on-failure
   contract (the caller decides whether a mail failure should be logged
   and swallowed, which is why this throws rather than returning a
   success flag: every call site here already wraps it in its own
   try/catch, exactly like createOrderForClientRequest does). */

const ROADSHOW_CAMPAIGN_MAIL_API_URL =
  process.env.ROADSHOW_CAMPAIGN_MAIL_API_URL ||
  "https://adinndigital.com/api/roadshows/index_rdsw_Campaign.php";

const ROADSHOW_CAMPAIGN_MAIL_TO =
  process.env.ROADSHOW_CAMPAIGN_MAIL_TO || "reactdeveloper@adinn.co.in";

const ROADSHOW_CAMPAIGN_MAIL_CC =
  process.env.ROADSHOW_CAMPAIGN_MAIL_CC ||
  "smm@adinn.co.in,2002karthikatg@gmail.com";

const normalizeEmailCsv = (value = "") =>
  String(value || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

const fmtDate = (d) => {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0]; // YYYY-MM-DD
};

const frontendBaseUrl = () =>
  (process.env.FRONTEND_BASE_URL || "").replace(/\/$/, "");

/**
 * bookingItems.vehicleType is an ObjectId ref into VehicleType, whose
 * typeName is the actual descriptive display name (e.g. "4 Side LED
 * Roadshow Vehicle") — the same value the admin Vehicle Onboarding screen
 * writes as "vehicleName" everywhere else in this codebase.
 * bookingItems.vehicleModel is a different, unrelated field: the rate-card
 * package variant name (e.g. "Non-Customized"), not a display name. One
 * batched query for every order, not one per line.
 */
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

/**
 * One booking line, in the shape the mail template expects.
 *
 * bookingItems on the Order carries pricing under different field names
 * (perDayRentalCost, totalAmount) than the mail payload sample
 * (pricePerDay, lineTotal) — this is purely a rename, no different math.
 */
const buildVehicleLine = (item, typeNameMap) => ({
  vehicleId: item.packageId ? String(item.packageId) : "",
  vehicleName:
    typeNameMap.get(item.vehicleType && String(item.vehicleType)) ||
    item.vehicleModel ||
    "",
  quantity: item.quantity || 0,

  fromDate: fmtDate(item.fromDate),
  toDate: fmtDate(item.toDate),
  totalDays: item.totalDays || 0,

  campaignType: item.campaignType || "",
  campaignName: item.campaignName || "",
  campaignLocation: item.campaignLocation || "",

  pricePerDay: item.perDayRentalCost || 0,
  rentalCost: item.rentalCost || 0,
  lineTotal: item.totalAmount || 0,

  needPromoter: !!item.needPromoter,
  promoterType: item.needPromoter ? item.promoterType || "" : "",
  promoterGender: item.needPromoter ? item.promoterGender || "" : "",
  promoterLanguage: item.needPromoter ? item.promoterLanguage || [] : [],
  promoterQuantity: item.needPromoter ? item.promoterQuantity || 0 : 0,
  promoterCost: item.needPromoter ? item.promoterCost || 0 : 0,
});

/**
 * Pricing block for the mail. Reuses the totals already computed and
 * stored on the order (grandGst/grandTotal, at the same flat 18% both
 * createAdminOrder and createOrderForClientRequest apply) rather than
 * recomputing GST here, so the mailed figures can never drift from what
 * was actually saved.
 *
 * cgst/sgst are a straight 50/50 split of grandGst — the Order schema has
 * no interstate/intrastate flag to pick CGST+SGST vs IGST correctly, so
 * IGST is always reported as 0. Flagged here rather than silently guessed.
 */
const buildPricing = (order) => {
  const items = order.bookingItems || [];
  const subtotal = items.reduce((sum, item) => sum + (item.rentalCost || 0), 0);
  const promoterTotal = items.reduce((sum, item) => sum + (item.promoterCost || 0), 0);
  const gstAmount = order.grandGst || 0;
  const cgstAmount = Math.round(gstAmount / 2);
  const sgstAmount = gstAmount - cgstAmount;

  return {
    subtotal,
    promoterTotal,
    gstPercentage: 18,
    gstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount: 0,
    estimatedTotal: order.grandTotal || 0,
  };
};

const buildCampaignMailData = async (order) => {
  const typeNameMap = await resolveVehicleTypeNames(order.bookingItems);

  return {
    clientOrderId: order.orderId,
    orderId: order.orderId,
    createdAt: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString(),
    status: 0,

    customer: {
      name: order.name || "",
      email: order.email || "",
      phone: order.phone || "",
      customerCategory: order.customerCategory || "individual",
      companyName: order.companyName || "",
      gstNumber: order.gstNumber || "",
      panNumber: order.panNumber || "",
      address: order.address || "",
    },

    vehicles: (order.bookingItems || []).map((item) => buildVehicleLine(item, typeNameMap)),
    pricing: buildPricing(order),
  };
};

/**
 * Sends the roadshowCampaignRequest mail for one order — same payload/
 * recipients for both an admin-created order (createAdminOrder) and a
 * public booking's mirrored order (createOrderForClientRequest), since
 * both write the same Order shape.
 *
 * Throws on failure; every call site wraps this in its own try/catch so a
 * mail outage never blocks the order that already exists.
 */
async function sendCampaignRequestMail(order) {
  const base = frontendBaseUrl();
  const mailData = await buildCampaignMailData(order);

  const payload = {
    mailtype: "roadshowCampaignRequest",

    customerEmail: order.email || "",
    customerName: order.name || "",

    toEmail: ROADSHOW_CAMPAIGN_MAIL_TO,
    ccEmail: normalizeEmailCsv(ROADSHOW_CAMPAIGN_MAIL_CC),

    customerBookingUrl: `${base}/roadshow/my-bookings`,
    adminRequestUrl: `${base}/admin/sales-handling`,

    bookingSummaryPdf: "",
    bookingSummaryFilename: `Booking_Summary_${order.orderId}.pdf`,

    data: mailData,
  };

  console.log("Roadshow campaign request mail payload:", JSON.stringify(payload, null, 2));

  let response;
  try {
    response = await axios.post(ROADSHOW_CAMPAIGN_MAIL_API_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });
  } catch (err) {
    throw new Error(
      `Roadshow campaign mail API request failed: ${err?.response?.data?.message || err.message}`
    );
  }

  const data = response.data;
  if (!data || data.status !== "success") {
    throw new Error(`Roadshow campaign mail API did not confirm success: ${data?.message || "unknown error"}`);
  }

  return data;
}

module.exports = { sendCampaignRequestMail, buildCampaignMailData };
