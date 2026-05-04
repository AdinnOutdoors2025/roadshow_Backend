

const Order = require("../../Models/AdminorderModel/Adminorder");
const User = require("../../Models/User/user");
const Package = require("../../Models/PackageManagementModel/packagemanagement");
require("dotenv").config();



// Format: 20260503AO#1  (AO = Admin Order)

async function generateAdminOrderId() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const datePrefix = `${year}${month}${day}`;

  const startOfDay = new Date(year, today.getMonth(), today.getDate());
  const endOfDay = new Date(year, today.getMonth(), today.getDate() + 1);

  const count = await Order.countDocuments({
    createdAt: { $gte: startOfDay, $lt: endOfDay },
  });

  return `${datePrefix}AO#${count + 1}`;
}


// HELPER: Calculate vehicle pricing from package

function calculateVehiclePricing(pkg, fromDate, toDate, quantity, needPromoter) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const totalDays = Math.max(
    1,
    Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  );

  const rentalCost = pkg.perDayRentalCost * totalDays * quantity;
  const driverCost = pkg.driverCharges * totalDays * quantity;
  const promoterCost =
    needPromoter && pkg.promoterAvailable
      ? (pkg.promoterChargePerDay || 0) * totalDays * quantity
      : 0;
  const rtoCost = pkg.rtoCharges * quantity;

  const subtotal = rentalCost + driverCost + promoterCost + rtoCost;
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
    subtotal,
    gstAmount,
    totalAmount,
  };
}


// CREATE CUSTOMER (New Customer)

