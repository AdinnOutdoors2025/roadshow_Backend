// routes/shortUrl.routes.js

const express = require("express");
const { redirectShortUrl } = require("../controllers/shortUrl.controller.js");

const router = express.Router();

router.get("/:code", redirectShortUrl);

module.exports = router;