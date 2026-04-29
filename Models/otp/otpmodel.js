const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    // MongoDB TTL index: automatically deletes document after expiresAt
    // index: { expires: 0 },
  },
  verified: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model("OTP", otpSchema);