exports.createCustomer = async (req, res) => {
  try {
    const { name, phone, address, email } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Customer name is required" });
    }
    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }
    const phoneStr = phone.toString().trim();
    if (!/^[6-9]\d{9}$/.test(phoneStr)) {
      return res
        .status(400)
        .json({ message: "Enter a valid 10-digit Indian mobile number" });
    }
    if (!address || !address.trim()) {
      return res.status(400).json({ message: "Address is required" });
    }

    // Duplicate check
    const existing = await User.findOne({ phone: phoneStr });
    if (existing) {
      return res.status(409).json({
        message: "Customer with this phone number already exists",
        customer: existing,
      });
    }

    const customer = new User({
      name: name.trim(),
      phone: phoneStr,
      address: address.trim(),
      ...(email && { email: email.trim().toLowerCase() }),
    });

    await customer.save();

    return res.status(201).json({
      success: true,
      message: "Customer created successfully",
      customer,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


// SEARCH CUSTOMERS (Existing Customer search)

exports.searchCustomers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res
        .status(400)
        .json({ message: "Search query must be at least 2 characters" });
    }

    const query = q.trim();
    const customers = await User.find({
      $or: [
        { phone: { $regex: query, $options: "i" } },
        { name: { $regex: query, $options: "i" } },
      ],
    })
      .limit(10)
      .select("_id name phone address email createdAt");

    return res.status(200).json({
      success: true,
      total: customers.length,
      customers,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


exports.getCustomerById = async (req, res) => {
  try {
    const customer = await User.findById(req.params.customerId).select(
      "_id name phone address email"
    );
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    return res.status(200).json({ success: true, customer });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


// GET /admin/packages?vehicleType=Customizable Vehicle
// GET /admin/packages?vehicleModel=LED Van

exports.getPackagesForOrder = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.vehicleType) filter.vehicleType = req.query.vehicleType;
    if (req.query.vehicleModel) filter.vehicleModel = req.query.vehicleModel;

    const packages = await Package.find(filter).select(
      "_id vehicleType vehicleModel perDayRentalCost dailyKmLimit additionalHourCharges promoterAvailable promoterChargePerDay driverCharges rtoCharges"
    );

    return res.status(200).json({ success: true, packages });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


// POST /admin/orders/preview-pricing

exports.previewPricing = async (req, res) => {
  try {
    const { packageId, fromDate, toDate, quantity, needPromoter } = req.body;

    if (!packageId || !fromDate || !toDate || !quantity) {
      return res.status(400).json({ message: "packageId, fromDate, toDate, quantity required" });
    }

    const pkg = await Package.findById(packageId);
    if (!pkg) return res.status(404).json({ message: "Package not found" });
    if (!pkg.isActive) return res.status(400).json({ message: "Package is inactive" });

    if (new Date(fromDate) >= new Date(toDate)) {
      return res.status(400).json({ message: "fromDate must be before toDate" });
    }

    const pricing = calculateVehiclePricing(
      pkg,
      fromDate,
      toDate,
      Number(quantity),
      !!needPromoter
    );

    return res.status(200).json({ success: true, pricing });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


exports.createAdminOrder = async (req, res) => {
  try {
    const { customerId, vehicles } = req.body;

    // ── Validate customer ──
    if (!customerId) {
      return res.status(400).json({ message: "customerId is required" });
    }
    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // ── Validate vehicles ──
    if (!vehicles || !Array.isArray(vehicles) || vehicles.length === 0) {
      return res.status(400).json({ message: "At least one vehicle is required" });
    }

    // ── Process each vehicle ──
    const bookingItems = [];
    let grandTotal = 0;

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];

      // Required field validation per vehicle
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

      if (missing.length > 0) {
        return res.status(400).json({
          message: `Vehicle ${i + 1}: Missing fields — ${missing.join(", ")}`,
        });
      }

      if (new Date(v.fromDate) >= new Date(v.toDate)) {
        return res.status(400).json({
          message: `Vehicle ${i + 1}: fromDate must be before toDate`,
        });
      }

      // Fetch package
      const pkg = await Package.findById(v.packageId);
      if (!pkg) {
        return res.status(404).json({ message: `Vehicle ${i + 1}: Package not found` });
      }
      if (!pkg.isActive) {
        return res.status(400).json({ message: `Vehicle ${i + 1}: Package "${pkg.vehicleModel}" is inactive` });
      }

      // Promoter validation
      if (v.needPromoter && !pkg.promoterAvailable) {
        return res.status(400).json({
          message: `Vehicle ${i + 1}: Promoter not available for "${pkg.vehicleModel}"`,
        });
      }
      if (v.needPromoter && !v.promoterType) {
        return res.status(400).json({ message: `Vehicle ${i + 1}: promoterType required` });
      }
      if (v.needPromoter && v.promoterType === "Other" && !v.otherPromoterType) {
        return res.status(400).json({ message: `Vehicle ${i + 1}: otherPromoterType required` });
      }

      // Calculate pricing
      const pricing = calculateVehiclePricing(
        pkg,
        v.fromDate,
        v.toDate,
        Number(v.quantity),
        !!v.needPromoter
      );

      grandTotal += pricing.totalAmount;

      bookingItems.push({
        packageId: pkg._id,
        vehicleType: pkg.vehicleType,
        vehicleModel: pkg.vehicleModel,
        bookingFor: v.bookingFor,
        campaignType: v.campaignType,
        otherCampaignType: v.otherCampaignType || "",
        fromDate: new Date(v.fromDate),
        toDate: new Date(v.toDate),
        state: v.state,
        city: v.city,
        fromLocation: v.fromLocation,
        toLocation: v.toLocation,
        quantity: Number(v.quantity),
        needPromoter: !!v.needPromoter,
        promoterType: v.needPromoter ? v.promoterType : "",
        otherPromoterType: v.needPromoter && v.promoterType === "Other" ? v.otherPromoterType : "",
        campaignImages: v.campaignImages || [],
        campaignVideos: v.campaignVideos || [],

        // Pricing 
        totalDays: pricing.totalDays,
        perDayRentalCost: pricing.perDayRentalCost,
        driverCharges: pricing.driverCharges,
        promoterChargePerDay: pricing.promoterChargePerDay,
        rtoCharges: pricing.rtoCharges,
        additionalHourCharges: pricing.additionalHourCharges,
        dailyKmLimit: pricing.dailyKmLimit,
        rentalCost: pricing.rentalCost,
        driverCost: pricing.driverCost,
        promoterCost: pricing.promoterCost,
        rtoCost: pricing.rtoCost,
        subtotal: pricing.subtotal,
        gstAmount: pricing.gstAmount,
        totalAmount: pricing.totalAmount,
      });
    }

    // ── Generate Order ID ──
    const orderId = await generateAdminOrderId();

    // ── Create Order ──
    const order = new Order({
      orderId,
      userId: customerId,         
      customerId: customerId,     
      name: customer.name,
      phone: customer.phone,
      address: customer.address || "",
      email: customer.email || "",
      isAdminCreated: true,
      bookingItems,
      grandTotal,
      orderStatus: "Pending",
      pipelineStatus: "newOrder",
      pipelineLogs: [
        {
          fromStage: null,
          toStage: "newOrder",
          movedBy: "Admin",
          movedAt: new Date(),
        },
      ],
    });

    await order.save();

    return res.status(201).json({
      success: true,
      message: "Admin order created successfully",
      orderId: order.orderId,
      order,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


// GET CUSTOMER'S ORDER HISTORY

exports.getCustomerOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.customerId })
      .sort({ createdAt: -1 })
      .select("orderId grandTotal pipelineStatus orderStatus createdAt bookingItems");

    return res.status(200).json({
      success: true,
      total: orders.length,
      orders,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


exports.getAllOrders = async (req, res) => {
  try {
    const {
      pipelineStatus,
      orderStatus,
      search,
      page = 1,
      limit = 50,
    } = req.query;
 
    const filter = {};
 
    if (pipelineStatus && pipelineStatus !== "all") {
      filter.pipelineStatus = pipelineStatus;
    }
 
    if (orderStatus && orderStatus !== "all") {
      filter.orderStatus = orderStatus;
    }
 
    if (search && search.trim().length >= 2) {
      const q = search.trim();
      filter.$or = [
        { orderId: { $regex: q, $options: "i" } },
        { name:    { $regex: q, $options: "i" } },
        { phone:   { $regex: q, $options: "i" } },
      ];
    }
 
    const skip  = (Number(page) - 1) * Number(limit);
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
      success: true,
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      orders,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
 

// GET SINGLE ADMIN ORDER BY ID

exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
 
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
 
    return res.status(200).json({ success: true, order });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


