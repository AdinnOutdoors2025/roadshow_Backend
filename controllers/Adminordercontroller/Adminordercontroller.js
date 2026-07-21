
/* eslint-disable */
const path = require("path");
const Order = require("../../Models/AdminorderModel/Adminorder");
const Package = require("../../Models/PackageManagementModel/packagemanagement");
require("dotenv").config();
const CampaignType = require("../../Models/CampaignTypeModel/campaigntype");
const { successResponse, errorResponse } = require("../../Utils/response");
const { sendFocMail, getActiveAdminEmails, getEmailByUsername } = require('../../Utils/focMailer');
const VehicleMaster = require("../../Models/vehicleDetails");
const { checkVehicleAvailability } = require("../../Utils/vehicleAvailability");


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

// ── Pricing Calculation ────────────────────────────────────────────────────
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
   const promoterChargePerDay = parseFloat(process.env.DEFAULT_PROMOTER_CHARGE || "1000");

  //  promoter charges default data 
  const promoterCost = needPromoter
    // ? (pkg.promoterChargePerDay || 0) * totalDays * promoterQuantity
       ? (promoterChargePerDay || 0) * totalDays * promoterQuantity
    : 0;
  const rtoCost = pkg.rtoCharges * quantity;
  const extraKmCost = extraKm > 0 ? (pkg.perKmCharge || 0) * extraKm : 0;
  const extraHourCost = extraHours > 0 ? pkg.additionalHourCharges * extraHours : 0;

  const additionalCharges = v.additionalCharges || [];
  const additionalAdds = additionalCharges.reduce((acc, c) => {
    const amt = Number(c.amount) || 0;
    return c.mode === "+" ? acc + amt : acc;
  }, 0);

  const subtotal =
    rentalCost + promoterCost + rtoCost + extraKmCost + extraHourCost + additionalAdds;

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
    rtoCharges: pkg.rtoCharges,
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
function getFileUrl(file) {
  if (!file) return null;
  if (file.location) return file.location;
  return `/uploads/${path.basename(file.path)}`;
}


