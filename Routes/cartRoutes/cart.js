const express = require("express");
const router = express.Router();
const cartController = require("../../controllers/CartController/cart");
const { protect } = require("../../Middleware/authmiddleware"); 

router.post("/addToCart", protect, cartController.addToCart);
// router.get("/getCart/:userId",protect, cartController.getCart);
router.get("/getCart",protect, cartController.getCart);

module.exports = router;