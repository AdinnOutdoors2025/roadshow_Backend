
const mongoose = require("mongoose");
const User = require("../../Models/User/user");
const Order = require("../../Models/orderModel");
const Vehicle = require("../../Models/vehicleDetails");
const Enquiry = require("../../Models/Enquiry/enquirymodel");
const ProductEnquiry = require("../../Models/Productenquiry/enquiry");

// ─────────────────────────────────────────────
// HELPER: 12 month labels generate 
// ─────────────────────────────────────────────
const getMonthlyTemplate = () => {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    months.push({ month: m, count: 0 });
  }
  return months;
};

// ─────────────────────────────────────────────
// HELPER: Days in a month
// ─────────────────────────────────────────────
const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();


// HELPER: Daily template for a given year+month

const getDailyTemplate = (year, month) => {
  const days = getDaysInMonth(year, month);
  const result = [];
  for (let d = 1; d <= days; d++) {
    result.push({ date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`, count: 0 });
  }
  return result;
};


const getMonthlyWithDailyTemplate = (year) => {
  const result = {};
  for (let m = 1; m <= 12; m++) {
    result[m] = {
      month: m,
      count: 0,
      days: getDailyTemplate(year, m),
    };
  }
  return result;
};


const monthlyObjToArray = (obj) => Object.values(obj);


const fetchMonthlyForYear = async (year) => {
  const statusList = ["newOrder", "proposal", "negotiation", "closedWon", "closedLoss"];

  const yearStart = new Date(`${year}-01-01`);
  const yearEnd = new Date(`${year}-12-31T23:59:59`);

  const [
    monthlyOrdersAgg,
    monthlyOrderAmountAgg,
    enquiryAgg,
    productEnquiryAgg,
    userAgg,
    vehicleAgg,
  ] = await Promise.all([

    // ── Orders: count by month+day+status (updatedAt) ──
    Order.aggregate([
      { $match: { updatedAt: { $gte: yearStart, $lte: yearEnd } } },
      {
        $group: {
          _id: {
            month: { $month: "$updatedAt" },
            day: { $dayOfMonth: "$updatedAt" },
            status: "$pipelineStatus",
          },
          count: { $sum: 1 },
        },
      },
    ]),

    // ── Orders: grandTotal amount by month+day+status (updatedAt) ──
    Order.aggregate([
      { $match: { updatedAt: { $gte: yearStart, $lte: yearEnd } } },
      {
        $group: {
          _id: {
            month: { $month: "$updatedAt" },
            day: { $dayOfMonth: "$updatedAt" },
            status: "$pipelineStatus",
          },
          totalAmount: { $sum: "$grandTotal" },
          orderCount: { $sum: 1 },
        },
      },
    ]),

    // ── Enquiry: count by month+day (createdAt) ──
    Enquiry.aggregate([
      { $match: { createdAt: { $gte: yearStart, $lte: yearEnd } } },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1, "_id.day": 1 } },
    ]),

    // ── ProductEnquiry: count by month+day (createdAt) ──
    ProductEnquiry.aggregate([
      { $match: { createdAt: { $gte: yearStart, $lte: yearEnd } } },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1, "_id.day": 1 } },
    ]),

  
    User.aggregate([
      {
        $match: {
          isVerified: true,
          createdAt: { $gte: yearStart, $lte: yearEnd },
        },
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1, "_id.day": 1 } },
    ]),

 
    Vehicle.aggregate([
      { $match: { updatedAt: { $gte: yearStart, $lte: yearEnd } } },
      {
        $group: {
          _id: {
            month: { $month: "$updatedAt" },
            day: { $dayOfMonth: "$updatedAt" },
            availability: "$availability",
          },
          count: { $sum: "$vehicleCount" },
        },
      },
      { $sort: { "_id.month": 1, "_id.day": 1 } },
    ]),
  ]);

 
  const monthlyOrders = {};
  statusList.forEach((status) => {
    monthlyOrders[status] = getMonthlyWithDailyTemplate(year);
  });

  monthlyOrdersAgg.forEach((r) => {
    const { month, day, status } = r._id;
    if (!monthlyOrders[status]) return;
    monthlyOrders[status][month].count += r.count;
    const dayIdx = day - 1;
    if (monthlyOrders[status][month].days[dayIdx]) {
      monthlyOrders[status][month].days[dayIdx].count += r.count;
    }
  });

  // ── Build: monthly orders (amount) ──
  const monthlyOrderAmounts = {};
  statusList.forEach((status) => {
    const template = getMonthlyWithDailyTemplate(year);
    // Replace count with amount structure
    Object.keys(template).forEach((m) => {
      template[m].totalAmount = 0;
      template[m].orderCount = 0;
      template[m].days = getDailyTemplate(year, parseInt(m)).map((d) => ({
        ...d,
        totalAmount: 0,
        orderCount: 0,
      }));
      delete template[m].count;
    });
    monthlyOrderAmounts[status] = template;
  });

  monthlyOrderAmountAgg.forEach((r) => {
    const { month, day, status } = r._id;
    if (!monthlyOrderAmounts[status]) return;
    monthlyOrderAmounts[status][month].totalAmount += r.totalAmount;
    monthlyOrderAmounts[status][month].orderCount += r.orderCount;
    const dayIdx = day - 1;
    if (monthlyOrderAmounts[status][month].days[dayIdx]) {
      monthlyOrderAmounts[status][month].days[dayIdx].totalAmount += r.totalAmount;
      monthlyOrderAmounts[status][month].days[dayIdx].orderCount += r.orderCount;
    }
  });

  // ── Build: monthly enquiry ──
  const monthlyEnquiryObj = getMonthlyWithDailyTemplate(year);
  enquiryAgg.forEach((r) => {
    const { month, day } = r._id;
    monthlyEnquiryObj[month].count += r.count;
    const dayIdx = day - 1;
    if (monthlyEnquiryObj[month].days[dayIdx]) {
      monthlyEnquiryObj[month].days[dayIdx].count += r.count;
    }
  });

  // ── Build: monthly product enquiry ──
  const monthlyProductEnquiryObj = getMonthlyWithDailyTemplate(year);
  productEnquiryAgg.forEach((r) => {
    const { month, day } = r._id;
    monthlyProductEnquiryObj[month].count += r.count;
    const dayIdx = day - 1;
    if (monthlyProductEnquiryObj[month].days[dayIdx]) {
      monthlyProductEnquiryObj[month].days[dayIdx].count += r.count;
    }
  });

  // ── Build: monthly users (verified, by createdAt) ──
  const monthlyUsersObj = getMonthlyWithDailyTemplate(year);
  userAgg.forEach((r) => {
    const { month, day } = r._id;
    monthlyUsersObj[month].count += r.count;
    const dayIdx = day - 1;
    if (monthlyUsersObj[month].days[dayIdx]) {
      monthlyUsersObj[month].days[dayIdx].count += r.count;
    }
  });

  // ── Build: monthly vehicles (by updatedAt + availability) ──
  const availableStatuses = ["Available"];
  const unavailableStatuses = ["Booked", "Under Maintenance", "Disabled"];

  const monthlyVehiclesAvailableObj = getMonthlyWithDailyTemplate(year);
  const monthlyVehiclesUnavailableObj = getMonthlyWithDailyTemplate(year);

  vehicleAgg.forEach((r) => {
    const { month, day, availability } = r._id;
    const dayIdx = day - 1;

    if (availableStatuses.includes(availability)) {
      monthlyVehiclesAvailableObj[month].count += r.count;
      if (monthlyVehiclesAvailableObj[month].days[dayIdx]) {
        monthlyVehiclesAvailableObj[month].days[dayIdx].count += r.count;
      }
    } else if (unavailableStatuses.includes(availability)) {
      monthlyVehiclesUnavailableObj[month].count += r.count;
      if (monthlyVehiclesUnavailableObj[month].days[dayIdx]) {
        monthlyVehiclesUnavailableObj[month].days[dayIdx].count += r.count;
      }
    }
  });

  // ── Convert all objects → arrays ──
  const finalMonthlyOrders = {};
  statusList.forEach((status) => {
    finalMonthlyOrders[status] = monthlyObjToArray(monthlyOrders[status]);
  });

  const finalMonthlyOrderAmounts = {};
  statusList.forEach((status) => {
    finalMonthlyOrderAmounts[status] = monthlyObjToArray(monthlyOrderAmounts[status]);
  });

  return {
    monthlyOrders: finalMonthlyOrders,
    monthlyOrderAmounts: finalMonthlyOrderAmounts,
    monthlyEnquiry: monthlyObjToArray(monthlyEnquiryObj),
    monthlyProductEnquiry: monthlyObjToArray(monthlyProductEnquiryObj),
    monthlyUsers: monthlyObjToArray(monthlyUsersObj),
    monthlyVehicles: {
      available: monthlyObjToArray(monthlyVehiclesAvailableObj),
      unavailable: monthlyObjToArray(monthlyVehiclesUnavailableObj),
    },
  };
};


// 1. USERS - isVerified: true count

const getVerifiedUsersCount = async (req, res) => {
  try {
    const verifiedCount = await User.countDocuments({ isVerified: true });
    const totalCount = await User.countDocuments();

    res.status(200).json({
      success: true,
      data: {
        totalUsers: totalCount,
        verifiedUsers: verifiedCount,
        unverifiedUsers: totalCount - verifiedCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// 2A. ORDERS - pipelineStatus count

const getPipelineStatusCounts = async (req, res) => {
  try {
    const statusList = ["newOrder", "proposal", "negotiation", "closedWon", "closedLoss"];

    const result = await Order.aggregate([
      { $group: { _id: "$pipelineStatus", count: { $sum: 1 } } },
    ]);

    const statusMap = {};
    statusList.forEach((s) => (statusMap[s] = 0));
    result.forEach((r) => {
      if (r._id) statusMap[r._id] = r.count;
    });

    res.status(200).json({ success: true, data: statusMap });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// 2B. ORDERS - closedWon grandTotal sum

const getClosedWonAmount = async (req, res) => {
  try {
    const result = await Order.aggregate([
      { $match: { pipelineStatus: "closedWon" } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$grandTotal" },
          orderCount: { $sum: 1 },
        },
      },
    ]);

    const data = result[0] || { totalAmount: 0, orderCount: 0 };

    res.status(200).json({
      success: true,
      data: {
        closedWonAmount: data.totalAmount,
        closedWonOrders: data.orderCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// 2C. ORDERS - Monthly count by pipelineStatus

const getMonthlyOrdersByPipelineStatus = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const statusList = ["newOrder", "proposal", "negotiation", "closedWon", "closedLoss"];

    const result = await Order.aggregate([
      {
        $match: {
          updatedAt: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31T23:59:59`),
          },
        },
      },
      {
        $group: {
          _id: {
            month: { $month: "$updatedAt" },
            status: "$pipelineStatus",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const formatted = {};
    statusList.forEach((status) => {
      formatted[status] = getMonthlyTemplate();
    });
    result.forEach((r) => {
      const { month, status } = r._id;
      if (formatted[status]) {
        formatted[status][month - 1].count = r.count;
      }
    });

    res.status(200).json({ success: true, year, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// 3. VEHICLES - availability count

const getVehicleAvailabilityCount = async (req, res) => {
  try {
    const result = await Vehicle.aggregate([
      { $group: { _id: "$availability", count: { $sum: "$vehicleCount" } } },
    ]);

    const availableStatuses = ["Available"];
    const unavailableStatuses = ["Booked", "Under Maintenance", "Disabled"];

    let availableCount = 0;
    let unavailableCount = 0;

    result.forEach((r) => {
      if (availableStatuses.includes(r._id)) availableCount += r.count;
      else if (unavailableStatuses.includes(r._id)) unavailableCount += r.count;
    });

    res.status(200).json({ success: true, data: { availableCount, unavailableCount } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// 4. ENQUIRY - Monthly count

const getMonthlyEnquiryCount = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const result = await Enquiry.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31T23:59:59`),
          },
        },
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);

    const monthly = getMonthlyTemplate();
    result.forEach((r) => {
      monthly[r._id.month - 1].count = r.count;
    });

    res.status(200).json({ success: true, year, data: monthly });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};



const getMonthlyProductEnquiryCount = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const result = await ProductEnquiry.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31T23:59:59`),
          },
        },
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);

    const monthly = getMonthlyTemplate();
    result.forEach((r) => {
      monthly[r._id.month - 1].count = r.count;
    });

    res.status(200).json({ success: true, year, data: monthly });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// MAIN: All Dashboard Stats

const getAllDashboardStats = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const statusList = ["newOrder", "proposal", "negotiation", "closedWon", "closedLoss"];
    const years = Array.from({ length: 6 }, (_, i) => currentYear - 5 + i);

    const [
      verifiedCount,
      totalUsers,
      vehicleAgg,
      pipelineAgg,
      pipelineAmountAgg,
      totalOrderCount,
      ...yearResults
    ] = await Promise.all([
      User.countDocuments({ isVerified: true }),
      User.countDocuments(),
      Vehicle.aggregate([
        { $group: { _id: "$availability", count: { $sum: "$vehicleCount" } } },
      ]),
      Order.aggregate([
        { $group: { _id: "$pipelineStatus", count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        {
          $group: {
            _id: "$pipelineStatus",
            totalAmount: { $sum: "$grandTotal" },
            orderCount: { $sum: 1 },
          },
        },
      ]),
      Order.countDocuments(),
      ...years.map((year) => fetchMonthlyForYear(year)),
    ]);

    // Vehicle availability
    const availableStatuses = ["Available"];
    const unavailableStatuses = ["Booked", "Under Maintenance", "Disabled"];
    let availableCount = 0;
    let unavailableCount = 0;
    vehicleAgg.forEach((r) => {
      if (availableStatuses.includes(r._id)) availableCount += r.count;
      else if (unavailableStatuses.includes(r._id)) unavailableCount += r.count;
    });

    // Pipeline status counts
    const pipelineStatusCounts = {};
    statusList.forEach((s) => (pipelineStatusCounts[s] = 0));
    pipelineAgg.forEach((r) => {
      if (r._id) pipelineStatusCounts[r._id] = r.count;
    });

    // Pipeline amounts
    const pipelineStatusAmounts = {};
    statusList.forEach((s) => {
      pipelineStatusAmounts[s] = { totalAmount: 0, orderCount: 0 };
    });
    pipelineAmountAgg.forEach((r) => {
      if (r._id && pipelineStatusAmounts[r._id]) {
        pipelineStatusAmounts[r._id] = {
          totalAmount: r.totalAmount,
          orderCount: r.orderCount,
        };
      }
    });

    // Build yearly
    const yearly = {};
    years.forEach((year, idx) => {
      yearly[year] = yearResults[idx];
    });

    res.status(200).json({
      success: true,
      years,
      currentYear,
      data: {
        users: {
          totalUsers,
          verifiedUsers: verifiedCount,
          unverifiedUsers: totalUsers - verifiedCount,
        },
        vehicles: {
          availability: { availableCount, unavailableCount },
        },
        orders: {
          totalCount: totalOrderCount,
          pipelineStatusCounts,
          pipelineStatusAmounts,
        },
      },
      yearly,
    
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getVerifiedUsersCount,
  getPipelineStatusCounts,
  getClosedWonAmount,
  getMonthlyOrdersByPipelineStatus,
  getVehicleAvailabilityCount,
  getMonthlyEnquiryCount,
  getMonthlyProductEnquiryCount,
  getAllDashboardStats,
};