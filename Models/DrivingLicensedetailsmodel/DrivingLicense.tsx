const mongoose = require("mongoose");

const otherDocumentSchema = new mongoose.Schema(
  {
    key: { type: String },
    url: { type: String },
  },
  { _id: false }
);

const drivingDetailsSchema = new mongoose.Schema(
  {
    // Personal Info
    name: { type: String, trim: true },
    dob: { type: String },
    gender: { type: String },
    fatherName: { type: String, trim: true },
    country: { type: String, default: "India" },

    // Aadhar Info
    aadharNo: { type: String },
    aadharAddress: { type: String },
    aadharFilename: { type: String },
    aadharImgFilename: { type: String },
    aadharXml: { type: String },
    aadharImg: { type: String },

    // Address
    house: { type: String },
    locality: { type: String },
    dist: { type: String },
    state: { type: String },
    pincode: { type: String },

    // PAN Info
    panNumber: { type: String },
    nameOnPan: { type: String },
    panImagePath: { type: String },

    // Other Documents (e.g. DLVCR)
    otherDocuments: { type: [otherDocumentSchema], default: [] },

    // Meta
    status: { type: String },
    dateTime: { type: String },

    // Optional: link to a User
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    collection: "drivingDetails",
  }
);

module.exports = mongoose.model("DrivingLicense", drivingDetailsSchema);