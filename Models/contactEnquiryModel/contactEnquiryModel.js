const mongoose = require("mongoose");

const contactEnquirySchema = new mongoose.Schema(
  {
    mailtype: { type: String, required: true },
    userName: { type: String, required: true },
    userContactNumber: {
      type: String,
      required: true,
      match: [/^[0-9]{10,15}$/, "Please enter a valid phone number"],
    },
    userEnquiryEmail: {
      type: String,
      required: false,
      default: "",
      lowercase: true,
      trim: true,
      match: [/^$|^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    userEnquiryMessage: { type: String, default: "" },
    apiStatus: { type: String, default: "success" },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("contactenquiry", contactEnquirySchema);