
const path = require("path");
const Order = require("../../Models/AdminorderModel/Adminorder");
const User = require("../../Models/User/user");
const Package = require("../../Models/PackageManagementModel/packagemanagement");
require("dotenv").config();
const CampaignType = require("../../Models/CampaignTypeModel/campaigntype");
const { successResponse, errorResponse } = require("../../Utils/response");


// Format: 20260503AO#1
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

    const customer = new User({
      name: name.trim(),
      phone: phoneStr,
      address: address.trim(),
      isVerified: true,
      ...(email && { email: email.trim().toLowerCase() }),
    });
    await customer.save();

    return successResponse(res, "Customer created successfully", { customer }, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};



exports.createAdminOrder = async (req, res) => {
  try {
    const { customerId, customerName, customerPhone, customerAddress, customerEmail } = req.body;

    const vehicles = [];
    let idx = 0;
    while (req.body[`vehicle_${idx}`] !== undefined) {
      try {
        vehicles.push(JSON.parse(req.body[`vehicle_${idx}`]));
      } catch {
        return errorResponse(res, `vehicle_${idx} is not valid JSON`, null, 400);
      }
      idx++;
    }

    if (!vehicles || vehicles.length === 0)
      return errorResponse(res, "At least one vehicle is required", null, 400);

    const bookingItems = [];

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];


      const fp = v.pricing || {};

      const missing = [];
      if (!v.packageId) missing.push("packageId");
      if (!v.bookingFor) missing.push("bookingFor");
      if (!v.campaignType) missing.push("campaignType");
      if (v.campaignType === "Other" && !v.otherCampaignType) missing.push("otherCampaignType");
      if (!v.fromDate) missing.push("fromDate");
      if (!v.toDate) missing.push("toDate");
      if (!v.state) missing.push("state");
      if (!v.city) missing.push("city");
      if (!v.fromLocation) missing.push("fromLocation");
      if (!v.toLocation) missing.push("toLocation");
      if (!v.quantity || Number(v.quantity) < 1) missing.push("quantity");
      if (v.bookingFor === "Agency" && !v.gstNumber?.trim()) missing.push("gstNumber (required for Agency)");

      if (missing.length > 0)
        return errorResponse(res, `Vehicle ${i + 1}: Missing fields — ${missing.join(", ")}`, null, 400);

      if (new Date(v.fromDate) >= new Date(v.toDate))
        return errorResponse(res, `Vehicle ${i + 1}: fromDate must be before toDate`, null, 400);

      const pkg = await Package.findById(v.packageId);
      if (!pkg)
        return errorResponse(res, `Vehicle ${i + 1}: Package not found`, null, 404);
      if (!pkg.isActive)
        return errorResponse(res, `Vehicle ${i + 1}: Package "${pkg.vehicleModel}" is inactive`, null, 400);

      if (v.needPromoter && !pkg.promoterAvailable)
        return errorResponse(res, `Vehicle ${i + 1}: Promoter not available for "${pkg.vehicleModel}"`, null, 400);
      if (v.needPromoter && !v.promoterType)
        return errorResponse(res, `Vehicle ${i + 1}: promoterType required`, null, 400);
      if (v.needPromoter && v.promoterType === "Other" && !v.otherPromoterType)
        return errorResponse(res, `Vehicle ${i + 1}: otherPromoterType required`, null, 400);

      const additionalFields = (v.additionalCharges || []).map((c) => ({
        label: (c.label || "").trim() || "Custom charge",
        mode: c.mode === "-" ? "-" : "+",
        amount: Math.max(0, Number(c.amount) || 0),
      }));

      let campaignTypeRef = null;
      let campaignTypeName = v.campaignType;

      if (v.campaignType && v.campaignType !== "Other") {
        const ct = await CampaignType.findById(v.campaignType).catch(() => null);
        if (ct) {
          campaignTypeRef = ct._id;
          campaignTypeName = ct.name;
        }
      } else if (v.campaignType === "Other" && v.otherCampaignType?.trim()) {
        let ct = await CampaignType.findOne({
          name: { $regex: `^${v.otherCampaignType.trim()}$`, $options: "i" },
        });
        if (!ct) {
          ct = await CampaignType.create({ name: v.otherCampaignType.trim() });
        }
        campaignTypeRef = ct._id;
        campaignTypeName = ct.name;
      }

      const gstNumber = v.bookingFor === "Agency" ? (v.gstNumber || "").trim() : "";

      const uploadedFiles = req.files || [];
      const campaignImages = uploadedFiles
        .filter((f) => f.fieldname === `campaignImages_${i}`)
        .map((f) => `/uploads/${path.basename(f.path)}`);
      const campaignVideos = uploadedFiles
        .filter((f) => f.fieldname === `campaignVideos_${i}`)
        .map((f) => `/uploads/${path.basename(f.path)}`);


      bookingItems.push({
        packageId: pkg._id,
        vehicleType: pkg.vehicleType,
        vehicleModel: pkg.vehicleModel,
        bookingFor: v.bookingFor,
        gstNumber,
        campaignType: campaignTypeName,
        campaignTypeRef,
        otherCampaignType: v.campaignType === "Other" ? (v.otherCampaignType || "") : "",
        promoterGender: v.needPromoter ? (v.promoterGender || "") : "",
        promoterLanguage: v.needPromoter ? (v.promoterLanguage || "") : "",
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
        totalDays: fp.totalDays || 0,
        perDayRentalCost: fp.perDayRentalCost || 0,
        driverCharges: fp.driverCharges || 0,
        promoterChargePerDay: fp.promoterChargePerDay || 0,
        rtoCharges: fp.rtoCharges || 0,
        additionalHourCharges: fp.additionalHourCharges || 0,
        dailyKmLimit: fp.dailyKmLimit || 0,
        rentalCost: fp.rentalCost || 0,
        driverCost: fp.driverCost || 0,
        promoterCost: fp.promoterCost || 0,
        rtoCost: fp.rtoCost || 0,
        extraKmCost: fp.extraKmCost || 0,
        extraHourCost: fp.extraHourCost || 0,
        additionalNet: fp.additionalNet || 0,
        subtotal: fp.subtotal || 0,
        totalAmount: fp.totalAmount || 0,
        additionalFields,
      });
    }

    const orderId = await generateAdminOrderId();


    const grandTotal = Number(req.body.grandTotal) || 0;
    const grandGst = Number(req.body.grandGst) || 0;

    const order = new Order({
      orderId,
      name: customerName,
      phone: customerPhone,
      address: customerAddress || "",
      email: customerEmail || "",
      customerType: Number(req.body.customerType) ?? 1,
      isAdminCreated: true,
      bookingItems,
      grandTotal,
      grandGst,
      orderStatus: "Pending",
      pipelineStatus: "newOrder",
      pipelineLogs: [{
        fromStage: null,
        toStage: "newOrder",
        movedBy: "Admin",
        movedAt: new Date(),
      }],
    });

    await order.save();

    return successResponse(res, "Admin order created successfully", {
      orderId: order.orderId,
      order,
    }, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};



