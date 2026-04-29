const mongoose = require('mongoose');

const vehicleOfferSchema = new mongoose.Schema(
  {
    model: {
      type: String,
      required: [true, 'Vehicle model is required'],
      trim: true,
    },
    fromdate: {
      type: Date,
      required: [true, 'From date is required'],
    },
    todate: {
      type: Date,
      required: [true, 'To date is required'],
    },
    percentage: {
      type: Number,
      required: [true, 'Percentage is required'],
      min: [0, 'Percentage cannot be negative'],
      max: [100, 'Percentage cannot exceed 100'],
    },
  },
  {
    timestamps: true,          
    collection: 'vehicleoffer',
  }
);

module.exports = mongoose.model('VehicleOffer', vehicleOfferSchema);