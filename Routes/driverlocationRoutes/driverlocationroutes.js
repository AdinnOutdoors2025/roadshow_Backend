
const express = require("express");
const router = express.Router();
const {
  addDriverLocation,
  getDriverLocationsByOrder,  
} = require("../../controllers/driverlocationcontroller/driverlocationcontroller");

router.post("/:orderId/driver-location", addDriverLocation);
router.get("/:orderId/driver-location", getDriverLocationsByOrder);

module.exports = router;