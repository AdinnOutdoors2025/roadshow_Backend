const express = require("express");
const router = express.Router();
const {
  createDrivingDetails,
  getAllDrivingDetails,
  getDrivingDetailsById,
  updateDrivingDetails,
  deleteDrivingDetails,
} = require("../../controllers/Driverdetailscontroller/Driverdetailscontroller");


router.route("/").post(createDrivingDetails).get(getAllDrivingDetails);


router
  .route("/:id")
  .get(getDrivingDetailsById)
  .put(updateDrivingDetails)
  .delete(deleteDrivingDetails);

module.exports = router;