exports.getCustomerOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.customerId })
      .sort({ createdAt: -1 })
      .select("orderId grandTotal pipelineStatus orderStatus createdAt bookingItems");

    return successResponse(res, "Customer orders fetched successfully", { total: orders.length, orders });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};


exports.getAllOrders = async (req, res) => {
  try {
    const { pipelineStatus, orderStatus, search, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (pipelineStatus && pipelineStatus !== "all") filter.pipelineStatus = pipelineStatus;
    if (orderStatus && orderStatus !== "all") filter.orderStatus = orderStatus;
    if (search && search.trim().length >= 2) {
      const q = search.trim();
      filter.$or = [
        { orderId: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Order.countDocuments(filter);

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .select(
        "orderId userId customerId name phone address email " +
        "grandTotal grandNegotiationTotal orderStatus pipelineStatus " +
        "isAdminCreated handlername reasonDescription " +
        "bookingItems pipelineLogs negotiationLogs createdAt updatedAt"
      );

    return successResponse(res, "Orders fetched successfully", {
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      orders,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};


exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order)
      return errorResponse(res, "Order not found", null, 404);

    return successResponse(res, "Order fetched successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};




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
    if (!name?.trim())
      return errorResponse(res, "Campaign type name required", null, 400);

    const existing = await CampaignType.findOne({
      name: { $regex: `^${name.trim()}$`, $options: "i" },
    });
    if (existing)
      return successResponse(res, "Campaign type already exists", { type: existing, alreadyExists: true });

    const type = await CampaignType.create({ name: name.trim() });
    return successResponse(res, "Campaign type created successfully", { type }, 201);
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

const STAGE_ORDER = [
  "todo",
  "inProgress",
  "customerConfirmation",
  "waitingForPO",
  "paymentStage1",
  "projectCodeCreation",
  "projectExecution",
  "onRoad",
  "campaignRunning",
  "vehicleUnavailable",
  "clientClosure",
  "invoiceGeneration",
  "paymentStage2",
  "closedWon",
  "closedLost",
];


exports.getOrdersByPipeline = async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .select(
        "orderId name phone customerType pipelineStatus orderStatus " +
        "grandTotal grandGst grandNegotiationTotal bookingItems handlerName " +
        "isAdminCreated createdAt updatedAt pipelineLogs negotiationLogs " +
        "companyName email address poDocumentLogs paymentStageFirst"
      );

    // Group by stage
    const grouped = {};
    STAGE_ORDER.forEach((s) => (grouped[s] = []));
    orders.forEach((o) => {
      const stage = o.pipelineStatus || "todo";
      if (grouped[stage]) grouped[stage].push(o);
      else grouped["todo"].push(o);
    });

    return successResponse(res, "Pipeline orders fetched", { grouped, stages: STAGE_ORDER });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};

exports.updateOrderPipeline = async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      pipelineStatus: rawPipelineStatus,
      handlerName,
      customerType,
      discountType,
      discountValue,
      poDate,
      poNotes,
      advancePayment,
      paymentDate,
      paymentVerification,
      paymentNotes,
    } = req.body;

    let pipelineStatus = rawPipelineStatus;

    if (!STAGE_ORDER.includes(pipelineStatus))
      return errorResponse(res, "Invalid pipeline stage", null, 400);

    const order = await Order.findById(orderId);
    if (!order) return errorResponse(res, "Order not found", null, 404);

    const oldStage = order.pipelineStatus;

    const movedByFinal =
      Number(req.user.isAdmin) === 0
        ? req.user.username
        : handlerName?.trim() || order.handlerName || "Admin";

    // ── inProgress ───────────────────────────────────────────────
    if (pipelineStatus === "inProgress") {
      const isStaffAdmin = Number(req.user.isAdmin) === 0;
      if (isStaffAdmin) {
        order.handlerName = req.user.username;
      } else {
        if (!handlerName?.trim())
          return errorResponse(res, "Handler name is required", null, 400);
        order.handlerName = handlerName.trim();
      }
      if (order.customerType === null || order.customerType === undefined) {
        if (customerType === undefined || customerType === null)
          return errorResponse(res, "Customer type is required", null, 400);
        if (![0, 1].includes(Number(customerType)))
          return errorResponse(res, "customerType must be 0 or 1", null, 400);
        order.customerType = Number(customerType);
      }
    }

 
    let autoRoutedFromPO = false;

    if (pipelineStatus === "waitingForPO") {
      const poFile = req.files?.find((f) => f.fieldname === "poDocument");

 
      if (poFile) {
        if (!poDate)
          return errorResponse(res, "PO date is required", null, 400);

        const poUrl = `/uploads/${path.basename(poFile.path)}`;
        order.poDocumentLogs.push({
          poDocument: poUrl,
          poDate: new Date(poDate),
          poNotes: (poNotes || "").trim(),
          uploadedBy: movedByFinal,
          uploadedAt: new Date(),
        });

       
        if (order.customerType === 1) {
          pipelineStatus = "paymentStage1";
          autoRoutedFromPO = true;
        } else if (order.customerType === 0) {
          pipelineStatus = "projectCodeCreation";
          autoRoutedFromPO = true;
        } else {
          return errorResponse(res, "Customer type not set on this order", null, 400);
        }
      }
    
    }

   
    if (pipelineStatus === "paymentStage1" && !autoRoutedFromPO) {
      const proofFile = req.files?.find((f) => f.fieldname === "paymentProofDocument");
      if (!proofFile)
        return errorResponse(res, "Payment proof document is required", null, 400);
      if (!advancePayment)
        return errorResponse(res, "Advance payment amount is required", null, 400);
      if (!paymentDate)
        return errorResponse(res, "Payment date is required", null, 400);
      if (!paymentVerification)
        return errorResponse(res, "Payment verification status is required", null, 400);

      const proofUrl = `/uploads/${path.basename(proofFile.path)}`;

      order.paymentStageFirst.push({
        advancePayment: Number(advancePayment),
        paymentProofDocument: proofUrl,
        paymentDate: new Date(paymentDate),
        paymentVerification: paymentVerification.trim(),
        paymentNotes: (paymentNotes || "").trim(),
        uploadedBy: movedByFinal,
        uploadedAt: new Date(),
      });
    }

    // ── projectCodeCreation ──────────────────────────────────────
    // if (pipelineStatus === "projectCodeCreation" && !autoRoutedFromPO) {
    //   if (order.customerType !== 0)
    //     return errorResponse(res, "Project Code Creation is only for Existing customers", null, 400);
    // }

    // ── projectCodeCreation ──────────────────────────────────────
    if (pipelineStatus === "projectCodeCreation" && !autoRoutedFromPO) {
      const comingFromPaymentStage = order.pipelineStatus === "paymentStage1";
      if (order.customerType !== 0 && !comingFromPaymentStage)
        return errorResponse(res, "Project Code Creation is only for Existing customers", null, 400);
    }

    // ── customerConfirmation ─────────────────────────────────────
    if (pipelineStatus === "customerConfirmation") {
      const subtotal = order.bookingItems.reduce(
        (sum, item) => sum + (item.totalAmount || 0), 0
      );
      let discountAmount = 0;
      if (discountValue != null && discountValue !== "") {
        if (discountType === "percent") {
          const pct = Math.min(Number(discountValue) || 0, 100);
          discountAmount = Math.floor((subtotal * pct) / 100);
        } else {
          discountAmount = Number(discountValue) || 0;
        }
      }
      const previousTotalDiscount = (order.negotiationLogs || []).reduce(
        (sum, log) => sum + (log.discountAmount || 0), 0
      );
      order.grandNegotiationTotal = subtotal - (previousTotalDiscount + discountAmount);
      order.negotiationLogs.push({
        fromStage: oldStage,
        toStage: pipelineStatus,
        movedBy: movedByFinal,
        movedAt: new Date(),
        discountAmount,
      });
    }

    // ── Update pipeline status + log ─────────────────────────────
    order.pipelineStatus = pipelineStatus;

    const logEntry = {
      fromStage: oldStage,
      toStage: pipelineStatus,
      movedBy: movedByFinal,
      movedAt: new Date(),
    };
    if (pipelineStatus === "inProgress") logEntry.handlerName = order.handlerName;

    order.pipelineLogs.push(logEntry);
    await order.save();

    return successResponse(res, "Pipeline stage updated successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};