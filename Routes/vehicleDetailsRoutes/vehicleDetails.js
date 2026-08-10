const express = require("express");
const router = express.Router();

const {
  createVehicle,
  getNewVehicles,
  updateVehicle,
  deleteVehicle,
  getVehicleById,
  getRegistrationVehicleByNumber,
  updateRegistrationVehicle,
  deleteRegistrationVehicle,
  getVehicleStatistics,
  checkRegistrationExists,
  generateUniqueVehicleId,
  createRegistrationVehicle,
  getVehiclesByType,
  getVehicleGroupByType,
  updateVehicleStep,
  checkAvailability,
updateRegistrationVehicleByRegNo,

} = require("../../controllers/VehicleDetailsController/vehicledetails");

const vehicleUpload = require("../../Middleware/vehicleDetailsUpload");


router.post("/checkAvailability", checkAvailability);
router.put("/updateRegistrationVehicleByRegNo/:registrationNumber", updateRegistrationVehicleByRegNo);

// Vehicle group routes
router.post("/createVehicle", vehicleUpload, createVehicle);
router.get("/getNewVehicles", getNewVehicles);
router.get("/getVehicle/:id", getVehicleById);
router.put("/updateVehicle/:id", vehicleUpload, updateVehicle);
router.delete("/deleteVehicle/:id", deleteVehicle);

// Registration vehicle specific routes
router.get("/generate-vehicle-id", generateUniqueVehicleId);
router.post("/createRegistrationVehicle", vehicleUpload, createRegistrationVehicle);
router.get("/getRegistrationVehicle/:registrationNumber", getRegistrationVehicleByNumber);
router.put("/updateRegistrationVehicle/:id/:registrationNumber", updateRegistrationVehicle);
router.delete("/deleteRegistrationVehicle/:id/:registrationNumber", deleteRegistrationVehicle);

// Check registration existence (real-time validation)
router.get("/checkRegistration/:registrationNumber", checkRegistrationExists);

// Get vehicles by vehicle type
router.get("/getVehiclesByType/:typeId", getVehiclesByType);
router.get("/getVehicleGroupByType/:typeId", getVehicleGroupByType);

// Statistics
router.get("/statistics", getVehicleStatistics);
//STEP STATUS

router.put("/updateVehicleStep/:id", vehicleUpload, updateVehicleStep);



module.exports = router;