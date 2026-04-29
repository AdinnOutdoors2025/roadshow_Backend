const express = require("express");
const router = express.Router();

const {
  saveVehicleModel,
  getVehicleModels,
  deleteVehicleModel
} = require("../../controllers/VehicleModelController/vehiclemodel");
// const { protect } = require("../../Middleware/authmiddleware"); 
const {
    protect
} = require('../../Middleware/rolemiddleware');


router.post("/saveVehicleModel",protect, saveVehicleModel);
router.get("/getVehicleModels",protect, getVehicleModels);
router.delete("/deleteVehicleModel/:id", protect, deleteVehicleModel); 

module.exports = router;