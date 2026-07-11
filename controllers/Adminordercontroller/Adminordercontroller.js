
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
  const baseDays = Math.ceil((to - from) / 86400000);
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
  "clientClosureCommentsArray closedWonCommentsArray closedLostCommentsArray orderClosedLostArray orderClosedWonArray extraKmDetailsArray" 
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
  "clientClosureCommentsArray closedWonCommentsArray closedLostCommentsArray orderClosedLostArray orderClosedWonArray extraKmDetailsArray"   
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
    const requiredQty = bookingItem?.quantity || 1;


    const savedForThisVehicle = order.onRoadExecutionArray.filter(
      e => e.vehicleIndex === vIdx
    );

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
    const { driverName, driverPhone, vehicleRegistrationNumber } = req.body;

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

    const { vehicleIndex, issueDescription, vehicleRegistrationNumber } = req.body;

    if (!issueDescription?.trim())
      return errorResponse(res, "Issue description is required", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);


    let entry;
    if (vehicleRegistrationNumber?.trim()) {
      entry = order.onRoadExecutionArray.find(
        (e) => e.vehicleRegistrationNumber === vehicleRegistrationNumber.trim().toUpperCase()
      );
    } else {
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
    const { vehicleIndex, vehicleRegistrationNumber, reason } = req.body;

    if (!reason?.trim())
      return errorResponse(res, "Reason is required", null, 400);

    const order = await Order.findById(id);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const entry = order.onRoadExecutionArray.find(
      (e) => e.vehicleRegistrationNumber === vehicleRegistrationNumber?.trim()?.toUpperCase()
    );
    if (!entry) return errorResponse(res, "Vehicle entry not found", null, 404);

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

    order.onRoadUnavailableHistory.push({
      vehicleIndex: entry.vehicleIndex,
      vehicleRegNo: entry.vehicleRegistrationNumber,
      driverName: entry.driverName,
      reason: reason.trim(),
      photo: photoUrl,
      status: "unavailable",
      reportedBy,
      reportedAt: new Date(),
      resolvedBy: "",
      resolvedAt: null,
    });

    await order.save();
    return successResponse(res, "Vehicle marked as unavailable", { order });
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

    const entry = order.onRoadExecutionArray.find(
      (e) => e.vehicleRegistrationNumber === history.vehicleRegNo
    );
    if (entry) {
      entry.unavailableStatus = false;
      entry.unavailableReason = "";
    }

    await order.save();
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

    const oldStage = order.pipelineStatus;
    order.pipelineStatus = "closedWon";
    order.pipelineLogs.push({
      fromStage: oldStage,
      toStage: "closedWon",
      movedBy: uploadedBy,
      movedAt: new Date(),
    });

    await order.save();


    const regNumbers = (order.onRoadExecutionArray || [])
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