


const path = require("path");
const Order = require("../../Models/AdminorderModel/Adminorder");
const User = require("../../Models/User/user");
const Package = require("../../Models/PackageManagementModel/packagemanagement");
require("dotenv").config();
const CampaignType = require("../../Models/CampaignTypeModel/campaigntype");


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



function calculateVehiclePricing(pkg, fromDate, toDate, quantity, needPromoter, extraKm = 0, extraDays = 0, extraHours = 0, additionalFields = []) {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  const baseDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  const totalDays = baseDays + (extraDays || 0);

  const rentalCost = pkg.perDayRentalCost * totalDays * quantity;
  const driverCost = pkg.driverCharges * totalDays * quantity;
  const promoterCost = needPromoter && pkg.promoterAvailable
    ? (pkg.promoterChargePerDay || 0) * totalDays * quantity
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

    if (!name?.trim()) return res.status(400).json({ message: "Customer name is required" });
    if (!phone) return res.status(400).json({ message: "Phone number is required" });

    const phoneStr = phone.toString().trim();
    if (!/^[6-9]\d{9}$/.test(phoneStr))
      return res.status(400).json({ message: "Enter a valid 10-digit Indian mobile number" });
    if (!address?.trim()) return res.status(400).json({ message: "Address is required" });

    const existing = await User.findOne({ phone: phoneStr });
    if (existing)
      return res.status(409).json({ message: "A customer with this phone number already exists. Please select an existing customer", customer: existing });

    const customer = new User({
      name: name.trim(),
      phone: phoneStr,
      address: address.trim(),
      ...(email && { email: email.trim().toLowerCase() }),
    });
    await customer.save();

    return res.status(201).json({ success: true, message: "Customer created successfully", customer });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


exports.searchCustomers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2)
      return res.status(400).json({ message: "Search query must be at least 2 characters" });

    const query = q.trim();
    const customers = await User.find({
      $or: [
        { phone: { $regex: query, $options: "i" } },
        { name: { $regex: query, $options: "i" } },
      ],
    }).limit(10).select("_id name phone address email createdAt");

    return res.status(200).json({ success: true, total: customers.length, customers });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


