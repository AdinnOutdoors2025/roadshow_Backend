const express = require("express");
const router = express.Router();
const { sendNewsletter } = require("../../controllers/NewsletterController/NewsletterController");

router.post("/newsletter", sendNewsletter);

module.exports = router;
