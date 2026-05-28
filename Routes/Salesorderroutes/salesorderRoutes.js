// routes/SalesPipelineRoutes/salesPipelineRoutes.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const router = express.Router();

// ✅ இந்த line-ஐ மாத்துங்க!
const ctrl = require("../../controllers/Salesordercontroller/Salesordercontroller");

const { protect } = require("../../Middleware/rolemiddleware");

// ── Multer config — accepts PDF + images ────────────────────────────────────
const salesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../../public/uploads");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) =>
    cb(null, `sales-${Date.now()}-${file.originalname}`),
});

const salesFileFilter = (req, file, cb) => {
  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only PDF and image files are allowed!"), false);
};

const salesUpload = multer({
  storage: salesStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, 
  fileFilter: salesFileFilter,
}).any();

// ── Routes ──────────────────────────────────────────────────────────────────

// Get all orders grouped by stage
router.get("/pipeline", protect, ctrl.getSalesPipeline);

// Get single sales order
router.get("/pipeline/order/:orderId", protect, ctrl.getSalesOrderById);

// Move stage (with optional file uploads)
router.patch("/pipeline/:id", protect, salesUpload, ctrl.updateSalesPipeline);

// Upload document to current stage without moving
router.post("/pipeline/:id/documents", protect, salesUpload, ctrl.uploadStageDocument);

module.exports = router;