exports.createAdminOrder = async (req, res) => {

  try {
    const {
      customerName, customerPhone, customerAddress, customerEmail,
      customerCategory, companyName, clientName, designation, gstNumber,
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
      if (!designation?.trim()) return errorResponse(res, "Designation is required", null, 400);
      if (!customerPhone) return errorResponse(res, "Phone number is required", null, 400);
      if (!/^[6-9]\d{9}$/.test(customerPhone.toString().trim()))
        return errorResponse(res, "Enter a valid 10-digit mobile number", null, 400);
      if (!customerEmail?.trim()) return errorResponse(res, "Email is required", null, 400);
      if (!gstNumber?.trim()) return errorResponse(res, "GST number is required", null, 400);
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

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const missing = [];
      if (!v.packageId) missing.push("packageId");
      if (!v.campaignType) missing.push("campaignType");
      if (!v.campaignName?.trim()) missing.push("campaignName");
      if (v.campaignType === "Other" && !v.otherCampaignType) missing.push("otherCampaignType");
      if (!v.fromDate) missing.push("fromDate");
      if (!v.toDate) missing.push("toDate");
      if (!v.state) missing.push("state");
      if (!v.city) missing.push("city");
      if (!v.fromLocation) missing.push("fromLocation");
      if (!v.toLocation) missing.push("toLocation");
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
        fromLocation: v.fromLocation,
        toLocation: v.toLocation,
        quantity: Number(v.quantity),
        extraKm: Number(v.extraKm) || 0,
        extraDays: Number(v.extraDays) || 0,
        extraHours: Number(v.extraHours) || 0,
        needPromoter: !!v.needPromoter,
        promoterType: v.needPromoter ? v.promoterType : "",
        otherPromoterType: v.needPromoter && v.promoterType === "Other" ? v.otherPromoterType : "",
        campaignImages,
        campaignVideos,
        totalDays: fp.totalDays,
        perDayRentalCost: fp.perDayRentalCost,
        driverCharges: fp.driverCharges,
        promoterChargePerDay: fp.promoterChargePerDay,
        rtoCharges: fp.rtoCharges,
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
    return successResponse(res, "Admin order created successfully", { orderId: order.orderId, order }, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

// exports.updateAdminOrder = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const order = await Order.findById(id);
//     if (!order) return errorResponse(res, "Order not found", null, 404);

   
//     const LOCKED_STAGES = ["closedWon", "projectCodeCreation", "closedLost"];
//     if (LOCKED_STAGES.includes(order.salesPipelineStatus)) {
//       return errorResponse(
//         res,
//         `Order cannot be edited in "${order.salesPipelineStatus}" stage`,
//         null,
//         400
//       );
//     }

//     const {
//       customerName, customerPhone, customerAddress, customerEmail,
//       customerCategory, companyName, clientName, designation, gstNumber,
//     } = req.body;

//     const category = customerCategory || "individual";

//     // ── Same validation as create ──
//     if (category === "individual") {
//       if (!customerName?.trim()) return errorResponse(res, "Customer name is required", null, 400);
//       if (!customerPhone) return errorResponse(res, "Phone number is required", null, 400);
//       if (!/^[6-9]\d{9}$/.test(customerPhone.toString().trim()))
//         return errorResponse(res, "Enter a valid 10-digit mobile number", null, 400);
//       if (!customerEmail?.trim()) return errorResponse(res, "Email is required", null, 400);
//     } else {
//       if (!companyName?.trim()) return errorResponse(res, "Company name is required", null, 400);
//       if (!clientName?.trim()) return errorResponse(res, "Client name is required", null, 400);
//       if (!designation?.trim()) return errorResponse(res, "Designation is required", null, 400);
//       if (!customerPhone) return errorResponse(res, "Phone number is required", null, 400);
//       if (!/^[6-9]\d{9}$/.test(customerPhone.toString().trim()))
//         return errorResponse(res, "Enter a valid 10-digit mobile number", null, 400);
//       if (!customerEmail?.trim()) return errorResponse(res, "Email is required", null, 400);
//       if (!gstNumber?.trim()) return errorResponse(res, "GST number is required", null, 400);
//     }

//     // ── Parse vehicles ──
//     const vehicles = [];
//     let idx = 0;
//     while (req.body[`vehicle_${idx}`] !== undefined) {
//       try { vehicles.push(JSON.parse(req.body[`vehicle_${idx}`])); }
//       catch { return errorResponse(res, `vehicle_${idx} is not valid JSON`, null, 400); }
//       idx++;
//     }

//     if (!vehicles || vehicles.length === 0)
//       return errorResponse(res, "At least one vehicle is required", null, 400);

//     const bookingItems = [];

//     for (let i = 0; i < vehicles.length; i++) {
//       const v = vehicles[i];
//       const missing = [];
//       if (!v.packageId) missing.push("packageId");
//       if (!v.campaignType) missing.push("campaignType");
//       if (!v.campaignName?.trim()) missing.push("campaignName");
//       if (v.campaignType === "Other" && !v.otherCampaignType) missing.push("otherCampaignType");
//       if (!v.fromDate) missing.push("fromDate");
//       if (!v.toDate) missing.push("toDate");
//       if (!v.state) missing.push("state");
//       if (!v.city) missing.push("city");
//       if (!v.fromLocation) missing.push("fromLocation");
//       if (!v.toLocation) missing.push("toLocation");
//       if (!v.quantity || Number(v.quantity) < 1) missing.push("quantity");
//       if (missing.length > 0)
//         return errorResponse(res, `Vehicle ${i + 1}: Missing fields — ${missing.join(", ")}`, null, 400);

//       if (new Date(v.fromDate) >= new Date(v.toDate))
//         return errorResponse(res, `Vehicle ${i + 1}: fromDate must be before toDate`, null, 400);

//       const pkg = await Package.findById(v.packageId);
//       if (!pkg) return errorResponse(res, `Vehicle ${i + 1}: Package not found`, null, 404);

//       const fp = calcPricingBackend(pkg, v);

//       const additionalFields = (v.additionalCharges || []).map((c) => ({
//         label: (c.label || "").trim() || "Custom charge",
//         mode: c.mode === "-" ? "-" : "+",
//         amount: Math.max(0, Number(c.amount) || 0),
//       }));

//       // ── Campaign type handling (same as create) ──
//       let campaignTypeRef = null;
//       let campaignTypeName = v.campaignType;
//       if (v.campaignType && v.campaignType !== "Other") {
//         const ct = await CampaignType.findById(v.campaignType).catch(() => null);
//         if (ct) { campaignTypeRef = ct._id; campaignTypeName = ct.name; }
//       } else if (v.campaignType === "Other" && v.otherCampaignType?.trim()) {
//         let ct = await CampaignType.findOne({
//           name: { $regex: `^${v.otherCampaignType.trim()}$`, $options: "i" },
//         });
//         if (!ct) ct = await CampaignType.create({ name: v.otherCampaignType.trim() });
//         campaignTypeRef = ct._id;
//         campaignTypeName = ct.name;
//       }

//       // ── Media: existing URLs keep + new files append ──
//       const uploadedFiles = req.files || [];

//       let existingImages = [];
//       let existingVideos = [];
//       try { existingImages = JSON.parse(req.body[`existingImages_${i}`] || "[]"); } catch {}
//       try { existingVideos = JSON.parse(req.body[`existingVideos_${i}`] || "[]"); } catch {}

//       const newImages = uploadedFiles
//         .filter((f) => f.fieldname === `campaignImages_${i}`)
//         .map((f) => getFileUrl(f));
//       const newVideos = uploadedFiles
//         .filter((f) => f.fieldname === `campaignVideos_${i}`)
//         .map((f) => getFileUrl(f));

//       bookingItems.push({
//         packageId: pkg._id,
//         vehicleType: pkg.vehicleType,
//         vehicleModel: pkg.vehicleModel,
//         bookingFor: v.bookingFor,
//         gstNumber: v.bookingFor === "Agency" ? (v.gstNumber || "").trim() : "",
//         campaignType: campaignTypeName,
//         campaignName: (v.campaignName || "").trim(),
//         campaignTypeRef,
//         otherCampaignType: v.campaignType === "Other" ? (v.otherCampaignType || "") : "",
//         promoterGender: v.needPromoter ? (v.promoterGender || "") : "",
//         promoterLanguage: v.needPromoter ? (v.promoterLanguage || []) : [],
//         promoterQuantity: v.needPromoter ? (Number(v.promoterQuantity) || 0) : 0,
//         fromDate: new Date(v.fromDate),
//         toDate: new Date(v.toDate),
//         state: v.state,
//         city: v.city,
//         fromLocation: v.fromLocation,
//         toLocation: v.toLocation,
//         quantity: Number(v.quantity),
//         extraKm: Number(v.extraKm) || 0,
//         extraDays: Number(v.extraDays) || 0,
//         extraHours: Number(v.extraHours) || 0,
//         needPromoter: !!v.needPromoter,
//         promoterType: v.needPromoter ? v.promoterType : "",
//         otherPromoterType: v.needPromoter && v.promoterType === "Other" ? v.otherPromoterType : "",
//         campaignImages: [...existingImages, ...newImages],
//         campaignVideos: [...existingVideos, ...newVideos],
//         totalDays: fp.totalDays,
//         perDayRentalCost: fp.perDayRentalCost,
//         driverCharges: fp.driverCharges,
//         promoterChargePerDay: fp.promoterChargePerDay,
//         rtoCharges: fp.rtoCharges,
//         additionalHourCharges: fp.additionalHourCharges,
//         dailyKmcharges: fp.dailyKmcharges,
//         dailyKmLimit: fp.dailyKmLimit,
//         rentalCost: fp.rentalCost,
//         driverCost: fp.driverCost,
//         promoterCost: fp.promoterCost,
//         rtoCost: fp.rtoCost,
//         extraKmCost: fp.extraKmCost,
//         extraHourCost: fp.extraHourCost,
//         additionalNet: fp.additionalNet,
//         subtotal: fp.subtotal,
//         totalAmount: fp.totalAmount,
//         additionalFields,
//       });
//     }

//     // ── Totals re-calc ──
//     const taxableAmount = bookingItems.reduce((s, item) => s + item.totalAmount, 0);
//     const grandGst = Math.floor(taxableAmount * 0.18);
//     const grandTotal = taxableAmount + grandGst;

//     // ── Customer fields update ──
//     order.name = category === "individual" ? (customerName || "").trim() : (clientName || "").trim();
//     order.phone = customerPhone.toString().trim();
//     order.address = customerAddress || "";
//     order.email = customerEmail || "";
//     order.customerType = category === "individual" ? 0 : 1;
//     order.customerCategory = category;
//     order.companyName = category === "organization" ? (companyName || "").trim() : "";
//     order.clientName = category === "organization" ? (clientName || "").trim() : "";
//     order.designation = category === "organization" ? (designation || "").trim() : "";
//     order.gstNumber = category === "organization" ? (gstNumber || "").trim() : "";

//     if (req.body.gstVerifyDetails) {
//       try { order.gstVerifyDetails = JSON.parse(req.body.gstVerifyDetails); } catch {}
//     }

//     order.bookingItems = bookingItems;
//     order.grandTotal = grandTotal;
//     order.grandGst = grandGst;

//     // ── Negotiation nadanthirundha final amount recalc ──
//     if ((order.salesNegotiationArray || []).length > 0) {
//       const totalNegotiated = order.salesNegotiationArray.reduce(
//         (sum, n) => sum + (n.amount || 0), 0
//       );
//       order.salesNegotiationFinalAmount = Math.max(grandTotal - totalNegotiated, 0);
//     }

//     // ── Audit log ──
//     const editedBy = req.user?.username || "Admin";
//     order.salesPipelineLogs.push({
//       fromStage: order.salesPipelineStatus,
//       toStage: order.salesPipelineStatus,
//       movedBy: editedBy,
//       handlerName: order.salesHandlerName || "",
//       movedAt: new Date(),
//       notes: `Order details edited by ${editedBy}`,
//     });

//     await order.save();
//     return successResponse(res, "Order updated successfully", { orderId: order.orderId, order });
//   } catch (error) {
//     return errorResponse(res, error.message);
//   }
// };



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
      customerCategory, companyName, clientName, designation, gstNumber,
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
      if (!designation?.trim()) return errorResponse(res, "Designation is required", null, 400);
      if (!customerPhone) return errorResponse(res, "Phone number is required", null, 400);
      if (!/^[6-9]\d{9}$/.test(customerPhone.toString().trim()))
        return errorResponse(res, "Enter a valid 10-digit mobile number", null, 400);
      if (!customerEmail?.trim()) return errorResponse(res, "Email is required", null, 400);
      if (!gstNumber?.trim()) return errorResponse(res, "GST number is required", null, 400);
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
      if (!v.campaignType) missing.push("campaignType");
      if (!v.campaignName?.trim()) missing.push("campaignName");
      if (v.campaignType === "Other" && !v.otherCampaignType) missing.push("otherCampaignType");
      if (!v.fromDate) missing.push("fromDate");
      if (!v.toDate) missing.push("toDate");
      if (!v.state) missing.push("state");
      if (!v.city) missing.push("city");
      if (!v.fromLocation) missing.push("fromLocation");
      if (!v.toLocation) missing.push("toLocation");
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
        fromLocation: v.fromLocation,
        toLocation: v.toLocation,
        quantity: Number(v.quantity),
        extraKm: Number(v.extraKm) || 0,
        extraDays: Number(v.extraDays) || 0,
        extraHours: Number(v.extraHours) || 0,
        needPromoter: !!v.needPromoter,
        promoterType: v.needPromoter ? v.promoterType : "",
        otherPromoterType: v.needPromoter && v.promoterType === "Other" ? v.otherPromoterType : "",
        campaignImages: [...existingImages, ...newImages],
        campaignVideos: [...existingVideos, ...newVideos],
        totalDays: fp.totalDays,
        perDayRentalCost: fp.perDayRentalCost,
        driverCharges: fp.driverCharges,
        promoterChargePerDay: fp.promoterChargePerDay,
        rtoCharges: fp.rtoCharges,
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
    };

    const customerChanges = [];
    Object.keys(FIELD_LABELS).forEach((key) => {
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
      if (durationFrom) {
        filter["bookingItems.toDate"] = {
          $gte: new Date(durationFrom + "T00:00:00.000Z"),
        };
      }
      if (durationTo) {
        filter["bookingItems.fromDate"] = {
          ...filter["bookingItems.fromDate"],
          $lte: new Date(durationTo + "T23:59:59.999Z"),
        };
      }
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
  "grandTotal grandGst grandNegotiationTotal orderStatus pipelineStatus " +
  "isAdminCreated handlerName bookingItems pipelineLogs negotiationLogs " +
  "createdAt updatedAt customerCategory companyName clientName designation gstNumber " +
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
  "orderId name phone customerType pipelineStatus orderStatus " +
  "grandTotal grandGst grandNegotiationTotal bookingItems handlerName " +
  "isAdminCreated createdAt updatedAt pipelineLogs negotiationLogs " +
  "companyName clientName designation email address gstNumber customerCategory " +
  "projectCodeArray projectExecutionArray onRoadExecutionArray onRoadCommentsArray todoArray todoUploadedBy " +
  "onRoadHistory onRoadIssues onRoadDriverHistory onRoadUnavailableHistory clientFeedbackHistory campaignClosureArray " +
  "clientClosureCommentsArray closedWonCommentsArray closedLostCommentsArray orderClosedLostArray orderClosedWonArray extraKmDetailsArray orderEditHistory"   
);

    const filteredOrders = orders.filter(
      (o) => o.projectCodeArray && o.projectCodeArray.length === 1
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
    const isStaff = Number(req.user.isAdmin) === 0;


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
      (Number(req.user.isAdmin) === 0
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
      Number(req.user.isAdmin) === 0
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
      entryId: savedSubEntry._id,        // ← NEW
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

    // Adding a vehicle beyond the originally booked quantity bumps the
    // booking's quantity to match, so drivers/quantity ratios (and
    // downstream billing in Campaign Calculator) stay consistent.
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


// exports.submitOnRoadDetails = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { vehicleIndex, driverName, driverPhone,
//       vehicleRegistrationNumber } = req.body;

//     if (!driverName?.trim())
//       return errorResponse(res, "Driver name is required", null, 400);
//     if (!driverPhone?.trim())
//       return errorResponse(res, "Driver phone is required", null, 400);
//     if (!vehicleRegistrationNumber?.trim())
//       return errorResponse(res, "Vehicle registration number is required", null, 400);

//     const order = await Order.findById(id);
//     if (!order) return errorResponse(res, "Order not found", null, 404);

//     const vIdx = Number(vehicleIndex);
//     const bookingItem = order.bookingItems[vIdx];
//     if (!bookingItem) return errorResponse(res, "Vehicle not found in this order", null, 404);

//     const requiredQty = bookingItem.quantity || 1;

//     // ── Availability re-check before saving driver ──────────────────
//     const savedForThisVehicle = order.onRoadExecutionArray.filter(
//       (e) => e.vehicleIndex === vIdx
//     );

//     // Only enforce the check while we still need more drivers/vehicles
//     // for this booking item (avoids blocking edits after quota already met)
//     if (savedForThisVehicle.length < requiredQty) {
//       try {
//         const availability = await checkVehicleAvailability({
//           vehicleType: bookingItem.vehicleType,
//           quantity: requiredQty,
//           fromDate: bookingItem.fromDate,
//           toDate: bookingItem.toDate,
//         });

//         if (!availability.available) {
//           return errorResponse(
//             res,
//             `You are required ${availability.requiredQuantity} vehicle(s) but only ${availability.availableCount} available`,
//             null,
//             400
//           );
//         }
//       } catch (availErr) {
//         return errorResponse(res, availErr.message || "Vehicle availability check failed", null, 400);
//       }
//     }
//     // ──────────────────────────────────────────────────────────────

//     const uploadedBy =
//       Number(req.user.isAdmin) === 0
//         ? req.user.username
//         : order.handlerName || req.user?.username || "Admin";

//     const gatepassFile = (req.files || []).find(f => f.fieldname === "gatepassPhoto");
//     const photoUrl = gatepassFile ? getFileUrl(gatepassFile) : "";

//     const newEntry = {
//       vehicleIndex: vIdx,
//       driverName: driverName.trim(),
//       driverPhone: driverPhone.trim(),
//       vehicleRegistrationNumber: vehicleRegistrationNumber.trim().toUpperCase(),
//       gatepassPhoto: photoUrl,
//       onRoadStatus: 0,
//       uploadedBy,
//       uploadedAt: new Date(),
//     };
//     order.onRoadExecutionArray.push(newEntry);

//     const savedSubEntry = order.onRoadExecutionArray[order.onRoadExecutionArray.length - 1];

//     order.onRoadDriverHistory.push({
//       vehicleIndex: vIdx,
//       entryId: savedSubEntry._id,
//       action: "created",
//       driverName: driverName.trim(),
//       driverPhone: driverPhone.trim(),
//       vehicleRegistrationNumber: vehicleRegistrationNumber.trim().toUpperCase(),
//       gatepassPhoto: photoUrl,
//       changedBy: uploadedBy,
//       changedAt: new Date(),
//       changedFields: {},
//     });

//     // Recompute after push (fresh count including the new entry)
//     const savedForThisVehicleAfter = order.onRoadExecutionArray.filter(
//       (e) => e.vehicleIndex === vIdx
//     );

//     if (savedForThisVehicleAfter.length >= requiredQty) {
//       order.onRoadExecutionArray.forEach((e) => {
//         if (e.vehicleIndex === vIdx) {
//           e.onRoadStatus = 1;
//         }
//       });
//     }

//     await order.save();
//     return successResponse(res, "Driver details saved", { order });

//   } catch (error) {
//     return errorResponse(res, error.message, null, 500);
//   }
// };



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
      Number(req.user.isAdmin) === 0
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


// exports.addOnRoadIssue = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const { vehicleIndex, issueDescription, vehicleRegistrationNumber } = req.body;

//     if (!issueDescription?.trim())
//       return errorResponse(res, "Issue description is required", null, 400);

//     const order = await Order.findById(id);
//     if (!order) return errorResponse(res, "Order not found", null, 404);


//     let entry;
//     if (vehicleRegistrationNumber?.trim()) {
//       entry = order.onRoadExecutionArray.find(
//         (e) => e.vehicleRegistrationNumber === vehicleRegistrationNumber.trim().toUpperCase()
//       );
//     } else {
//       entry = order.onRoadExecutionArray.find(
//         (e) => e.vehicleIndex === Number(vehicleIndex) && e.onRoadStatus === 1
//       );
//     }

//     const reportedBy =
//       Number(req.user.isAdmin) === 0
//         ? req.user.username
//         : order.handlerName || req.user?.username || "Admin";

//     const photoFile = (req.files || []).find(f => f.fieldname === "issuePhoto");

//     if (photoFile) {
//       const err = validateFile(photoFile, "Issue photo");
//       if (err) return errorResponse(res, err, null, 400);
//     }

//     const photoUrl = photoFile ? getFileUrl(photoFile) : "";

//     order.onRoadIssues.push({
//       vehicleIndex: entry ? entry.vehicleIndex : Number(vehicleIndex),
//       driverName: entry?.driverName || "",
//       vehicleRegNo: entry?.vehicleRegistrationNumber || vehicleRegistrationNumber || "",
//       issueDescription: issueDescription.trim(),
//       issuePhoto: photoUrl,
//       status: "open",
//       reportedBy,
//       reportedAt: new Date(),
//     });

//     await order.save();
//     return successResponse(res, "Issue reported successfully", { order });
//   } catch (error) {
//     return errorResponse(res, error.message, null, 500);
//   }
// };

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
      Number(req.user.isAdmin) === 0
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
      Number(req.user.isAdmin) === 0
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
      Number(req.user.isAdmin) === 0
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
            e.entryStatus !== "removed" &&
            !e.unavailableStatus
        );
    if (!entry) return errorResponse(res, "Vehicle entry not found", null, 404);
    if (entry.entryStatus === "removed")
      return errorResponse(res, "This vehicle entry has already been released", null, 400);
    if (entry.unavailableStatus)
      return errorResponse(res, "This vehicle is already marked unavailable", null, 400);

    const reportedBy =
      Number(req.user.isAdmin) === 0
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

    // Sync Vehicle Master inventory to the selected status (Unavailable /
    // Damaged / Under Maintenance) so this reg no. is no longer assignable
    // — this is the on-road vehicle's status change, not a release.
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

// ── Replace a broken-down on-road vehicle with another one ─────────────────
// Releases the old vehicle (flags it unavailable + moves it into the Vehicle
// Unavailable stage), assigns a fresh registration number to the same slot,
// and links both sides together for full replacement history.
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
    if (oldEntry.entryStatus === "removed") {
      return errorResponse(res, "This vehicle has already been released", null, 400);
    }
    // Replace is valid both from On Road (not yet flagged) and from the
    // Vehicle Unavailable stage (already flagged unavailableStatus) — that's
    // the normal path now that Unavailable vehicles get a Replace button.

    const newReg = newVehicleRegistrationNumber.trim().toUpperCase().replace(/\s+/g, "");
    const oldReg = (oldEntry.vehicleRegistrationNumber || "").trim().toUpperCase().replace(/\s+/g, "");

    if (newReg === oldReg) {
      return errorResponse(res, "Replacement vehicle must be different from the current vehicle", null, 400);
    }

    // Entries flagged unavailableStatus are inactive/superseded slots (either
    // still waiting for a replacement or already replaced) — they don't hold
    // a live assignment, so a reg no. sitting only in such an entry is free
    // to be reused elsewhere on the same order.
    const alreadyActive = order.onRoadExecutionArray.some(
      (e) => e.entryStatus !== "removed" && !e.unavailableStatus && e.vehicleRegistrationNumber === newReg
    );
    if (alreadyActive) {
      return errorResponse(res, "That vehicle is already assigned on this order", null, 400);
    }

    const performedBy =
      Number(req.user.isAdmin) === 0
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

    const now = new Date();
    const replacedAt = new Date(now.getTime() + 1000);
    const reasonTrim = reason.trim();
    const wasAlreadyUnavailable = !!oldEntry.unavailableStatus;

    // 1. Old entry → mark unavailable (kept visible/active on the roster, just flagged)
    oldEntry.unavailableStatus = true;
    oldEntry.unavailableReason = reasonTrim;

    // 2. New entry → same slot, new (or re-entered) driver, new registration number
    order.onRoadExecutionArray.push({
      vehicleIndex: oldEntry.vehicleIndex,
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim(),
      vehicleRegistrationNumber: newReg,
      onRoadStatus: oldEntry.onRoadStatus,
      uploadedBy: performedBy,
      uploadedAt: now,
      entryStatus: "active",
    });
    const newEntry = order.onRoadExecutionArray[order.onRoadExecutionArray.length - 1];

    // 3. Driver/vehicle history — mirrors the "release + add" pattern used elsewhere
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

    // 4. If this vehicle wasn't already flagged unavailable (a direct Replace
    // from On Road, not from the Unavailable stage), log that as its own
    // history record first, so it shows as a separate timeline entry instead
    // of being folded into the replacement event below.
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

    // 5. Separate replacement record holding BOTH old + new vehicle details
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

    // 5. Sync Vehicle Master inventory: old vehicle → Unavailable, new vehicle → Booked
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
      Number(req.user.isAdmin) === 0
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

    const createdBy = Number(req.user.isAdmin) === 0
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
    //   Number(req.user.isAdmin) === 0
    //     ? req.user.username
    //     : order.handlerName || req.user?.username || "Admin";

    const createdBy =
      Number(req.user.isAdmin) === 0
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

    // approver's own email straight from JWT — no DB lookup needed
    const approverEmail = req.user?.email || "";

    // original requester is a DIFFERENT user, so this still needs a DB lookup
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

    // Only super admin can use this shortcut
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
      Number(req.user.isAdmin) === 0
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
        .filter((e) => e.entryStatus !== "removed" && !e.unavailableStatus)
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
      Number(req.user.isAdmin) === 0
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
        .filter((e) => e.entryStatus !== "removed" && !e.unavailableStatus)
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

    const senderRole = Number(req.user.isAdmin) === 1 ? "admin" : "staffAdmin";

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



async function fetchVamosysApiKey() {
  const userId = "ADINN12";
  const validDays = 365;
  const time = Math.floor(Date.now() / 1000);

  const url = `https://api.vamosys.com/getApiKey?userId=${userId}&validDays=${validDays}&time=${time}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || "Vamosys API returned an error");
  }

  const data = await response.json();
  return data.apiKey || "";
}

exports.getVamosysApiKey = async (req, res) => {
  try {
    const userId = "ADINN12";
    const validDays = 365;
    const time = Math.floor(Date.now() / 1000);
    const url = `https://api.vamosys.com/getApiKey?userId=${userId}&validDays=${validDays}&time=${time}`;

    const apiKey = await fetchVamosysApiKey();

    return res.status(200).json({
      success: true,
      requestedUrl: url,
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

    const apiKey = await fetchVamosysApiKey();

    const url = `http://api.vamosys.com/apiMobile/getVehicleLocations?apiKey=${apiKey}&userId=ADINN12&groupId=ADINN12`;
    const response = await fetch(url);

    if (!response.ok) {
      const errText = await response.text();
      return errorResponse(res, "Vamosys locations API error: " + errText, null, 502);
    }

    const data = await response.json();
    return successResponse(res, "Vehicle locations fetched", { data });
  } catch (error) {
    console.error("Vamosys locations proxy error:", error.message);
    return errorResponse(res, error.message, null, 500);
  }
};



exports.addExtraKmDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleIndex, entryId, extraKm, extraHours, fromDate, toDate, extraKmId } = req.body;

    const vIdx = Number(vehicleIndex);
    const km = Number(extraKm) || 0;
    const hrs = Number(extraHours) || 0;

   
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
      Number(req.user.isAdmin) === 0
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
    const { vehicleIndex, entryId, day, startTime, endTime, remarks, logId, isAbsentDay } = req.body;

    const vIdx = Number(vehicleIndex);
    const absentDayFlag = !!isAbsentDay;
    if (!day) return errorResponse(res, "Day is required", null, 400);

    // Vehicle Absent Calculation: a full-day absence doesn't need real
    // start/end times — the whole day is logged as 0 running / full absent.
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
      Number(req.user.isAdmin) === 0
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

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
      remarks: remarks || "",
      loggedBy,
      loggedAt: new Date(),
    };

    const existing = logId
      ? order.dailyHoursLogArray.id(logId)
      : order.dailyHoursLogArray.find(
          (l) => l.entryId && entry && l.entryId.toString() === entry._id.toString() && l.day === day
        );

    if (existing) {
      Object.assign(existing, payload);
    } else {
      order.dailyHoursLogArray.push(payload);
    }

    await order.save();

    return successResponse(res, "Daily hours logged successfully", { order }, 201);
  } catch (error) {
    console.error("Error in addDailyHoursLog:", error);
    return errorResponse(res, error.message, null, 500);
  }
};

// ── Campaign Compensation ───────────────────────────────────────────────
// Grants extra working hours (added to a day's running time) or extra
// campaign days for a date range, to make up for downtime caused by issues
// or vehicle unavailability. Scope: whole vehicleIndex (entryId omitted) or
// one specific entry/reg-no (entryId provided).
// Sets/clears the date-range window within which the Order-Creation-purchased
// Extra KM/Hours pool (bookingItem.extraKm/extraHours) is treated as
// "available" against logged usage in the Campaign Calculator. Pass
// fromDate/toDate to narrow it, or omit both (null) to reset to the vehicle
// slot's full campaign window (the default behavior).
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
      Number(req.user.isAdmin) === 0
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin";

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

    if (entry.entryStatus === "removed") {
      return errorResponse(res, "This vehicle is already released", null, 400);
    }

    const releasedBy =
      Number(req.user.isAdmin) === 0
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

// ── Campaign Calculator ────────────────────────────────────────────────────
// Pure read-only derivation from existing data (onRoadExecutionArray,
// onRoadDriverHistory, extraKmDetailsArray) — no new persisted state.
// Gives a day-by-day, vehicle-wise billing breakdown for a running campaign.

const dateKey = (d) => new Date(d).toISOString().slice(0, 10);

function addDaysUTC(dateKeyStr, days) {
  const d = new Date(dateKeyStr + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return dateKey(d);
}

// Replays onRoadDriverHistory events for one entry to find its
// driver/registration state as of a given day, and whether it was
// active (created & not yet removed) on that day.
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
    // "replacement" = this slot's vehicle was created after the campaign's
    // own start date, i.e. it filled in mid-campaign rather than at kickoff.
    isReplacement: false, // set by caller once campaignStart is known
  };
}

// Among overlapping extra-km/hour submissions for the same entry, only the
// most recently added one counts toward billing — older ones stay in history.
function pickActiveExtraKmEntries(extraKmDetailsArray, entryId) {
  const forEntry = extraKmDetailsArray
    .filter((e) => e.entryId && String(e.entryId) === String(entryId))
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt)); // newest first

  const active = [];
  const coveredRanges = []; // [fromKey, toKey] already claimed by a newer entry

  for (const e of forEntry) {
    const fromK = dateKey(e.fromDate);
    const toK = dateKey(e.toDate);
    const overlapsCovered = coveredRanges.some(
      ([cf, ct]) => fromK <= ct && toK >= cf
    );
    if (!overlapsCovered) {
      active.push(e);
      coveredRanges.push([fromK, toK]);
    }
  }
  return active;
}

