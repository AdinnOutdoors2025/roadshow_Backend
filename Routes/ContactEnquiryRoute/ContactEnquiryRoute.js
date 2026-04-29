const express = require("express");
const router = express.Router();
const { sendContactEnquiry } = require("../../controllers/ContactEnquiry/ContactEnquiry");

router.post("/contact-enquiry", sendContactEnquiry);

module.exports = router;