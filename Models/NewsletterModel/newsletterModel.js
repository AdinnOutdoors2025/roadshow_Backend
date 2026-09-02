const mongoose = require("mongoose");

const newsletterSchema = new mongoose.Schema(
  {
    mailtype: { type: String, default: "newsletter" },
    contact: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    contactType: {
      type: String,
      enum: ["email", "phone"],
      required: true,
    },
    source: { type: String, default: "" },
    apiStatus: { type: String, default: "success" },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("newsletter", newsletterSchema);
