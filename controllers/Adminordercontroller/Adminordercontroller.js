
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


function calculateVehiclePricing(pkg, fromDate, toDate, quantity, needPromoter, extraKm = 0, extraDays = 0, extraHours = 0, additionalFields = [],promoterQuantity) {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  const baseDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  const totalDays = baseDays + (extraDays || 0);

  const rentalCost = pkg.perDayRentalCost * totalDays * quantity;
  const driverCost = pkg.driverCharges * totalDays * quantity;

    const promoterCost = needPromoter && pkg.promoterAvailable
    ? (pkg.promoterChargePerDay || 0) * totalDays * promoterQuantity  
    : 0;
  const rtoCost = pkg.rtoCharges * quantity;

  const extraKmCost = extraKm > 0 ? (pkg.perKmCharge || 0) * extraKm : 0;
  const extraHourCost = extraHours > 0 ? (pkg.additionalHourCharges || 0) * extraHours : 0;

  const additionalNet = (additionalFields || []).reduce((acc, c) => {
    const amt = Number(c.amount) || 0;
    return c.mode === "+" ? acc + amt : acc - amt;
  }, 0);

  const subtotal = Math.max(0, rentalCost + driverCost + promoterCost + rtoCost + extraKmCost + extraHourCost + additionalNet);
  const gstAmount = Math.round(subtotal * 0.18);
  const totalAmount = subtotal + gstAmount;

  return {
    totalDays,
    perDayRentalCost: pkg.perDayRentalCost,
    driverCharges: pkg.driverCharges,
    promoterChargePerDay: needPromoter ? (pkg.promoterChargePerDay || 0) : 0,
    rtoCharges: pkg.rtoCharges,
    additionalHourCharges: pkg.additionalHourCharges,
    dailyKmLimit: pkg.dailyKmLimit,
    rentalCost,
    driverCost,
    promoterCost,
    rtoCost,
    extraKmCost,
    extraHourCost,
    additionalNet,
    subtotal,
    gstAmount,
    totalAmount,
  };
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


exports.searchCustomers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2)
      return errorResponse(res, "Search query must be at least 2 characters", null, 400);

    const query = q.trim();
    const customers = await User.find({
      $or: [
        { phone: { $regex: query, $options: "i" } },
        { name: { $regex: query, $options: "i" } },
      ],
    }).limit(10).select("_id name phone address email createdAt");

    return successResponse(res, "Customers fetched successfully", { total: customers.length, customers });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};


exports.getCustomerById = async (req, res) => {
  try {
    const customer = await User.findById(req.params.customerId).select("_id name phone address email");
    if (!customer)
      return errorResponse(res, "Customer not found", null, 404);

    return successResponse(res, "Customer fetched successfully", { customer });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};


// ─── Packages ─────────────────────────────────────────────────────────────────

exports.getPackagesForOrder = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.vehicleType) filter.vehicleType = req.query.vehicleType;
    if (req.query.vehicleModel) filter.vehicleModel = req.query.vehicleModel;

    const packages = await Package.find(filter).select(
      "_id vehicleType vehicleModel perDayRentalCost dailyKmLimit additionalHourCharges " +
      "promoterAvailable promoterChargePerDay driverCharges rtoCharges"
    );

    return successResponse(res, "Packages fetched successfully", { packages });
  } catch (error) {
    return errorResponse(res, error.message);
  }
};


// ─── Preview Pricing ──────────────────────────────────────────────────────────

exports.previewPricing = async (req, res) => {
  try {
    const { packageId, fromDate, toDate, quantity, needPromoter, extraKm, extraDays, additionalFields } = req.body;

    if (!packageId || !fromDate || !toDate || !quantity)
      return errorResponse(res, "packageId, fromDate, toDate, quantity required", null, 400);

    const pkg = await Package.findById(packageId);
    if (!pkg)
      return errorResponse(res, "Package not found", null, 404);
    if (!pkg.isActive)
      return errorResponse(res, "Package is inactive", null, 400);

    if (new Date(fromDate) >= new Date(toDate))
      return errorResponse(res, "fromDate must be before toDate", null, 400);

    const pricing = calculateVehiclePricing(
      pkg, fromDate, toDate, Number(quantity), !!needPromoter,
      Number(extraKm) || 0, Number(extraDays) || 0,
      0,
      additionalFields
    );

    return successResponse(res, "Pricing calculated successfully", { pricing });
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