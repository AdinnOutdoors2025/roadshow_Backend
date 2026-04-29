const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    vehicleNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    // ✅ NEW OPTIONAL FIELDS
    speaker: {
      type: String,
      trim: true,
      default: "",
    },
    speakerNos: {
      type: Number,
      default: null,
    },
    generator: {
      type: String,
      trim: true,
      default: "",
    },
    generatorNos: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("entryVehicles", vehicleSchema);
