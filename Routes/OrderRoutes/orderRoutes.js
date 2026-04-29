const express = require("express");
const router = express.Router();
const orderController = require("../../controllers/OrderController/orderController");
const { protect } = require("../../Middleware/authmiddleware"); 

router.post("/orderCreation",protect, orderController.createOrder);
router.get("/getOrders", orderController.getOrders);
router.put("/updateOrderPipeline/:orderId", orderController.updateOrderPipeline);

module.exports = router;