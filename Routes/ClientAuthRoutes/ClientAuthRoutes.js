const express = require("express");
const router = express.Router();

const { sendClientOtp, verifyClientOtp } = require("../../controllers/ClientAuthController/ClientAuthController");
const { protect, authorizeUserType } = require("../../Middleware/rolemiddleware"); // use the same file


router.post( "/send-otp", sendClientOtp );
router.post( "/verify-otp", verifyClientOtp );

//CLIENT AUTHENTICATION
router.get("/profile", protect, authorizeUserType(2), async (req, res) => {
  const ClientUser = require("../../Models/ClientUserSchema");
  const user = await ClientUser.findById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  res.json({ success: true, user });
});
module.exports = router;