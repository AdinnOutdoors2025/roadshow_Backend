const mongoose = require("mongoose");

const vehiclesAvailabilitySchema = new mongoose.Schema(
  {
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
       ref: "entryVehicles",
      required: true,
    },

    vehicleNumber: {
      type: String,
      required: true,
    },

    model: {
      type: String,
      required: true,
    },

    location: {
      type: String,
      required: true,
    },

    isAvailable: {          // ✅ NEW FIELD
      type: Boolean,
      required: true,
      default: true,
    },

    statusReason: {         // ✅ NEW FIELD
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "VehiclesAvailability",
  vehiclesAvailabilitySchema
);
