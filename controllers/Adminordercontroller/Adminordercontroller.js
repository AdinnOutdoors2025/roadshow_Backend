
/* eslint-disable */
const path = require("path");
const Order = require("../../Models/AdminorderModel/Adminorder");
const User = require("../../Models/User/user");
const Package = require("../../Models/PackageManagementModel/packagemanagement");
require("dotenv").config();
const CampaignType = require("../../Models/CampaignTypeModel/campaigntype");
const { successResponse, errorResponse } = require("../../Utils/response");
const { sendFocMail, getActiveAdminEmails, getEmailByUsername } = require('../../Utils/focMailer');
const { sendCampaignRequestMail, buildBookingSummaryPdfData } = require('../../Utils/campaignMailer');
const { sendOrderCreatedSms } = require('../../Utils/orderSms');
const VehicleMaster = require("../../Models/vehicleDetails");
const VehicleType = require("../../Models/VehicleTypeSchema");
const { checkVehicleAvailability } = require("../../Utils/vehicleAvailability");
const { fetchVamosysApiKey, fetchAllVehicleLocations } = require("../../Utils/vamosysClient");


async function generateAdminOrderId() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const prefix = `${year}${month}${day}`;

  const start = new Date(year, today.getMonth(), today.getDate());
  const end = new Date(year, today.getMonth(), today.getDate() + 1);
  const count = await Order.countDocuments({ createdAt: { $gte: start, $lt: end } });

  return `${prefix}AO#${count + 1}`;
}


