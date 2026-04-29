const express = require("express");
const router = express.Router();

const {
  saveVehiclesAvailability,
  updateVehiclesAvailability,
  getVehiclesAvailability,
  deleteVehiclesAvailability,
} = require("../../controllers/VehiclesAvailabilityController/vehiclesAvailability");
// const { protect } = require("../../Middleware/authmiddleware"); 
const {
    protect,
    isAdmin,
    verifyAdminExists,
} = require('../../Middleware/rolemiddleware');

router.post("/saveVehiclesAvailability",protect, saveVehiclesAvailability);
router.put("/updateVehiclesAvailability/:id",protect, updateVehiclesAvailability);
router.get("/getVehiclesAvailability",protect, getVehiclesAvailability);
router.delete("/deleteVehiclesAvailability/:id",protect, deleteVehiclesAvailability);

module.exports = router;