const express = require("express");
const router  = express.Router();

const {
  register,
  verifyOtp,
  login,
  loginVerifyOtp,
  getUsers,
  resendOtp,
} = require("../../controllers/UserController/userController");

 const { protect } = require("../../Middleware/authmiddleware");

// ─── Public Routes ─────────────────────────────────────────────────────────────

// REGISTER FLOW
// Step 1: Register → OTP sent to phone
router.post("/register",    register);
// Step 2: Verify OTP → user verified → JWT returned
router.post("/verify-otp",  verifyOtp);

// LOGIN FLOW
// Step 1: Login with name + phone/email → OTP sent
router.post("/login",         login);
// Step 2: Verify login OTP → JWT returned
router.post("/login-verify",  loginVerifyOtp);

// Resend OTP (for both register & login)
router.post("/resend-otp",  resendOtp);

// ─── Protected Routes ──────────────────────────────────────────────────────────
// Get current user profile
router.get("/getUser", protect, getUsers);

module.exports = router;