// Among campaign-level (entryId null) extra-km/hour submissions for a
// vehicleIndex, only the most recently added, non-superseded ones count.
function pickActiveVehicleLevelExtraKmEntries(extraKmDetailsArray, vehicleIndex) {
  const forVehicle = extraKmDetailsArray
    .filter((e) => !e.entryId && e.vehicleIndex === vehicleIndex)
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

  const active = [];
  const coveredRanges = [];
  for (const e of forVehicle) {
    const fromK = dateKey(e.fromDate);
    const toK = dateKey(e.toDate);
    const overlapsCovered = coveredRanges.some(([cf, ct]) => fromK <= ct && toK >= cf);
    if (!overlapsCovered) {
      active.push(e);
      coveredRanges.push([fromK, toK]);
    }
  }
  return active;
}

// Default campaign working window when no actual hours were logged for an
// entry/day: 4:00 PM – Midnight (8 hours), matching the frontend's
// NEXT_PUBLIC_DEFAULT_LOGIN_TIME/NEXT_PUBLIC_DEFAULT_LOGOUT_TIME defaults
// used by LogHoursModal. When an entry/day DOES have a real dailyHoursLog
// entry, that log's own startTime/endTime is used as the window instead
// (see resolveWorkWindow below) — this constant is only the fallback.
const DEFAULT_WORK_START_HOUR = Number(process.env.DEFAULT_WORK_START_HOUR);
const DEFAULT_WORK_END_HOUR = Number(process.env.DEFAULT_WORK_END_HOUR);

