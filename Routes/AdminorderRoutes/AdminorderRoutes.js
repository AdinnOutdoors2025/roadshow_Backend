
const multer = require("multer");
const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/Adminordercontroller/Adminordercontroller");
const { adminOrderUpload } = require("../../Middleware/orderImageupload");


router.post("/customers/create", ctrl.createCustomer);
router.get("/customers/search", ctrl.searchCustomers);
router.get("/customers/:customerId/orders", ctrl.getCustomerOrders);
router.get("/customers/:customerId", ctrl.getCustomerById);

router.get("/packages", ctrl.getPackagesForOrder);
router.get("/orders",                    ctrl.getAllOrders);
router.get("/orders/:orderId",           ctrl.getOrderById);
router.post("/orders/preview-pricing", ctrl.previewPricing);
router.post("/orders/create",adminOrderUpload,ctrl.createAdminOrder);

router.get("/campaign-types", ctrl.getCampaignTypes);
router.post("/campaign-types", ctrl.createCampaignType);

module.exports = router;