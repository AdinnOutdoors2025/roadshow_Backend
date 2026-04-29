const express = require("express");
const router = express.Router();

const {
  getVerifiedUsersCount,
  getPipelineStatusCounts,
  getClosedWonAmount,
  getMonthlyOrdersByPipelineStatus,
  getVehicleAvailabilityCount,
  getMonthlyEnquiryCount,
  getAllDashboardStats,
} = require("../../controllers/Dashboardcontroller/dashboard");

// ── Users ──────────────────────────────────────
// GET /api/dashboard/users/verified-count
router.get("/users/verified-count", getVerifiedUsersCount);

// ── Orders ─────────────────────────────────────
// GET /api/dashboard/orders/pipeline-status
router.get("/orders/pipeline-status", getPipelineStatusCounts);

// GET /api/dashboard/orders/closed-won-amount
router.get("/orders/closed-won-amount", getClosedWonAmount);

// GET /api/dashboard/orders/monthly?year=2026
router.get("/orders/monthly", getMonthlyOrdersByPipelineStatus);

// ── Vehicles ───────────────────────────────────
// GET /api/dashboard/vehicles/availability
router.get("/vehicles/availability", getVehicleAvailabilityCount);

// ── Enquiries ──────────────────────────────────
// GET /api/dashboard/enquiries/monthly?year=2026
router.get("/enquiries/monthly", getMonthlyEnquiryCount);


router.get("/dashboard", getAllDashboardStats);

module.exports = router;
