const express = require("express");
const router = express.Router();
const enquiryController = require("../../controllers/Productenquirycontroller/productenquiry");

router.post("/", enquiryController.createEnquiry);
router.get("/", enquiryController.getAllEnquiries);
router.get("/:id", enquiryController.getEnquiryById);
router.put("/:id", enquiryController.updateEnquiry);
router.delete("/:id", enquiryController.deleteEnquiry);

module.exports = router;