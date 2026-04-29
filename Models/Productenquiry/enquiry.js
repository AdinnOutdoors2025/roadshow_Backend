const mongoose = require("mongoose");

const enquirySchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProductEnquiry", enquirySchema);