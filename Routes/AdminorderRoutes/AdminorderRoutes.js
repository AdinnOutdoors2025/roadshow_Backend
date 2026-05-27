const multer = require("multer");
const path = require("path");
const fs = require("fs"); 
const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/Adminordercontroller/Adminordercontroller");
const { adminOrderUpload } = require("../../Middleware/orderImageupload");
const { protect } = require('../../Middleware/rolemiddleware');

const pipelineStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../../public/uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['application/pdf'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed!'), false);
  }
};


const pipelineUpload = multer({
  storage: pipelineStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: fileFilter,
}).any();

// ── Routes ──


router.get("/pipeline", protect, ctrl.getOrdersByPipeline);
router.patch(
  "/pipeline/:orderId",
  protect,
  pipelineUpload,
  ctrl.updateOrderPipeline
);

router.get("/orders", protect, ctrl.getAllOrders);
router.get("/orders/:orderId", ctrl.getOrderById);
router.post("/orders/create", protect, adminOrderUpload, ctrl.createAdminOrder);

router.get("/campaign-types", ctrl.getCampaignTypes);
router.post("/campaign-types", ctrl.createCampaignType);



module.exports = router;