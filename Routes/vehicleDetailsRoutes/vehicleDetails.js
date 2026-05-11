// // Routes/vehicleDetailsRoutes/vehicleDetails.js

// const express = require("express");
// const router = express.Router();

// const {
//   createVehicle,
//   getNewVehicles,
//   updateVehicle,
//     deleteVehicle,
//   getVehicleById,
//   getVehicleStatistics
// } = require("../../controllers/VehicleDetailsController/vehicledetails");

// const vehicleUpload = require("../../Middleware/vehicleDetailsUpload");

// // TEMPORARILY COMMENT OUT protect FOR TESTING
// // const { protect } = require('../../Middleware/rolemiddleware');

// // Remove protect middleware for testing

// // router.post("/createVehicle",protect, vehicleUpload, createVehicle);
// // router.get("/getNewVehicles",protect, getNewVehicles);
// // router.put("/updateVehicle/:id", protect,vehicleUpload, updateVehicle);


// router.post("/createVehicle", vehicleUpload, createVehicle);
// router.get("/getNewVehicles", getNewVehicles);
// router.get("/getVehicle/:id", getVehicleById);

// router.put("/updateVehicle/:id", vehicleUpload, updateVehicle);
// router.delete("/deleteVehicle/:id", deleteVehicle);
// router.get("/statistics", getVehicleStatistics);

// module.exports = router;




// Routes/vehicleDetailsRoutes/vehicleDetails.js

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
  getVehicleGroupByType
} = require("../../controllers/VehicleDetailsController/vehicledetails");

const vehicleUpload = require("../../Middleware/vehicleDetailsUpload");

// Vehicle group routes
router.post("/createVehicle", vehicleUpload, createVehicle);
router.get("/getNewVehicles", getNewVehicles);
router.get("/getVehicle/:id", getVehicleById);
router.put("/updateVehicle/:id", vehicleUpload, updateVehicle);
router.delete("/deleteVehicle/:id", deleteVehicle);
// Add these routes to your existing router
router.get("/generate-vehicle-id", generateUniqueVehicleId);
router.post("/createRegistrationVehicle", vehicleUpload, createRegistrationVehicle);
// Registration vehicle specific routes
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

module.exports = router;