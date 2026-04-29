const express = require("express");
const router = express.Router();

const {
  saveVehicleModelElection,
  getVehicleModelsElection,
  updateVehicleModelElection,
  deleteVehicleModelElection,
} = require("../../controllers/VehicleModelElectionController/vehicleModelElection");
// const { protect } = require("../../Middleware/authmiddleware"); 
const {
    protect,
    isAdmin,
    verifyAdminExists,
} = require('../../Middleware/rolemiddleware');

router.post("/saveVehicleModelElection",protect, saveVehicleModelElection);
router.get("/getVehicleModelsElection",protect, getVehicleModelsElection);
router.put("/updateVehicleModelElection/:id",protect, updateVehicleModelElection);
router.delete("/deleteVehicleModelElection/:id",protect, deleteVehicleModelElection);

module.exports = router;