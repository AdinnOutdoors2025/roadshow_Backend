
const multer = require("multer");
const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/Adminordercontroller/Adminordercontroller");
const { adminOrderUpload } = require("../../Middleware/orderImageupload");
const {
    protect,
    isAdmin,
    verifyAdminExists,
} = require('../../Middleware/rolemiddleware');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });


router.post("/customers/create", ctrl.createCustomer);
router.get("/customers/:customerId/orders", ctrl.getCustomerOrders);

router.get("/pipeline",protect, ctrl.getOrdersByPipeline);
router.patch(
  "/pipeline/:orderId",protect,
  upload.single("poDocument"),   
  ctrl.updateOrderPipeline
);

router.get("/orders",protect, ctrl.getAllOrders);
router.get("/orders/:orderId",           ctrl.getOrderById);
router.post("/orders/create",protect,adminOrderUpload,ctrl.createAdminOrder);

router.get("/campaign-types", ctrl.getCampaignTypes);
router.post("/campaign-types", ctrl.createCampaignType);

module.exports = router;