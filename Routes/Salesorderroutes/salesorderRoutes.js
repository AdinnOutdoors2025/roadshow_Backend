

// routes/SalesPipelineRoutes/salesPipelineRoutes.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const multerS3 = require("multer-s3");
const router = express.Router();

const ctrl = require("../../controllers/Salesordercontroller/Salesordercontroller");
const { protect } = require("../../Middleware/rolemiddleware");
const spacesClient = require("../../config/spaces"); // உங்க existing spaces config

const STORAGE_TYPE = process.env.STORAGE_TYPE || "local";
const BUCKET_NAME = process.env.DO_SPACES_BUCKET || "adinn-space";

// ── File filter — PDF + images மட்டும் allow ────────────────────────────────
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

// ── Storage: STORAGE_TYPE based ─────────────────────────────────────────────
let salesUploadStorage;

if (STORAGE_TYPE === "space") {
  // DigitalOcean Spaces storage
  salesUploadStorage = multerS3({
    s3: spacesClient,
    bucket: BUCKET_NAME,
    acl: "public-read",
    metadata: (req, file, cb) => {
      cb(null, { fieldname: file.fieldname });
    },
    key: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      const filename = `sales-${file.fieldname}-${uniqueSuffix}${ext}`;
      // sales pipeline docs → "sales-documents/" folder under Spaces
      cb(null, `sales-documents/${filename}`);
    },
  });
} else {
  // Local disk storage
  salesUploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, "../../public/uploads");
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      cb(null, `sales-${Date.now()}-${file.originalname}`);
    },
  });
}

const salesUpload = multer({
  storage: salesUploadStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
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

// Send / Resend project creation mail
router.post("/pipeline/:id/send-project-mail", ctrl.sendProjectMail);

module.exports = router;