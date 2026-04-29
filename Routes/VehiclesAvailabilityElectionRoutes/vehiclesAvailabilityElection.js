const express = require("express");
const router = express.Router();

const {
  saveVehiclesAvailabilityElection,
  updateVehiclesAvailabilityElection,
  getVehiclesAvailabilityElection,
  deleteVehiclesAvailabilityElection,
} = require("../../controllers/VehiclesAvailabilityElectionController/vehiclesAvailabilityElection");
// const { protect } = require("../../Middleware/authmiddleware"); 
const {
    protect,
    isAdmin,
    verifyAdminExists,
} = require('../../Middleware/rolemiddleware');

router.post(
  "/saveVehiclesAvailabilityElection",protect,
  saveVehiclesAvailabilityElection
);
router.put(
  "/updateVehiclesAvailabilityElection/:id",protect,
  updateVehiclesAvailabilityElection
);
router.get(
  "/getVehiclesAvailabilityElection",protect,
  getVehiclesAvailabilityElection
);
router.delete(
  "/deleteVehiclesAvailabilityElection/:id",protect,
  deleteVehiclesAvailabilityElection
);

module.exports = router;