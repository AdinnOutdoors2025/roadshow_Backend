const mongoose = require("mongoose");

const enquirySchema = new mongoose.Schema(
  {
    mailtype: { type: String, required: true },
    userName: { type: String,  required: true },
    userEnquiryEmail: { 
      type: String, 
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"]
    },
  userContactNumber: { 
      type: String, 
      required: true,
      match: [/^[0-9]{10,15}$/, "Please enter a valid phone number"]
    },
    userPreferredLocation: { type: String, required: true },
    userStartDate: { type: Date, required: true },
    userEndDate: { type: Date, required: true },
    userPreferredvehicle: { type: String,  required: true },
    userEnquiryMessage: { type: String, default: "" },
    apiStatus: { type: String, default: "success" },
  },
  {
    timestamps: true, 
  }
);

module.exports = mongoose.model("emailenquiry", enquirySchema);