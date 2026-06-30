

const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const multerS3 = require("multer-s3");
const router = express.Router();

const ctrl = require("../../controllers/Adminordercontroller/Adminordercontroller");
const { adminOrderUpload } = require("../../Middleware/orderImageupload");
const { protect } = require("../../Middleware/rolemiddleware");
const spacesClient = require("../../config/spaces");

const STORAGE_TYPE = process.env.STORAGE_TYPE || "local";
const BUCKET_NAME = process.env.DO_SPACES_BUCKET || "adinn-space";


const pipelineFileFilter = (req, file, cb) => {
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


let pipelineStorage;

if (STORAGE_TYPE === "space") {
  pipelineStorage = multerS3({
    s3: spacesClient,
    bucket: BUCKET_NAME,
    acl: "public-read",
    metadata: (req, file, cb) => {
      cb(null, { fieldname: file.fieldname });
    },
    key: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      const filename = `admin-${file.fieldname}-${uniqueSuffix}${ext}`;
      cb(null, `admin-pipeline/${filename}`);
    },
  });
} else {
  pipelineStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, "../../public/uploads");
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      cb(null, `admin-${Date.now()}-${file.originalname}`);
    },
  });
}

const pipelineUpload = multer({
  storage: pipelineStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: pipelineFileFilter,
}).any();

// ── Routes ─────────────────────────────────────────────────────────────────
router.get("/pipeline", protect, ctrl.getOrdersByPipeline);
router.patch("/pipeline/:orderId", protect, pipelineUpload, ctrl.updateOrderPipeline);


router.post(
  "/pipeline/:id/documents",
  protect,
  pipelineUpload,
  ctrl.uploadStageDocument
);

router.patch("/pipeline/:id/onroad-driver/:entryId", protect, ctrl.updateOnRoadDriver);
router.post("/pipeline/:id/onroad-issue", protect, pipelineUpload, ctrl.addOnRoadIssue);
router.patch("/pipeline/:id/onroad-issue/:issueId/resolve", protect, pipelineUpload, ctrl.resolveOnRoadIssue);
router.post("/pipeline/:id/onroad-unavailable", protect, pipelineUpload, ctrl.markVehicleUnavailable);
router.patch("/pipeline/:id/onroad-unavailable/:historyId/available", protect, pipelineUpload, ctrl.markVehicleAvailable);

router.patch("/pipeline/:id/todo-uploader", protect, ctrl.saveTodoUploadedBy);

router.post("/pipeline/:id/onroad-details", protect, pipelineUpload, ctrl.submitOnRoadDetails);
router.patch("/pipeline/:id/onroad-status/:entryId", protect, ctrl.updateOnRoadStatus);
router.post(
  "/pipeline/:id/closed-won",
  protect,
  pipelineUpload,
  ctrl.submitOrderClosedWon
);

router.post(
  "/pipeline/:id/closed-lost",
  protect,
  pipelineUpload,
  ctrl.submitOrderClosedLost
);

router.put("/pipeline/:id/onroad-details/:entryId", protect, ctrl.editOnRoadDetails);

router.post("/pipeline/:id/client-feedback", protect, pipelineUpload, ctrl.submitClientFeedback);
router.post("/pipeline/:id/campaign-closure", protect, pipelineUpload, ctrl.submitCampaignClosure);
router.patch("/pipeline/:id/campaign-closure/:closureId", protect, pipelineUpload, ctrl.updateCampaignClosure);
router.patch(
  "/pipeline/:id/campaign-closure/:closureId/approve",
  protect,
  pipelineUpload,
  ctrl.approveFocEntry
);

router.get("/orders", protect, ctrl.getAllOrders);  
router.get("/orders/:orderId", ctrl.getOrderById);
router.post("/orders/create", protect, adminOrderUpload, ctrl.createAdminOrder);

router.get("/campaign-types", ctrl.getCampaignTypes);
router.post("/campaign-types", ctrl.createCampaignType);

module.exports = router;