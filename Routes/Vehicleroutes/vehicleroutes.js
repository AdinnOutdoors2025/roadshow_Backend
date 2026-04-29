const express = require("express");
const router = express.Router();
const {
  getAllVehicles,
  getVehicleById,
  getSimilarVehicles,
  createVehicle,
  updateVehicle,
  patchVehicle,
  removeSimilarVehicle,
  deleteVehicle,
} = require("../../controllers/VehiclesController/vehicles");

// const { protect } = require("../../Middleware/authmiddleware"); 
const {
    protect,
    isAdmin,
    verifyAdminExists,
} = require('../../Middleware/rolemiddleware');

// NOTE: /similar/:vehicleId must come BEFORE /:id
// Otherwise Express will treat "similar" as an :id param
router.get("/similar/:vehicleId",protect, getSimilarVehicles);

router.get("/",protect, getAllVehicles);
router.get("/:id",protect, getVehicleById);
router.post("/",protect, createVehicle);
router.put("/:id",protect, updateVehicle);
router.patch("/:id/remove-similar",protect, removeSimilarVehicle);
router.patch("/:id",protect, patchVehicle);
router.delete("/:id",protect, deleteVehicle);

module.exports = router;