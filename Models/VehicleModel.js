const mongoose = require("mongoose");

const VehicleModelSchema = new mongoose.Schema(
  {
    modelName: {
      type: String,
      required: true,
    //   unique: true,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VehicleModel", VehicleModelSchema);