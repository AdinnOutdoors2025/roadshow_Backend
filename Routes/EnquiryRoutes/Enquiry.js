const express = require("express");
const router = express.Router();
const { sendRoadshowEnquiry } = require("../../controllers/Enquirycontroller/Enquiry");

router.post("/enquiry", sendRoadshowEnquiry);

module.exports = router;