exports.getCustomerById = async (req, res) => {
  try {
    const customer = await User.findById(req.params.customerId).select("_id name phone address email");
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    return res.status(200).json({ success: true, customer });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


exports.getPackagesForOrder = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.vehicleType) filter.vehicleType = req.query.vehicleType;
    if (req.query.vehicleModel) filter.vehicleModel = req.query.vehicleModel;

    const packages = await Package.find(filter).select(
      "_id vehicleType vehicleModel perDayRentalCost dailyKmLimit additionalHourCharges " +
      "promoterAvailable promoterChargePerDay driverCharges rtoCharges"
    );

    return res.status(200).json({ success: true, packages });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


exports.previewPricing = async (req, res) => {
  try {
    const { packageId, fromDate, toDate, quantity, needPromoter, extraKm, extraDays, additionalFields } = req.body;

    if (!packageId || !fromDate || !toDate || !quantity)
      return res.status(400).json({ message: "packageId, fromDate, toDate, quantity required" });

    const pkg = await Package.findById(packageId);
    if (!pkg) return res.status(404).json({ message: "Package not found" });
    if (!pkg.isActive) return res.status(400).json({ message: "Package is inactive" });

    if (new Date(fromDate) >= new Date(toDate))
      return res.status(400).json({ message: "fromDate must be before toDate" });

 const pricing = calculateVehiclePricing(
  pkg, v.fromDate, v.toDate, Number(v.quantity), !!v.needPromoter,
  Number(v.extraKm) || 0, Number(v.extraDays) || 0,
  Number(v.extraHours) || 0,
  additionalFields
);
    return res.status(200).json({ success: true, pricing });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};



exports.createAdminOrder = async (req, res) => {
  try {
    const { customerId } = req.body;


    const vehicles = [];
    let idx = 0;
    while (req.body[`vehicle_${idx}`] !== undefined) {
      try {
        vehicles.push(JSON.parse(req.body[`vehicle_${idx}`]));
      } catch {
        return res.status(400).json({ message: `vehicle_${idx} is not valid JSON` });
      }
      idx++;
    }

    if (!customerId) return res.status(400).json({ message: "customerId is required" });
    const customer = await User.findById(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    if (!vehicles || vehicles.length === 0)
      return res.status(400).json({ message: "At least one vehicle is required" });

    const bookingItems = [];
    let grandTotal = 0;

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];

  
      const missing = [];
      if (!v.packageId)    missing.push("packageId");
      if (!v.bookingFor)   missing.push("bookingFor");
      if (!v.campaignType) missing.push("campaignType");
      if (v.campaignType === "Other" && !v.otherCampaignType) missing.push("otherCampaignType");
      if (!v.fromDate)     missing.push("fromDate");
      if (!v.toDate)       missing.push("toDate");
      if (!v.state)        missing.push("state");
      if (!v.city)         missing.push("city");
      if (!v.fromLocation) missing.push("fromLocation");
      if (!v.toLocation)   missing.push("toLocation");
      if (!v.quantity || Number(v.quantity) < 1) missing.push("quantity");

  
      if (v.bookingFor === "Agency" && !v.gstNumber?.trim())
        missing.push("gstNumber (required for Agency)");

      if (missing.length > 0)
        return res.status(400).json({ message: `Vehicle ${i + 1}: Missing fields — ${missing.join(", ")}` });

      if (new Date(v.fromDate) >= new Date(v.toDate))
        return res.status(400).json({ message: `Vehicle ${i + 1}: fromDate must be before toDate` });

      const pkg = await Package.findById(v.packageId);
      if (!pkg)          return res.status(404).json({ message: `Vehicle ${i + 1}: Package not found` });
      if (!pkg.isActive) return res.status(400).json({ message: `Vehicle ${i + 1}: Package "${pkg.vehicleModel}" is inactive` });

      if (v.needPromoter && !pkg.promoterAvailable)
        return res.status(400).json({ message: `Vehicle ${i + 1}: Promoter not available for "${pkg.vehicleModel}"` });
      if (v.needPromoter && !v.promoterType)
        return res.status(400).json({ message: `Vehicle ${i + 1}: promoterType required` });
      if (v.needPromoter && v.promoterType === "Other" && !v.otherPromoterType)
        return res.status(400).json({ message: `Vehicle ${i + 1}: otherPromoterType required` });

      // Additional charges
      const additionalFields = (v.additionalCharges || []).map((c) => ({
        label:  (c.label || "").trim() || "Custom charge",
        mode:   c.mode === "-" ? "-" : "+",
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

     
   

      const pricing = calculateVehiclePricing(
  pkg, v.fromDate, v.toDate, Number(v.quantity), !!v.needPromoter,
  Number(v.extraKm) || 0, Number(v.extraDays) || 0,
  Number(v.extraHours) || 0,
  additionalFields
);
      grandTotal += pricing.totalAmount;

     
      const uploadedFiles = req.files || [];

      const campaignImages = uploadedFiles
        .filter((f) => f.fieldname === `campaignImages_${i}`)
        .map((f) => `/uploads/${path.basename(f.path)}`);

      const campaignVideos = uploadedFiles
        .filter((f) => f.fieldname === `campaignVideos_${i}`)
        .map((f) => `/uploads/${path.basename(f.path)}`);

      bookingItems.push({
        packageId:          pkg._id,
        vehicleType:        pkg.vehicleType,
        vehicleModel:       pkg.vehicleModel,
        bookingFor:         v.bookingFor,
        gstNumber,                         
        campaignType:       campaignTypeName, 
        campaignTypeRef,                   
        otherCampaignType:  v.campaignType === "Other" ? (v.otherCampaignType || "") : "",
        fromDate:           new Date(v.fromDate),
        toDate:             new Date(v.toDate),
        state:              v.state,
        city:               v.city,
        fromLocation:       v.fromLocation,
        toLocation:         v.toLocation,
        quantity:           Number(v.quantity),
        extraKm:            Number(v.extraKm) || 0,
        extraDays:          Number(v.extraDays) || 0,
        needPromoter:       !!v.needPromoter,
        promoterType:       v.needPromoter ? v.promoterType : "",
        otherPromoterType:  v.needPromoter && v.promoterType === "Other" ? v.otherPromoterType : "",
        campaignImages,
        campaignVideos,

        
        totalDays:             pricing.totalDays,
        perDayRentalCost:      pricing.perDayRentalCost,
        driverCharges:         pricing.driverCharges,
        promoterChargePerDay:  pricing.promoterChargePerDay,
        rtoCharges:            pricing.rtoCharges,
        additionalHourCharges: pricing.additionalHourCharges,
        dailyKmLimit:          pricing.dailyKmLimit,
        rentalCost:            pricing.rentalCost,
        driverCost:            pricing.driverCost,
        promoterCost:          pricing.promoterCost,
        rtoCost:               pricing.rtoCost,
        extraKmCost:           pricing.extraKmCost,
        extraHours:            Number(v.extraHours) || 0,
        extraHourCost:         pricing.extraHourCost,
        additionalNet:         pricing.additionalNet,
        subtotal:              pricing.subtotal,
        gstAmount:             pricing.gstAmount,
        totalAmount:           pricing.totalAmount,
        additionalFields,
      });
    }

    const orderId = await generateAdminOrderId();

    const order = new Order({
      orderId,
      userId:     customerId,
      customerId: customerId,
      name:       customer.name,
      phone:      customer.phone,
      address:    customer.address || "",
      email:      customer.email  || "",
      isAdminCreated: true,
      bookingItems,
      grandTotal,
      orderStatus:    "Pending",
      pipelineStatus: "newOrder",
      pipelineLogs: [{
        fromStage: null,
        toStage:   "newOrder",
        movedBy:   "Admin",
        movedAt:   new Date(),
      }],
    });

    await order.save();

    return res.status(201).json({
      success: true,
      message: "Admin order created successfully",
      orderId:  order.orderId,
      order,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};






exports.getCustomerOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.customerId })
      .sort({ createdAt: -1 })
      .select("orderId grandTotal pipelineStatus orderStatus createdAt bookingItems");

    return res.status(200).json({ success: true, total: orders.length, orders });
  } catch (error) {
    return res.status(500).json({ message: error.message });
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

    return res.status(200).json({
      success: true, total, page: Number(page),
      totalPages: Math.ceil(total / Number(limit)), orders,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ message: "Order not found" });
    return res.status(200).json({ success: true, order });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


exports.getCampaignTypes = async (req, res) => {
  try {
    const types = await CampaignType.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, types });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createCampaignType = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Campaign type name required" });

    // Already exists-ஆ check பண்ணு
    const existing = await CampaignType.findOne({
      name: { $regex: `^${name.trim()}$`, $options: "i" }
    });
    if (existing)
      return res.status(200).json({ success: true, type: existing, alreadyExists: true });

    const type = await CampaignType.create({ name: name.trim() });
    return res.status(201).json({ success: true, type });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

