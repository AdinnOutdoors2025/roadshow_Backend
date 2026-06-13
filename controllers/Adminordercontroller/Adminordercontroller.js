


/* eslint-disable */
const path = require("path");
const Order = require("../../Models/AdminorderModel/Adminorder");
const User = require("../../Models/User/user");
const Package = require("../../Models/PackageManagementModel/packagemanagement");
require("dotenv").config();
const CampaignType = require("../../Models/CampaignTypeModel/campaigntype");
const { successResponse, errorResponse } = require("../../Utils/response");



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
  const baseDays = Math.ceil((to - from) / 86400000);
  const totalDays = baseDays + (Number(v.extraDays) || 0);
  const quantity = Number(v.quantity) || 1;
  const extraKm = Number(v.extraKm) || 0;
  const extraHours = Number(v.extraHours) || 0;
  const needPromoter = !!v.needPromoter;
  const promoterQuantity = Number(v.promoterQuantity) || 0;

  const rentalCost = pkg.perDayRentalCost * totalDays * quantity;
  const driverCost = pkg.driverCharges * totalDays * quantity;
  const promoterCost = needPromoter
    ? (pkg.promoterChargePerDay || 0) * totalDays * promoterQuantity
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
    promoterChargePerDay: needPromoter ? pkg.promoterChargePerDay : 0,
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


const STAGE_ORDER = [
  "todo",
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
      const campaignImages = uploadedFiles
        .filter((f) => f.fieldname === `campaignImages_${i}`)
        .map((f) => getFileUrl(f));
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
        "orderId name phone address email customerType " +
        "grandTotal grandGst grandNegotiationTotal orderStatus pipelineStatus " +
        "isAdminCreated handlerName bookingItems pipelineLogs negotiationLogs " +
        "createdAt updatedAt customerCategory companyName clientName designation gstNumber " +
        "projectCodeArray projectExecutionArray onRoadExecutionArray onRoadCommentsArray projectMailLogs todoArray todoUploadedBy onRoadHistory  "
      );
    return successResponse(res, "Orders fetched successfully", {
      total, page: Number(page), totalPages: Math.ceil(total / Number(limit)), orders,
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
        "projectCodeArray projectExecutionArray onRoadExecutionArray onRoadCommentsArray todoArray todoUploadedBy onRoadHistory "
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
      "Please complete at least one vehicle driver details and enable On Road status",
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

    const logEntry = {
      fromStage: oldStage,
      toStage: pipelineStatus,
      movedBy,
      movedAt: new Date(),
    };

    if (
      pipelineStatus === "projectExecution"
    ) {
      logEntry.handlerName = order.handlerName || "";
    }

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

    // const uploadedBy =
    //   Number(req.user.isAdmin) === 0
    //     ? req.user.username
    //     : order.handlerName || req.user?.username || "Admin";

    const uploadedBy =
      (order.pipelineStatus === "todo" ? order.todoUploadedBy : null) ||
      // req.body.uploadedBy?.trim() ||
      (Number(req.user.isAdmin) === 0
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin");

    const docFile = (req.files || []).find((f) => f.fieldname === "document");
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

    await order.save();
    return successResponse(res, "Document uploaded successfully", { order });
  } catch (error) {
    return errorResponse(res, error.message, null, 500);
  }
};


exports.submitOnRoadDetails = async (req, res) => {
  const { id } = req.params;
  const { vehicleIndex, driverName, driverPhone, 
          vehicleRegistrationNumber, onRoadStatus } = req.body;

  const order = await Order.findById(id);

      const uploadedBy =
      (order.pipelineStatus === "todo" ? order.todoUploadedBy : null) ||
      // req.body.uploadedBy?.trim() ||
      (Number(req.user.isAdmin) === 0
        ? req.user.username
        : order.handlerName || req.user?.username || "Admin");
  
 
  const gatepassPhoto = (req.files || []).find(f => f.fieldname === "gatepassPhoto");
  const photoUrl = gatepassPhoto ? getFileUrl(gatepassPhoto) : "";

  order.onRoadExecutionArray.push({
    vehicleIndex: Number(vehicleIndex),
    driverName: driverName.trim(),
    driverPhone: driverPhone.trim(),
    vehicleRegistrationNumber: vehicleRegistrationNumber.trim(),
    gatepassPhoto: photoUrl,
    onRoadStatus: Number(onRoadStatus) || 0,
    uploadedBy: uploadedBy,
    uploadedAt: new Date()
  });

  await order.save();
  return successResponse(res, "Driver details saved", { order });
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