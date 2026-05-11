const mongoose = require("mongoose");

const vehicleTypeSchema = new mongoose.Schema(
  {
    typeName: { 
      type: String, 
      required: true,
      unique: true,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("VehicleType", vehicleTypeSchema);