exports.createCustomer = async (req, res) => {
  try {
    const { name, phone, address, email } = req.body;

    if (!name?.trim())
      return errorResponse(res, "Customer name is required", null, 400);
    if (!phone)
      return errorResponse(res, "Phone number is required", null, 400);

    const phoneStr = phone.toString().trim();
    if (!/^[6-9]\d{9}$/.test(phoneStr))
      return errorResponse(res, "Enter a valid 10-digit Indian mobile number", null, 400);
    if (!address?.trim())
      return errorResponse(res, "Address is required", null, 400);

    const existingUser = await User.findOne({ phone: phoneStr });
    if (existingUser) {
      return successResponse(res, "Customer already exists", {
        customer: existingUser,
        alreadyExists: true,
      }, 200);
    }

    const customer = new User({
      name: name.trim(),
      phone: phoneStr,
      address: address.trim(),
      isVerified: true,
      ...(email && { email: email.trim().toLowerCase() }),
    });
    await customer.save();

    return successResponse(res, "Customer created successfully", { customer, alreadyExists: false }, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};


// ── Pricing calculation helper ─────────────────────────────────
function calcPricingBackend(pkg, v) {
  const from = new Date(v.fromDate);
  const to = new Date(v.toDate);
  const baseDays = Math.ceil((to - from) / 86400000) + 1;
  const totalDays = baseDays + (Number(v.extraDays) || 0);
  const quantity = Number(v.quantity) || 1;
  const extraKm = Number(v.extraKm) || 0;
  const extraHours = Number(v.extraHours) || 0;
  const needPromoter = !!v.needPromoter;
  const promoterQuantity = Number(v.promoterQuantity) || 0;

  const rentalCost = pkg.perDayRentalCost * totalDays * quantity;
  const driverCost = pkg.driverCharges * totalDays * quantity;
   const promoterChargePerDay = parseFloat(process.env.DEFAULT_PROMOTER_CHARGE_PER_DAY || "1000");

  //  promoter charges default data
  // Promoter is priced only for the selected Promoter From/To days
  // (inclusive) — falls back to the full campaign totalDays when no
  // promoter date range was sent (keeps older clients/saved orders working).
  let promoterDays = totalDays;
  if (v.promoterFromDate && v.promoterToDate) {
    const pFrom = new Date(v.promoterFromDate);
    const pTo = new Date(v.promoterToDate);
    if (pFrom <= pTo) {
      promoterDays = Math.ceil((pTo - pFrom) / 86400000) + 1;
    }
  }
  const promoterCost = needPromoter
    // ? (pkg.promoterChargePerDay || 0) * totalDays * promoterQuantity
       ? (promoterChargePerDay || 0) * promoterDays * promoterQuantity
    : 0;
  // RTO is a one-time flat charge per vehicle-type slot (from the selected
  // package), applied once regardless of totalDays.
  const rtoCost = (pkg.rtoCharges || 0) * quantity;
  // Branding Cost — only ever set on a Hybrid vehicle's package; same
  // one-time-per-vehicle-slot pattern as RTO.
  const brandingCost = (pkg.brandingCost || 0) * quantity;
  const extraKmCost = extraKm > 0 ? (pkg.perKmCharge || 0) * extraKm : 0;
  const extraHourCost = extraHours > 0 ? pkg.additionalHourCharges * extraHours : 0;

  const additionalCharges = v.additionalCharges || [];
  const additionalAdds = additionalCharges.reduce((acc, c) => {
    const amt = Number(c.amount) || 0;
    return c.mode === "+" ? acc + amt : acc;
  }, 0);

  const subtotal =
    rentalCost + promoterCost + rtoCost + brandingCost + extraKmCost + extraHourCost + additionalAdds;

  const MAX_DISCOUNT_PCT = parseFloat(process.env.MAX_DISCOUNT_PERCENT || "15");
  const maxDiscountAmount = Math.floor(subtotal * (MAX_DISCOUNT_PCT / 100));

  const additionalCuts = additionalCharges.reduce((acc, c) => {
    if (c.mode !== "-") return acc;
    const remaining = Math.max(maxDiscountAmount - acc, 0);
    if (remaining === 0) return acc;
    const requestedAmt = Number(c.amount) || 0;
    return acc + Math.min(requestedAmt, remaining);
  }, 0);

  const additionalNet = additionalAdds - additionalCuts;
  const totalAmount = Math.max(subtotal - additionalCuts, 0);

  return {
    totalDays,
    perDayRentalCost: pkg.perDayRentalCost,
    driverCharges: pkg.driverCharges,
    // promoterChargePerDay: needPromoter ? pkg.promoterChargePerDay : 0,
     promoterChargePerDay: needPromoter ? promoterChargePerDay : 0,
    promoterDays,
    rtoCharges: pkg.rtoCharges,
    brandingCost,
    additionalHourCharges: pkg.additionalHourCharges,
    dailyKmLimit: pkg.dailyKmLimit,
    dailyKmcharges: pkg.perKmCharge,
    rentalCost,
    driverCost,
    promoterCost,
    rtoCost,
    extraKmCost,
    extraHourCost,
    additionalAdds,
    additionalCuts,
    additionalNet,
    subtotal,
    taxableAmount: totalAmount,
    totalAmount,
  };
}



const IMAGE_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DOC_MAX_BYTES = 10 * 1024 * 1024;

const VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/webm"];
const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const validateFile = (file, label) => {
  if (!file) return null;
  const isImage = IMAGE_MIMES.includes(file.mimetype);
  const isVideo = VIDEO_MIMES.includes(file.mimetype);
  const fileSize = file.size || 0;

  if (isImage && fileSize > IMAGE_MAX_BYTES) {
    return `Image upload only 5 MB allowed. "${file.originalname}" is ${(fileSize / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (isVideo && fileSize > VIDEO_MAX_BYTES) {
    return `Video upload only 50 MB allowed. "${file.originalname}" is ${(fileSize / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (!isImage && !isVideo && fileSize > DOC_MAX_BYTES) {
    return `PDF document upload only 10 MB allowed. "${file.originalname}" is ${(fileSize / (1024 * 1024)).toFixed(2)} MB`;
  }
  return null;
};


const STAGE_ORDER = [
  "todo",
  "projectExecution",
  "onRoad",
  "vehicleUnavailable",
  "clientClosure",
  "closedWon",
  "closedLost",
];

// ── Helper: file URL ───────────────────────────────────────────────────────
const { resolveStoredUrl } = require("../../Utils/spaceUrl");
function getFileUrl(file) {
  if (!file) return null;
  return resolveStoredUrl(file) || null;
}


exports.createAdminOrder = async (req, res) => {

  try {
    const {
      customerName, customerPhone, customerAddress, customerEmail,
      customerCategory, companyName, clientName, designation, gstNumber, panNumber,
    } = req.body;

    const category = customerCategory || "individual";

    if (category === "individual") {
      if (!customerName?.trim()) return errorResponse(res, "Customer name is required", null, 400);
      if (!customerPhone) return errorResponse(res, "Phone number is required", null, 400);
      if (!/^[6-9]\d{9}$/.test(customerPhone.toString().trim()))
        return errorResponse(res, "Enter a valid 10-digit mobile number", null, 400);
      if (!customerEmail?.trim()) return errorResponse(res, "Email is required", null, 400);
    } else {
      if (!companyName?.trim()) return errorResponse(res, "Company name is required", null, 400);
      if (!clientName?.trim()) return errorResponse(res, "Client name is required", null, 400);
      if (!customerPhone) return errorResponse(res, "Phone number is required", null, 400);
      if (!/^[6-9]\d{9}$/.test(customerPhone.toString().trim()))
        return errorResponse(res, "Enter a valid 10-digit mobile number", null, 400);
      if (!customerEmail?.trim()) return errorResponse(res, "Email is required", null, 400);
      if (!gstNumber?.trim()) return errorResponse(res, "GST number is required", null, 400);
      if (!panNumber?.trim()) return errorResponse(res, "PAN number is required", null, 400);
    }

    const vehicles = [];
    let idx = 0;
    while (req.body[`vehicle_${idx}`] !== undefined) {
      try { vehicles.push(JSON.parse(req.body[`vehicle_${idx}`])); }
      catch { return errorResponse(res, `vehicle_${idx} is not valid JSON`, null, 400); }
      idx++;
    }

    if (!vehicles || vehicles.length === 0)
      return errorResponse(res, "At least one vehicle is required", null, 400);

    const bookingItems = [];
    const availabilityFailures = [];
    const pkgCache = [];

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const missing = [];
      if (!v.packageId) missing.push("packageId");
      if (v.campaignType === "Other" && !v.otherCampaignType) missing.push("otherCampaignType");
      if (!v.fromDate) missing.push("fromDate");
      if (!v.toDate) missing.push("toDate");
      if (!v.campaignLocation && !(v.fromLocation && v.toLocation)) missing.push("campaignLocation");
      if (!v.quantity || Number(v.quantity) < 1) missing.push("quantity");
      if (missing.length > 0)
        return errorResponse(res, `Vehicle ${i + 1}: Missing fields — ${missing.join(", ")}`, null, 400);

      if (new Date(v.fromDate) >= new Date(v.toDate))
        return errorResponse(res, `Vehicle ${i + 1}: fromDate must be before toDate`, null, 400);

      const pkg = await Package.findById(v.packageId);
      if (!pkg) return errorResponse(res, `Vehicle ${i + 1}: Package not found`, null, 404);
      if (!pkg.isActive) return errorResponse(res, `Vehicle ${i + 1}: Package "${pkg.vehicleModel}" is inactive`, null, 400);

      if (v.needPromoter && !v.promoterType)
        return errorResponse(res, `Vehicle ${i + 1}: promoterType required`, null, 400);
      if (v.needPromoter && v.promoterType === "Other" && !v.otherPromoterType)
        return errorResponse(res, `Vehicle ${i + 1}: otherPromoterType required`, null, 400);

      const availability = await checkVehicleAvailability({
        vehicleType: pkg.vehicleType,
        quantity: v.quantity,
        fromDate: v.fromDate,
        toDate: v.toDate,
      });
      if (!availability.available) {
        const vt = await VehicleType.findById(pkg.vehicleType).catch(() => null);
        const typeName = vt?.typeName || pkg.vehicleType;
        const fmt = (d) => new Date(d).toLocaleDateString("en-GB").replace(/\//g, "-");
        availabilityFailures.push(
          `Vehicle ${i + 1} (${typeName}): Only ${availability.availableCount} vehicle(s) available, you requested ${availability.requiredQuantity}, for dates ${fmt(v.fromDate)} to ${fmt(v.toDate)}`
        );
        pkgCache[i] = pkg;
        continue;
      }
      pkgCache[i] = pkg;
    }

    if (availabilityFailures.length > 0) {
      return errorResponse(res, availabilityFailures.join("\n"), null, 409);
    }

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const pkg = pkgCache[i];

      const fp = calcPricingBackend(pkg, v);

      const additionalFields = (v.additionalCharges || []).map((c) => ({
        label: (c.label || "").trim() || "Custom charge",
        mode: c.mode === "-" ? "-" : "+",
        amount: Math.max(0, Number(c.amount) || 0),
      }));

      let campaignTypeRef = null;
      let campaignTypeName = v.campaignType;
      if (v.campaignType && v.campaignType !== "Other") {
        const ct = await CampaignType.findById(v.campaignType).catch(() => null);
        if (ct) { campaignTypeRef = ct._id; campaignTypeName = ct.name; }
      } else if (v.campaignType === "Other" && v.otherCampaignType?.trim()) {
        let ct = await CampaignType.findOne({
          name: { $regex: `^${v.otherCampaignType.trim()}$`, $options: "i" },
        });
        if (!ct) ct = await CampaignType.create({ name: v.otherCampaignType.trim() });
        campaignTypeRef = ct._id;
        campaignTypeName = ct.name;
      }




      const uploadedFiles = req.files || [];


      const imageFiles = uploadedFiles.filter((f) => f.fieldname === `campaignImages_${i}`);
      for (const imgFile of imageFiles) {
        if ((imgFile.size || 0) > IMAGE_MAX_BYTES) {
          return errorResponse(
            res,
            `Vehicle ${i + 1}: Campaign image "${imgFile.originalname}" exceeds 5 MB limit (uploaded: ${((imgFile.size || 0) / (1024 * 1024)).toFixed(2)} MB)`,
            null,
            400
          );
        }
      }

      const campaignImages = imageFiles.map((f) => getFileUrl(f));
      const campaignVideos = uploadedFiles
        .filter((f) => f.fieldname === `campaignVideos_${i}`)
        .map((f) => getFileUrl(f));

      bookingItems.push({
        packageId: pkg._id,
        vehicleType: pkg.vehicleType,
        vehicleModel: pkg.vehicleModel,
        bookingFor: v.bookingFor,
        gstNumber: v.bookingFor === "Agency" ? (v.gstNumber || "").trim() : "",
        campaignType: campaignTypeName,
        campaignName: (v.campaignName || "").trim(),
        campaignTypeRef,
        otherCampaignType: v.campaignType === "Other" ? (v.otherCampaignType || "") : "",
        promoterGender: v.needPromoter ? (v.promoterGender || "") : "",
        promoterLanguage: v.needPromoter ? (v.promoterLanguage || []) : [],
        promoterQuantity: v.needPromoter ? (Number(v.promoterQuantity) || 0) : 0,
        fromDate: new Date(v.fromDate),
        toDate: new Date(v.toDate),
        state: v.state,
        city: v.city,
        campaignLocation: v.campaignLocation || "",
        fromLocation: v.fromLocation || "",
        toLocation: v.toLocation || "",
        quantity: Number(v.quantity),
        extraKm: Number(v.extraKm) || 0,
        extraDays: Number(v.extraDays) || 0,
        extraHours: Number(v.extraHours) || 0,
        needPromoter: !!v.needPromoter,
        promoterFromDate: v.needPromoter && v.promoterFromDate ? new Date(v.promoterFromDate) : null,
        promoterToDate: v.needPromoter && v.promoterToDate ? new Date(v.promoterToDate) : null,
        promoterType: v.needPromoter ? v.promoterType : "",
        otherPromoterType: v.needPromoter && v.promoterType === "Other" ? v.otherPromoterType : "",
        campaignImages,
        campaignVideos,
        totalDays: fp.totalDays,
        perDayRentalCost: fp.perDayRentalCost,
        driverCharges: fp.driverCharges,
        promoterChargePerDay: fp.promoterChargePerDay,
        promoterDays: fp.promoterDays,
        rtoCharges: fp.rtoCharges,
        brandingCost: fp.brandingCost,
        additionalHourCharges: fp.additionalHourCharges,
        dailyKmcharges: fp.dailyKmcharges,
        dailyKmLimit: fp.dailyKmLimit,
        rentalCost: fp.rentalCost,
        driverCost: fp.driverCost,
        promoterCost: fp.promoterCost,
        rtoCost: fp.rtoCost,
        extraKmCost: fp.extraKmCost,
        extraHourCost: fp.extraHourCost,
        additionalNet: fp.additionalNet,
        subtotal: fp.subtotal,
        totalAmount: fp.totalAmount,
        additionalFields,
      });
    }

    const taxableAmount = bookingItems.reduce((s, item) => s + item.totalAmount, 0);
    const grandGst = Math.floor(taxableAmount * 0.18);
    const grandTotal = taxableAmount + grandGst;
    const orderId = await generateAdminOrderId();

    const orderName =
      category === "individual" ? (customerName || "").trim() : (clientName || "").trim();

    let gstVerifyDetails = [];
    if (req.body.gstVerifyDetails) {
      try { gstVerifyDetails = JSON.parse(req.body.gstVerifyDetails); }
      catch { gstVerifyDetails = []; }
    }

    const order = new Order({
      orderId,
      name: orderName,
      phone: customerPhone.toString().trim(),
      address: customerAddress || "",
      gstVerifyDetails,
      email: customerEmail || "",
      customerType: category === "individual" ? 0 : 1,
      customerCategory: category,
      companyName: category === "organization" ? (companyName || "").trim() : "",
      clientName: category === "organization" ? (clientName || "").trim() : "",
      designation: category === "organization" ? (designation || "").trim() : "",
      gstNumber: category === "organization" ? (gstNumber || "").trim() : "",
      panNumber: category === "organization" ? (panNumber || "").trim() : "",
      isAdminCreated: true,
      bookingItems,
      grandTotal,
      grandGst,
      orderStatus: "Pending",
      pipelineStatus: "todo",
      pipelineLogs: [
        {
          fromStage: null,
          toStage: "todo",
          movedBy: "Admin",
          movedAt: new Date(),
        },
      ],
    });

    await order.save();

    /* Deliberately non-fatal — the order is already saved and must not be
       rejected because the notification mail could not be sent. */
    try {
      await sendCampaignRequestMail(order);
    } catch (mailError) {
      console.error(
        `Admin order ${order.orderId}: campaign request mail not sent —`,
        mailError.message
      );
    }

    /* Same non-fatal contract as the mail above — an already-saved order
       must never fail because Nettyfish is unavailable. */
    try {
      await sendOrderCreatedSms({ orderId: order.orderId, customerPhone: order.phone });
    } catch (smsError) {
      console.error(
        `Admin order ${order.orderId}: order-created SMS not sent —`,
        smsError.message
      );
    }

    return successResponse(res, "Admin order created successfully", { orderId: order.orderId, order }, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};





// exports.getAllOrders = async (req, res) => {
//   try {
//     const { pipelineStatus, orderStatus, search, page = 1, limit = 50 } = req.query;
//     const filter = {};
//     if (pipelineStatus && pipelineStatus !== "all") filter.pipelineStatus = pipelineStatus;
//     if (orderStatus && orderStatus !== "all") filter.orderStatus = orderStatus;
//     if (search && search.trim().length >= 2) {
//       const q = search.trim();
//       filter.$or = [
//         { orderId: { $regex: q, $options: "i" } },
//         { name: { $regex: q, $options: "i" } },
//         { phone: { $regex: q, $options: "i" } },
//       ];
//     }
//     const skip = (Number(page) - 1) * Number(limit);
//     const total = await Order.countDocuments(filter);
//     const orders = await Order.find(filter)
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(Number(limit))
//       .select(
//         "orderId name phone address email customerType " +
//         "grandTotal grandGst grandNegotiationTotal orderStatus pipelineStatus " +
//         "isAdminCreated handlerName bookingItems pipelineLogs negotiationLogs " +
//         "createdAt updatedAt customerCategory companyName clientName designation gstNumber " +
//         "projectCodeArray projectExecutionArray onRoadExecutionArray onRoadCommentsArray projectMailLogs todoArray todoUploadedBy onRoadHistory onRoadIssues  "
//       );
//     return successResponse(res, "Orders fetched successfully", {
//       total, page: Number(page), totalPages: Math.ceil(total / Number(limit)), orders,
//     });
//   } catch (error) {
//     return errorResponse(res, error.message);
//   }
// };

exports.updateAdminOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const LOCKED_STAGES = ["closedWon", "projectCodeCreation", "closedLost"];
    if (LOCKED_STAGES.includes(order.salesPipelineStatus)) {
      return errorResponse(
        res,
        `Order cannot be edited in "${order.salesPipelineStatus}" stage`,
        null,
        400
      );
    }

    const {
      customerName, customerPhone, customerAddress, customerEmail,
      customerCategory, companyName, clientName, designation, gstNumber, panNumber,
    } = req.body;

    const category = customerCategory || "individual";

    // ── Same validation as create ──
    if (category === "individual") {
      if (!customerName?.trim()) return errorResponse(res, "Customer name is required", null, 400);
      if (!customerPhone) return errorResponse(res, "Phone number is required", null, 400);
      if (!/^[6-9]\d{9}$/.test(customerPhone.toString().trim()))
        return errorResponse(res, "Enter a valid 10-digit mobile number", null, 400);
      if (!customerEmail?.trim()) return errorResponse(res, "Email is required", null, 400);
    } else {
      if (!companyName?.trim()) return errorResponse(res, "Company name is required", null, 400);
      if (!clientName?.trim()) return errorResponse(res, "Client name is required", null, 400);
      if (!customerPhone) return errorResponse(res, "Phone number is required", null, 400);
      if (!/^[6-9]\d{9}$/.test(customerPhone.toString().trim()))
        return errorResponse(res, "Enter a valid 10-digit mobile number", null, 400);
      if (!customerEmail?.trim()) return errorResponse(res, "Email is required", null, 400);
      if (!gstNumber?.trim()) return errorResponse(res, "GST number is required", null, 400);
      if (!panNumber?.trim()) return errorResponse(res, "PAN number is required", null, 400);
    }

    // ── snapshot BEFORE any mutation (for Edit History diff) ──────────────
    const oldCustomerSnapshot = {
      name: order.name,
      phone: order.phone,
      address: order.address,
      email: order.email,
      companyName: order.companyName,
      clientName: order.clientName,
      designation: order.designation,
      gstNumber: order.gstNumber,
      panNumber: order.panNumber,
    };
    const oldBookingItemsSnapshot = JSON.parse(JSON.stringify(order.bookingItems || []));
    // ────────────────────────────────────────────────────────────────────

    // ── Parse vehicles ──
    const vehicles = [];
    let idx = 0;
    while (req.body[`vehicle_${idx}`] !== undefined) {
      try { vehicles.push(JSON.parse(req.body[`vehicle_${idx}`])); }
      catch { return errorResponse(res, `vehicle_${idx} is not valid JSON`, null, 400); }
      idx++;
    }

    if (!vehicles || vehicles.length === 0)
      return errorResponse(res, "At least one vehicle is required", null, 400);

    const bookingItems = [];

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const missing = [];
      if (!v.packageId) missing.push("packageId");
      if (v.campaignType === "Other" && !v.otherCampaignType) missing.push("otherCampaignType");
      if (!v.fromDate) missing.push("fromDate");
      if (!v.toDate) missing.push("toDate");
      if (!v.campaignLocation && !(v.fromLocation && v.toLocation)) missing.push("campaignLocation");
      if (!v.quantity || Number(v.quantity) < 1) missing.push("quantity");
      if (missing.length > 0)
        return errorResponse(res, `Vehicle ${i + 1}: Missing fields — ${missing.join(", ")}`, null, 400);

      if (new Date(v.fromDate) >= new Date(v.toDate))
        return errorResponse(res, `Vehicle ${i + 1}: fromDate must be before toDate`, null, 400);

      const pkg = await Package.findById(v.packageId);
      if (!pkg) return errorResponse(res, `Vehicle ${i + 1}: Package not found`, null, 404);

      const fp = calcPricingBackend(pkg, v);

      const additionalFields = (v.additionalCharges || []).map((c) => ({
        label: (c.label || "").trim() || "Custom charge",
        mode: c.mode === "-" ? "-" : "+",
        amount: Math.max(0, Number(c.amount) || 0),
      }));

      // ── Campaign type handling (same as create) ──
      let campaignTypeRef = null;
      let campaignTypeName = v.campaignType;
      if (v.campaignType && v.campaignType !== "Other") {
        const ct = await CampaignType.findById(v.campaignType).catch(() => null);
        if (ct) { campaignTypeRef = ct._id; campaignTypeName = ct.name; }
      } else if (v.campaignType === "Other" && v.otherCampaignType?.trim()) {
        let ct = await CampaignType.findOne({
          name: { $regex: `^${v.otherCampaignType.trim()}$`, $options: "i" },
        });
        if (!ct) ct = await CampaignType.create({ name: v.otherCampaignType.trim() });
        campaignTypeRef = ct._id;
        campaignTypeName = ct.name;
      }

      // ── Media: existing URLs keep + new files append ──
      const uploadedFiles = req.files || [];

      let existingImages = [];
      let existingVideos = [];
      try { existingImages = JSON.parse(req.body[`existingImages_${i}`] || "[]"); } catch {}
      try { existingVideos = JSON.parse(req.body[`existingVideos_${i}`] || "[]"); } catch {}

      const newImages = uploadedFiles
        .filter((f) => f.fieldname === `campaignImages_${i}`)
        .map((f) => getFileUrl(f));
      const newVideos = uploadedFiles
        .filter((f) => f.fieldname === `campaignVideos_${i}`)
        .map((f) => getFileUrl(f));

      bookingItems.push({
        packageId: pkg._id,
        vehicleType: pkg.vehicleType,
        vehicleModel: pkg.vehicleModel,
        bookingFor: v.bookingFor,
        gstNumber: v.bookingFor === "Agency" ? (v.gstNumber || "").trim() : "",
        campaignType: campaignTypeName,
        campaignName: (v.campaignName || "").trim(),
        campaignTypeRef,
        otherCampaignType: v.campaignType === "Other" ? (v.otherCampaignType || "") : "",
        promoterGender: v.needPromoter ? (v.promoterGender || "") : "",
        promoterLanguage: v.needPromoter ? (v.promoterLanguage || []) : [],
        promoterQuantity: v.needPromoter ? (Number(v.promoterQuantity) || 0) : 0,
        fromDate: new Date(v.fromDate),
        toDate: new Date(v.toDate),
        state: v.state,
        city: v.city,
        campaignLocation: v.campaignLocation || "",
        fromLocation: v.fromLocation || "",
        toLocation: v.toLocation || "",
        quantity: Number(v.quantity),
        extraKm: Number(v.extraKm) || 0,
        extraDays: Number(v.extraDays) || 0,
        extraHours: Number(v.extraHours) || 0,
        needPromoter: !!v.needPromoter,
        promoterFromDate: v.needPromoter && v.promoterFromDate ? new Date(v.promoterFromDate) : null,
        promoterToDate: v.needPromoter && v.promoterToDate ? new Date(v.promoterToDate) : null,
        promoterType: v.needPromoter ? v.promoterType : "",
        otherPromoterType: v.needPromoter && v.promoterType === "Other" ? v.otherPromoterType : "",
        campaignImages: [...existingImages, ...newImages],
        campaignVideos: [...existingVideos, ...newVideos],
        totalDays: fp.totalDays,
        perDayRentalCost: fp.perDayRentalCost,
        driverCharges: fp.driverCharges,
        promoterChargePerDay: fp.promoterChargePerDay,
        promoterDays: fp.promoterDays,
        rtoCharges: fp.rtoCharges,
        brandingCost: fp.brandingCost,
        additionalHourCharges: fp.additionalHourCharges,
        dailyKmcharges: fp.dailyKmcharges,
        dailyKmLimit: fp.dailyKmLimit,
        rentalCost: fp.rentalCost,
        driverCost: fp.driverCost,
        promoterCost: fp.promoterCost,
        rtoCost: fp.rtoCost,
        extraKmCost: fp.extraKmCost,
        extraHourCost: fp.extraHourCost,
        additionalNet: fp.additionalNet,
        subtotal: fp.subtotal,
        totalAmount: fp.totalAmount,
        additionalFields,
      });
    }

    // ── Totals re-calc ──
    const taxableAmount = bookingItems.reduce((s, item) => s + item.totalAmount, 0);
    const grandGst = Math.floor(taxableAmount * 0.18);
    const grandTotal = taxableAmount + grandGst;

    // ── Customer fields update ──
    order.name = category === "individual" ? (customerName || "").trim() : (clientName || "").trim();
    order.phone = customerPhone.toString().trim();
    order.address = customerAddress || "";
    order.email = customerEmail || "";
    order.customerType = category === "individual" ? 0 : 1;
    order.customerCategory = category;
    order.companyName = category === "organization" ? (companyName || "").trim() : "";
    order.clientName = category === "organization" ? (clientName || "").trim() : "";
    order.designation = category === "organization" ? (designation || "").trim() : "";
    order.gstNumber = category === "organization" ? (gstNumber || "").trim() : "";
    order.panNumber = category === "organization" ? (panNumber || "").trim() : "";

    if (req.body.gstVerifyDetails) {
      try { order.gstVerifyDetails = JSON.parse(req.body.gstVerifyDetails); } catch {}
    }

    order.bookingItems = bookingItems;
    order.grandTotal = grandTotal;
    order.grandGst = grandGst;

    // ── Negotiation nadanthirundha final amount recalc ──
    if ((order.salesNegotiationArray || []).length > 0) {
      const totalNegotiated = order.salesNegotiationArray.reduce(
        (sum, n) => sum + (n.amount || 0), 0
      );
      order.salesNegotiationFinalAmount = Math.max(grandTotal - totalNegotiated, 0);
    }

    // ── Audit log ──
    const editedBy = order.salesHandlerName || req.user?.username || "Admin";
    order.salesPipelineLogs.push({
      fromStage: order.salesPipelineStatus,
      toStage: order.salesPipelineStatus,
      movedBy: editedBy,
      handlerName: order.salesHandlerName || "",
      movedAt: new Date(),
      notes: `Order details edited by ${editedBy}`,
      logType: "edit",
    });

    // ── Build field-level Edit History (customer diff) ─────────────────────
    const FIELD_LABELS = {
      name: "Customer Name",
      phone: "Phone",
      address: "Address",
      email: "Email",
      companyName: "Company Name",
      clientName: "Client Name",
      designation: "Designation",
      gstNumber: "GST Number",
      panNumber: "PAN Number",
    };

    const customerChanges = [];
    Object.keys(FIELD_LABELS).forEach((key) => {
      // For an organization order, `order.name` is always set to the same
      // value as `order.clientName` (see the customer-fields update above)
      // — it's a mirror for display purposes, not an independently edited
      // field. Reporting both would show the identical name change twice
      // ("Customer Name" and "Client Name"), so only clientName's own entry
      // is kept here.
      if (key === "name" && category === "organization") return;

      const oldVal = oldCustomerSnapshot[key] || "";
      const newVal = order[key] || "";
      if (String(oldVal) !== String(newVal)) {
        customerChanges.push({
          field: FIELD_LABELS[key],
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    });

    // ── Vehicle-level diff (modified / added / removed with FULL details) ──
    const VEHICLE_FIELD_LABELS = {
       vehicleType: "Vehicle Type",
      bookingFor: "Booking For",
      campaignName: "Campaign Name",
      campaignType: "Campaign Type",
      otherCampaignType: "Other Campaign Type",
      fromDate: "From Date",
      toDate: "To Date",
      state: "State",
      city: "City",
      campaignLocation: "Campaign Location",
      fromLocation: "From Location",
      toLocation: "To Location",
      quantity: "Quantity",
      extraKm: "Extra KM",
      extraDays: "Extra Days",
      extraHours: "Extra Hours",
      needPromoter: "Need Promoter",
      promoterType: "Promoter Type",
      promoterGender: "Promoter Gender",
      promoterQuantity: "Promoter Quantity",
      promoterFromDate: "Promoter From Date",
      promoterToDate: "Promoter To Date",
      gstNumber: "GST Number",
      totalAmount: "Total Amount",
    };

    const formatVal = (key, val) => {
      if (val === undefined || val === null) return "";
      if (key.toLowerCase().includes("date")) {
        return val ? new Date(val).toISOString().slice(0, 10) : "";
      }
      if (typeof val === "boolean") return val;
      return val;
    };

   const buildVehicleLabel = (v) =>
  `${v.campaignName || "Campaign"}${v.city ? " · " + v.city : ""}`;

    const vehicleChanges = [];
    const maxLen = Math.max(oldBookingItemsSnapshot.length, bookingItems.length);

    for (let i = 0; i < maxLen; i++) {
      const oldV = oldBookingItemsSnapshot[i];
      const newV = bookingItems[i];

      // ── Vehicle REMOVED: dump full old details ──
      if (oldV && !newV) {
        const changes = Object.keys(VEHICLE_FIELD_LABELS)
          .map((key) => ({
            field: VEHICLE_FIELD_LABELS[key],
            oldValue: formatVal(key, oldV[key]),
            newValue: null,
          }))
          .filter((c) => c.oldValue !== "" && c.oldValue !== undefined);

        vehicleChanges.push({
          vehicleIndex: i,
          action: "removed",
          vehicleLabel: buildVehicleLabel(oldV),
          vehicleTypeId: oldV.vehicleType ? String(oldV.vehicleType) : "",
          changes,
        });
        continue;
      }

      // ── Vehicle ADDED: dump full new details ──
      if (!oldV && newV) {
        const changes = Object.keys(VEHICLE_FIELD_LABELS)
          .map((key) => ({
            field: VEHICLE_FIELD_LABELS[key],
            oldValue: null,
            newValue: formatVal(key, newV[key]),
          }))
          .filter((c) => c.newValue !== "" && c.newValue !== undefined);

        vehicleChanges.push({
          vehicleIndex: i,
          action: "added",
          vehicleLabel: buildVehicleLabel(newV),
          vehicleTypeId: newV.vehicleType ? String(newV.vehicleType) : "",
          changes,
        });
        continue;
      }

      // ── Vehicle MODIFIED: only changed fields ──
      const changes = [];
      Object.keys(VEHICLE_FIELD_LABELS).forEach((key) => {
        const ov = formatVal(key, oldV[key]);
        const nv = formatVal(key, newV[key]);
        if (String(ov ?? "") !== String(nv ?? "")) {
          changes.push({ field: VEHICLE_FIELD_LABELS[key], oldValue: ov, newValue: nv });
        }
      });

      if (changes.length > 0) {
        vehicleChanges.push({
          vehicleIndex: i,
          action: "modified",
          vehicleLabel: buildVehicleLabel(newV),
          vehicleTypeId: newV.vehicleType ? String(newV.vehicleType) : "",
          changes,
        });
      }
    }

    if (customerChanges.length > 0 || vehicleChanges.length > 0) {
      order.orderEditHistory.push({
        editedBy,
        editedAt: new Date(),
        customerChanges,
        vehicleChanges,
      });
    }
    // ───────────────────────────────────────────────────────────────────

    await order.save();
    return successResponse(res, "Order updated successfully", { orderId: order.orderId, order });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};


exports.getAllOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      pipelineStatus,
      orderStatus,
      search,
      vehicleType,
      durationFrom,
      durationTo,
      createdFrom,
      createdTo,
    } = req.query;

    const filter = {};


    if (pipelineStatus && pipelineStatus !== "all") {
      filter.pipelineStatus = pipelineStatus;
    }


    if (orderStatus && orderStatus !== "all") {
      filter.orderStatus = orderStatus;
    }


    if (vehicleType && vehicleType !== "all") {
      filter["bookingItems.vehicleType"] = vehicleType;
    }


    if (durationFrom || durationTo) {
      const durationFilter = {};
      if (durationFrom) {
        durationFilter.fromDate = {
          $gte: new Date(durationFrom + "T00:00:00.000Z"),
        };
      }
      if (durationTo) {
        durationFilter.toDate = {
          $lte: new Date(durationTo + "T23:59:59.999Z"),
        };
      }
      filter.bookingItems = { $elemMatch: durationFilter };
    }


    if (createdFrom || createdTo) {
      filter.createdAt = {};
      if (createdFrom) {
        filter.createdAt.$gte = new Date(createdFrom + "T00:00:00.000Z");
      }
      if (createdTo) {
        filter.createdAt.$lte = new Date(createdTo + "T23:59:59.999Z");
      }
    }


    if (search && search.trim().length >= 1) {
      const q = search.trim();
      const orConditions = [
        { orderId: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
        { "bookingItems.city": { $regex: q, $options: "i" } },
        { "bookingItems.state": { $regex: q, $options: "i" } },
      ];

      if (!isNaN(Number(q))) {
        orConditions.push({ grandTotal: Number(q) });
        orConditions.push({ grandNegotiationTotal: Number(q) });
      }
      filter.$or = orConditions;
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const total = await Order.countDocuments(filter);

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
     .select(
  "orderId name phone address email customerType " +
  "grandTotal grandGst grandNegotiationTotal orderStatus pipelineStatus salesPipelineStatus " +
  "isAdminCreated handlerName bookingItems pipelineLogs negotiationLogs " +
  "createdAt updatedAt customerCategory companyName clientName designation gstNumber panNumber " +
  "projectCodeArray projectExecutionArray onRoadExecutionArray onRoadCommentsArray " +
  "projectMailLogs todoArray todoUploadedBy onRoadHistory onRoadIssues onRoadDriverHistory onRoadUnavailableHistory clientFeedbackHistory campaignClosureArray " +
  "clientClosureCommentsArray closedWonCommentsArray closedLostCommentsArray orderClosedLostArray orderClosedWonArray extraKmDetailsArray orderEditHistory" 
);

    return successResponse(res, "Orders fetched successfully", {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      orders,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};



exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return errorResponse(res, "Order not found", null, 404);
    return successResponse(res, "Order fetched successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Fetch by Mongo _id instead of orderId — needed for lookups where orderId
// may contain characters (e.g. "#") that break as a URL path segment.
exports.getOrderByMongoId = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return errorResponse(res, "Order not found", null, 404);
    return successResponse(res, "Order fetched successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// Internal-only (see the `internalOnly` shared-secret middleware in
// AdminorderRoutes.js): feeds the print-only frontend route
// (src/app/print-summary/[orderId]/page.tsx) the data it renders
// BookingSummaryDocument.tsx with, so Puppeteer can print the exact same
// template the browser "Download Summary" flow uses.
exports.getBookingSummaryPdfData = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return errorResponse(res, "Order not found", null, 404);
    const data = await buildBookingSummaryPdfData(order);
    return successResponse(res, "Booking summary data fetched successfully", data);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// ── Campaign Types ─────────────────────────────────────────────────────────
exports.getCampaignTypes = async (req, res) => {
  try {
    const types = await CampaignType.find().sort({ createdAt: -1 });
    return successResponse(res, "Campaign types fetched successfully", { types });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.createCampaignType = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return errorResponse(res, "Campaign type name required", null, 400);
    const existing = await CampaignType.findOne({ name: { $regex: `^${name.trim()}$`, $options: "i" } });
    if (existing) return successResponse(res, "Campaign type already exists", { type: existing, alreadyExists: true });
    const type = await CampaignType.create({ name: name.trim() });
    return successResponse(res, "Campaign type created successfully", { type }, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};



exports.getOrdersByPipeline = async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
     .select(
  "orderId name phone customerType pipelineStatus salesPipelineStatus orderStatus " +
  "grandTotal grandGst grandNegotiationTotal bookingItems handlerName " +
  "isAdminCreated createdAt updatedAt pipelineLogs negotiationLogs " +
  "companyName clientName designation email address gstNumber panNumber customerCategory invoiceData " +
  "projectCodeArray projectExecutionArray onRoadExecutionArray onRoadCommentsArray todoArray todoUploadedBy " +
  "onRoadHistory onRoadIssues onRoadDriverHistory onRoadUnavailableHistory clientFeedbackHistory campaignClosureArray " +
  "clientClosureCommentsArray closedWonCommentsArray closedLostCommentsArray orderClosedLostArray orderClosedWonArray extraKmDetailsArray orderEditHistory " +
  "opsHandlerAssignmentHistory originalHandlerName"
);

    const filteredOrders = orders.filter(
      // Orders sales already closed-lost should never appear on the
      // operations board (not even under its own Closed Lost column) —
      // sales lost the deal before/without operations acting on it.
      (o) => o.projectCodeArray && o.projectCodeArray.length === 1 && o.salesPipelineStatus !== "closedLost"&& o.salesPipelineStatus ==="salesFinalClosedWon"
    );

    const grouped = {};
    STAGE_ORDER.forEach((s) => (grouped[s] = []));

    filteredOrders.forEach((o) => {
      const stage = o.pipelineStatus || "todo";
      const targetStage = stage === "newOrder" ? "todo" : stage;
      if (grouped[targetStage]) grouped[targetStage].push(o);
      else grouped["todo"].push(o);
    });

    return successResponse(res, "Pipeline orders fetched", {
      grouped,
      stages: STAGE_ORDER,
      totalFilteredOrders: filteredOrders.length
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};


exports.updateOrderPipeline = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { pipelineStatus, handlerName } = req.body;

    if (!STAGE_ORDER.includes(pipelineStatus))
      return errorResponse(res, "Invalid pipeline stage", null, 400);

    const order = await Order.findById(orderId);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    if (order.pipelineStatus === "closedLost") {
      return errorResponse(res, "This order is closed lost and cannot be moved.", null, 400);
    }

    const oldStage = order.pipelineStatus;
    const isStaff = Number(req.user.isAdmin) !== 1;


    const LOCKED_BACK_STAGES = ["todo", "projectExecution"];
    const oldIndex = STAGE_ORDER.indexOf(oldStage);
    const newIndex = STAGE_ORDER.indexOf(pipelineStatus);
    if (LOCKED_BACK_STAGES.includes(pipelineStatus) && newIndex < oldIndex) {
      return errorResponse(
        res,
        `Cannot move back to "${pipelineStatus}" stage once the order has progressed.`,
        null,
        400
      );
    }


    if (oldStage === "projectExecution" && pipelineStatus === "onRoad") {
      const hasActiveDriver = order.onRoadExecutionArray.some(
        e => e.onRoadStatus === 1
      );
      if (!hasActiveDriver) {
        return errorResponse(
          res,
          "Please complete at least one vehicle Model details and enable On Road status",
          null,
          400
        );
      }
    }

    const movedBy = req.user?.username || order.handlerName || "Admin";


    if (oldStage === "todo" && pipelineStatus === "projectExecution") {
      if (isStaff) {

        order.handlerName = req.user.username;
      } else {

        if (!handlerName?.trim())
          return errorResponse(res, "Handler name is required", null, 400);
        order.handlerName = handlerName.trim();
      }
    }




    order.pipelineStatus = pipelineStatus;


    // logEntry.handlerName = order.handlerName || "";

    const logEntry = {
      fromStage: oldStage,
      toStage: pipelineStatus,
      movedBy,
      handlerName: order.handlerName || "",
      movedAt: new Date(),
    };

    // if (
    //   pipelineStatus === "projectExecution"
    // ) {
    //   logEntry.handlerName = order.handlerName || "";
    // }



    order.pipelineLogs.push(logEntry);
    await order.save();

    return successResponse(res, "Pipeline stage updated successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.uploadStageDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { stage, notes } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);



    const uploadedBy =
      (order.pipelineStatus === "todo" ? order.todoUploadedBy : null) ||
      // req.body.uploadedBy?.trim() ||
      (Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin");

    const docFile = (req.files || []).find((f) => f.fieldname === "document");

    if (docFile) {
      const err = validateFile(docFile, "Stage document");
      if (err) return errorResponse(res, err, null, 400);
    }

    const docUrl = docFile ? getFileUrl(docFile) : "";

    if (stage === "todo" || order.pipelineStatus === "todo") {
      if (docUrl || notes?.trim()) {
        order.todoArray.push({
          document: docUrl,
          notes: (notes || "").trim(),
          uploadedBy,
          uploadedAt: new Date(),
        });
      }
    }



    if (stage === "projectExecution" || order.pipelineStatus === "projectExecution") {

      if (docUrl || notes?.trim()) {
        order.projectExecutionArray.push({
          document: docUrl,
          notes: (notes || "").trim(),
          uploadedBy,
          uploadedAt: new Date(),
        });
      }
    }

    if (stage === "onRoad" || order.pipelineStatus === "onRoad") {
      if (docUrl || notes?.trim()) {
        order.onRoadCommentsArray.push({
          document: docUrl,
          notes: (notes || "").trim(),
          uploadedBy,
          uploadedAt: new Date(),
        });
      }
    }

    if (stage === "clientClosure" || order.pipelineStatus === "clientClosure") {
  if (docUrl || notes?.trim()) {
    order.clientClosureCommentsArray.push({ document: docUrl, notes: (notes||"").trim(), uploadedBy, uploadedAt: new Date() });
  }
}
if (stage === "closedWon" || order.pipelineStatus === "closedWon") {
  if (docUrl || notes?.trim()) {
    order.closedWonCommentsArray.push({ document: docUrl, notes: (notes||"").trim(), uploadedBy, uploadedAt: new Date() });
  }
}
if (stage === "closedLost" || order.pipelineStatus === "closedLost") {
  if (docUrl || notes?.trim()) {
    order.closedLostCommentsArray.push({ document: docUrl, notes: (notes||"").trim(), uploadedBy, uploadedAt: new Date() });
  }
}

    await order.save();
    return successResponse(res, "Document uploaded successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};



exports.submitOnRoadDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleIndex, driverName, driverPhone,
      vehicleRegistrationNumber } = req.body;

    if (!driverName?.trim())
      return errorResponse(res, "Driver name is required", null, 400);
    if (!driverPhone?.trim())
      return errorResponse(res, "Driver phone is required", null, 400);
    if (!vehicleRegistrationNumber?.trim())
      return errorResponse(res, "Vehicle registration number is required", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const uploadedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

    const gatepassFile = (req.files || []).find(f => f.fieldname === "gatepassPhoto");
    const photoUrl = gatepassFile ? getFileUrl(gatepassFile) : "";



    const newEntry = {
      vehicleIndex: Number(vehicleIndex),
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim(),
      vehicleRegistrationNumber: vehicleRegistrationNumber.trim().toUpperCase(),
      gatepassPhoto: photoUrl,
      onRoadStatus: 0,
      uploadedBy,
      uploadedAt: new Date(),
    };
    order.onRoadExecutionArray.push(newEntry);

  
    const savedSubEntry = order.onRoadExecutionArray[order.onRoadExecutionArray.length - 1];

    order.onRoadDriverHistory.push({
      vehicleIndex: Number(vehicleIndex),
      entryId: savedSubEntry._id,       
      action: "created",
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim(),
      vehicleRegistrationNumber: vehicleRegistrationNumber.trim().toUpperCase(),
      gatepassPhoto: photoUrl,
      changedBy: uploadedBy,
      changedAt: new Date(),
      changedFields: {},
    });



    const vIdx = Number(vehicleIndex);
    const bookingItem = order.bookingItems[vIdx];

    const savedForThisVehicle = order.onRoadExecutionArray.filter(
      e => e.vehicleIndex === vIdx && e.entryStatus !== "removed"
    );

    if (bookingItem && savedForThisVehicle.length > (bookingItem.quantity || 1)) {
      bookingItem.quantity = savedForThisVehicle.length;
    }

    const requiredQty = bookingItem?.quantity || 1;

    if (savedForThisVehicle.length >= requiredQty) {
      order.onRoadExecutionArray.forEach(e => {
        if (e.vehicleIndex === vIdx) {
          e.onRoadStatus = 1;
        }
      });
    }


    await order.save();
    return successResponse(res, "Driver details saved", { order });

  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};



exports.updateOnRoadDriver = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const { driverName, driverPhone, vehicleRegistrationNumber, reason } = req.body;

    if (!reason?.trim())
      return errorResponse(res, "Reason for this update is required", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const entry = order.onRoadExecutionArray.id(entryId);
    if (!entry) return errorResponse(res, "Entry not found", null, 404);

    const changedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

    const changedFields = {};
    if (driverName?.trim() && driverName.trim() !== entry.driverName)
      changedFields.driverName = { old: entry.driverName, new: driverName.trim() };
    if (driverPhone?.trim() && driverPhone.trim() !== entry.driverPhone)
      changedFields.driverPhone = { old: entry.driverPhone, new: driverPhone.trim() };
    if (vehicleRegistrationNumber?.trim() && vehicleRegistrationNumber.trim().toUpperCase() !== entry.vehicleRegistrationNumber)
      changedFields.vehicleRegistrationNumber = { old: entry.vehicleRegistrationNumber, new: vehicleRegistrationNumber.trim().toUpperCase() };

    if (driverName?.trim()) entry.driverName = driverName.trim();
    if (driverPhone?.trim()) entry.driverPhone = driverPhone.trim();
    if (vehicleRegistrationNumber?.trim())
      entry.vehicleRegistrationNumber = vehicleRegistrationNumber.trim().toUpperCase();

    order.onRoadDriverHistory.push({
      vehicleIndex: entry.vehicleIndex,
       entryId: entry._id, 
      action: "updated",
      driverName: entry.driverName,
      driverPhone: entry.driverPhone,
      vehicleRegistrationNumber: entry.vehicleRegistrationNumber,
      changedBy,
      changedAt: new Date(),
      changedFields,
      reason: reason.trim(),
    });

    await order.save();
    return successResponse(res, "Driver details updated", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};

exports.addOnRoadIssue = async (req, res) => {
  try {
    const { id } = req.params;

    const { vehicleIndex, issueDescription, vehicleRegistrationNumber, entryId } = req.body;

    if (!issueDescription?.trim())
      return errorResponse(res, "Issue description is required", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);


    let entry;
    if (entryId) {
      entry = order.onRoadExecutionArray.id(entryId);
    }
    if (!entry && vehicleRegistrationNumber?.trim()) {
      entry = order.onRoadExecutionArray.find(
        (e) => e.vehicleRegistrationNumber === vehicleRegistrationNumber.trim().toUpperCase()
      );
    }
    if (!entry) {
      entry = order.onRoadExecutionArray.find(
        (e) => e.vehicleIndex === Number(vehicleIndex) && e.onRoadStatus === 1
      );
    }

    const reportedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

    const photoFile = (req.files || []).find(f => f.fieldname === "issuePhoto");

    if (photoFile) {
      const err = validateFile(photoFile, "Issue photo");
      if (err) return errorResponse(res, err, null, 400);
    }

    const photoUrl = photoFile ? getFileUrl(photoFile) : "";

    order.onRoadIssues.push({
      vehicleIndex: entry ? entry.vehicleIndex : Number(vehicleIndex),
      entryId: entry ? entry._id : null,
      driverName: entry?.driverName || "",
      vehicleRegNo: entry?.vehicleRegistrationNumber || vehicleRegistrationNumber || "",
      issueDescription: issueDescription.trim(),
      issuePhoto: photoUrl,
      status: "open",
      reportedBy,
      reportedAt: new Date(),
    });

    await order.save();
    return successResponse(res, "Issue reported successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};

exports.resolveOnRoadIssue = async (req, res) => {
  try {
    const { id, issueId } = req.params;
    const { resolveDescription } = req.body;

    if (!resolveDescription?.trim())
      return errorResponse(res, "Resolve description is required", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const issue = order.onRoadIssues.id(issueId);
    if (!issue) return errorResponse(res, "Issue not found", null, 404);

    const resolvedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";


    const photoFile = (req.files || []).find(f => f.fieldname === "resolvePhoto");

    if (photoFile) {
      const err = validateFile(photoFile, "Resolve photo");
      if (err) return errorResponse(res, err, null, 400);
    }

    const photoUrl = photoFile ? getFileUrl(photoFile) : "";

    issue.status = "resolved";
    issue.resolveDescription = resolveDescription.trim();
    issue.resolvePhoto = photoUrl;
    issue.resolvedBy = resolvedBy;
    issue.resolvedAt = new Date();

    await order.save();
    return successResponse(res, "Issue resolved successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.updateOnRoadStatus = async (req, res) => {
  const { id, entryId } = req.params;
  const { onRoadStatus } = req.body;

  const order = await Order.findById(id);
  const entry = order.onRoadExecutionArray.id(entryId);
  entry.onRoadStatus = Number(onRoadStatus);

  await order.save();
  return successResponse(res, "Status updated", { order });
};

exports.saveTodoUploadedBy = async (req, res) => {
  try {
    const { id } = req.params;
    const { todoUploadedBy } = req.body;

    if (!todoUploadedBy?.trim())
      return errorResponse(res, "Name is required", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    order.todoUploadedBy = todoUploadedBy.trim();
    await order.save();

    return successResponse(res, "Todo uploader name saved", {
      todoUploadedBy: order.todoUploadedBy,
    });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.editOnRoadDetails = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const {
      driverName,
      driverPhone,
      driverAlternatePhone,
      vehicleRegistrationNumber,
    } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);


    const entry = order.onRoadExecutionArray.id(entryId);
    if (!entry) return errorResponse(res, "Entry not found", null, 404);

    const uploadedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";


    const changedFields = {};
    if (driverName?.trim() && driverName.trim() !== entry.driverName)
      changedFields.driverName = { old: entry.driverName, new: driverName.trim() };
    if (driverPhone?.trim() && driverPhone.trim() !== entry.driverPhone)
      changedFields.driverPhone = { old: entry.driverPhone, new: driverPhone.trim() };
    if (driverAlternatePhone !== undefined && driverAlternatePhone !== entry.driverAlternatePhone)
      changedFields.driverAlternatePhone = { old: entry.driverAlternatePhone, new: driverAlternatePhone };
    if (vehicleRegistrationNumber?.trim() && vehicleRegistrationNumber.trim() !== entry.vehicleRegistrationNumber)
      changedFields.vehicleRegistrationNumber = { old: entry.vehicleRegistrationNumber, new: vehicleRegistrationNumber.trim() };


    if (driverName?.trim()) entry.driverName = driverName.trim();
    if (driverPhone?.trim()) entry.driverPhone = driverPhone.trim();
    if (driverAlternatePhone !== undefined) entry.driverAlternatePhone = driverAlternatePhone;
    if (vehicleRegistrationNumber?.trim())
      entry.vehicleRegistrationNumber = vehicleRegistrationNumber.trim().toUpperCase();


    order.onRoadHistory.push({
      action: "edited",
      driverName: entry.driverName,
      driverPhone: entry.driverPhone,
      driverAlternatePhone: entry.driverAlternatePhone,
      vehicleRegistrationNumber: entry.vehicleRegistrationNumber,
      changedFields,
      changedBy: uploadedBy,
      changedAt: new Date(),
    });

    await order.save();
    return successResponse(res, "On Road details updated successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.markVehicleUnavailable = async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleIndex, vehicleRegistrationNumber, entryId, reason, inventoryStatus } = req.body;

    if (!reason?.trim())
      return errorResponse(res, "Reason is required", null, 400);

    const ALLOWED_INVENTORY_STATUSES = ["Unavailable", "Damaged", "Under Maintenance"];
    const resolvedInventoryStatus = ALLOWED_INVENTORY_STATUSES.includes(inventoryStatus)
      ? inventoryStatus
      : "Unavailable";

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const regNoUpper = vehicleRegistrationNumber?.trim()?.toUpperCase();
    const entry = entryId
      ? order.onRoadExecutionArray.id(entryId)
      : order.onRoadExecutionArray.find(
          (e) =>
            e.vehicleRegistrationNumber === regNoUpper &&
            e.entryStatus === "active" &&
            !e.unavailableStatus
        );
    if (!entry) return errorResponse(res, "Vehicle entry not found", null, 404);
    if (entry.entryStatus !== "active") {
      const msg =
        entry.entryStatus === "replaced"
          ? "This vehicle has already been replaced"
          : "This vehicle entry has already been released";
      return errorResponse(res, msg, null, 400);
    }
    if (entry.unavailableStatus)
      return errorResponse(res, "This vehicle is already marked unavailable", null, 400);

    const reportedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

    const photoFile = (req.files || []).find(f => f.fieldname === "unavailablePhoto");

    if (photoFile) {
      const err = validateFile(photoFile, "Unavailable photo");
      if (err) return errorResponse(res, err, null, 400);
    }

    const photoUrl = photoFile ? getFileUrl(photoFile) : "";

    entry.unavailableStatus = true;
    entry.unavailableReason = reason.trim();
    entry.inventoryStatus = resolvedInventoryStatus;

    order.onRoadUnavailableHistory.push({
      vehicleIndex: entry.vehicleIndex,
      entryId: entry._id,
      vehicleRegNo: entry.vehicleRegistrationNumber,
      driverName: entry.driverName,
      driverPhone: entry.driverPhone,
      reason: reason.trim(),
      inventoryStatus: resolvedInventoryStatus,
      photo: photoUrl,
      status: "unavailable",
      eventType: "unavailable",
      reportedBy,
      reportedAt: new Date(),
      resolvedBy: "",
      resolvedAt: null,
    });

    await order.save();

    try {
      await VehicleMaster.updateOne(
        { "registrationVehicles.registrationNumber": entry.vehicleRegistrationNumber },
        {
          $set: {
            "registrationVehicles.$.statusAvailability.currentStatus": resolvedInventoryStatus,
            "registrationVehicles.$.statusAvailability.remarks": `Marked ${resolvedInventoryStatus} on Order ${order.orderId} — ${reason.trim()}`,
          },
        }
      );
    } catch (err) {
      console.error(`Failed to flag vehicle ${entry.vehicleRegistrationNumber} as ${resolvedInventoryStatus}:`, err.message);
    }

    return successResponse(res, "Vehicle marked as unavailable", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.replaceOnRoadVehicle = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const { newVehicleRegistrationNumber, reason, driverName, driverPhone } = req.body;

    if (!newVehicleRegistrationNumber?.trim())
      return errorResponse(res, "Replacement vehicle registration number is required", null, 400);
    if (!reason?.trim())
      return errorResponse(res, "Reason/comments are required", null, 400);
    if (!driverName?.trim())
      return errorResponse(res, "Driver name is required", null, 400);
    if (!/^\d{10}$/.test(driverPhone || ""))
      return errorResponse(res, "Enter a valid 10-digit driver phone number", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const oldEntry = order.onRoadExecutionArray.id(entryId);
    if (!oldEntry) return errorResponse(res, "Vehicle entry not found", null, 404);
    if (oldEntry.entryStatus !== "active") {
      const msg =
        oldEntry.entryStatus === "replaced"
          ? "This vehicle has already been replaced"
          : "This vehicle has already been released";
      return errorResponse(res, msg, null, 400);
    }

    const newReg = newVehicleRegistrationNumber.trim().toUpperCase().replace(/\s+/g, "");
    const oldReg = (oldEntry.vehicleRegistrationNumber || "").trim().toUpperCase().replace(/\s+/g, "");

    // if (newReg === oldReg) {
    //   return errorResponse(res, "Replacement vehicle must be different from the current vehicle", null, 400);
    // }

    const alreadyActive = order.onRoadExecutionArray.some(
      (e) => e.entryStatus === "active" && !e.unavailableStatus && e.vehicleRegistrationNumber === newReg
    );
    if (alreadyActive) {
      return errorResponse(res, "That vehicle is already assigned on this order", null, 400);
    }

    const performedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

    const now = new Date();
    const replacedAt = new Date(now.getTime() + 1000);
    const reasonTrim = reason.trim();
    const wasAlreadyUnavailable = !!oldEntry.unavailableStatus;


    oldEntry.unavailableStatus = true;
    oldEntry.unavailableReason = reasonTrim;

    /* The old entry must stop being "active" the moment a replacement is
       assigned — otherwise it and the new entry both read as current for
       the same slot, which is what made the Live Vehicle / GPS Movement
       Report screens show the unavailable vehicle AND its replacement as
       two separate active rows instead of one "2345 → 7852" slot.
       "replaced" (not "removed") — a replacement is NOT a withdrawal, so it
       must never count toward Released Vehicles or look identical to an
       explicit Withdraw Vehicle action. Full history is preserved: the
       entry itself, and everything already pushed to onRoadUnavailableHistory /
       onRoadDriverHistory below, are untouched — only entryStatus flips. */
    oldEntry.entryStatus = "replaced";
    oldEntry.removedAt = now;
    oldEntry.removedBy = performedBy;
    oldEntry.removalReason = reasonTrim;


    order.onRoadExecutionArray.push({
      vehicleIndex: oldEntry.vehicleIndex,
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim(),
      vehicleRegistrationNumber: newReg,
      onRoadStatus: oldEntry.onRoadStatus,
      uploadedBy: performedBy,
      uploadedAt: now,
      entryStatus: "active",
      /* Chain link back to the entry this replaces — see the schema
         comment and Utils/vehicleAssignmentResolver.js. */
      replacesEntryId: oldEntry._id,
    });
    const newEntry = order.onRoadExecutionArray[order.onRoadExecutionArray.length - 1];

   
    order.onRoadDriverHistory.push({
      vehicleIndex: oldEntry.vehicleIndex,
      entryId: oldEntry._id,
      action: "removed",
      driverName: oldEntry.driverName,
      driverPhone: oldEntry.driverPhone,
      vehicleRegistrationNumber: oldEntry.vehicleRegistrationNumber,
      changedBy: performedBy,
      changedAt: now,
      changedFields: { reason: reasonTrim, replacedBy: newReg },
    });
    order.onRoadDriverHistory.push({
      vehicleIndex: oldEntry.vehicleIndex,
      entryId: newEntry._id,
      action: "created",
      driverName: newEntry.driverName,
      driverPhone: newEntry.driverPhone,
      vehicleRegistrationNumber: newEntry.vehicleRegistrationNumber,
      changedBy: performedBy,
      changedAt: now,
      changedFields: { reason: reasonTrim, replacementFor: oldEntry.vehicleRegistrationNumber },
    });

    if (!wasAlreadyUnavailable) {
      order.onRoadUnavailableHistory.push({
        vehicleIndex: oldEntry.vehicleIndex,
        entryId: oldEntry._id,
        vehicleRegNo: oldEntry.vehicleRegistrationNumber,
        driverName: oldEntry.driverName,
        driverPhone: oldEntry.driverPhone,
        reason: reasonTrim,
        status: "unavailable",
        eventType: "unavailable",
        reportedBy: performedBy,
        reportedAt: now,
      });
    }


    order.onRoadUnavailableHistory.push({
      vehicleIndex: oldEntry.vehicleIndex,
      entryId: oldEntry._id,
      vehicleRegNo: oldEntry.vehicleRegistrationNumber,
      driverName: oldEntry.driverName,
      driverPhone: oldEntry.driverPhone,
      reason: reasonTrim,
      status: "unavailable",
      eventType: "replaced",
      replacementEntryId: newEntry._id,
      replacementVehicleRegNo: newReg,
      replacementDriverName: newEntry.driverName,
      replacementDriverPhone: newEntry.driverPhone,
      replacedAt: replacedAt,
      reportedBy: performedBy,
      reportedAt: replacedAt,
    });

    await order.save();

   
    try {
      await VehicleMaster.updateOne(
        { "registrationVehicles.registrationNumber": oldReg },
        {
          $set: {
            "registrationVehicles.$.statusAvailability.currentStatus": "Unavailable",
            "registrationVehicles.$.statusAvailability.remarks": `Replaced on Order ${order.orderId} — ${reasonTrim}`,
          },
        }
      );
    } catch (err) {
      console.error(`Failed to flag old vehicle ${oldReg} unavailable:`, err.message);
    }

    try {
      const bookingItem = order.bookingItems?.[oldEntry.vehicleIndex];
      const normalizeDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
      await VehicleMaster.updateOne(
        { "registrationVehicles.registrationNumber": newReg },
        {
          $set: {
            "registrationVehicles.$.statusAvailability.currentStatus": "Booked",
            "registrationVehicles.$.statusAvailability.fromDate": normalizeDate(bookingItem?.fromDate),
            "registrationVehicles.$.statusAvailability.toDate": normalizeDate(bookingItem?.toDate),
            "registrationVehicles.$.statusAvailability.remarks": `Replacement vehicle for Order ${order.orderId} - ${order.name || "Customer"}`,
            "registrationVehicles.$.statusAvailability.orderId": order._id.toString(),
            "registrationVehicles.$.statusAvailability.orderDisplayId": order.orderId || "",
          },
        }
      );
    } catch (err) {
      console.error(`Failed to book replacement vehicle ${newReg}:`, err.message);
    }

    return successResponse(res, "Vehicle replaced successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};

exports.markVehicleAvailable = async (req, res) => {
  try {
    const { id, historyId } = req.params;
    const { resolveDescription } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const history = order.onRoadUnavailableHistory.id(historyId);
    if (!history) return errorResponse(res, "History not found", null, 404);

    const resolvedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

    const photoFile = (req.files || []).find(f => f.fieldname === "availablePhoto");

    if (photoFile) {
      const err = validateFile(photoFile, "Available photo");
      if (err) return errorResponse(res, err, null, 400);
    }

    const photoUrl = photoFile ? getFileUrl(photoFile) : "";

    history.status = "available";
    history.resolvedBy = resolvedBy;
    history.resolvedAt = new Date();
    history.resolveDescription = (resolveDescription || "").trim();
    history.resolvePhoto = photoUrl;

    const entry = history.entryId
      ? order.onRoadExecutionArray.id(history.entryId)
      : order.onRoadExecutionArray.find(
          (e) => e.vehicleRegistrationNumber === history.vehicleRegNo
        );
    if (entry) {
      entry.unavailableStatus = false;
      entry.unavailableReason = "";
    }

    await order.save();

    try {
      await VehicleMaster.updateOne(
        { "registrationVehicles.registrationNumber": history.vehicleRegNo },
        {
          $set: {
            "registrationVehicles.$.statusAvailability.currentStatus": "Booked",
            "registrationVehicles.$.statusAvailability.remarks": `Resumed on Order ${order.orderId} — ${(resolveDescription || "").trim()}`,
          },
        }
      );
    } catch (err) {
      console.error(`Failed to restore vehicle ${history.vehicleRegNo} status:`, err.message);
    }

    return successResponse(res, "Vehicle marked as available", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.submitClientFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments, rating, bookingItemId } = req.body; // ADD bookingItemId

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const createdBy = Number(req.user.isAdmin) !== 1
      ? req.user.username
      : order.handlerName || req.user?.username || "Admin";

    const feedbackEntry = {
      bookingItemId: bookingItemId || null, // ADD THIS
      comments: (comments || "").trim(),
      rating: rating || null,
      createdBy,
      createdDate: new Date(),
    };

    order.clientFeedbackHistory.push(feedbackEntry);
    await order.save();
    return successResponse(res, "Feedback submitted successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};




exports.submitCampaignClosure = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, reason, fromDate, toDate, bookingItemId } = req.body;

    if (!type || !["closed", "foc", "paid"].includes(type))
      return errorResponse(res, "Invalid closure type", null, 400);

    if (type === "closed" && !reason?.trim())
      return errorResponse(res, "Reason is required for closure", null, 400);

    if (type === "foc") {
      if (!reason?.trim())
        return errorResponse(res, "Reason is required for FOC", null, 400);
      if (!fromDate)
        return errorResponse(res, "From date is required", null, 400);
      if (!toDate)
        return errorResponse(res, "To date is required", null, 400);
    }

    if (type === "paid") {
      if (!fromDate)
        return errorResponse(res, "From date is required", null, 400);
      if (!toDate)
        return errorResponse(res, "To date is required", null, 400);
    }

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    // const createdBy =
    //   Number(req.user.isAdmin) !== 1
    //     ? req.user.username
    //     : order.handlerName || req.user?.username || "Admin";

    const createdBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : req.user?.username || order.handlerName || "Admin";

    const docFile = (req.files || []).find((f) => f.fieldname === "document");
    if (docFile) {
      const err = validateFile(docFile, "Document");
      if (err) return errorResponse(res, err, null, 400);
    }
    const docUrl = docFile ? getFileUrl(docFile) : "";

    if (type === "foc") {
      const existing = order.campaignClosureArray.find(
        (c) =>
          c.type === "foc" &&
          c.status === "pending" &&
          String(c.bookingItemId) === String(bookingItemId || "")
      );


      const requesterEmail = req.user?.email || "";
      const adminEmails = await getActiveAdminEmails();

      if (existing) {
        const changedFields = {};
        const newReason = reason.trim();
        const newFromDate = new Date(fromDate);
        const newToDate = new Date(toDate);

        if (existing.reason !== newReason)
          changedFields.reason = { old: existing.reason, new: newReason };
        if (!existing.fromDate || existing.fromDate.getTime() !== newFromDate.getTime())
          changedFields.fromDate = { old: existing.fromDate, new: newFromDate };
        if (!existing.toDate || existing.toDate.getTime() !== newToDate.getTime())
          changedFields.toDate = { old: existing.toDate, new: newToDate };
        if (docUrl && existing.document !== docUrl)
          changedFields.document = { old: existing.document, new: docUrl };

        const finalDocPath = docUrl || existing.document;

        await sendFocMail({
          status: "created",
          reason: newReason,
          fromDate: newFromDate,
          toDate: newToDate,
          documentPath: finalDocPath,
          description: `FOC extension request updated by ${createdBy} for order ${order.projectCodeArray[0].projectCode}. Reason: ${newReason}`,
          toEmail: adminEmails,
          ccEmail: requesterEmail,
        });

        existing.reason = newReason;
        existing.fromDate = newFromDate;
        existing.toDate = newToDate;
        if (docUrl) existing.document = docUrl;

        if (Object.keys(changedFields).length > 0) {
          existing.focHistory.push({
            action: "updated",
            changedFields,
            changedBy: createdBy,
            changedAt: new Date(),
          });
        }

        await order.save();
        return successResponse(res, "FOC extension updated successfully", { order });
      }

      const newReason = reason.trim();
      const newFromDate = new Date(fromDate);
      const newToDate = new Date(toDate);

      await sendFocMail({
        status: "created",
        reason: newReason,
        fromDate: newFromDate,
        toDate: newToDate,
        documentPath: docUrl,
        description: `New FOC extension request raised by ${createdBy} for order ${order.projectCodeArray[0].projectCode}. Reason: ${newReason}`,
        toEmail: adminEmails,
        ccEmail: requesterEmail,
      });



      const closureEntry = {
        bookingItemId: bookingItemId || null,
        type,
        reason: newReason,
        document: docUrl,
        fromDate: newFromDate,
        toDate: newToDate,
        createdBy,
        createdAt: new Date(),
        status: "pending",
        isAdminCreated: false,
        focChatMessages: [],
        focHistory: [
          { action: "created", changedFields: {}, changedBy: createdBy, changedAt: new Date() },
        ],
      };

      order.campaignClosureArray.push(closureEntry);
      await order.save();
      return successResponse(res, "FOC extension submitted successfully", { order });
    }

    const closureEntry = {
      bookingItemId: bookingItemId || null,
      type,
      reason: (reason || "").trim(),
      document: docUrl,
      fromDate: fromDate ? new Date(fromDate) : null,
      toDate: toDate ? new Date(toDate) : null,
      createdBy,
      createdAt: new Date(),
    };

    order.campaignClosureArray.push(closureEntry);

    if (type === "closed") {
      const oldStage = order.pipelineStatus;
      order.pipelineStatus = "closedLost";
      order.pipelineLogs.push({
        fromStage: oldStage,
        toStage: "closedLost",
        movedBy: createdBy,
        movedAt: new Date(),
      });
    }

    await order.save();
    return successResponse(res, "Campaign closure submitted successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.approveFocEntry = async (req, res) => {
  try {
    const { id, closureId } = req.params;
    const { fromDate, reason, toDate } = req.body;

    if (Number(req.user.isAdmin) !== 1) {
      return errorResponse(res, "Only super admin can approve FOC extension", null, 403);
    }

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const entry = order.campaignClosureArray.id(closureId);
    if (!entry) return errorResponse(res, "FOC entry not found", null, 404);
    if (entry.type !== "foc") return errorResponse(res, "Not a FOC entry", null, 400);
    if (entry.status === "approved") return errorResponse(res, "Already approved", null, 400);

    const approvedBy = req.user?.username || "Admin";
    const changedFields = {};

    if (fromDate) {
      const newFromDate = new Date(fromDate);
      if (!entry.fromDate || entry.fromDate.getTime() !== newFromDate.getTime()) {
        changedFields.fromDate = { old: entry.fromDate, new: newFromDate };
        entry.fromDate = newFromDate;
      }
    }
    if (reason && reason.trim() && reason.trim() !== entry.reason) {
      changedFields.reason = { old: entry.reason, new: reason.trim() };
      entry.reason = reason.trim();
    }
    if (toDate) {
      const newToDate = new Date(toDate);
      if (!entry.toDate || entry.toDate.getTime() !== newToDate.getTime()) {
        changedFields.toDate = { old: entry.toDate, new: newToDate };
        entry.toDate = newToDate;
      }
    }

    const approverEmail = req.user?.email || "";

   
    const createdByUsername =
      (entry.focHistory || []).find((h) => h.action === "created")?.changedBy ||
      entry.createdBy;
    const creatorEmail = await getEmailByUsername(createdByUsername);

    await sendFocMail({
      status: "approved",
      reason: entry.reason,
      fromDate: entry.fromDate,
      toDate: entry.toDate,
      documentPath: entry.document,
      description: `FOC extension approved by ${approvedBy} for order ${order.projectCodeArray[0].projectCode}. Reason: ${entry.reason}`,
      toEmail: approverEmail,
      ccEmail: creatorEmail,
    });

    entry.status = "approved";
    entry.approvedBy = approvedBy;
    entry.approvedAt = new Date();

    entry.focHistory.push({
      action: "approved",
      changedFields,
      changedBy: approvedBy,
      changedAt: new Date(),
    });


    if (entry.focPurpose === "compensation-days" && entry.compensationDaysValue > 0) {
      order.campaignCompensationArray.push({
        vehicleIndex: entry.compensationVehicleIndex,
        entryId: entry.compensationEntryId || null,
        compensationType: "days",
        compensationValue: entry.compensationDaysValue,
        fromDate: entry.fromDate,
        toDate: entry.toDate,
        reason: entry.reason || "",
        addedBy: approvedBy,
        addedAt: new Date(),
      });
    } else if (entry.focPurpose === "compensation-hours" && entry.compensationHoursValue > 0) {
      order.campaignCompensationArray.push({
        vehicleIndex: entry.compensationVehicleIndex,
        entryId: entry.compensationEntryId || null,
        compensationType: "hours",
        compensationValue: entry.compensationHoursValue,
        fromDate: entry.fromDate,
        toDate: entry.toDate,
        reason: entry.reason || "",
        addedBy: approvedBy,
        addedAt: new Date(),
      });
    }

    await order.save();
    return successResponse(res, "FOC extension approved successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};

exports.createAndApproveFocEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, fromDate, toDate, bookingItemId } = req.body;

    if (Number(req.user.isAdmin) !== 1) {
      return errorResponse(res, "Only super admin can create and approve FOC extension", null, 403);
    }

    if (!reason?.trim())
      return errorResponse(res, "Reason is required", null, 400);
    if (!fromDate)
      return errorResponse(res, "From date is required", null, 400);
    if (!toDate)
      return errorResponse(res, "To date is required", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const docFile = (req.files || []).find((f) => f.fieldname === "document");
    if (docFile) {
      const err = validateFile(docFile, "Document");
      if (err) return errorResponse(res, err, null, 400);
    }
    const docUrl = docFile ? getFileUrl(docFile) : "";

    const adminUsername = req.user?.username || "Admin";
    const now = new Date();



    const closureEntry = {
      bookingItemId: bookingItemId || null,
      type: "foc",
      reason: reason.trim(),
      document: docUrl,
      fromDate: new Date(fromDate),
      toDate: new Date(toDate),
      createdBy: adminUsername,
      createdAt: now,
      status: "approved",
      approvedBy: adminUsername,
      approvedAt: now,
      isAdminCreated: true,
      focChatMessages: [],
      focHistory: [
        { action: "created", changedFields: {}, changedBy: adminUsername, changedAt: now },
        { action: "approved", changedFields: {}, changedBy: adminUsername, changedAt: now },
      ],
    };

    order.campaignClosureArray.push(closureEntry);
    await order.save();

    return successResponse(res, "FOC extension created and approved successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.updateCampaignClosure = async (req, res) => {
  try {
    const { id, closureId } = req.params;
    const { reason, fromDate, toDate } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const entry = order.campaignClosureArray.id(closureId);
    if (!entry) return errorResponse(res, "Closure entry not found", null, 404);

    const docFile = (req.files || []).find(f => f.fieldname === "document");
    if (docFile) {
      const err = validateFile(docFile, "Document");
      if (err) return errorResponse(res, err, null, 400);
    }
    const docUrl = docFile ? getFileUrl(docFile) : entry.document;

    if (reason?.trim()) entry.reason = reason.trim();
    if (fromDate) entry.fromDate = new Date(fromDate);
    if (toDate) entry.toDate = new Date(toDate);
    if (docUrl) entry.document = docUrl;

    await order.save();
    return successResponse(res, "Closure updated successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};



exports.submitOrderClosedWon = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    if (order.pipelineStatus === "closedLost") {
      return errorResponse(res, "This order is closed lost and cannot be moved.", null, 400);
    }

    const uploadedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

    const docFile = (req.files || []).find((f) => f.fieldname === "document");
    if (docFile) {
      const err = validateFile(docFile, "Closed Won document");
      if (err) return errorResponse(res, err, null, 400);
    }
    const docUrl = docFile ? getFileUrl(docFile) : "";

    order.orderClosedWonArray.push({
      comments: comments.trim(),
      document: docUrl,
      uploadedBy,
      uploadedAt: new Date(),
    });

    const RELEASE_VEHICLE_FROM_STAGES = ["projectExecution", "onRoad", "clientClosure"];
    const oldStage = order.pipelineStatus;
    order.pipelineStatus = "closedWon";
    order.pipelineLogs.push({
      fromStage: oldStage,
      toStage: "closedWon",
      movedBy: uploadedBy,
      movedAt: new Date(),
    });

    await order.save();

    if (RELEASE_VEHICLE_FROM_STAGES.includes(oldStage)) {
      const regNumbers = (order.onRoadExecutionArray || [])
        .filter((e) => e.entryStatus === "active" && !e.unavailableStatus)
        .map((e) => e.vehicleRegistrationNumber)
        .filter(Boolean);

      for (const regNo of regNumbers) {
        try {
          await VehicleMaster.updateOne(
            { "registrationVehicles.registrationNumber": regNo },
            { $set: { "registrationVehicles.$.statusAvailability.currentStatus": "Available" } }
          );
        } catch (err) {
          console.error(`Failed to release vehicle ${regNo}:`, err.message);
        }
      }
    }

    return successResponse(res, "Order moved to Closed Won successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.submitOrderClosedLost = async (req, res) => {
  try {

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason?.trim())
      return errorResponse(res, "Reason is required", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    if (order.pipelineStatus === "closedLost") {
      return errorResponse(res, "This order is already closed lost.", null, 400);
    }

    const uploadedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

    const docFile = (req.files || []).find((f) => f.fieldname === "document");
    if (docFile) {
      const err = validateFile(docFile, "Closed Lost document");
      if (err) return errorResponse(res, err, null, 400);
    }
    const docUrl = docFile ? getFileUrl(docFile) : "";

    order.orderClosedLostArray.push({
      reason: reason.trim(),
      document: docUrl,
      uploadedBy,
      uploadedAt: new Date(),
    });

    // ── CHANGE STARTS HERE ──────────────────────────────────────
    const RELEASE_VEHICLE_FROM_STAGES = ["projectExecution", "onRoad", "clientClosure"];
    const oldStage = order.pipelineStatus;
    order.pipelineStatus = "closedLost";
    order.pipelineLogs.push({
      fromStage: oldStage,
      toStage: "closedLost",
      movedBy: uploadedBy,
      movedAt: new Date(),
    });

    await order.save();

    if (RELEASE_VEHICLE_FROM_STAGES.includes(oldStage)) {
      const regNumbers = (order.onRoadExecutionArray || [])
        .filter((e) => e.entryStatus === "active" && !e.unavailableStatus)
        .map((e) => e.vehicleRegistrationNumber)
        .filter(Boolean);

      for (const regNo of regNumbers) {
        try {
          await VehicleMaster.updateOne(
            { "registrationVehicles.registrationNumber": regNo },
            { $set: { "registrationVehicles.$.statusAvailability.currentStatus": "Available" } }
          );
        } catch (err) {
          console.error(`Failed to release vehicle ${regNo}:`, err.message);
        }
      }
    }
   

    return successResponse(res, "Order moved to Closed Lost successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.sendFocChatMessage = async (req, res) => {
  try {
    const { id, closureId } = req.params;
    const { message } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const entry = order.campaignClosureArray.id(closureId);
    if (!entry) return errorResponse(res, "FOC entry not found", null, 404);
    if (entry.type !== "foc") return errorResponse(res, "Not a FOC entry", null, 400);


    if (entry.status !== "pending") {
      return errorResponse(res, "This FOC request is already approved — chat is closed", null, 400);
    }


    if (entry.isAdminCreated) {
      return errorResponse(res, "This FOC entry was created by admin directly and has no chat", null, 400);
    }

    if (!message?.trim() && !(req.files || []).length) {
      return errorResponse(res, "Message or attachment is required", null, 400);
    }

    const attachmentFile = (req.files || []).find((f) => f.fieldname === "attachment");
    if (attachmentFile) {
      const err = validateFile(attachmentFile, "Chat attachment");
      if (err) return errorResponse(res, err, null, 400);
    }
    const attachmentUrl = attachmentFile ? getFileUrl(attachmentFile) : "";

    const isAdminNum = Number(req.user.isAdmin);
    const senderRole = isAdminNum === 1 ? "admin" : isAdminNum === 2 ? "sales" : isAdminNum === 3 ? "operation" : "staffAdmin";

    entry.focChatMessages.push({
      senderUsername: req.user?.username || "Unknown",
      senderRole,
      message: (message || "").trim(),
      attachment: attachmentUrl,
      sentAt: new Date(),
    });

    await order.save();
    return successResponse(res, "Message sent", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};



exports.getVamosysApiKey = async (req, res) => {
  try {
    const apiKey = await fetchVamosysApiKey();

    return res.status(200).json({
      success: true,
      data: { apiKey },
    });
  } catch (error) {
    console.error("Vamosys API key fetch failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch Vamosys API key",
      error: error.message,
    });
  }
};

exports.getVehicleLocationsProxy = async (req, res) => {
  try {
    const locations = await fetchAllVehicleLocations();
    return successResponse(res, "Vehicle locations fetched", {
      data: [{ vehicleLocations: locations }],
    });
  } catch (error) {
    console.error("Vamosys locations proxy error:", error.message);
    return errorResponse(res, error.message, null, 500);
  }
};



exports.addExtraKmDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleIndex, entryId, extraKm, extraHours, fromDate, toDate, extraKmId, distributionMethod } = req.body;

    const vIdx = Number(vehicleIndex);
    const km = Number(extraKm) || 0;
    const hrs = Number(extraHours) || 0;
    const distMethod = distributionMethod === "split" ? "split" : "daily";

   
    if (km <= 0 && hrs <= 0) {
      return errorResponse(res, "Enter extra KM or extra hours", null, 400);
    }

    if (!fromDate) {
      return errorResponse(res, "From date is required", null, 400);
    }

    if (!toDate) {
      return errorResponse(res, "To date is required", null, 400);
    }

    const newFrom = new Date(fromDate);
    const newTo = new Date(toDate);

    if (isNaN(newFrom.getTime()) || isNaN(newTo.getTime())) {
      return errorResponse(res, "Invalid date format", null, 400);
    }

    if (newFrom > newTo) {
      return errorResponse(res, "From date must be before or equal to To date", null, 400);
    }

  
    const order = await Order.findById(id);
    if (!order) {
      return errorResponse(res, "Order not found", null, 404);
    }

    
    const bookingItem = order.bookingItems[vIdx];
    if (!bookingItem) {
      return errorResponse(res, "Vehicle not found in this order", null, 404);
    }

  
    const campaignFrom = new Date(bookingItem.fromDate);
    const campaignTo = new Date(bookingItem.toDate);

    if (newFrom < campaignFrom || newTo > campaignTo) {
      return errorResponse(
        res,
        `Dates must be within campaign range (${campaignFrom.toLocaleDateString("en-IN")} - ${campaignTo.toLocaleDateString("en-IN")})`,
        null,
        400
      );
    }

 
    let driverEntry = null;
    if (entryId) {
      driverEntry = order.onRoadExecutionArray.id(entryId);
      if (!driverEntry) {
        return errorResponse(res, "Driver entry not found", null, 404);
      }
    }

    if (!bookingItem.packageId) {
      return errorResponse(res, "Package not linked to this vehicle", null, 400);
    }

    const pkg = await Package.findById(bookingItem.packageId);
    if (!pkg) {
      return errorResponse(res, "Package not found", null, 404);
    }

    const perKmChargeRate = pkg.perKmCharge || 0;
    const additionalHourChargeRate = pkg.additionalHourCharges || 0;

    const extraKmCost = km * perKmChargeRate;
    const extraHourCost = hrs * additionalHourChargeRate;
    const totalCost = extraKmCost + extraHourCost;

    const addedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

   
    const extraKmPayload = {
      vehicleIndex: vIdx,
      entryId: driverEntry ? driverEntry._id : null,
      driverName: driverEntry?.driverName || "",
      driverPhone: driverEntry?.driverPhone || "",
      vehicleRegistrationNumber: driverEntry?.vehicleRegistrationNumber || "",
      extraKm: km,
      extraHours: hrs,
      fromDate: newFrom,
      toDate: newTo,
      perKmChargeRate,
      additionalHourChargeRate,
      extraKmCost,
      extraHourCost,
      totalCost,
      addedBy,
      addedAt: new Date(),
      distributionMethod: distMethod,
    };


    order.extraKmDetailsArray.push(extraKmPayload);

 
    if (driverEntry && entryId) {
     
      if (extraKmId) {
      
        const existingEntry = order.onRoadExtraKm.id(extraKmId);
        
        if (existingEntry) {
    
          existingEntry.extraKm = km;
          existingEntry.extraHours = hrs;
          existingEntry.fromDate = newFrom;
          existingEntry.toDate = newTo;
          existingEntry.perKmChargeRate = perKmChargeRate;
          existingEntry.additionalHourChargeRate = additionalHourChargeRate;
          existingEntry.extraKmCost = extraKmCost;
          existingEntry.extraHourCost = extraHourCost;
          existingEntry.totalCost = totalCost;
          existingEntry.addedBy = addedBy;
          existingEntry.addedAt = new Date();
          existingEntry.distributionMethod = distMethod;
          existingEntry.driverName = driverEntry?.driverName || "";
          existingEntry.driverPhone = driverEntry?.driverPhone || "";
          existingEntry.vehicleRegistrationNumber = driverEntry?.vehicleRegistrationNumber || "";
        } else {
          
          order.onRoadExtraKm.push(extraKmPayload);
        }
      } else {
        
        const driverEntries = order.onRoadExtraKm.filter(
          (e) => e.entryId && e.entryId.toString() === driverEntry._id.toString()
        );
        
        if (driverEntries.length > 0) {
        
          const latestEntry = driverEntries[driverEntries.length - 1];
          
          
          latestEntry.extraKm = km;
          latestEntry.extraHours = hrs;
          latestEntry.fromDate = newFrom;
          latestEntry.toDate = newTo;
          latestEntry.perKmChargeRate = perKmChargeRate;
          latestEntry.additionalHourChargeRate = additionalHourChargeRate;
          latestEntry.extraKmCost = extraKmCost;
          latestEntry.extraHourCost = extraHourCost;
          latestEntry.totalCost = totalCost;
          latestEntry.addedBy = addedBy;
          latestEntry.addedAt = new Date();
          latestEntry.distributionMethod = distMethod;
          latestEntry.driverName = driverEntry?.driverName || "";
          latestEntry.driverPhone = driverEntry?.driverPhone || "";
          latestEntry.vehicleRegistrationNumber = driverEntry?.vehicleRegistrationNumber || "";
        } else {
          
          order.onRoadExtraKm.push(extraKmPayload);
        }
      }
    } else {
      
      order.onRoadExtraKm.push(extraKmPayload);
    }

    
    await order.save();

    return successResponse(res, "Extra KM details added successfully", { order }, 201);

  } catch (error) {
    console.error("Error in addExtraKmDetails:", error);
    return errorResponse(res, error.message, null, 500);
  }
};

const CAMPAIGN_HOURS_PER_DAY = Number(process.env.CAMPAIGN_HOURS_PER_DAY) || 8;
const GST_PERCENT = Number(process.env.GST_PERCENT) || 18;

exports.addDailyHoursLog = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      vehicleIndex, entryId, day, startTime, endTime, remarks, logId, isAbsentDay, billingMode, absentDayResolution,
      distanceCoveredKm, activationsCount, leadsCollected, peopleEngaged, routeNote,
    } = req.body;

    const vIdx = Number(vehicleIndex);
    const absentDayFlag = !!isAbsentDay;
    if (!day) return errorResponse(res, "Day is required", null, 400);

  
    let resolvedAbsentDayResolution = null;
    if (absentDayFlag) {
      if (absentDayResolution !== "extend" && absentDayResolution !== "close") {
        return errorResponse(
          res,
          "absentDayResolution ('extend' or 'close') is required when isAbsentDay is true",
          null,
          400
        );
      }
      resolvedAbsentDayResolution = absentDayResolution;
    }

   
    const allowedBillingModes = ["full", "partial", "absent"];
    let resolvedBillingMode = allowedBillingModes.includes(billingMode) ? billingMode : "full";
    if (absentDayFlag) {
     
      resolvedBillingMode = "absent";
    }


    let start, end, runningHours, absentHours;
    if (absentDayFlag) {
      start = new Date(`${day}T00:00:00.000Z`);
      end = new Date(`${day}T00:00:01.000Z`);
      runningHours = 0;
      absentHours = CAMPAIGN_HOURS_PER_DAY;
    } else {
      if (!startTime) return errorResponse(res, "Start time is required", null, 400);
      if (!endTime) return errorResponse(res, "End time is required", null, 400);

      start = new Date(startTime);
      end = new Date(endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return errorResponse(res, "Invalid time format", null, 400);
      }
      if (end <= start) {
        return errorResponse(res, "End time must be after start time", null, 400);
      }
      runningHours = Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100;
      absentHours = Math.max(Math.round((CAMPAIGN_HOURS_PER_DAY - runningHours) * 100) / 100, 0);
    }

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const bookingItem = order.bookingItems[vIdx];
    if (!bookingItem) return errorResponse(res, "Vehicle not found in this order", null, 404);

    const campaignFrom = new Date(bookingItem.fromDate).toISOString().slice(0, 10);
    const campaignTo = new Date(bookingItem.toDate).toISOString().slice(0, 10);
    if (day < campaignFrom || day > campaignTo) {
      return errorResponse(res, "Day must be within campaign range", null, 400);
    }

    let entry = null;
    if (entryId) {
      entry = order.onRoadExecutionArray.id(entryId);
      if (!entry) return errorResponse(res, "Vehicle entry not found", null, 404);
    }

    const loggedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

    const existing = logId
      ? order.dailyHoursLogArray.id(logId)
      : order.dailyHoursLogArray.find(
          (l) => l.entryId && entry && l.entryId.toString() === entry._id.toString() && l.day === day
        );

    /* Day photos: a re-save that doesn't attach new files keeps whatever
       was uploaded last time, rather than wiping them. */
    const uploadedPhotoFiles = (req.files || []).filter((f) => f.fieldname === "photos");
    for (const file of uploadedPhotoFiles) {
      const err = validateFile(file, "Day photo");
      if (err) return errorResponse(res, err, null, 400);
    }
    const photos = uploadedPhotoFiles.length
      ? uploadedPhotoFiles.map(getFileUrl)
      : existing?.photos || [];

    const payload = {
      vehicleIndex: vIdx,
      entryId: entry ? entry._id : null,
      driverName: entry?.driverName || "",
      driverPhone: entry?.driverPhone || "",
      vehicleRegistrationNumber: entry?.vehicleRegistrationNumber || "",
      day,
      startTime: start,
      endTime: end,
      campaignHours: CAMPAIGN_HOURS_PER_DAY,
      runningHours,
      absentHours,
      isAbsentDay: absentDayFlag,
      absentDayResolution: resolvedAbsentDayResolution,
      billingMode: resolvedBillingMode,
      remarks: remarks || "",
      loggedBy,
      loggedAt: new Date(),
      distanceCoveredKm: Number(distanceCoveredKm) || 0,
      activationsCount: Number(activationsCount) || 0,
      leadsCollected: Number(leadsCollected) || 0,
      peopleEngaged: Number(peopleEngaged) || 0,
      routeNote: routeNote || "",
      photos,
    };

    if (existing) {
      Object.assign(existing, payload);
    } else {
      order.dailyHoursLogArray.push(payload);
    }


    if (absentDayFlag && resolvedAbsentDayResolution === "extend") {
      const alreadyPendingOrApproved = (order.campaignClosureArray || []).some(
        (c) =>
          c.type === "foc" &&
          String(c.bookingItemId) === String(bookingItem._id || vIdx) &&
          c.status !== "rejected" &&
          new Date(c.fromDate).toISOString().slice(0, 10) === campaignTo
      );
      if (!alreadyPendingOrApproved) {
        const isSuperAdmin = Number(req.user.isAdmin) === 1;
        const extendedTo = new Date(`${campaignTo}T00:00:00.000Z`);
        extendedTo.setUTCDate(extendedTo.getUTCDate() + 1);
        const now = new Date();
        const reason = `Vehicle Absent on ${day} — Campaign extended by 1 day`;
        order.campaignClosureArray.push({
          bookingItemId: bookingItem._id || null,
          type: "foc",
          reason,
          document: "",
          fromDate: new Date(`${campaignTo}T00:00:00.000Z`),
          toDate: extendedTo,
          createdBy: loggedBy,
          createdAt: now,
          status: isSuperAdmin ? "approved" : "pending",
          approvedBy: isSuperAdmin ? loggedBy : undefined,
          approvedAt: isSuperAdmin ? now : undefined,
          isAdminCreated: isSuperAdmin,
          focChatMessages: [],
          focPurpose: "absent-day",
          focHistory: isSuperAdmin
            ? [
                { action: "created", changedFields: {}, changedBy: loggedBy, changedAt: now },
                { action: "approved", changedFields: {}, changedBy: loggedBy, changedAt: now },
              ]
            : [{ action: "created", changedFields: {}, changedBy: loggedBy, changedAt: now }],
        });
      }
    }

    await order.save();

    return successResponse(res, "Daily hours logged successfully", { order }, 201);
  } catch (error) {
    console.error("Error in addDailyHoursLog:", error);
    return errorResponse(res, error.message, null, 500);
  }
};


exports.setPurchasedPoolWindow = async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleIndex, fromDate, toDate } = req.body;

    const vIdx = Number(vehicleIndex);
    if (Number.isNaN(vIdx)) {
      return errorResponse(res, "vehicleIndex is required", null, 400);
    }

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const bookingItem = order.bookingItems[vIdx];
    if (!bookingItem) return errorResponse(res, "Vehicle not found in this order", null, 404);

    let newFrom = null;
    let newTo = null;
    if (fromDate || toDate) {
      if (!fromDate || !toDate) {
        return errorResponse(res, "Both From date and To date are required (or leave both empty to reset)", null, 400);
      }
      newFrom = new Date(fromDate);
      newTo = new Date(toDate);
      if (isNaN(newFrom.getTime()) || isNaN(newTo.getTime())) {
        return errorResponse(res, "Invalid date format", null, 400);
      }
      if (newFrom > newTo) {
        return errorResponse(res, "From date must be before or equal to To date", null, 400);
      }
      const itemFrom = new Date(bookingItem.fromDate);
      const itemTo = new Date(bookingItem.toDate);
      if (newFrom < itemFrom || newTo > itemTo) {
        return errorResponse(res, "The pool window must fall within this vehicle's campaign dates", null, 400);
      }
    }

    bookingItem.purchasedExtraKmFromDate = newFrom;
    bookingItem.purchasedExtraKmToDate = newTo;

    await order.save();

    return successResponse(res, "Purchased Extra KM/Hours pool window updated successfully", { order }, 200);
  } catch (error) {
    console.error("Error in setPurchasedPoolWindow:", error);
    return errorResponse(res, error.message, null, 500);
  }
};

exports.addCampaignCompensation = async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleIndex, entryId, compensationType, compensationValue, fromDate, toDate, reason } = req.body;

    const vIdx = Number(vehicleIndex);
    const value = Number(compensationValue) || 0;
    if (!["hours", "days"].includes(compensationType)) {
      return errorResponse(res, "compensationType must be 'hours' or 'days'", null, 400);
    }
    if (value <= 0) return errorResponse(res, "Enter a compensation value greater than 0", null, 400);
    if (!fromDate) return errorResponse(res, "From date is required", null, 400);
    if (!toDate) return errorResponse(res, "To date is required", null, 400);

    const newFrom = new Date(fromDate);
    const newTo = new Date(toDate);
    if (isNaN(newFrom.getTime()) || isNaN(newTo.getTime())) {
      return errorResponse(res, "Invalid date format", null, 400);
    }
    if (newFrom > newTo) {
      return errorResponse(res, "From date must be before or equal to To date", null, 400);
    }

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const bookingItem = order.bookingItems[vIdx];
    if (!bookingItem) return errorResponse(res, "Vehicle not found in this order", null, 404);

    let entry = null;
    if (entryId) {
      entry = order.onRoadExecutionArray.id(entryId);
      if (!entry) return errorResponse(res, "Vehicle entry not found", null, 404);
    }

    const addedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";


    if (compensationType === "days" || compensationType === "hours") {
      const isSuperAdmin = Number(req.user.isAdmin) === 1;
      const now = new Date();
      const focPurpose = compensationType === "days" ? "compensation-days" : "compensation-hours";

      if (isSuperAdmin) {
        order.campaignCompensationArray.push({
          vehicleIndex: vIdx,
          entryId: entry ? entry._id : null,
          vehicleRegistrationNumber: entry?.vehicleRegistrationNumber || "",
          compensationType,
          compensationValue: value,
          fromDate: newFrom,
          toDate: newTo,
          reason: reason || "",
          addedBy,
          addedAt: now,
        });
      }

      order.campaignClosureArray.push({
        bookingItemId: bookingItem._id || null,
        type: "foc",
        reason:
          reason ||
          (compensationType === "days"
            ? `Compensation: ${value} extra campaign day(s) requested`
            : `Compensation: ${value} extra working hour(s) requested`),
        document: "",
        fromDate: newFrom,
        toDate: newTo,
        createdBy: addedBy,
        createdAt: now,
        status: isSuperAdmin ? "approved" : "pending",
        approvedBy: isSuperAdmin ? addedBy : undefined,
        approvedAt: isSuperAdmin ? now : undefined,
        isAdminCreated: isSuperAdmin,
        focChatMessages: [],
        focPurpose,
        compensationVehicleIndex: vIdx,
        compensationEntryId: entry ? entry._id : null,
        compensationDaysValue: compensationType === "days" ? value : null,
        compensationHoursValue: compensationType === "hours" ? value : null,
        focHistory: isSuperAdmin
          ? [
              { action: "created", changedFields: {}, changedBy: addedBy, changedAt: now },
              { action: "approved", changedFields: {}, changedBy: addedBy, changedAt: now },
            ]
          : [{ action: "created", changedFields: {}, changedBy: addedBy, changedAt: now }],
      });

      await order.save();

      const label = compensationType === "days" ? "Campaign days extension" : "Extra hours compensation";
      return successResponse(
        res,
        isSuperAdmin
          ? `${label} approved and applied`
          : `${label} requested — waiting for admin approval`,
        { order },
        201
      );
    }

    order.campaignCompensationArray.push({
      vehicleIndex: vIdx,
      entryId: entry ? entry._id : null,
      vehicleRegistrationNumber: entry?.vehicleRegistrationNumber || "",
      compensationType,
      compensationValue: value,
      fromDate: newFrom,
      toDate: newTo,
      reason: reason || "",
      addedBy,
      addedAt: new Date(),
    });

    await order.save();

    return successResponse(res, "Campaign compensation added successfully", { order }, 201);
  } catch (error) {
    console.error("Error in addCampaignCompensation:", error);
    return errorResponse(res, error.message, null, 500);
  }
};

exports.releaseOnRoadVehicle = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const entry = order.onRoadExecutionArray.id(entryId);
    if (!entry) return errorResponse(res, "Vehicle entry not found", null, 404);

    if (entry.entryStatus !== "active") {
      const msg =
        entry.entryStatus === "replaced"
          ? "This vehicle has already been replaced and is no longer active"
          : "This vehicle is already released";
      return errorResponse(res, msg, null, 400);
    }

    const releasedBy =
      Number(req.user.isAdmin) !== 1
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

   
    entry.entryStatus = "removed";
    // entry.onRoadStatus = 0; 
    entry.removedAt = new Date();
    entry.removedBy = releasedBy;
    entry.removalReason = (reason || "").trim();

    // 2. History log — "removed" action
    order.onRoadDriverHistory.push({
      vehicleIndex: entry.vehicleIndex,
      entryId: entry._id,
      action: "removed",
      driverName: entry.driverName,
      driverPhone: entry.driverPhone,
      vehicleRegistrationNumber: entry.vehicleRegistrationNumber,
      changedBy: releasedBy,
      changedAt: new Date(),
      changedFields: { reason: (reason || "").trim() },
    });

    await order.save();

    // 3. Release the vehicle back to Vehicle Master pool (so it's bookable again)
    try {
      await VehicleMaster.updateOne(
        { "registrationVehicles.registrationNumber": entry.vehicleRegistrationNumber },
        {
          $set: {
            "registrationVehicles.$.statusAvailability.currentStatus": "Available",
            "registrationVehicles.$.statusAvailability.orderId": "",
            "registrationVehicles.$.statusAvailability.orderDisplayId": "",
            "registrationVehicles.$.statusAvailability.fromDate": null,
            "registrationVehicles.$.statusAvailability.toDate": null,
          },
        }
      );
    } catch (err) {
      console.error(`Failed to release vehicle ${entry.vehicleRegistrationNumber}:`, err.message);
    }

    return successResponse(res, "Vehicle released from campaign successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};



const dateKey = (d) => new Date(d).toISOString().slice(0, 10);

function addDaysUTC(dateKeyStr, days) {
  const d = new Date(dateKeyStr + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return dateKey(d);
}

function daysBetweenInclusive(fromKeyStr, toKeyStr) {
  const f = new Date(fromKeyStr + "T00:00:00.000Z");
  const t = new Date(toKeyStr + "T00:00:00.000Z");
  return Math.round((t - f) / 86400000) + 1;
}

function resolveEffectiveExtraKmRecords(slotRecords) {
  const byEntry = new Map();
  slotRecords.forEach((rec) => {
    const key = rec.entryId ? String(rec.entryId) : "campaign";
    const existing = byEntry.get(key);
    if (!existing || new Date(rec.addedAt) > new Date(existing.addedAt)) {
      byEntry.set(key, rec);
    }
  });
  return Array.from(byEntry.values());
}


function resolveEntryStateForDay(entry, historyForEntry, dayKey) {
  const eventsUpToDay = historyForEntry.filter((h) => dateKey(h.changedAt) <= dayKey);
  if (eventsUpToDay.length === 0) return null; // not created yet as of this day

  let state = null;
  let removed = false;
  let createdOnThisDay = false;
  let releasedOnThisDay = false;

  for (const ev of historyForEntry) {
    const evKey = dateKey(ev.changedAt);
    if (evKey > dayKey) break;

    if (ev.action === "created") {
      state = {
        driverName: ev.driverName,
        driverPhone: ev.driverPhone,
        vehicleRegistrationNumber: ev.vehicleRegistrationNumber,
      };
      removed = false;
      if (evKey === dayKey) createdOnThisDay = true;
    } else if (ev.action === "updated" && state) {
      const cf = ev.changedFields || {};
      if (cf.driverName?.new !== undefined) state.driverName = cf.driverName.new;
      if (cf.driverPhone?.new !== undefined) state.driverPhone = cf.driverPhone.new;
      if (cf.vehicleRegistrationNumber?.new !== undefined) {
        state.vehicleRegistrationNumber = cf.vehicleRegistrationNumber.new;
      }
    } else if (ev.action === "removed") {
      removed = true;
      if (evKey === dayKey) releasedOnThisDay = true;
    }
  }

  if (!state || removed) {
    return removed
      ? {
          removed: true,
          releasedOnThisDay,
          entryId: String(entry._id),
          driverName: state ? state.driverName : entry.driverName,
          driverPhone: state ? state.driverPhone : entry.driverPhone,
          vehicleRegistrationNumber: state
            ? state.vehicleRegistrationNumber
            : entry.vehicleRegistrationNumber,
        }
      : null;
  }

  return {
    entryId: String(entry._id),
    driverName: state.driverName,
    driverPhone: state.driverPhone,
    vehicleRegistrationNumber: state.vehicleRegistrationNumber,
    createdOnThisDay,
    isReplacement: false, 
  };
}


function daysBetweenInclusive(fromDate, toDate) {
  const f = new Date(`${dateKey(fromDate)}T00:00:00.000Z`);
  const t = new Date(`${dateKey(toDate)}T00:00:00.000Z`);
  return Math.max(Math.round((t - f) / (1000 * 60 * 60 * 24)) + 1, 1);
}


function parseTimeToDecimalHour(str, fallback) {
  const m = String(str || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    const n = Number(str);
    return isNaN(n) ? fallback : n;
  }
  return Number(m[1]) + Number(m[2]) / 60;
}

const DEFAULT_WORK_START_HOUR = parseTimeToDecimalHour(process.env.DEFAULT_WORK_START_HOUR, 16);

let _rawWorkEndHour = parseTimeToDecimalHour(process.env.DEFAULT_WORK_END_HOUR, 24);
if (_rawWorkEndHour <= DEFAULT_WORK_START_HOUR) _rawWorkEndHour += 24;
const DEFAULT_WORK_END_HOUR = _rawWorkEndHour;

const IST_OFFSET = "+05:30";
function istWallClock(dayKeyStr, hourDecimal) {

  const totalMinutes = Math.round(hourDecimal * 60);
  const dayOffset = Math.floor(totalMinutes / (24 * 60));
  const minutesInDay = totalMinutes - dayOffset * 24 * 60;
  const hh = String(Math.floor(minutesInDay / 60)).padStart(2, "0");
  const mm = String(minutesInDay % 60).padStart(2, "0");
  const targetDay = dayOffset > 0 ? addDaysUTC(dayKeyStr, dayOffset) : dayKeyStr;
  return new Date(`${targetDay}T${hh}:${mm}:00${IST_OFFSET}`);
}


function resolveWorkWindow(dayKeyStr, hoursLog) {
  if (hoursLog && hoursLog.startTime && hoursLog.endTime && !hoursLog.isAbsentDay) {
    const start = new Date(hoursLog.startTime);
    const end = new Date(hoursLog.endTime);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
      return { start, end };
    }
  }
  const start = istWallClock(dayKeyStr, DEFAULT_WORK_START_HOUR);
  const end = istWallClock(dayKeyStr, DEFAULT_WORK_END_HOUR);
  return { start, end };
}

function buildEntryDayTimeline(windowStart, windowEnd, issuesForEntry, unavailForEntry, entryCreatedClip) {
  const clip = (d) => {
    if (!d) return null;
    const t = new Date(d);
    if (isNaN(t.getTime())) return null;
    if (t < windowStart) return new Date(windowStart);
    if (t > windowEnd) return new Date(windowEnd);
    return t;
  };

  const replacedRecord = (unavailForEntry || [])
    .filter((h) => h.eventType === "replaced" && h.replacedAt)
    .sort((a, b) => new Date(a.replacedAt) - new Date(b.replacedAt))[0];
  const entryEndCap = replacedRecord ? clip(replacedRecord.replacedAt) || windowEnd : windowEnd;

  let effectiveStart = windowStart;
  if (entryCreatedClip) {
    const cc = clip(entryCreatedClip);
    if (cc && cc > effectiveStart) effectiveStart = cc;
  }

  if (entryEndCap <= effectiveStart) {
    return { timeline: [], runningHours: 0, issueHours: 0, unavailableHours: 0 };
  }

  const issueIntervals = [];
  for (const iss of issuesForEntry || []) {
    const s = clip(iss.reportedAt);
    if (!s || s >= entryEndCap) continue;
    let e = clip(iss.resolvedAt) || entryEndCap;
    if (e > entryEndCap) e = entryEndCap;
    if (e > s) issueIntervals.push([s, e]);
  }

  const unavailIntervals = [];
  for (const h of unavailForEntry || []) {
    if (h.eventType === "replaced") continue; // boundary marker only (entryEndCap), not its own segment
    const s = clip(h.reportedAt);
    if (!s || s >= entryEndCap) continue;
    let e = clip(h.resolvedAt) || entryEndCap;
    if (e > entryEndCap) e = entryEndCap;
    if (e > s) unavailIntervals.push([s, e]);
  }

  const allDownStarts = [...issueIntervals, ...unavailIntervals].map(([s]) => s);
  const downFloor =
    replacedRecord && allDownStarts.length
      ? allDownStarts.reduce((m, s) => (s < m ? s : m))
      : null;

  const points = new Set([effectiveStart.getTime(), entryEndCap.getTime()]);
  issueIntervals.forEach(([s, e]) => { points.add(s.getTime()); points.add(e.getTime()); });
  unavailIntervals.forEach(([s, e]) => { points.add(s.getTime()); points.add(e.getTime()); });
  if (downFloor) points.add(downFloor.getTime());

  const sorted = Array.from(points)
    .filter((ms) => ms >= effectiveStart.getTime() && ms <= entryEndCap.getTime())
    .sort((a, b) => a - b)
    .map((ms) => new Date(ms));

  const timeline = [];
  let runningHours = 0;
  let issueHours = 0;
  let unavailableHours = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    if (segEnd <= segStart) continue;
    const hours = Math.round(((segEnd - segStart) / (1000 * 60 * 60)) * 100) / 100;
    if (hours <= 0) continue;
    const mid = new Date((segStart.getTime() + segEnd.getTime()) / 2);

    let type = "running";
    if (issueIntervals.some(([s, e]) => mid >= s && mid < e)) {
      type = "issue";
    } else if (unavailIntervals.some(([s, e]) => mid >= s && mid < e)) {
      type = "unavailable";
    } else if (downFloor && mid >= downFloor && mid < entryEndCap) {
      type = "unavailable";
    }

    timeline.push({ type, start: segStart, end: segEnd, hours });
    if (type === "running") runningHours += hours;
    else if (type === "issue") issueHours += hours;
    else unavailableHours += hours;
  }

  return {
    timeline,
    runningHours: Math.round(runningHours * 100) / 100,
    issueHours: Math.round(issueHours * 100) / 100,
    unavailableHours: Math.round(unavailableHours * 100) / 100,
  };
}

const INVOICE_FIELD_SECTIONS = {
  invoiceDate: { section: "Invoice Meta", label: "Invoice Date", type: "date" },
  dueDate: { section: "Invoice Meta", label: "Due Date", type: "date" },
  poNumber: { section: "Invoice Meta", label: "P.O.#" },
  projectName: { section: "Invoice Meta", label: "Project Name" },
  placeOfSupply: { section: "Invoice Meta", label: "Place Of Supply" },
  billToName: { section: "Bill To", label: "Name / Company" },
  billToAddress: { section: "Bill To", label: "Address" },
  billToGstin: { section: "Bill To", label: "GSTIN" },
  billToPan: { section: "Bill To", label: "PAN" },
  cgstPercent: { section: "Tax", label: "CGST %" },
  sgstPercent: { section: "Tax", label: "SGST %" },
  igstPercent: { section: "Tax", label: "IGST %" },
  rounding: { section: "Tax", label: "Rounding" },
  signatureMode: { section: "Signature", label: "Signature Mode" },
};

const toDateOnly = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toISOString().slice(0, 10);
};

const buildInvoiceDiff = (oldData, newData) => {
  const changes = [];

  Object.entries(INVOICE_FIELD_SECTIONS).forEach(([key, meta]) => {
    const oldVal = oldData ? oldData[key] : undefined;
    const newVal = newData[key];
    const oldCmp = meta.type === "date" ? toDateOnly(oldVal) : (oldVal ?? null);
    const newCmp = meta.type === "date" ? toDateOnly(newVal) : (newVal ?? null);
    if (JSON.stringify(oldCmp) !== JSON.stringify(newCmp)) {
      changes.push({
        section: meta.section,
        field: meta.label,
        oldValue: oldVal ?? null,
        newValue: newVal ?? null,
      });
    }
  });

  return changes;
};

const normalizeDiscount = (d) => ({
  // Keep a genuinely blank label as "" (not defaulted to "Discount") — the
  // blank-placeholder check in buildDiscountDiff below relies on this to
  // tell an untouched draft row apart from a real previously-saved one.
  label: (d.label || "").trim(),
  mode: d.mode === "add" ? "add" : "decrease",
  type: d.type === "amount" ? "amount" : "percent",
  value: Number(d.value) || 0,
});

// Diffs discount rows primarily by their persisted _id (stable across
// saves) so only genuinely added/removed/edited discounts show up in
// history — unchanged rows, and rows whose sibling fields didn't change,
// stay silent. Falls back to label-matching only for rows that have no
// _id yet (pre-migration invoices saved before discounts carried an _id).
const buildDiscountDiff = (oldDiscounts = [], newDiscounts = []) => {
  const oldNorm = (oldDiscounts || []).map((d) => ({ ...normalizeDiscount(d), _id: d._id ? String(d._id) : null }));
  const newNorm = (newDiscounts || []).map((d) => ({ ...normalizeDiscount(d), _id: d._id ? String(d._id) : null }));
  const oldUsed = new Array(oldNorm.length).fill(false);
  const newUsed = new Array(newNorm.length).fill(false);
  const result = [];

  newNorm.forEach((nd, niIdx) => {
    const oiIdx = oldNorm.findIndex((od, idx) => {
      if (oldUsed[idx]) return false;
      if (nd._id && od._id) return od._id === nd._id;
      if (nd._id || od._id) return false; // one has an id, the other doesn't — not the same row
      return od.label.toLowerCase() === nd.label.toLowerCase();
    });
    if (oiIdx !== -1) {
      oldUsed[oiIdx] = true;
      newUsed[niIdx] = true;
      const od = oldNorm[oiIdx];
      // The old row is still the untouched default placeholder (blank
      // label, zero value) the draft auto-created — the admin is filling
      // it in for the first time, not editing real prior content. Read
      // this as a genuine "added" entry, not "edited".
      const oldWasBlankPlaceholder = !od.label && !od.value;
      if (oldWasBlankPlaceholder && (nd.label || nd.value)) {
        result.push({
          groupLabel: nd.label,
          action: "added",
          description: nd.label,
          hsnSac: "",
          qty: 0,
          rate: 0,
          fieldChanges: [
            { field: "Mode", oldValue: null, newValue: nd.mode },
            { field: "Type", oldValue: null, newValue: nd.type },
            { field: "Value", oldValue: null, newValue: nd.value },
          ],
        });
        return;
      }
      const labelChanged = od.label !== nd.label;
      const modeChanged = od.mode !== nd.mode;
      const typeChanged = od.type !== nd.type;
      const valueChanged = od.value !== nd.value;
      const fieldChanges = [];
      if (labelChanged) fieldChanges.push({ field: "Label", oldValue: od.label, newValue: nd.label });
      if (modeChanged) fieldChanges.push({ field: "Mode", oldValue: od.mode, newValue: nd.mode });
      if (typeChanged) fieldChanges.push({ field: "Type", oldValue: od.type, newValue: nd.type });
      if (valueChanged) fieldChanges.push({ field: "Value", oldValue: od.value, newValue: nd.value });
      // Mode/Value are shown as a formatted amount (+/-₹ or %), which needs
      // all three of Mode+Type+Value even when only one of them changed —
      // so always carry the others along (marked unchanged) for the
      // frontend's sibling lookup to use.
      if (modeChanged || valueChanged) {
        if (!fieldChanges.some((fc) => fc.field === "Mode")) {
          fieldChanges.push({ field: "Mode", oldValue: od.mode, newValue: nd.mode, unchanged: true });
        }
        if (!fieldChanges.some((fc) => fc.field === "Type")) {
          fieldChanges.push({ field: "Type", oldValue: od.type, newValue: nd.type, unchanged: true });
        }
        if (!fieldChanges.some((fc) => fc.field === "Value")) {
          fieldChanges.push({ field: "Value", oldValue: od.value, newValue: nd.value, unchanged: true });
        }
      }
      // Label-only change reads clearer as a single "renamed" entry
      // (matches the legacy no-id rename path's presentation) rather than
      // an "edited" entry whose only fieldChange happens to be Label.
      if (labelChanged && !modeChanged && !typeChanged && !valueChanged) {
        result.push({
          groupLabel: nd.label,
          action: "renamed",
          description: nd.label,
          hsnSac: "",
          qty: 0,
          rate: 0,
          fieldChanges: [{ field: "Label", oldValue: od.label, newValue: nd.label }],
        });
      } else if (fieldChanges.length > 0) {
        result.push({ groupLabel: nd.label, action: "edited", description: nd.label, hsnSac: "", qty: 0, rate: 0, fieldChanges });
      }
    }
  });

  // Second pass — a still-unmatched old/new pair with an identical
  // mode+type+value is the same discount with just its label edited
  // (e.g. "Tolcharge" -> "Testcase"), not a genuine remove+add. Surface
  // that as a single "renamed" entry so it reads clearly in the history.
  newNorm.forEach((nd, niIdx) => {
    if (newUsed[niIdx]) return;
    const oiIdx = oldNorm.findIndex(
      (od, idx) => !oldUsed[idx] && od.mode === nd.mode && od.type === nd.type && od.value === nd.value
    );
    if (oiIdx !== -1) {
      oldUsed[oiIdx] = true;
      newUsed[niIdx] = true;
      const od = oldNorm[oiIdx];
      result.push({
        groupLabel: nd.label,
        action: "renamed",
        description: nd.label,
        hsnSac: "",
        qty: 0,
        rate: 0,
        fieldChanges: [{ field: "Label", oldValue: od.label, newValue: nd.label }],
      });
    }
  });

  newNorm.forEach((nd, idx) => {
    if (!newUsed[idx]) {
      const fieldChanges = [
        { field: "Mode", oldValue: null, newValue: nd.mode },
        { field: "Type", oldValue: null, newValue: nd.type },
        { field: "Value", oldValue: null, newValue: nd.value },
      ];
      result.push({ groupLabel: nd.label, action: "added", description: nd.label, hsnSac: "", qty: 0, rate: 0, fieldChanges });
    }
  });

  oldNorm.forEach((od, idx) => {
    if (!oldUsed[idx]) {
      const fieldChanges = [
        { field: "Mode", oldValue: od.mode, newValue: null },
        { field: "Type", oldValue: od.type, newValue: null },
        { field: "Value", oldValue: od.value, newValue: null },
      ];
      result.push({ groupLabel: od.label, action: "removed", description: od.label, hsnSac: "", qty: 0, rate: 0, fieldChanges });
    }
  });

  return result;
};

const normalizeLineItem = (li) => ({
  groupLabel: li.groupLabel || "General",
  description: (li.description || "").trim(),
  hsnSac: li.hsnSac || "",
  qty: Number(li.qty) || 0,
  rate: Number(li.rate) || 0,
});

// Diffs line items per vehicle-type group, matching rows by description so
// unchanged rows never show up — only genuinely added/removed/edited rows do.
const buildLineItemDiff = (oldItems = [], newItems = []) => {
  const oldNorm = (oldItems || []).map(normalizeLineItem);
  const newNorm = (newItems || []).map(normalizeLineItem);

  const groups = [...new Set([...oldNorm.map((i) => i.groupLabel), ...newNorm.map((i) => i.groupLabel)])];
  const result = [];

  groups.forEach((group) => {
    const oldGroupItems = oldNorm.filter((i) => i.groupLabel === group);
    const newGroupItems = newNorm.filter((i) => i.groupLabel === group);
    const oldUsed = new Array(oldGroupItems.length).fill(false);
    const newUsed = new Array(newGroupItems.length).fill(false);

    newGroupItems.forEach((ni, niIdx) => {
      const oiIdx = oldGroupItems.findIndex(
        (oi, idx) => !oldUsed[idx] && oi.description.toLowerCase() === ni.description.toLowerCase()
      );
      if (oiIdx !== -1) {
        oldUsed[oiIdx] = true;
        newUsed[niIdx] = true;
        const oi = oldGroupItems[oiIdx];
        const fieldChanges = [];
        if (oi.hsnSac !== ni.hsnSac) fieldChanges.push({ field: "HSN/SAC", oldValue: oi.hsnSac, newValue: ni.hsnSac });
        if (oi.qty !== ni.qty) fieldChanges.push({ field: "Qty", oldValue: oi.qty, newValue: ni.qty });
        if (oi.rate !== ni.rate) fieldChanges.push({ field: "Rate", oldValue: oi.rate, newValue: ni.rate });
        if (fieldChanges.length > 0) {
          result.push({
            groupLabel: group,
            action: "edited",
            description: ni.description,
            hsnSac: ni.hsnSac,
            qty: ni.qty,
            rate: ni.rate,
            fieldChanges,
          });
        }
      }
    });

    newGroupItems.forEach((ni, idx) => {
      if (!newUsed[idx]) {
        result.push({
          groupLabel: group,
          action: "added",
          description: ni.description,
          hsnSac: ni.hsnSac,
          qty: ni.qty,
          rate: ni.rate,
          fieldChanges: [],
        });
      }
    });

    oldGroupItems.forEach((oi, idx) => {
      if (!oldUsed[idx]) {
        result.push({
          groupLabel: group,
          action: "removed",
          description: oi.description,
          hsnSac: oi.hsnSac,
          qty: oi.qty,
          rate: oi.rate,
          fieldChanges: [],
        });
      }
    });
  });

  return result;
};

exports.saveInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const {
      invoiceDate, dueDate, poNumber, projectName, placeOfSupply,
      billToName, billToAddress, billToGstin, billToPan,
      lineItems, discounts,
      cgstPercent, sgstPercent, igstPercent, rounding, signatureMode,
      isAutoSave,
    } = req.body;

    // A prior save was only the auto-generated draft (fired the instant a
    // Project Code was picked, before the admin touched anything) if
    // invoiceData exists but is still flagged isDraft. Treat that the same
    // as "no real invoice yet" for diffing purposes — the admin's first
    // actual save should read as the invoice's creation, not an edit
    // against blank/default values.
    const previousWasDraft = !!order.invoiceData?.isDraft;
    const wasExisting = !!order.invoiceData && !previousWasDraft;
    const invoiceNumber = order.invoiceData?.invoiceNumber || `ASI-${order.orderId}`;

    const newInvoiceData = {
      isDraft: !!isAutoSave,
      invoiceNumber,
      invoiceDate: invoiceDate || new Date(),
      dueDate: dueDate || null,
      poNumber: poNumber || "",
      projectName: projectName || "",
      placeOfSupply: placeOfSupply || "",
      billToName: billToName || "",
      billToAddress: billToAddress || "",
      billToGstin: billToGstin || "",
      billToPan: billToPan || "",
      lineItems: Array.isArray(lineItems) ? lineItems : [],
      discounts: Array.isArray(discounts)
        ? discounts.map((d) => ({
            // Keep the row's real Mongo _id if the frontend sent one back
            // (an existing, previously-saved row) — omitting it lets
            // Mongoose mint a fresh _id, which is correct for a brand-new
            // row the admin just added in this same edit.
            ...(d._id ? { _id: d._id } : {}),
            // Preserve an intentionally-blank label as "" — the admin must
            // type their own name, so a blank row shouldn't silently save
            // back as the literal text "Discount" and reappear pre-filled
            // next time the invoice is opened.
            label: d.label != null ? d.label : "Discount",
            mode: d.mode === "add" ? "add" : "decrease",
            type: d.type === "amount" ? "amount" : "percent",
            value: Number(d.value) || 0,
          }))
        : [],
      cgstPercent: Number(cgstPercent) || 0,
      sgstPercent: Number(sgstPercent) || 0,
      igstPercent: Number(igstPercent) || 0,
      rounding: Number(rounding) || 0,
      signatureMode: signatureMode === "unsigned" ? "unsigned" : "signed",
      generatedBy: req.user?.username || req.user?.name || "",
      generatedAt: new Date(),
    };

    const editedBy = req.user?.username || req.user?.name || "Admin";

    // The auto-generated draft save itself is never logged. The admin's
    // first real save (replacing that draft) IS logged, but as a "created"
    // entry rather than an "updated" one — but the diff itself is computed
    // the same way in both cases: always against the draft's own actual
    // previous values, never an empty baseline. Since the draft already
    // holds the system's auto-filled line items and a blank discount row,
    // comparing against it (not against []) means only what the admin
    // genuinely changed — a typed Label, a filled Place of Supply, an
    // edited line item — shows up, and untouched auto-filled values don't
    // falsely appear as "Added".
    if (wasExisting || (order.invoiceData && previousWasDraft)) {
      const changes = buildInvoiceDiff(order.invoiceData, newInvoiceData);
      const lineItemChanges = buildLineItemDiff(order.invoiceData?.lineItems, newInvoiceData.lineItems);
      const discountChanges = buildDiscountDiff(order.invoiceData?.discounts, newInvoiceData.discounts);
      if (changes.length > 0 || lineItemChanges.length > 0 || discountChanges.length > 0) {
        order.invoiceHistory.push({
          action: previousWasDraft ? "created" : "updated",
          changes,
          lineItemChanges,
          discountChanges,
          editedBy,
          editedAt: new Date(),
        });
      }
    }

    order.invoiceData = newInvoiceData;

    await order.save();

    return successResponse(res, "Invoice saved successfully", order.invoiceData);
  } catch (error) {
    return errorResponse(res, "Server Error", error.message, 500);
  }
};

exports.getProjectCodeOrders = async (req, res) => {
  try {
    const orders = await Order.find({ "projectCodeArray.0": { $exists: true } })
      .sort({ createdAt: -1 })
      .select("orderId name companyName clientName projectCodeArray")
      .lean();

    const list = orders.map((o) => {
      const latestCode = o.projectCodeArray[o.projectCodeArray.length - 1];
      return {
        _id: o._id,
        orderId: o.orderId,
        name: o.companyName || o.name,
        projectCode: latestCode?.projectCode || "",
        estimationCode: latestCode?.estimationCode || "",
      };
    });

    return successResponse(res, "Project code orders fetched successfully", { data: list });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.getCampaignCalculator = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).lean();
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const bookingItems = order.bookingItems || [];
    if (bookingItems.length === 0) {
      return errorResponse(res, "This order has no vehicles to calculate", null, 400);
    }

    const onRoadExecutionArray = order.onRoadExecutionArray || [];
    const onRoadDriverHistory = order.onRoadDriverHistory || [];
    const onRoadIssues = order.onRoadIssues || [];
    const onRoadUnavailableHistory = order.onRoadUnavailableHistory || [];
    const extraKmDetailsArray = order.extraKmDetailsArray || [];
    const dailyHoursLogArray = order.dailyHoursLogArray || [];
    const campaignCompensationArray = order.campaignCompensationArray || [];

  
    const hoursLogByEntryDay = {};
    for (const l of dailyHoursLogArray) {
      if (!l.entryId) continue;
      hoursLogByEntryDay[`${String(l.entryId)}|${l.day}`] = l;
    }


    const extraDaysByVehicle = {};
    bookingItems.forEach((_, vehicleIndex) => {
      extraDaysByVehicle[vehicleIndex] = campaignCompensationArray
        .filter((c) => c.compensationType === "days" && c.vehicleIndex === vehicleIndex)
        .reduce((s, c) => s + (c.compensationValue || 0), 0);
    });


    const absentExtendDaysByVehicle = {};
    bookingItems.forEach((_, vehicleIndex) => {
      absentExtendDaysByVehicle[vehicleIndex] = dailyHoursLogArray.filter(
        (l) => l.vehicleIndex === vehicleIndex && l.isAbsentDay && l.absentDayResolution === "extend"
      ).length;
    });

    const effectiveToDateByVehicle = {};
    bookingItems.forEach((b, idx) => {
      const baseTo = dateKey(b.toDate);
      const extra = (extraDaysByVehicle[idx] || 0) + (absentExtendDaysByVehicle[idx] || 0);
      effectiveToDateByVehicle[idx] = extra > 0 ? addDaysUTC(baseTo, extra) : baseTo;
    });

    const campaignStart = bookingItems
      .map((b) => dateKey(b.fromDate))
      .sort()[0];
    const campaignEnd = bookingItems
      .map((b, idx) => effectiveToDateByVehicle[idx])
      .sort()
      .slice(-1)[0];

    if (!campaignStart || !campaignEnd) {
      return errorResponse(res, "Campaign dates are missing on this order", null, 400);
    }

    const issuesByEntry = {};
    for (const iss of onRoadIssues) {
      const key = iss.entryId ? String(iss.entryId) : `vi-${iss.vehicleIndex}`;
      (issuesByEntry[key] = issuesByEntry[key] || []).push(iss);
    }
    const unavailByEntry = {};
    for (const h of onRoadUnavailableHistory) {
      const key = h.entryId ? String(h.entryId) : `vi-${h.vehicleIndex}`;
      (unavailByEntry[key] = unavailByEntry[key] || []).push(h);
    }


    const hourCompByEntry = {};
    const hourCompByVehicle = {};
    for (const c of campaignCompensationArray) {
      if (c.compensationType !== "hours") continue;
      if (c.entryId) {
        (hourCompByEntry[String(c.entryId)] = hourCompByEntry[String(c.entryId)] || []).push(c);
      } else {
        (hourCompByVehicle[c.vehicleIndex] = hourCompByVehicle[c.vehicleIndex] || []).push(c);
      }
    }
  
    function compensationHoursFor(entryId, vehicleIndex, dayKeyStr, isActiveToday = true) {
      const inRange = (c) => dateKey(c.fromDate) <= dayKeyStr && dateKey(c.toDate) >= dayKeyStr;
      const entryGrants = (hourCompByEntry[entryId] || []).filter(inRange);
      if (entryGrants.length) {
        return Math.round(entryGrants.reduce((s, c) => s + c.compensationValue, 0) * 100) / 100;
      }
      if (!isActiveToday) return 0;
      const vehicleGrants = (hourCompByVehicle[vehicleIndex] || []).filter(inRange);
      return Math.round(vehicleGrants.reduce((s, c) => s + c.compensationValue, 0) * 100) / 100;
    }

 
    const historyByEntry = {};
    for (const h of onRoadDriverHistory) {
      const key = h.entryId ? String(h.entryId) : `vi-${h.vehicleIndex}`;
      (historyByEntry[key] = historyByEntry[key] || []).push(h);
    }
    Object.values(historyByEntry).forEach((arr) =>
      arr.sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt))
    );


    function clipExtraKmRecordsToEntryLifetime(records) {
      return records.map((rec) => {
        if (!rec.entryId) return rec;
        const hist = historyByEntry[String(rec.entryId)] || [];
        const removedEvent = hist.find((h) => h.action === "removed");
        if (!removedEvent) return rec;
        const releaseDay = dateKey(removedEvent.changedAt);
        if (releaseDay >= dateKey(rec.toDate)) return rec; // already within lifetime
        return { ...rec, toDate: new Date(releaseDay) };
      });
    }

    const bookingItemsMeta = bookingItems.map((b, idx) => {
 
      const absentDaySet = new Set(
        dailyHoursLogArray
          .filter((l) => l.vehicleIndex === idx && l.isAbsentDay)
          .map((l) => l.day)
      );
      const extraDaysGranted = extraDaysByVehicle[idx] || 0;
      const totalScheduledDays = (b.totalDays || 0) + extraDaysGranted;
      const absentDaysCount = absentDaySet.size;
      const completedCampaignDays = Math.max(totalScheduledDays - absentDaysCount, 0);

      return {
        vehicleIndex: idx,
        vehicleType: b.vehicleType,
        vehicleModel: b.vehicleModel,
        quantity: b.quantity || 0,
        fromDate: b.fromDate,
        toDate: b.toDate,
        totalDays: b.totalDays || 0,
        extraDaysGranted,
        absentExtendDaysGranted: absentExtendDaysByVehicle[idx] || 0,
        effectiveToDate: effectiveToDateByVehicle[idx],
        totalScheduledDays,
        absentDaysCount,
        completedCampaignDays,
        perDayRentalCost: b.perDayRentalCost || 0,
        driverCharges: b.driverCharges || 0,
        rtoCost: b.rtoCost || 0,
        brandingCost: b.brandingCost || 0,
        needPromoter: !!b.needPromoter,
        promoterCost: b.promoterCost || 0,
        estimatedRentalCost: (b.rentalCost || 0) + (b.driverCost || 0),
        estimatedExtraKmCost: b.extraKmCost || 0,
        estimatedExtraHourCost: b.extraHourCost || 0,
        estimatedAdditionalCharges: b.additionalNet || 0,
        estimatedTotalAmount: b.totalAmount || 0,
      };
    });

 
    const extraKmBalanceByVehicle = {};
    bookingItems.forEach((item, vehicleIndex) => {
      const purchasedWindowFrom = item.purchasedExtraKmFromDate
        ? dateKey(item.purchasedExtraKmFromDate)
        : dateKey(item.fromDate);
      const purchasedWindowTo = item.purchasedExtraKmToDate
        ? dateKey(item.purchasedExtraKmToDate)
        : dateKey(item.toDate);
      const slotItemFrom = dateKey(item.fromDate);
      const slotItemToExtended = effectiveToDateByVehicle[vehicleIndex] || dateKey(item.toDate);
      const slotRecords = extraKmDetailsArray.filter((e) => e.vehicleIndex === vehicleIndex);
      const effectiveRecords = clipExtraKmRecordsToEntryLifetime(resolveEffectiveExtraKmRecords(slotRecords));

      let usedKm = 0, usedHours = 0, usedKmCost = 0, usedHourCost = 0;

      let balCursor = slotItemFrom;
      while (balCursor <= slotItemToExtended) {
        const dayRecords = effectiveRecords.filter(
          (e) => dateKey(e.fromDate) <= balCursor && dateKey(e.toDate) >= balCursor
        );
        if (dayRecords.length) {
          dayRecords.forEach((winner) => {
            const rangeDays = daysBetweenInclusive(dateKey(winner.fromDate), dateKey(winner.toDate));
            const method = winner.distributionMethod === "split" ? "split" : "daily";
            const dayKm = method === "split" ? (winner.extraKm || 0) / rangeDays : (winner.extraKm || 0);
            const dayHours = method === "split" ? (winner.extraHours || 0) / rangeDays : (winner.extraHours || 0);
            const dayKmCost = dayKm * (winner.perKmChargeRate || 0);
            const dayHourCost = dayHours * (winner.additionalHourChargeRate || 0);

            usedKm += dayKm;
            usedHours += dayHours;
            usedKmCost += dayKmCost;
            usedHourCost += dayHourCost;
          });
        }
        balCursor = addDaysUTC(balCursor, 1);
      }

      const purchasedKm = item.extraKm || 0;
      const purchasedHours = item.extraHours || 0;

      extraKmBalanceByVehicle[vehicleIndex] = {
        vehicleIndex,
        purchasedKm,
        purchasedHours,
        purchasedWindowFrom,
        purchasedWindowTo,
        isPurchasedWindowCustom: !!(item.purchasedExtraKmFromDate || item.purchasedExtraKmToDate),
        usedKm: Math.round(usedKm * 10000) / 10000,
        usedHours: Math.round(usedHours * 10000) / 10000,
       
        overageKm: Math.round(usedKm * 10000) / 10000,
        overageHours: Math.round(usedHours * 10000) / 10000,
        overageKmCost: Math.round(usedKmCost * 100) / 100,
        overageHourCost: Math.round(usedHourCost * 100) / 100,
      };
    });

    function computeEntryDayFigures(resolved, hist, dayKey, vehicleIndex, itemFrom, isCompensationExtensionDay, isActiveToday = true) {
      const createdEvent = hist.find((h) => h.action === "created");
      resolved.isReplacement = !!(createdEvent && dateKey(createdEvent.changedAt) > itemFrom);

      const hoursLog = hoursLogByEntryDay[`${resolved.entryId}|${dayKey}`];
      if (hoursLog) {
        resolved.runningHours = hoursLog.runningHours;
        resolved.absentHours = hoursLog.absentHours;
        resolved.campaignHours = hoursLog.campaignHours;
        resolved.isAbsentDay = !!hoursLog.isAbsentDay;
        resolved.billingMode = hoursLog.billingMode || "full";
        resolved.absentDayResolution = hoursLog.absentDayResolution || null;
      } else {
        resolved.billingMode = "full";
        resolved.absentDayResolution = null;
      }

      const issuesForEntry = issuesByEntry[resolved.entryId] || [];
      const unavailForEntry = unavailByEntry[resolved.entryId] || [];

      let { start: dayWindowStart, end: dayWindowEnd } = resolveWorkWindow(dayKey, hoursLog);
      const now = new Date();
      // Clamp to "now" for TODAY and any future campaign day — not just
      // dayKey === today. Without this, a still-open (resolvedAt: null)
      // issue/unavailable record from an earlier day got treated as
      // spanning the FULL day window on every future day too (since it
      // hasn't happened yet, there's nothing to clip against), massively
      // inflating totalIssueHours/totalUnavailableHours across the campaign.
      if (dayWindowEnd > now) {
        dayWindowEnd = now;
      }
      const entryCreatedClip =
        createdEvent && dateKey(createdEvent.changedAt) === dayKey
          ? new Date(createdEvent.changedAt)
          : null;

      const entryTimeline = buildEntryDayTimeline(
        dayWindowStart,
        dayWindowEnd,
        issuesForEntry,
        unavailForEntry,
        entryCreatedClip
      );

      const issueHours = entryTimeline.issueHours;
      const unavailableHours = entryTimeline.unavailableHours;
      const downtimeHours = Math.round((issueHours + unavailableHours) * 100) / 100;
      resolved.totalCampaignHours = resolved.campaignHours || CAMPAIGN_HOURS_PER_DAY;
      resolved.issueHours = issueHours;
      resolved.unavailableHours = unavailableHours;
      resolved.downtimeHours = downtimeHours;
      resolved.timeline = entryTimeline.timeline;

      if (!hoursLog) {
        resolved.runningHours = entryTimeline.runningHours;
      }

      resolved.compensationHours = compensationHoursFor(resolved.entryId, vehicleIndex, dayKey, isActiveToday);
      resolved.isCompensationExtensionDay = isCompensationExtensionDay;

      const replacedRecord = unavailForEntry
        .filter((h) => h.eventType === "replaced" && h.replacedAt && dateKey(h.replacedAt) === dayKey)
        .sort((a, b) => new Date(b.replacedAt) - new Date(a.replacedAt))[0];
      if (replacedRecord) {
        resolved.wasReplacedToday = true;
        resolved.replacedByRegistrationNumber = replacedRecord.replacementVehicleRegNo || null;
        resolved.replacedAt = replacedRecord.replacedAt;
      }

      return resolved;
    }


    const effectiveExtraKmRecordsByVehicle = {};
    bookingItems.forEach((item, vehicleIndex) => {
      const slotRecords = extraKmDetailsArray.filter((e) => e.vehicleIndex === vehicleIndex);
      effectiveExtraKmRecordsByVehicle[vehicleIndex] = clipExtraKmRecordsToEntryLifetime(resolveEffectiveExtraKmRecords(slotRecords));
    });

    const days = [];
    let cumulativeTotal = 0;
    let cumulativeCompensation = 0;
    let cursor = campaignStart;

    while (cursor <= campaignEnd) {
      const dayKey = cursor;
      const vehicles = [];
      let dayTotal = 0;

      bookingItems.forEach((item, vehicleIndex) => {
        const itemFrom = dateKey(item.fromDate);
        const itemTo = dateKey(item.toDate);
      
        const extraDaysGranted = extraDaysByVehicle[vehicleIndex] || 0;
        const extendDaysGranted = absentExtendDaysByVehicle[vehicleIndex] || 0;
        const itemToExtended = effectiveToDateByVehicle[vehicleIndex] || itemTo;
        if (dayKey < itemFrom || dayKey > itemToExtended) return; // this vehicle-type's window doesn't include today
        const isCompensationExtensionDay = dayKey > itemTo;
        const compExtendedTo = extraDaysGranted > 0 ? addDaysUTC(itemTo, extraDaysGranted) : itemTo;
        const isAbsentExtensionDay = extendDaysGranted > 0 && dayKey > compExtendedTo && dayKey <= itemToExtended;

        const entriesForSlot = onRoadExecutionArray.filter(
          (e) => e.vehicleIndex === vehicleIndex
        );
        // A booking item/vehicle that hasn't actually been moved onto the
        // On Road tab yet has no execution entries at all — keep it out of
        // the Daily Timeline entirely (no cost line, no card) until it is
        // genuinely moved On Road, instead of showing it just because its
        // campaign date window includes today.
        if (entriesForSlot.length === 0) return;

        const activeEntries = [];
        const releasedToday = [];

        for (const entry of entriesForSlot) {
          const histKey = entry._id ? String(entry._id) : `vi-${vehicleIndex}`;
          const hist = historyByEntry[histKey] || [];
          const resolved = resolveEntryStateForDay(entry, hist, dayKey);
          if (!resolved) continue;
          if (resolved.removed) {
            if (resolved.releasedOnThisDay) {
              // Released on this exact day — still shown ("Released Today"),
              // but no longer eligible for slot-level (broadcast) compensation;
              // it has already "completed" as of this day.
              computeEntryDayFigures(resolved, hist, dayKey, vehicleIndex, itemFrom, isCompensationExtensionDay, false);
              releasedToday.push(resolved);
            }
            continue;
          }

          computeEntryDayFigures(resolved, hist, dayKey, vehicleIndex, itemFrom, isCompensationExtensionDay, true);

          activeEntries.push(resolved);
        }

        const activeCount = activeEntries.length;
        const baseDailyRate = (item.perDayRentalCost || 0) + (item.driverCharges || 0);
        const dailyVehicleAmount = activeCount * baseDailyRate;

        let compensationToday = 0;
        for (const entry of activeEntries) {
          if (!entry.absentHours || !entry.campaignHours) continue;
          const deduction =
            Math.round(((baseDailyRate * entry.absentHours) / entry.campaignHours) * 100) / 100;
          entry.compensationDeduction = deduction;
          compensationToday += deduction;
        }

   
        const extraKmPoolFeeToday = dayKey === itemFrom ? item.extraKmCost || 0 : 0;
        const extraHourPoolFeeToday = dayKey === itemFrom ? item.extraHourCost || 0 : 0;

        let extraKmCost = extraKmPoolFeeToday;
        let extraHourCost = extraHourPoolFeeToday;
        const extraDetailsToday = [];

        const slotRecordsForDay = (effectiveExtraKmRecordsByVehicle[vehicleIndex] || []).filter(
          (e) => dateKey(e.fromDate) <= dayKey && dateKey(e.toDate) >= dayKey
        );
        if (slotRecordsForDay.length) {
          slotRecordsForDay.forEach((winner) => {
            const rangeDays = daysBetweenInclusive(dateKey(winner.fromDate), dateKey(winner.toDate));
            const method = winner.distributionMethod === "split" ? "split" : "daily";
            const resolvedKm = method === "split" ? (winner.extraKm || 0) / rangeDays : (winner.extraKm || 0);
            const resolvedHours = method === "split" ? (winner.extraHours || 0) / rangeDays : (winner.extraHours || 0);

            const resolvedKmCostRaw = resolvedKm * (winner.perKmChargeRate || 0);
            const resolvedHourCostRaw = resolvedHours * (winner.additionalHourChargeRate || 0);

            const billableKmCost = Math.round(resolvedKmCostRaw * 100) / 100;
            const billableHourCost = Math.round(resolvedHourCostRaw * 100) / 100;

            extraKmCost += billableKmCost;
            extraHourCost += billableHourCost;

            extraDetailsToday.push({
              registrationNumber: winner.vehicleRegistrationNumber,
              entryId: winner.entryId ? String(winner.entryId) : null,
              distributionMethod: method,
              recordExtraKm: winner.extraKm || 0,
              recordExtraHours: winner.extraHours || 0,
              resolvedExtraKmToday: Math.round(resolvedKm * 10000) / 10000,
              resolvedExtraHoursToday: Math.round(resolvedHours * 10000) / 10000,
              extraKm: winner.extraKm,
              extraHours: winner.extraHours,
              extraKmCost: billableKmCost,
              extraHourCost: billableHourCost,

              withinPurchasedBalance: false,
              loggedFor: `${dateKey(winner.fromDate)} to ${dateKey(winner.toDate)}`,
              addedBy: winner.addedBy,
              addedAt: winner.addedAt,
            });
          });
        }

        // Additional Charges (from order-creation additionalFields, e.g. "+"/"-"
        // adjustments) are a one-time flat amount for the vehicle-type slot —
        // applied once on the campaign's first day, same pattern as RTO/extra-km pool fee.
        const additionalChargesToday = dayKey === itemFrom ? (item.additionalNet || 0) : 0;

        // RTO is a one-time flat charge for the vehicle-type slot, applied
        // once on the campaign's first day (same pattern as the extra-KM
        // pool fee / additional charges below).
        let rtoAppliedToday = dayKey === itemFrom ? (item.rtoCost || 0) : 0;
        // Branding Cost — same one-time-on-first-day pattern as RTO.
        let brandingAppliedToday = dayKey === itemFrom ? (item.brandingCost || 0) : 0;

        // Promoter cost is only spread across the promoter's own selected
        // days (item.promoterFromDate → item.promoterToDate), not the full
        // campaign span — falls back to totalDays when no promoter date
        // range was saved (older orders, created before this field existed).
        let promoterAmountToday = 0;
        if (item.needPromoter) {
          if (item.promoterFromDate && item.promoterToDate) {
            const pFrom = dateKey(item.promoterFromDate);
            const pTo = dateKey(item.promoterToDate);
            const pDays = item.promoterDays || (daysBetweenInclusive(pFrom, pTo));
            if (dayKey >= pFrom && dayKey <= pTo && pDays) {
              promoterAmountToday = Math.round(((item.promoterCost || 0) / pDays) * 100) / 100;
            }
          } else if (item.totalDays) {
            promoterAmountToday = Math.round(((item.promoterCost || 0) / item.totalDays) * 100) / 100;
          }
        }


        if (activeEntries.length) {
          const billingFactors = activeEntries.map((entry) => {
            if (entry.isAbsentDay || entry.billingMode === "absent") return 0;
            if (entry.billingMode === "partial") {
              const expectedHours = entry.totalCampaignHours || CAMPAIGN_HOURS_PER_DAY;
              return expectedHours > 0 ? Math.min((entry.runningHours || 0) / expectedHours, 1) : 0;
            }
            return 1;
          });
          const avgBillingFactor =
            billingFactors.reduce((s, f) => s + f, 0) / billingFactors.length;
          rtoAppliedToday = Math.round(rtoAppliedToday * avgBillingFactor * 100) / 100;
          brandingAppliedToday = Math.round(brandingAppliedToday * avgBillingFactor * 100) / 100;
          promoterAmountToday = Math.round(promoterAmountToday * avgBillingFactor * 100) / 100;
        }

        const itemDayTotal =
          dailyVehicleAmount +
          extraKmCost +
          extraHourCost +
          rtoAppliedToday +
          brandingAppliedToday +
          promoterAmountToday +
          additionalChargesToday -
          compensationToday;

        dayTotal += itemDayTotal;

     
        const issueHoursToday = Math.round(
          [...activeEntries, ...releasedToday].reduce((s, e) => s + (e.issueHours || 0), 0) * 100
        ) / 100;
        const unavailableHoursToday = Math.round(
          [...activeEntries, ...releasedToday].reduce((s, e) => s + (e.unavailableHours || 0), 0) * 100
        ) / 100;
        const downtimeHoursToday = Math.round((issueHoursToday + unavailableHoursToday) * 100) / 100;
        const compensationHoursGrantedToday = Math.round(activeEntries.reduce((s, e) => s + (e.compensationHours || 0), 0) * 100) / 100;


        const combinedRunningHoursToday =
          Math.round(
            ([...activeEntries, ...releasedToday].reduce((s, e) => s + (e.runningHours || 0), 0)) * 100
          ) / 100;

        const relevantEntryIds = [...activeEntries, ...releasedToday]
          .map((e) => (e.entryId ? String(e.entryId) : null))
          .filter(Boolean);
        const matchingCompGrants = campaignCompensationArray.filter((c) => {
          if (c.compensationType !== "hours") return false;
          if (c.vehicleIndex !== vehicleIndex) return false;
          if (dateKey(c.fromDate) > dayKey || dateKey(c.toDate) < dayKey) return false;
          if (c.entryId) return relevantEntryIds.includes(String(c.entryId));
          return true; // campaign-level grant (no entryId) applies to every entry of this slot
        });

        const matchingPendingFoc = (order.campaignClosureArray || []).filter((c) => {
          if (c.type !== "foc" || c.status !== "pending") return false;
          if (c.focPurpose !== "compensation-hours" && c.focPurpose !== "compensation-days") return false;
          if (c.compensationVehicleIndex !== vehicleIndex) return false;
          if (dateKey(c.fromDate) > dayKey || dateKey(c.toDate) < dayKey) return false;
          return true;
        });

        let compensationStatus = {
          hasLoss: downtimeHoursToday > 0,
          lossHours: downtimeHoursToday,
          state: "none",
          applied: false,
          scope: "none",
          dateFrom: null,
          dateTo: null,
          valuePerDay: 0,
        };
        if (matchingCompGrants.length) {
          const grant = matchingCompGrants
            .slice()
            .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))[0];
          const grantFrom = dateKey(grant.fromDate);
          const grantTo = dateKey(grant.toDate);
          compensationStatus = {
            hasLoss: downtimeHoursToday > 0,
            lossHours: downtimeHoursToday,
            state: "approved",
            applied: true,
            scope: grantFrom === grantTo ? "this-date" : "split",
            dateFrom: grantFrom,
            dateTo: grantTo,
            valuePerDay: grant.compensationValue || 0,
          };
        } else if (matchingPendingFoc.length) {
          const pending = matchingPendingFoc
            .slice()
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
          const pendingFrom = dateKey(pending.fromDate);
          const pendingTo = dateKey(pending.toDate);
          compensationStatus = {
            hasLoss: downtimeHoursToday > 0,
            lossHours: downtimeHoursToday,
            state: "pending",
            applied: false,
            scope: pendingFrom === pendingTo ? "this-date" : "split",
            dateFrom: pendingFrom,
            dateTo: pendingTo,
            valuePerDay: pending.compensationHoursValue || pending.compensationDaysValue || 0,
          };
        }

        vehicles.push({
          vehicleIndex,
          vehicleType: item.vehicleType,
          vehicleModel: item.vehicleModel,
          bookedQuantity: item.quantity || 0,
          activeCount,
          entries: activeEntries,
          releasedToday,
          baseDailyRate,
          dailyVehicleAmount,
          extraKmCost,
          extraHourCost,
          extraKmPoolFeeToday,
          extraHourPoolFeeToday,
          extraDetailsToday,
          rtoAppliedToday,
          brandingAppliedToday,
          promoterAmountToday,
          additionalChargesToday,
          compensationToday: Math.round(compensationToday * 100) / 100,
          issueHoursToday,
          unavailableHoursToday,
          downtimeHoursToday,
          compensationHoursGrantedToday,
          combinedRunningHoursToday,
          compensationStatus,
          isCompensationExtensionDay,
          itemDayTotal,
        });
      });

      cumulativeTotal += dayTotal;
      cumulativeCompensation += vehicles.reduce((s, v) => s + (v.compensationToday || 0), 0);

      days.push({
        date: dayKey,
        vehicles,
        dayTotal: Math.round(dayTotal * 100) / 100,
        cumulativeTotal: Math.round(cumulativeTotal * 100) / 100,
      });

      cursor = addDaysUTC(cursor, 1);
    }

    const grandTotal = days.length ? days[days.length - 1].cumulativeTotal : 0;
    const orderTaxableAmount =
      order.taxableAmount ?? bookingItems.reduce((s, b) => s + (b.totalAmount || 0), 0);

    // ── Final Billing summary: actual usage rolled up across every day ──
    const allVehicles = days.flatMap((d) => d.vehicles);
    const actualRental = allVehicles.reduce((s, v) => s + (v.dailyVehicleAmount || 0), 0);
    const actualExtraKm = allVehicles.reduce((s, v) => s + (v.extraKmCost || 0), 0);
    const actualExtraHours = allVehicles.reduce((s, v) => s + (v.extraHourCost || 0), 0);
    const actualRto = allVehicles.reduce((s, v) => s + (v.rtoAppliedToday || 0), 0);
    const actualBranding = allVehicles.reduce((s, v) => s + (v.brandingAppliedToday || 0), 0);
    const actualPromoter = allVehicles.reduce((s, v) => s + (v.promoterAmountToday || 0), 0);
    const actualAdditionalCharges = allVehicles.reduce((s, v) => s + (v.additionalChargesToday || 0), 0);
    const totalCompensation = Math.round(cumulativeCompensation * 100) / 100;
    const campaignExtensionAmount = 0; // extension approval workflow not yet implemented
    const totalIssueHours = Math.round(allVehicles.reduce((s, v) => s + (v.issueHoursToday || 0), 0) * 100) / 100;
    const totalUnavailableHours = Math.round(allVehicles.reduce((s, v) => s + (v.unavailableHoursToday || 0), 0) * 100) / 100;
    const totalDowntimeHours = Math.round((totalIssueHours + totalUnavailableHours) * 100) / 100;
    const totalCompensationHoursGranted = Math.round(allVehicles.reduce((s, v) => s + (v.compensationHoursGrantedToday || 0), 0) * 100) / 100;
    const totalCompensationDaysGranted = Object.values(extraDaysByVehicle).reduce((s, d) => s + (d || 0), 0);
    const totalCompletedCampaignDays = bookingItemsMeta.reduce((s, b) => s + (b.completedCampaignDays || 0), 0);
    const totalAbsentDays = bookingItemsMeta.reduce((s, b) => s + (b.absentDaysCount || 0), 0);

    const finalAmountBeforeGst = Math.round(grandTotal * 100) / 100;
    const gstPercent = GST_PERCENT;
    const gstAmount = Math.round(((finalAmountBeforeGst * gstPercent) / 100) * 100) / 100;
    const finalInvoiceAmount = Math.round((finalAmountBeforeGst + gstAmount) * 100) / 100;

    const estimatedRental = bookingItemsMeta.reduce((s, b) => s + (b.estimatedRentalCost || 0), 0);
    const estimatedRto = bookingItemsMeta.reduce((s, b) => s + (b.rtoCost || 0), 0);
    const estimatedBranding = bookingItemsMeta.reduce((s, b) => s + (b.brandingCost || 0), 0);
    const estimatedPromoter = bookingItemsMeta.reduce((s, b) => s + (b.promoterCost || 0), 0);
    const estimatedExtraKm = bookingItemsMeta.reduce((s, b) => s + (b.estimatedExtraKmCost || 0), 0);
    const estimatedExtraHours = bookingItemsMeta.reduce((s, b) => s + (b.estimatedExtraHourCost || 0), 0);
    const estimatedAdditionalCharges = bookingItemsMeta.reduce((s, b) => s + (b.estimatedAdditionalCharges || 0), 0);

    const finalBilling = {
      estimatedAmount: orderTaxableAmount,
      estimatedRental: Math.round(estimatedRental * 100) / 100,
      estimatedRto: Math.round(estimatedRto * 100) / 100,
      estimatedBranding: Math.round(estimatedBranding * 100) / 100,
      estimatedPromoter: Math.round(estimatedPromoter * 100) / 100,
      estimatedExtraKm: Math.round(estimatedExtraKm * 100) / 100,
      estimatedExtraHours: Math.round(estimatedExtraHours * 100) / 100,
      estimatedAdditionalCharges: Math.round(estimatedAdditionalCharges * 100) / 100,
      actualRental: Math.round(actualRental * 100) / 100,
      actualExtraKm: Math.round(actualExtraKm * 100) / 100,
      actualExtraHours: Math.round(actualExtraHours * 100) / 100,
      actualRto: Math.round(actualRto * 100) / 100,
      actualBranding: Math.round(actualBranding * 100) / 100,
      actualPromoter: Math.round(actualPromoter * 100) / 100,
      actualAdditionalCharges: Math.round(actualAdditionalCharges * 100) / 100,
      totalCompensation,
      campaignExtensionAmount,
      totalIssueHours,
      totalUnavailableHours,
      totalDowntimeHours,
      totalCompensationHoursGranted,
      totalCompensationDaysGranted,
      totalCompletedCampaignDays,
      totalAbsentDays,
      finalAmountBeforeGst,
      gstPercent,
      gstAmount,
      finalInvoiceAmount,
    };

    return successResponse(res, "Campaign calculator generated", {
      orderId: order._id,
      orderDisplayId: order.orderId,
      campaignStart,
      campaignEnd,
      bookingItemsMeta,
      extraKmBalances: Object.values(extraKmBalanceByVehicle),
      campaignCompensationArray,
      days,
      grandTotal,
      orderTaxableAmount,
      reconciliationDiff: Math.round((grandTotal - orderTaxableAmount) * 100) / 100,
      finalBilling,
    });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.getDayByDayHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).lean();
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const bookingItems = order.bookingItems || [];
    if (bookingItems.length === 0) {
      return errorResponse(res, "This order has no vehicles", null, 400);
    }

    const onRoadExecutionArray = order.onRoadExecutionArray || [];
    const onRoadDriverHistory = order.onRoadDriverHistory || [];
    const onRoadIssues = order.onRoadIssues || [];
    const onRoadUnavailableHistory = order.onRoadUnavailableHistory || [];
    const extraKmDetailsArray = order.extraKmDetailsArray || [];
    const dailyHoursLogArray = order.dailyHoursLogArray || [];

    const campaignStart = bookingItems.map((b) => dateKey(b.fromDate)).sort()[0];
    const campaignEnd = bookingItems.map((b) => dateKey(b.toDate)).sort().slice(-1)[0];

    // ── vehicleTypes[] nav tree (level 1 + 2) ──
    const vehicleTypes = bookingItems.map((b, vehicleIndex) => {
      const regSet = new Set();
      onRoadExecutionArray
        .filter((e) => e.vehicleIndex === vehicleIndex)
        .forEach((e) => e.vehicleRegistrationNumber && regSet.add(e.vehicleRegistrationNumber));
      onRoadDriverHistory
        .filter((h) => h.vehicleIndex === vehicleIndex)
        .forEach((h) => h.vehicleRegistrationNumber && regSet.add(h.vehicleRegistrationNumber));
      onRoadUnavailableHistory
        .filter((h) => h.vehicleIndex === vehicleIndex)
        .forEach((h) => {
          if (h.vehicleRegNo) regSet.add(h.vehicleRegNo);
          if (h.replacementVehicleRegNo) regSet.add(h.replacementVehicleRegNo);
        });
      extraKmDetailsArray
        .filter((e) => e.vehicleIndex === vehicleIndex)
        .forEach((e) => e.vehicleRegistrationNumber && regSet.add(e.vehicleRegistrationNumber));
      onRoadIssues
        .filter((iss) => iss.vehicleIndex === vehicleIndex)
        .forEach((iss) => iss.vehicleRegNo && regSet.add(iss.vehicleRegNo));

 
      const entriesForType = onRoadExecutionArray.filter((e) => e.vehicleIndex === vehicleIndex);
      const registrationNumbers = Array.from(regSet).map((reg) => {
        const matches = entriesForType
          .filter((e) => e.vehicleRegistrationNumber === reg)
          .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        const latest = matches[0];

        let status = "Historical";
        if (latest) {
          if (latest.entryStatus === "removed") status = "Released";
          else if (latest.entryStatus === "replaced") status = "Replaced";
          else if (latest.unavailableStatus) status = "Unavailable";
          else if (latest.onRoadStatus === 1) status = "On Road";
          else status = "Assigned";
        }
        return { registrationNumber: reg, status };
      });

      return {
        vehicleIndex,
        vehicleType: b.vehicleType,
        vehicleModel: b.vehicleModel,
        fromDate: b.fromDate,
        toDate: b.toDate,
        registrationNumbers,
      };
    })
      // Only a booking item/vehicle that has actually been moved onto the
      // On Road tab (i.e. has at least one on-road-side record — execution
      // entry, driver history, unavailable event, extra KM, or issue) shows
      // up here. A booking item still sitting in Project Execution has none
      // of these yet, so it stays out of Timeline / Timeline Hours until it
      // is genuinely moved On Road.
      .filter((vt) => vt.registrationNumbers.length > 0);

    // ── 2.1 / 2.4 Driver Change + Driver Status History ──
    const driverChangeHistory = [];
    const driverStatusHistory = [];
    const ACTION_LABEL = { created: "Vehicle Added", updated: "Vehicle Updated", removed: "Vehicle Removed" };
    const STATUS_LABEL = { created: "assigned", updated: "changed", removed: "removed" };

    for (const h of onRoadDriverHistory) {
      const day = dateKey(h.changedAt);
      const base = {
        day,
        vehicleIndex: h.vehicleIndex,
        entryId: h.entryId ? String(h.entryId) : null,
        vehicleRegistrationNumber: h.vehicleRegistrationNumber,
        driverName: h.driverName,
        driverPhone: h.driverPhone,
        changedBy: h.changedBy,
        changedAt: h.changedAt,
        // The Update Driver endpoint stores the edit reason as its own
        // top-level `reason` field, not inside `changedFields` — other
        // event types (e.g. vehicle replacement) instead nest it as
        // `changedFields.reason`. Check both so the Timeline's "Reason"
        // line actually shows it for either shape.
        comments: h.reason || h.changedFields?.reason || "",
      };
      driverChangeHistory.push({
        ...base,
        eventType: ACTION_LABEL[h.action] || h.action,
        changedFields: h.changedFields || {},
      });
      driverStatusHistory.push({
        ...base,
        statusEvent: STATUS_LABEL[h.action] || h.action,
      });
    }

  
    for (const h of onRoadUnavailableHistory.filter((h) => h.eventType === "replaced")) {
      const day = dateKey(h.replacedAt || h.reportedAt);
      driverChangeHistory.push({
        day,
        vehicleIndex: h.vehicleIndex,
        entryId: h.entryId ? String(h.entryId) : null,
        vehicleRegistrationNumber: h.vehicleRegNo,
        eventType: "Vehicle Replaced (Outgoing)",
        oldDriverName: h.driverName,
        oldDriverPhone: h.driverPhone,
        newVehicleRegistrationNumber: h.replacementVehicleRegNo,
        newDriverName: h.replacementDriverName,
        newDriverPhone: h.replacementDriverPhone,
        changedBy: h.reportedBy,
        changedAt: h.replacedAt || h.reportedAt,
        comments: h.reason,
      });
      driverChangeHistory.push({
        day,
        vehicleIndex: h.vehicleIndex,
        entryId: h.replacementEntryId ? String(h.replacementEntryId) : null,
        vehicleRegistrationNumber: h.replacementVehicleRegNo,
        eventType: "Vehicle Replaced (Incoming)",
        oldVehicleRegistrationNumber: h.vehicleRegNo,
        oldDriverName: h.driverName,
        oldDriverPhone: h.driverPhone,
        newDriverName: h.replacementDriverName,
        newDriverPhone: h.replacementDriverPhone,
        changedBy: h.reportedBy,
        changedAt: h.replacedAt || h.reportedAt,
        comments: h.reason,
      });
    }

    // ── 2.2 Issue / Escalation History ──
    // One entry per issue — its full lifecycle (report + resolution, when
    // resolved) grouped into a single card, always bucketed under the day
    // it was REPORTED (not split into separate "Reported"/"Resolved" day
    // entries — that made it impossible to tell which resolution belonged
    // to which issue when several were open on the same day).
    const issueHistory = [];
    for (const iss of onRoadIssues) {
      issueHistory.push({
        day: dateKey(iss.reportedAt),
        vehicleIndex: iss.vehicleIndex,
        entryId: iss.entryId ? String(iss.entryId) : null,
        vehicleRegistrationNumber: iss.vehicleRegNo,
        driverName: iss.driverName,
        issueDescription: iss.issueDescription,
        issuePhoto: iss.issuePhoto,
        status: iss.status,
        resolveDescription: iss.status === "resolved" ? iss.resolveDescription : "",
        resolvePhoto: iss.status === "resolved" ? iss.resolvePhoto : "",
        createdBy: iss.reportedBy,
        createdAt: iss.reportedAt,
        resolvedBy: iss.status === "resolved" ? iss.resolvedBy : "",
        resolvedAt: iss.status === "resolved" ? iss.resolvedAt : "",
      });
    }

    // ── 2.3 Extra KM History ──
    const extraKmHistory = extraKmDetailsArray.map((e) => ({
      day: dateKey(e.addedAt),
      vehicleIndex: e.vehicleIndex,
      entryId: e.entryId ? String(e.entryId) : null,
      vehicleRegistrationNumber: e.vehicleRegistrationNumber,
      driverName: e.driverName,
      extraKm: e.extraKm,
      extraHours: e.extraHours,
      extraKmCost: e.extraKmCost,
      extraHourCost: e.extraHourCost,
      totalCost: e.totalCost,
      distributionMethod: e.distributionMethod || "daily",
      loggedFor: `${dateKey(e.fromDate)} to ${dateKey(e.toDate)}`,
      comments: "",
      updatedBy: e.addedBy,
      updatedAt: e.addedAt,
    }));

    // ── 2.4 Daily Hours History ──
    const dailyHoursHistory = dailyHoursLogArray.map((l) => ({
      day: l.day,
      vehicleIndex: l.vehicleIndex,
      entryId: l.entryId ? String(l.entryId) : null,
      vehicleRegistrationNumber: l.vehicleRegistrationNumber,
      driverName: l.driverName,
      startTime: l.startTime,
      endTime: l.endTime,
      campaignHours: l.campaignHours,
      runningHours: l.runningHours,
      absentHours: l.absentHours,
      isAbsentDay: !!l.isAbsentDay,
      absentDayResolution: l.absentDayResolution || null,
      billingMode: l.billingMode || "full",
      remarks: l.remarks,
      loggedBy: l.loggedBy,
      loggedAt: l.loggedAt,
    }));

    // ── 2.6 Vehicle Unavailable History ──
    const unavailableHistory = onRoadUnavailableHistory.map((h) => ({
      day: dateKey(h.reportedAt),
      vehicleIndex: h.vehicleIndex,
      entryId: h.entryId ? String(h.entryId) : null,
      vehicleRegistrationNumber: h.vehicleRegNo,
      driverName: h.driverName,
      driverPhone: h.driverPhone,
      reason: h.reason,
      photo: h.photo,
      eventType: h.eventType,
      status: h.status,
      replacementVehicleRegistrationNumber: h.replacementVehicleRegNo,
      replacementDriverName: h.replacementDriverName,
      replacementDriverPhone: h.replacementDriverPhone,
      replacedAt: h.replacedAt,
      reportedBy: h.reportedBy,
      reportedAt: h.reportedAt,
      resolvedBy: h.resolvedBy,
      resolvedAt: h.resolvedAt,
      resolveDescription: h.resolveDescription,
      resolvePhoto: h.resolvePhoto,
    }));

    // ── 2.5 Campaign Vehicle Status Timeline (day-by-day, per entry) ──
    const historyByEntry = {};
    for (const h of onRoadDriverHistory) {
      const key = h.entryId ? String(h.entryId) : `vi-${h.vehicleIndex}`;
      (historyByEntry[key] = historyByEntry[key] || []).push(h);
    }
    Object.values(historyByEntry).forEach((arr) =>
      arr.sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt))
    );
    const unavailableByEntryDay = {}; // `${entryId}|${day}` -> unavailableHistory record
    for (const h of onRoadUnavailableHistory) {
      const key = `${h.entryId ? String(h.entryId) : ""}|${dateKey(h.reportedAt)}`;
      unavailableByEntryDay[key] = h;
    }

    const vehicleStatusTimeline = [];
    bookingItems.forEach((item, vehicleIndex) => {
      const itemFrom = dateKey(item.fromDate);
      const itemTo = dateKey(item.toDate);
      const entries = onRoadExecutionArray.filter((e) => e.vehicleIndex === vehicleIndex);

      for (const entry of entries) {
        const histKey = entry._id ? String(entry._id) : `vi-${vehicleIndex}`;
        const hist = historyByEntry[histKey] || [];
        let cursor = itemFrom;
        while (cursor <= itemTo) {
          const resolved = resolveEntryStateForDay(entry, hist, cursor);
          let statusLabel = "Not Active";
          let performedBy = "";
          let comments = "";

          if (resolved && !resolved.removed) {
            if (resolved.createdOnThisDay) {
              statusLabel = "Vehicle Assigned";
            } else {
              const todaysEvent = hist.find(
                (h) => h.action === "updated" && dateKey(h.changedAt) === cursor
              );
              if (todaysEvent) {
                const cf = todaysEvent.changedFields || {};
                statusLabel = cf.vehicleRegistrationNumber?.new !== undefined
                  ? "Vehicle Updated"
                  : "Driver Updated";
                performedBy = todaysEvent.changedBy;
                comments = cf.reason || "";
              } else {
                const unavailToday = unavailableByEntryDay[`${String(entry._id)}|${cursor}`];
                if (unavailToday) {
                  statusLabel = unavailToday.eventType === "replaced"
                    ? "Old Vehicle Released & New Vehicle Assigned"
                    : "Marked Unavailable";
                  performedBy = unavailToday.reportedBy;
                  comments = unavailToday.reason;
                } else {
                  statusLabel = "No Changes";
                }
              }
            }
          } else if (resolved && resolved.removed) {
            if (resolved.releasedOnThisDay) {
              const linkedReplacement = onRoadUnavailableHistory.find(
                (h) => h.eventType === "replaced" && String(h.entryId) === String(entry._id) && dateKey(h.replacedAt) === cursor
              );
              statusLabel = linkedReplacement ? "Old Vehicle Released & New Vehicle Assigned" : "Vehicle Released";
              performedBy = linkedReplacement?.reportedBy || "";
              comments = linkedReplacement?.reason || "";
            } else {
              statusLabel = "Not Active";
            }
          }

          vehicleStatusTimeline.push({
            day: cursor,
            vehicleIndex,
            entryId: String(entry._id),
            vehicleRegistrationNumber: entry.vehicleRegistrationNumber,
            statusLabel,
            performedBy,
            comments,
          });

          cursor = addDaysUTC(cursor, 1);
        }
      }
    });

    return successResponse(res, "Day-by-day history generated", {
      orderId: order._id,
      orderDisplayId: order.orderId,
      campaignStart,
      campaignEnd,
      vehicleTypes,
      driverChangeHistory,
      issueHistory,
      extraKmHistory,
      dailyHoursHistory,
      driverStatusHistory,
      vehicleStatusTimeline,
      unavailableHistory,
    });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};

exports.reassignOpsHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { newHandler, isTemporary, leaveStartDate, leaveEndDate, reason } = req.body;

    if (!newHandler?.trim())
      return errorResponse(res, "New handler name is required", null, 400);
    if (!reason?.trim())
      return errorResponse(res, "Reason is required", null, 400);
    if (isTemporary && (!leaveStartDate || !leaveEndDate))
      return errorResponse(
        res,
        "Leave start and end dates are required for a temporary handover",
        null,
        400
      );

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const previousHandler = order.handlerName || "";
    if (!order.originalHandlerName) {
      order.originalHandlerName = previousHandler;
    }

    order.opsHandlerAssignmentHistory.push({
      previousHandler,
      newHandler: newHandler.trim(),
      isTemporary: !!isTemporary,
      leaveStartDate: isTemporary ? leaveStartDate : null,
      leaveEndDate: isTemporary ? leaveEndDate : null,
      reason: reason.trim(),
      status: "active",
      assignedBy: req.user?.username || "Admin",
      assignedAt: new Date(),
    });

    order.handlerName = newHandler.trim();
    await order.save();

    return successResponse(res, "Handler reassigned successfully", {
      handlerName: order.handlerName,
      opsHandlerAssignmentHistory: order.opsHandlerAssignmentHistory,
    });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.resolveOpsHandlerHandover = async (req, res) => {
  try {
    const { id, assignmentId } = req.params;
    const { makePermanent } = req.body;

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const assignment = order.opsHandlerAssignmentHistory.id(assignmentId);
    if (!assignment)
      return errorResponse(res, "Handover record not found", null, 404);
    if (assignment.status !== "active")
      return errorResponse(res, "This handover has already been resolved", null, 400);

    if (makePermanent) {
      assignment.status = "madePermanent";
    } else {
      assignment.status = "reverted";
      assignment.revertedAt = new Date();
      order.handlerName = assignment.previousHandler;
    }

    await order.save();

    return successResponse(res, "Handover resolved", {
      handlerName: order.handlerName,
      opsHandlerAssignmentHistory: order.opsHandlerAssignmentHistory,
    });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};