// The default work window's hours (e.g. 16:00-24:00) are meant to represent
// wall-clock IST hours ("4:00 PM - Midnight IST"), matching the frontend's
// NEXT_PUBLIC_DEFAULT_LOGIN_TIME/LOGOUT_TIME which are entered/displayed as
// IST times by staff. They must therefore be anchored as literal IST instants
// (UTC+5:30), NOT as raw UTC hours — anchoring them as UTC hours previously
// made a "4:00 PM-Midnight" window actually fall at 9:30 PM-5:30 AM IST once
// rendered in the browser's local timezone, which is what every OTHER
// timestamp in this response (real event timestamps) is rendered in. Building
// every timeline boundary — synthetic default-window ones AND real
// event-derived ones — as genuine instants that equal the intended IST
// wall-clock time keeps a single, consistent local-time rendering convention
// usable everywhere on the frontend (see fmtClock/fmtDatetime in
// CampaignCalculatorTab.tsx).
const IST_OFFSET = "+05:30";
function istWallClock(dayKeyStr, hour) {
  // hour may be 24 (midnight rollover into next day), handled via addDaysUTC
  // on the *date* portion while the wall-clock hour itself stays 00.
  if (hour >= 24) {
    const nextDay = addDaysUTC(dayKeyStr, Math.floor(hour / 24));
    return new Date(`${nextDay}T${String(hour % 24).padStart(2, "0")}:00:00${IST_OFFSET}`);
  }
  return new Date(`${dayKeyStr}T${String(hour).padStart(2, "0")}:00:00${IST_OFFSET}`);
}

// Resolves the actual working window [start,end] for one entry/day: prefers
// the real logged startTime/endTime from dailyHoursLogArray for that
// entry/day (when it's a real timed log, not a full-day-absence placeholder
// entry); otherwise falls back to the default 4PM-Midnight IST window built
// on top of dayKeyStr (see istWallClock above).
function resolveWorkWindow(dayKeyStr, hoursLog) {
  if (hoursLog && hoursLog.startTime && hoursLog.endTime && !hoursLog.isAbsentDay) {
    const start = new Date(hoursLog.startTime);
    const end = new Date(hoursLog.endTime);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
      return { start, end };
    }
  }
  const start = istWallClock(dayKeyStr, DEFAULT_WORK_START_HOUR);
  const end = istWallClock(dayKeyStr, DEFAULT_WORK_END_HOUR); // 24 correctly rolls into next-day 00:00 IST
  return { start, end };
}

// Builds the classified running-time event sequence for one entry/day: a
// sorted walk across window-start, every issue's reportedAt/resolvedAt, and
// every (non-replacement) unavailable-history reportedAt/resolvedAt, all
// clipped into [windowStart, entryEndCap]. Gaps are running by default;
// they become "issue" while an issue is open, and "unavailable" while a
// standalone unavailable-status record is open. If this entry was replaced
// this day (a "replaced" record with a `replacedAt`), that timestamp caps
// the entry's own day (the new entryId picks up the rest via its own
// creation-clip) and — since the vehicle demonstrably never resumed running
// after its first down event that day — every gap from that first down
// event onward through the cap is treated as "unavailable" too, so an
// informational "marked unavailable" status change sitting inside that span
// doesn't get misread as a return to running.
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

    // Pre-group actual-hours logs by entryId + day for O(1) lookup.
    const hoursLogByEntryDay = {};
    for (const l of dailyHoursLogArray) {
      if (!l.entryId) continue;
      hoursLogByEntryDay[`${String(l.entryId)}|${l.day}`] = l;
    }

    // Campaign Compensation ("days" type) — extra campaign days granted per
    // vehicle-type slot, added to that slot's schedule window.
    const extraDaysByVehicle = {};
    bookingItems.forEach((_, vehicleIndex) => {
      extraDaysByVehicle[vehicleIndex] = campaignCompensationArray
        .filter((c) => c.compensationType === "days" && c.vehicleIndex === vehicleIndex)
        .reduce((s, c) => s + (c.compensationValue || 0), 0);
    });

    const campaignStart = bookingItems
      .map((b) => dateKey(b.fromDate))
      .sort()[0];
    const campaignEnd = bookingItems
      .map((b, idx) => {
        const baseTo = dateKey(b.toDate);
        const extra = extraDaysByVehicle[idx] || 0;
        return extra > 0 ? addDaysUTC(baseTo, extra) : baseTo;
      })
      .sort()
      .slice(-1)[0];

    if (!campaignStart || !campaignEnd) {
      return errorResponse(res, "Campaign dates are missing on this order", null, 400);
    }

    // Vehicle Issue Duration + Vehicle Unavailable Duration: pre-group by
    // entryId so per-day derivation below is O(1) per entry.
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

    // Campaign Compensation ("hours" type) — pre-group so entry-specific
    // grants (entryId set) can take precedence over campaign-level grants
    // (entryId null) for the same vehicleIndex/day.
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
    function compensationHoursFor(entryId, vehicleIndex, dayKeyStr) {
      const inRange = (c) => dateKey(c.fromDate) <= dayKeyStr && dateKey(c.toDate) >= dayKeyStr;
      const entryGrants = (hourCompByEntry[entryId] || []).filter(inRange);
      if (entryGrants.length) {
        return Math.round(entryGrants.reduce((s, c) => s + c.compensationValue, 0) * 100) / 100;
      }
      const vehicleGrants = (hourCompByVehicle[vehicleIndex] || []).filter(inRange);
      return Math.round(vehicleGrants.reduce((s, c) => s + c.compensationValue, 0) * 100) / 100;
    }

    // Pre-group history + extras by entryId for fast lookup per day.
    const historyByEntry = {};
    for (const h of onRoadDriverHistory) {
      const key = h.entryId ? String(h.entryId) : `vi-${h.vehicleIndex}`;
      (historyByEntry[key] = historyByEntry[key] || []).push(h);
    }
    Object.values(historyByEntry).forEach((arr) =>
      arr.sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt))
    );

    const bookingItemsMeta = bookingItems.map((b, idx) => {
      // Vehicle Absent Calculation: a day marked fully absent for ANY active
      // entry of this vehicle-type slot doesn't count as a completed
      // campaign day for that slot.
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
        totalScheduledDays,
        absentDaysCount,
        completedCampaignDays,
        perDayRentalCost: b.perDayRentalCost || 0,
        driverCharges: b.driverCharges || 0,
        rtoCost: b.rtoCost || 0,
        needPromoter: !!b.needPromoter,
        promoterCost: b.promoterCost || 0,
        // Estimate figures as stored at Order Creation time — used only to
        // show the client the Estimated-vs-Actual breakdown, never re-billed.
        estimatedRentalCost: (b.rentalCost || 0) + (b.driverCost || 0),
        estimatedExtraKmCost: b.extraKmCost || 0,
        estimatedExtraHourCost: b.extraHourCost || 0,
        estimatedTotalAmount: b.totalAmount || 0,
      };
    });

    // ── Extra KM / Hours balance ──────────────────────────────────────────
    // The client pre-purchases a KM/hour pool at Order Creation (bookingItem
    // .extraKm/.extraHours, already priced into the contract). Usage logged
    // on-road first draws down that pool for free; only usage beyond the
    // pool ("overage") is a genuinely new billable charge. We compute, per
    // vehicle slot, what fraction of all logged usage is overage, then use
    // that fraction to scale every individual logged entry's cost so the
    // day-by-day breakdown and the aggregate total stay consistent.
    const extraKmBalanceByVehicle = {};
    bookingItems.forEach((item, vehicleIndex) => {
      // The purchased pool is only "available" against usage logged inside
      // this window — defaults to the vehicle-type slot's full campaign
      // window when ops haven't narrowed it. Usage logged outside the
      // window can't draw against the pool at all and falls straight to
      // overage (billed in full), same as if no pool existed for that day.
      const purchasedWindowFrom = item.purchasedExtraKmFromDate
        ? dateKey(item.purchasedExtraKmFromDate)
        : dateKey(item.fromDate);
      const purchasedWindowTo = item.purchasedExtraKmToDate
        ? dateKey(item.purchasedExtraKmToDate)
        : dateKey(item.toDate);
      const inPurchasedWindow = (e) =>
        dateKey(e.fromDate) <= purchasedWindowTo && dateKey(e.toDate) >= purchasedWindowFrom;

      const entriesForVehicle = extraKmDetailsArray.filter((e) => e.vehicleIndex === vehicleIndex);
      const entriesInWindow = entriesForVehicle.filter(inPurchasedWindow);
      const entriesOutOfWindow = entriesForVehicle.filter((e) => !inPurchasedWindow(e));

      const usedKm = entriesInWindow.reduce((s, e) => s + (e.extraKm || 0), 0);
      const usedHours = entriesInWindow.reduce((s, e) => s + (e.extraHours || 0), 0);
      const loggedKmCost = entriesInWindow.reduce((s, e) => s + (e.extraKmCost || 0), 0);
      const loggedHourCost = entriesInWindow.reduce((s, e) => s + (e.extraHourCost || 0), 0);
      const purchasedKm = item.extraKm || 0;
      const purchasedHours = item.extraHours || 0;
      const overageKm = Math.max(usedKm - purchasedKm, 0);
      const overageHours = Math.max(usedHours - purchasedHours, 0);
      const kmRatio = usedKm > 0 ? overageKm / usedKm : 0;
      const hourRatio = usedHours > 0 ? overageHours / usedHours : 0;

      // Usage logged outside the purchased window is 100% overage — it
      // never touches the pool ratio above.
      const outOfWindowKmCost = entriesOutOfWindow.reduce((s, e) => s + (e.extraKmCost || 0), 0);
      const outOfWindowHourCost = entriesOutOfWindow.reduce((s, e) => s + (e.extraHourCost || 0), 0);
      const outOfWindowKm = entriesOutOfWindow.reduce((s, e) => s + (e.extraKm || 0), 0);
      const outOfWindowHours = entriesOutOfWindow.reduce((s, e) => s + (e.extraHours || 0), 0);

      extraKmBalanceByVehicle[vehicleIndex] = {
        vehicleIndex,
        purchasedKm,
        purchasedHours,
        purchasedWindowFrom,
        purchasedWindowTo,
        isPurchasedWindowCustom: !!(item.purchasedExtraKmFromDate || item.purchasedExtraKmToDate),
        usedKm,
        usedHours,
        remainingKm: Math.max(purchasedKm - usedKm, 0),
        remainingHours: Math.max(purchasedHours - usedHours, 0),
        overageKm: Math.round((overageKm + outOfWindowKm) * 100) / 100,
        overageHours: Math.round((overageHours + outOfWindowHours) * 100) / 100,
        overageKmCost: Math.round((loggedKmCost * kmRatio + outOfWindowKmCost) * 100) / 100,
        overageHourCost: Math.round((loggedHourCost * hourRatio + outOfWindowHourCost) * 100) / 100,
        kmRatio,
        hourRatio,
      };
    });

    // Computes the running/issue/unavailable-hour figures for one entry on
    // one day — shared by both still-active entries and entries that were
    // released (removed) on this exact day, so a released entry gets the
    // same real, event-derived figures instead of being reduced to a bare
    // registration-number string.
    function computeEntryDayFigures(resolved, hist, dayKey, vehicleIndex, itemFrom, isCompensationExtensionDay) {
      const createdEvent = hist.find((h) => h.action === "created");
      resolved.isReplacement = !!(createdEvent && dateKey(createdEvent.changedAt) > itemFrom);

      const hoursLog = hoursLogByEntryDay[`${resolved.entryId}|${dayKey}`];
      if (hoursLog) {
        resolved.runningHours = hoursLog.runningHours;
        resolved.absentHours = hoursLog.absentHours;
        resolved.campaignHours = hoursLog.campaignHours;
        resolved.isAbsentDay = !!hoursLog.isAbsentDay;
      }

      const issuesForEntry = issuesByEntry[resolved.entryId] || [];
      const unavailForEntry = unavailByEntry[resolved.entryId] || [];

      let { start: dayWindowStart, end: dayWindowEnd } = resolveWorkWindow(dayKey, hoursLog);
      // Bug C fix: for the current, still-in-progress calendar day, never
      // project the timeline past the real current moment — a fresh entry
      // with no down-events yet should show only its actual elapsed running
      // time so far, not an assumed "runs uninterrupted to the end of the
      // work window" projection. Past, fully-completed days keep the full
      // window (legitimate for cost/reporting once the day is over).
      const now = new Date();
      if (dayKey === dateKey(now) && dayWindowEnd > now) {
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

      resolved.compensationHours = compensationHoursFor(resolved.entryId, vehicleIndex, dayKey);
      resolved.isCompensationExtensionDay = isCompensationExtensionDay;

      // Surface explicit replacement info: was this entry replaced by
      // another vehicle on this day (per onRoadUnavailableHistory's
      // "replaced" record)? Used so a released/removed entry's card can say
      // "Replaced by <reg>" instead of silently vanishing into a bare name.
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
        // Campaign Compensation ("days" type) extends this slot's schedule.
        const extraDaysGranted = extraDaysByVehicle[vehicleIndex] || 0;
        const itemToExtended = extraDaysGranted > 0 ? addDaysUTC(itemTo, extraDaysGranted) : itemTo;
        if (dayKey < itemFrom || dayKey > itemToExtended) return; // this vehicle-type's window doesn't include today
        const isCompensationExtensionDay = dayKey > itemTo;

        const entriesForSlot = onRoadExecutionArray.filter(
          (e) => e.vehicleIndex === vehicleIndex
        );

        const activeEntries = [];
        const releasedToday = [];

        for (const entry of entriesForSlot) {
          const histKey = entry._id ? String(entry._id) : `vi-${vehicleIndex}`;
          const hist = historyByEntry[histKey] || [];
          const resolved = resolveEntryStateForDay(entry, hist, dayKey);
          if (!resolved) continue;
          if (resolved.removed) {
            if (resolved.releasedOnThisDay) {
              // Give the released entry the same real, event-derived
              // running/issue/unavailable figures (and replacement linkage)
              // as an active entry gets, instead of collapsing it down to a
              // bare registration-number string.
              computeEntryDayFigures(resolved, hist, dayKey, vehicleIndex, itemFrom, isCompensationExtensionDay);
              releasedToday.push(resolved);
            }
            continue;
          }
          // Vehicle Issue Duration + Vehicle Unavailable/Replacement Duration:
          // derived (not stored) from onRoadIssues / onRoadUnavailableHistory
          // timestamps, via a real event-sequence walk across this entry/
          // day's actual working window (logged hours, or the default
          // window) instead of a hardcoded 9AM-5PM clip.
          computeEntryDayFigures(resolved, hist, dayKey, vehicleIndex, itemFrom, isCompensationExtensionDay);

          activeEntries.push(resolved);
        }

        const activeCount = activeEntries.length;
        const baseDailyRate = (item.perDayRentalCost || 0) + (item.driverCharges || 0);
        const dailyVehicleAmount = activeCount * baseDailyRate;

        // Compensation: for every entry with a logged absence today, dock a
        // proportional share of that entry's daily rate.
        let compensationToday = 0;
        for (const entry of activeEntries) {
          if (!entry.absentHours || !entry.campaignHours) continue;
          const deduction =
            Math.round(((baseDailyRate * entry.absentHours) / entry.campaignHours) * 100) / 100;
          entry.compensationDeduction = deduction;
          compensationToday += deduction;
        }

        const balance = extraKmBalanceByVehicle[vehicleIndex] || { kmRatio: 0, hourRatio: 0 };

        // The client already paid for the purchased Extra KM/Hours pool at
        // Order Creation (item.extraKmCost/extraHourCost) — that flat fee is
        // part of the actual bill regardless of how much of the pool gets
        // used, charged once on the vehicle's first campaign day, same as RTO.
        const extraKmPoolFeeToday = dayKey === itemFrom ? item.extraKmCost || 0 : 0;
        const extraHourPoolFeeToday = dayKey === itemFrom ? item.extraHourCost || 0 : 0;

        let extraKmCost = extraKmPoolFeeToday;
        let extraHourCost = extraHourPoolFeeToday;
        const extraDetailsToday = [];
        for (const entry of activeEntries) {
          // Reg-no-specific (entry-scoped) extra KM/hour grants take
          // precedence over campaign-level (vehicleIndex-scoped, entryId
          // null) grants for the same vehicle on overlapping dates.
          const entryPicked = pickActiveExtraKmEntries(extraKmDetailsArray, entry.entryId);
          const entryCoveredRanges = entryPicked.map((p) => [dateKey(p.fromDate), dateKey(p.toDate)]);
          const vehiclePicked = pickActiveVehicleLevelExtraKmEntries(extraKmDetailsArray, vehicleIndex).filter(
            (p) => {
              const fromK = dateKey(p.fromDate);
              const toK = dateKey(p.toDate);
              return !entryCoveredRanges.some(([cf, ct]) => fromK <= ct && toK >= cf);
            }
          );
          const picked = [...entryPicked, ...vehiclePicked];
          for (const p of picked) {
            // Attribute the (one-time) extra-usage cost to the last day of
            // its logged range, so it isn't double-counted across the range.
            if (dateKey(p.toDate) === dayKey) {
              // Only the overage fraction (usage beyond the purchased KM/hour
              // pool) is billable — usage within the pool is already paid
              // for in the original contract. Usage logged outside the
              // purchased pool's applicable date window never draws against
              // the pool at all, so it's billed at full (100% overage) cost.
              const pInPurchasedWindow =
                balance.purchasedWindowFrom !== undefined
                  ? dateKey(p.fromDate) <= balance.purchasedWindowTo &&
                    dateKey(p.toDate) >= balance.purchasedWindowFrom
                  : true;
              const billableKmCost = pInPurchasedWindow
                ? Math.round((p.extraKmCost || 0) * balance.kmRatio * 100) / 100
                : Math.round((p.extraKmCost || 0) * 100) / 100;
              const billableHourCost = pInPurchasedWindow
                ? Math.round((p.extraHourCost || 0) * balance.hourRatio * 100) / 100
                : Math.round((p.extraHourCost || 0) * 100) / 100;
              extraKmCost += billableKmCost;
              extraHourCost += billableHourCost;
              extraDetailsToday.push({
                registrationNumber: entry.vehicleRegistrationNumber,
                extraKm: p.extraKm,
                extraHours: p.extraHours,
                extraKmCost: billableKmCost,
                extraHourCost: billableHourCost,
                withinPurchasedBalance: billableKmCost === 0 && billableHourCost === 0,
                loggedFor: `${dateKey(p.fromDate)} to ${dateKey(p.toDate)}`,
                addedBy: p.addedBy,
              });
            }
          }
        }

        const rtoAppliedToday = dayKey === itemFrom ? item.rtoCost || 0 : 0;

        const promoterAmountToday =
          item.needPromoter && item.totalDays
            ? Math.round(((item.promoterCost || 0) / item.totalDays) * 100) / 100
            : 0;

        const itemDayTotal =
          dailyVehicleAmount +
          extraKmCost +
          extraHourCost +
          rtoAppliedToday +
          promoterAmountToday -
          compensationToday;

        dayTotal += itemDayTotal;

        // Daily Campaign Running Summary rollup for this vehicle-type/day.
        const issueHoursToday = Math.round(activeEntries.reduce((s, e) => s + (e.issueHours || 0), 0) * 100) / 100;
        const unavailableHoursToday = Math.round(activeEntries.reduce((s, e) => s + (e.unavailableHours || 0), 0) * 100) / 100;
        const downtimeHoursToday = Math.round((issueHoursToday + unavailableHoursToday) * 100) / 100;
        const compensationHoursGrantedToday = Math.round(activeEntries.reduce((s, e) => s + (e.compensationHours || 0), 0) * 100) / 100;

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
          promoterAmountToday,
          compensationToday: Math.round(compensationToday * 100) / 100,
          issueHoursToday,
          unavailableHoursToday,
          downtimeHoursToday,
          compensationHoursGrantedToday,
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
    const actualPromoter = allVehicles.reduce((s, v) => s + (v.promoterAmountToday || 0), 0);
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

    // Estimate figures as stored at Order Creation — shown next to actuals so
    // any gap (e.g. extra KM/hours guessed at booking time but not yet
    // logged by Operations) is visible instead of collapsing into one
    // unexplained "reconciliation" number.
    const estimatedRental = bookingItemsMeta.reduce((s, b) => s + (b.estimatedRentalCost || 0), 0);
    const estimatedRto = bookingItemsMeta.reduce((s, b) => s + (b.rtoCost || 0), 0);
    const estimatedPromoter = bookingItemsMeta.reduce((s, b) => s + (b.promoterCost || 0), 0);
    const estimatedExtraKm = bookingItemsMeta.reduce((s, b) => s + (b.estimatedExtraKmCost || 0), 0);
    const estimatedExtraHours = bookingItemsMeta.reduce((s, b) => s + (b.estimatedExtraHourCost || 0), 0);

    const finalBilling = {
      estimatedAmount: orderTaxableAmount,
      estimatedRental: Math.round(estimatedRental * 100) / 100,
      estimatedRto: Math.round(estimatedRto * 100) / 100,
      estimatedPromoter: Math.round(estimatedPromoter * 100) / 100,
      estimatedExtraKm: Math.round(estimatedExtraKm * 100) / 100,
      estimatedExtraHours: Math.round(estimatedExtraHours * 100) / 100,
      actualRental: Math.round(actualRental * 100) / 100,
      actualExtraKm: Math.round(actualExtraKm * 100) / 100,
      actualExtraHours: Math.round(actualExtraHours * 100) / 100,
      actualRto: Math.round(actualRto * 100) / 100,
      actualPromoter: Math.round(actualPromoter * 100) / 100,
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

// ── Day-by-Day History ──────────────────────────────────────────────────
// Flat, pre-labeled event lists for six history categories, each event
// tagged with { day, vehicleIndex, vehicleRegistrationNumber } so the
// frontend can filter by Vehicle Type → Registration Number → Campaign Date
// without recomputing anything client-side.
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

      // Status tag per registration number — resolved from the CURRENT
      // onRoadExecutionArray state (most-recently-uploaded entry wins),
      // so chained replacements (Vehicle1→2→3) are each labeled correctly.
      const entriesForType = onRoadExecutionArray.filter((e) => e.vehicleIndex === vehicleIndex);
      const registrationNumbers = Array.from(regSet).map((reg) => {
        const matches = entriesForType
          .filter((e) => e.vehicleRegistrationNumber === reg)
          .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
        const latest = matches[0];

        let status = "Historical";
        if (latest) {
          if (latest.entryStatus === "removed") status = "Released";
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
    });

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
        comments: h.changedFields?.reason || "",
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

    // Replacement events surface as "Vehicle Replaced" on BOTH the old and new reg.
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
        resolveDescription: iss.resolveDescription,
        resolvePhoto: iss.resolvePhoto,
        createdBy: iss.reportedBy,
        createdAt: iss.reportedAt,
        resolvedBy: iss.resolvedBy,
        resolvedAt: iss.resolvedAt,
      });
      if (iss.status === "resolved" && iss.resolvedAt && dateKey(iss.resolvedAt) !== dateKey(iss.reportedAt)) {
        issueHistory.push({
          day: dateKey(iss.resolvedAt),
          vehicleIndex: iss.vehicleIndex,
          entryId: iss.entryId ? String(iss.entryId) : null,
          vehicleRegistrationNumber: iss.vehicleRegNo,
          driverName: iss.driverName,
          issueDescription: iss.issueDescription,
          issuePhoto: iss.issuePhoto,
          status: "resolved-today",
          resolveDescription: iss.resolveDescription,
          resolvePhoto: iss.resolvePhoto,
          createdBy: iss.reportedBy,
          createdAt: iss.reportedAt,
          resolvedBy: iss.resolvedBy,
          resolvedAt: iss.resolvedAt,
        });
      }
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

